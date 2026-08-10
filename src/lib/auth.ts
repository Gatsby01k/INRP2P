import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { isTrainingAccountEmail, isTrainingModeEnabled } from "./training";

export const SESSION_COOKIE = "inrp2p_session";
const SESSION_DAYS = 30;

export const CHALLENGE_COOKIE = "inrp2p_2fa_challenge";
const CHALLENGE_MINUTES = 10;
const CHALLENGE_MAX_ATTEMPTS = 5;

// Brute-force lockout — applies to every role (company/partner accounts had
// zero protection before this; admin's 2FA only kicks in after the password
// step, so a lockout still matters there too). Deliberately simple: no new
// infra, just two columns on User and a check on every login attempt.
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MINUTES = 15;

export function isAccountLocked(user: { lockedUntil: Date | null }): boolean {
  return !!user.lockedUntil && user.lockedUntil > new Date();
}

/** Called on a wrong password. Locks the account once the threshold is hit. */
export async function registerFailedLogin(userId: string) {
  const user = await db.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });
  if (user.failedLoginAttempts >= LOGIN_MAX_ATTEMPTS) {
    await db.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000) },
    });
  }
}

/** Called on a correct password — a real login clears the slate. */
export async function clearFailedLogins(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/**
 * Generates an unreachable bootstrap credential for first-touch accounts.
 * The user proves email ownership before replacing it. ~96 bits entropy.
 */
export function generateAccessPassword() {
  return crypto.randomBytes(12).toString("base64url");
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { token, userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { token } });
  jar.delete(SESSION_COOKIE);
}

export const getSession = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: { include: { company: true, partner: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (isTrainingAccountEmail(session.user.email) && !isTrainingModeEnabled()) return null;
  return session;
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>["user"];

export function roleHome(role: Role) {
  return role === "ADMIN" ? "/admin" : role === "COMPANY" ? "/company" : "/partner";
}

export function hasWorkspaceAccess(user: { role: Role; emailVerifiedAt: Date | null }) {
  return user.role === "ADMIN" || Boolean(user.emailVerifiedAt);
}

/** Server-side guard. Redirects instead of throwing — safe in pages and actions. */
export async function requireRole(role: Role): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== role) redirect(roleHome(session.user.role));
  return session.user;
}

export async function requireVerifiedRole(role: Role): Promise<SessionUser> {
  const user = await requireRole(role);
  if (!user.emailVerifiedAt) redirect("/verify-email?status=pending");
  return user;
}

export function actorLabel(user: SessionUser) {
  if (user.role === "ADMIN") return "Operator";
  return user.company?.companyName ?? user.partner?.displayName ?? user.name;
}

/**
 * Short-lived "password verified, waiting on a TOTP code" state — created
 * once the password step passes for an account with 2FA enabled, and never
 * becomes a real Session by itself. Mirrors createSession's cookie pattern.
 */
export async function createTwoFactorChallenge(userId: string, next?: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000);
  await db.twoFactorChallenge.create({
    data: { token, userId, next: next ?? null, expiresAt },
  });
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function getTwoFactorChallenge() {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  const challenge = await db.twoFactorChallenge.findUnique({ where: { token } });
  if (!challenge || challenge.expiresAt < new Date()) return null;
  if (challenge.attempts >= CHALLENGE_MAX_ATTEMPTS) return null;
  return challenge;
}

export async function bumpTwoFactorAttempts(token: string) {
  await db.twoFactorChallenge.updateMany({
    where: { token },
    data: { attempts: { increment: 1 } },
  });
}

export async function clearTwoFactorChallenge() {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  if (token) await db.twoFactorChallenge.deleteMany({ where: { token } });
  jar.delete(CHALLENGE_COOKIE);
}

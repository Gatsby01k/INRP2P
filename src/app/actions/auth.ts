"use server";

import { redirect } from "next/navigation";
import {
  bumpTwoFactorAttempts,
  clearFailedLogins,
  clearTwoFactorChallenge,
  createSession,
  createTwoFactorChallenge,
  destroySession,
  getSession,
  getTwoFactorChallenge,
  isAccountLocked,
  registerFailedLogin,
  roleHome,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { loginSchema, twoFactorCodeSchema, type ActionState } from "@/lib/schemas";
import { matchBackupCode, verifyTotp } from "@/lib/totp";
import { issueEmailVerification, issuePasswordReset } from "@/lib/email";
import { consumeRateLimit } from "@/lib/rate-limit";
import { hashOpaqueToken } from "@/lib/secure-token";
import { isTrainingAccountEmail, isTrainingModeEnabled } from "@/lib/training";

function safeNext(next: FormDataEntryValue | null): string | null {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });

  if (user && isTrainingAccountEmail(user.email) && !isTrainingModeEnabled()) {
    return { error: "Training workspace access is disabled on this deployment." };
  }

  // Checked before the password compare so a locked account never leaks
  // "yes, that password was actually wrong" while it's locked.
  if (user && isAccountLocked(user)) {
    const minutesLeft = Math.max(1, Math.ceil((user.lockedUntil!.getTime() - Date.now()) / 60_000));
    return { error: `Too many attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.` };
  }

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    if (user) await registerFailedLogin(user.id);
    return { error: "Invalid email or password." };
  }

  await clearFailedLogins(user.id);
  const next = safeNext(formData.get("next"));

  // Password is correct — for accounts with 2FA enabled, that's only step
  // one. Park them in a short-lived challenge instead of a real session
  // until they prove they hold the authenticator/backup code too.
  if (user.totpEnabled) {
    await createTwoFactorChallenge(user.id, next ?? undefined);
    redirect(next ? `/login/verify?next=${encodeURIComponent(next)}` : "/login/verify");
  }

  await createSession(user.id);
  redirect(next ?? roleHome(user.role));
}

export async function verifyTwoFactor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const challenge = await getTwoFactorChallenge();
  if (!challenge) {
    return { error: "That verification step expired. Sign in again." };
  }

  const parsed = twoFactorCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { error: "Enter the 6-digit code or a backup code." };
  const submitted = parsed.data;

  const user = await db.user.findUnique({ where: { id: challenge.userId } });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    await clearTwoFactorChallenge();
    return { error: "Two-factor is no longer enabled on this account. Sign in again." };
  }

  const isTotpMatch = /^\d{6}$/.test(submitted) && verifyTotp(user.totpSecret, submitted);

  let usedBackupHash: string | null = null;
  if (!isTotpMatch) {
    usedBackupHash = await matchBackupCode(submitted, user.totpBackupCodes);
  }

  if (!isTotpMatch && !usedBackupHash) {
    await bumpTwoFactorAttempts(challenge.token);
    return { error: "Incorrect code. Check your authenticator app and try again." };
  }

  if (usedBackupHash) {
    // Single-use — burn it the moment it's redeemed.
    await db.user.update({
      where: { id: user.id },
      data: { totpBackupCodes: { set: user.totpBackupCodes.filter((h) => h !== usedBackupHash) } },
    });
  }

  await createSession(user.id);
  await clearTwoFactorChallenge();
  redirect(challenge.next ?? roleHome(user.role));
}

export async function cancelTwoFactorChallenge() {
  await clearTwoFactorChallenge();
  redirect("/login");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

function strongPassword(password: string) {
  return password.length >= 14 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email." };
  if (isTrainingAccountEmail(email)) return { ok: true };
  if (!(await consumeRateLimit("password-reset", email, 3, 60 * 60 * 1000))) return { ok: true };
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (user) await issuePasswordReset(user.id, user.email).catch(() => false);
  return { ok: true };
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!strongPassword(password)) return { error: "Use at least 14 characters with uppercase, lowercase and a number." };
  if (password !== confirm) return { error: "Passwords do not match." };
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return { error: "This reset link is invalid or expired." };
  const passwordHash = await hashPassword(password);
  const changed = await db.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash, mustSetPassword: false, failedLoginAttempts: 0, lockedUntil: null } });
    await tx.session.deleteMany({ where: { userId: record.userId } });
    return true;
  });
  return changed ? { ok: true } : { error: "This reset link is invalid or expired." };
}

export async function setWorkspacePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Your session expired. Request a password-reset link." };
  if (!session.user.emailVerifiedAt) return { error: "Verify your email before setting a workspace password." };
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!session.user.mustSetPassword && !(await verifyPassword(current, session.user.passwordHash))) return { error: "Current password is incorrect." };
  if (!strongPassword(password)) return { error: "Use at least 14 characters with uppercase, lowercase and a number." };
  if (password !== confirm) return { error: "Passwords do not match." };
  await db.$transaction([db.user.update({ where: { id: session.user.id }, data: { passwordHash: await hashPassword(password), mustSetPassword: false } }), db.session.deleteMany({ where: { userId: session.user.id, id: { not: session.id } } })]);
  return { ok: true };
}

export async function resendEmailVerification(prev: ActionState, formData: FormData): Promise<ActionState> {
  void prev; void formData;
  const session = await getSession();
  if (!session) return { error: "Your session expired." };
  if (session.user.emailVerifiedAt) return { ok: true };
  if (!(await consumeRateLimit("email-verification", session.user.email, 3, 60 * 60 * 1000))) return { error: "Too many verification messages. Try again later." };
  const sent = await issueEmailVerification(session.user.id, session.user.email).catch(() => false);
  return sent ? { ok: true } : { error: "Email delivery is not configured or temporarily unavailable." };
}

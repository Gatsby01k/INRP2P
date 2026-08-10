// Native substitute for Sentry — this build environment has no network
// access for `npm install`, so `@sentry/nextjs` can't be added. This module
// covers the same job with what's already here: write the error to Postgres
// (ErrorLog) and, for anything WARNING-and-above, push it to the existing
// ops Telegram chat via sendTelegramAlert — the same channel the watchdogs
// already use, so one place to check either way.
//
// logError() is deliberately fail-safe: it must never throw, and never be
// the reason a request fails, since it's usually called from inside a catch
// block that's already handling a real error.

import { db } from "@/lib/db";
import { sendTelegramAlert } from "@/lib/telegram";
import { isTrainingAccountEmail, isTrainingModeEnabled } from "@/lib/training";
import { Prisma, type ErrorSeverity } from "@prisma/client";

export type LogErrorInput = {
  error: unknown;
  /** Where it happened — e.g. "server-action:updateRequestStatus", "route:/api/webhooks/nowpayments", "client:error-boundary". */
  source: string;
  severity?: ErrorSeverity;
  url?: string | null;
  userId?: string | null;
  meta?: Record<string, unknown>;
};

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function toStack(error: unknown): string | null {
  if (error instanceof Error && error.stack) return error.stack.slice(0, 4000);
  return null;
}

export async function logError(input: LogErrorInput): Promise<void> {
  const severity: ErrorSeverity = input.severity ?? "ERROR";
  const message = toMessage(input.error).slice(0, 2000);
  const stack = toStack(input.error);

  // Always visible in Vercel's function logs regardless of whether the DB
  // write below succeeds.
  console.error(`[${severity}] ${input.source}: ${message}`, {
    error: input.error,
    url: input.url ?? null,
    meta: input.meta ?? null,
  });

  try {
    await db.errorLog.create({
      data: {
        severity,
        message,
        stack,
        source: input.source,
        url: input.url ?? null,
        userId: input.userId ?? null,
        meta: input.meta === undefined ? undefined : (input.meta as Prisma.InputJsonValue),
      },
    });
  } catch (dbErr) {
    console.error("logError: failed to write ErrorLog row", dbErr);
  }

  const isTrainingUser = isTrainingModeEnabled() && input.userId
    ? Boolean(await db.user.findUnique({ where: { id: input.userId }, select: { email: true } })
        .then((user) => isTrainingAccountEmail(user?.email))
        .catch(() => false))
    : false;

  if (severity !== "WARNING" && !isTrainingUser) {
    const tag = severity === "FATAL" ? "🔴 FATAL" : "🟠 ERROR";
    await sendTelegramAlert(
      `${tag} — ${input.source}\n${message}${input.url ? `\n${input.url}` : ""}`,
    ).catch(() => {});
  }
}

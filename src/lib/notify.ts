import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { notifyUser as pushTelegram } from "@/lib/telegram";
import { isWhatsAppConfigured, sendWhatsAppTemplate } from "@/lib/whatsapp";
import { isTrainingAccountEmail } from "@/lib/training";

/** Phone lives on CompanyProfile/PartnerProfile, not User directly — check
    whichever one this user actually has. Used only for the WhatsApp fan-out
    below; every other channel here keys off userId alone. */
async function phoneForUser(userId: string): Promise<string | null> {
  const [company, partner] = await Promise.all([
    db.companyProfile.findUnique({ where: { userId }, select: { phone: true } }),
    db.partnerProfile.findUnique({ where: { userId }, select: { phone: true } }),
  ]);
  return company?.phone ?? partner?.phone ?? null;
}

/**
 * Single call for "let this user know" — writes the in-app notification
 * (bell icon), pushes to Telegram (if they've linked it), and pushes a
 * WhatsApp template message (if a phone is on file and WhatsApp is
 * configured) at the same time. Replaces bare notifyUser() at every call
 * site that represents an actual event the user should see even if they
 * never open Telegram or WhatsApp. Every channel here is transactional/
 * UTILITY in nature — about something the recipient's own account already
 * initiated — never used for marketing outreach. No channel throws, so this
 * never blocks the action that triggered it.
 */
export async function notify(
  userId: string,
  opts: { title: string; body: string; telegramHtml: string; link?: string },
): Promise<void> {
  const recipient = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (recipient && isTrainingAccountEmail(recipient.email)) {
    await createNotification(userId, { title: opts.title, body: opts.body, link: opts.link });
    return;
  }
  const tasks: Promise<unknown>[] = [
    createNotification(userId, { title: opts.title, body: opts.body, link: opts.link }),
    pushTelegram(userId, opts.telegramHtml),
  ];
  if (isWhatsAppConfigured()) {
    tasks.push(
      phoneForUser(userId)
        .then((phone) => (phone ? sendWhatsAppTemplate(phone, [opts.title, opts.body]) : null))
        .catch((err) => console.error("notify: WhatsApp fan-out failed", err)),
    );
  }
  await Promise.all(tasks);
}

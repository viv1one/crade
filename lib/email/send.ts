import { Resend } from "resend";

// Falls back to Resend's own sandbox sender, which works immediately with
// no domain verification — fine for a personal project. Same
// "?? default" convention as lib/push/send.ts's VAPID config.
const FROM = process.env.RESEND_FROM_EMAIL ?? "Crade <onboarding@resend.dev>";

export async function sendEmailNotification(
  to: string,
  payload: { title: string; body: string; url?: string }
) {
  // Constructed lazily, not at module scope like lib/push/send.ts's
  // webpush.setVapidDetails — unlike that call, the Resend SDK's
  // constructor throws immediately on an empty API key rather than
  // deferring the error to send time, which broke `next build`'s page-data
  // collection (it imports every route, including the cron route that
  // imports this file, even with no key configured locally).
  const resend = new Resend(process.env.RESEND_API_KEY ?? "");
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: payload.title,
    text: payload.url ? `${payload.body}\n\n${payload.url}` : payload.body,
  });
  if (error) throw error;
}

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY ?? "");

// Falls back to Resend's own sandbox sender, which works immediately with
// no domain verification — fine for a personal project. Same
// "?? default" convention as lib/push/send.ts's VAPID config.
const FROM = process.env.RESEND_FROM_EMAIL ?? "Crade <onboarding@resend.dev>";

export async function sendEmailNotification(
  to: string,
  payload: { title: string; body: string; url?: string }
) {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: payload.title,
    text: payload.url ? `${payload.body}\n\n${payload.url}` : payload.body,
  });
  if (error) throw error;
}

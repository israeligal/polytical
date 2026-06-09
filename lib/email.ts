import { Resend } from "resend";
import { logger } from "@/app/lib/logger";

// Transactional email via Resend. Best-effort: send() never throws, so a mail
// failure can never 500 a signup or a reset request — it's logged and the auth
// flow proceeds (mirrors the non-fatal starting-grant hook in lib/auth.ts).
//
// EMAIL_FROM must be an address on a domain you've verified in Resend. The
// `onboarding@resend.dev` default only delivers to your own Resend account
// email — fine for local testing, NOT for real users. Set EMAIL_FROM in prod.

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const EMAIL_FROM = process.env.EMAIL_FROM?.trim() || "Polytical <onboarding@resend.dev>";

// Lazily constructed so a missing key only bites when we actually send — the
// app (and tests/build) boot fine without email configured.
let client: Resend | null = null;
function getClient(): Resend {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  if (!client) client = new Resend(RESEND_API_KEY);
  return client;
}

type SendArgs = { to: string; subject: string; html: string };
type LinkEmailArgs = { to: string; url: string };
type LayoutArgs = { title: string; intro: string; cta: string; url: string; note: string };

async function send({ to, subject, html }: SendArgs): Promise<boolean> {
  if (!RESEND_API_KEY) {
    logger.error("email_not_configured", { to, subject });
    return false;
  }
  try {
    const { data, error } = await getClient().emails.send({ from: EMAIL_FROM, to, subject, html });
    if (error) {
      logger.error("email_send_failed", { to, subject, err: String(error) });
      return false;
    }
    logger.info("email_sent", { to, subject, id: data?.id ?? null });
    return true;
  } catch (e) {
    logger.error("email_send_threw", { to, subject, err: String(e) });
    return false;
  }
}

// Hebrew, RTL. Inline styles only (email clients strip <style>/external CSS).
function layout({ title, intro, cta, url, note }: LayoutArgs): string {
  return `<!doctype html>
<html dir="rtl" lang="he">
  <body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
    <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:right;">
        <h1 style="margin:0 0 12px;font-size:22px;color:#121831;">${title}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#444;">${intro}</p>
        <a href="${url}" style="display:inline-block;background:#00b386;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 24px;border-radius:10px;">${cta}</a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#888;">${note}</p>
      </div>
      <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#aaa;">פוליטיקל — זירת התחזיות הפוליטית</p>
    </div>
  </body>
</html>`;
}

/** Verification email sent on signup (does not block login — soft verify). */
export async function sendVerificationEmail({ to, url }: LinkEmailArgs): Promise<boolean> {
  return send({
    to,
    subject: "אימות כתובת האימייל — פוליטיקל",
    html: layout({
      title: "אימות האימייל",
      intro: "ברוכים הבאים לפוליטיקל! לחצו על הכפתור כדי לאמת את כתובת האימייל שלכם.",
      cta: "אימות האימייל",
      url,
      note: "אם לא נרשמתם לפוליטיקל, אפשר להתעלם מהמייל הזה.",
    }),
  });
}

/** Password-reset email sent when a user requests a reset. */
export async function sendResetPassword({ to, url }: LinkEmailArgs): Promise<boolean> {
  return send({
    to,
    subject: "איפוס סיסמה — פוליטיקל",
    html: layout({
      title: "איפוס סיסמה",
      intro: "קיבלנו בקשה לאיפוס הסיסמה לחשבון שלכם. לחצו על הכפתור כדי לבחור סיסמה חדשה.",
      cta: "איפוס הסיסמה",
      url,
      note: "הקישור תקף לזמן מוגבל. אם לא ביקשתם לאפס סיסמה, אפשר להתעלם מהמייל הזה.",
    }),
  });
}

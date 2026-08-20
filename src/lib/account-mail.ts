import 'server-only';
import { Resend } from 'resend';

/**
 * Emails sent TO artists, as distinct from lib/notify.ts which alerts Samir.
 *
 * Different audience, different rules. These are transactional messages a
 * customer is waiting on, so:
 *
 *  - the code goes in the SUBJECT as well as the body, because most people
 *    read a verification code off the notification without opening anything;
 *  - there is no tracking, no image, no external asset — a one-time code that
 *    silently phones home is not something to put in someone's inbox;
 *  - failures return a reason instead of throwing. A registration must not be
 *    rolled back because a mail provider had a bad minute, and the caller
 *    decides what to tell the person waiting.
 *
 * Tables and inline styles rather than modern CSS: email clients are still
 * email clients.
 */

export type MailResult = { sent: boolean; reason?: string };

const FROM = () => process.env.MAIL_FROM || 'SnareByt <onboarding@resend.dev>';

function shell(opts: {
  eyebrow: string;
  heading: string;
  body: string;
  footer?: string;
}) {
  return `<!doctype html><html><body style="margin:0;background:#040405;padding:28px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#0d0d10;border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:hidden">
    <tr><td style="height:3px;background:#E01B36"></td></tr>
    <tr><td style="padding:28px 28px 0">
      <div style="color:#F4F4F6;font:800 19px/1.2 Arial,sans-serif;letter-spacing:.06em">SNAREBYT</div>
      <div style="color:#E01B36;font:700 11px/1.4 Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;margin-top:8px">${opts.eyebrow}</div>
      <div style="color:#F4F4F6;font:700 22px/1.3 Arial,sans-serif;margin-top:14px">${opts.heading}</div>
    </td></tr>
    <tr><td style="padding:16px 28px 30px;color:#C9C9D1;font:400 15px/1.65 Arial,sans-serif">
      ${opts.body}
    </td></tr>
  </table>
  <div style="max-width:520px;margin:14px auto 0;color:#5C5C66;font:400 11px/1.6 Arial,sans-serif;text-align:center">
    ${opts.footer ?? 'Sent by snarebyt.com because someone used this address on the site.'}
  </div>
  </body></html>`;
}

async function send(to: string, subject: string, html: string, text: string): Promise<MailResult> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { sent: false, reason: 'no_api_key' };
    const { error } = await new Resend(key).emails.send({ from: FROM(), to, subject, html, text });
    if (error) return { sent: false, reason: String(error.message ?? error) };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String(e) };
  }
}

/**
 * The one-time code.
 *
 * Spaced as "123 456" in the body because that is how people read six digits
 * back to themselves, but stated unspaced in the subject so it can be copied
 * from a notification without picking up a space the form would then reject.
 */
export function otpEmail(code: string, minutes: number) {
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  return {
    subject: `${code} is your SnareByt verification code`,
    html: shell({
      eyebrow: 'Verify your email',
      heading: 'Your verification code',
      body: `
        <div style="margin:6px 0 20px;padding:18px;border-radius:12px;background:#141418;border:1px solid rgba(255,255,255,.12);text-align:center">
          <div style="color:#fff;font:800 34px/1 'Courier New',monospace;letter-spacing:.18em">${pretty}</div>
        </div>
        <p style="margin:0 0 12px">Enter this to finish setting up your artist account. It expires in ${minutes} minutes.</p>
        <p style="margin:0;color:#8C8C96;font-size:13px">If you did not ask for this, you can ignore it — nobody can use the code without your inbox, and no account is created until it is entered.</p>`,
    }),
    text: `Your SnareByt verification code is ${code}. It expires in ${minutes} minutes. If you did not request it, ignore this email.`,
  };
}

export function sendOtpEmail(to: string, code: string, minutes = 10): Promise<MailResult> {
  const m = otpEmail(code, minutes);
  return send(to, m.subject, m.html, m.text);
}

export function resetEmail(url: string, minutes: number) {
  return {
    subject: 'Reset your SnareByt password',
    html: shell({
      eyebrow: 'Password reset',
      heading: 'Set a new password',
      body: `
        <p style="margin:0 0 20px">Use the button below to choose a new password. The link works once and expires in ${minutes} minutes.</p>
        <a href="${url}" style="display:inline-block;background:#E01B36;color:#fff;text-decoration:none;font:700 14px/1 Arial,sans-serif;padding:14px 24px;border-radius:9px">Choose a new password</a>
        <p style="margin:22px 0 0;color:#8C8C96;font-size:13px">If you did not ask for this, nothing has changed and you can ignore it. Your current password still works.</p>
        <p style="margin:14px 0 0;color:#5C5C66;font-size:12px;word-break:break-all">${url}</p>`,
    }),
    text: `Set a new SnareByt password: ${url}\n\nThe link works once and expires in ${minutes} minutes. If you did not request it, ignore this email — nothing has changed.`,
  };
}

export function sendResetEmail(to: string, url: string, minutes = 30): Promise<MailResult> {
  const m = resetEmail(url, minutes);
  return send(to, m.subject, m.html, m.text);
}

/**
 * Sent when a password actually changes, to whichever address is on the
 * account. This is the message that lets someone notice a takeover, so it
 * goes out even when the change was legitimate and expected.
 */
export function sendPasswordChanged(to: string): Promise<MailResult> {
  const m = shell({
    eyebrow: 'Security',
    heading: 'Your password was changed',
    body: `
      <p style="margin:0 0 12px">The password on your SnareByt artist account has just been changed, and every other signed-in device was signed out.</p>
      <p style="margin:0;color:#8C8C96;font-size:13px">If this was not you, reset your password immediately and message SnareByt.</p>`,
  });
  return send(to, 'Your SnareByt password was changed', m,
    'The password on your SnareByt artist account was changed and other devices were signed out. If this was not you, reset it immediately and contact SnareByt.');
}

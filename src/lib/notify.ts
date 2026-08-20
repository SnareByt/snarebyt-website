import 'server-only';
import { Resend } from 'resend';
import { prisma } from './prisma';

/**
 * Alerts to Samir when something happens on the site.
 *
 * Three rules shape this:
 *
 *  1. It can NEVER break the thing it is reporting on. A failed alert must not
 *     roll back a verified payment or lose an enquiry, so every path here
 *     swallows its errors and records them rather than throwing.
 *  2. It is configured from the dashboard, not from code — where alerts go and
 *     which events send them are Setting rows.
 *  3. It says what happened and what to do, in the subject line. An alert read
 *     on a phone lock screen at 2am should not require opening anything to
 *     know whether it matters.
 */

export type NotifyEvent = 'order.placed' | 'order.paid' | 'enquiry.received';

type Settings = {
  to: string;
  onOrder: boolean;
  onPaid: boolean;
  onEnquiry: boolean;
};

async function loadSettings(): Promise<Settings | null> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['notifyEmail', 'notifyOnOrder', 'notifyOnPaid', 'notifyOnEnquiry', 'businessEmail'] } },
  });
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? '';
  // Falls back to the business email, so alerts work the moment a key exists
  // rather than silently going nowhere until a second field is filled in.
  const to = get('notifyEmail').trim() || get('businessEmail').trim();
  if (!to) return null;
  return {
    to,
    // Default ON. Someone who has configured an address wants to hear about
    // sales; making them opt in per event would mean missing the first one.
    onOrder: get('notifyOnOrder') !== 'false',
    onPaid: get('notifyOnPaid') !== 'false',
    onEnquiry: get('notifyOnEnquiry') !== 'false',
  };
}

const wants = (s: Settings, e: NotifyEvent) =>
  e === 'order.placed' ? s.onOrder : e === 'order.paid' ? s.onPaid : s.onEnquiry;

/** Minimal, dark, and readable in a notification preview. */
function shell(title: string, accent: string, rows: [string, string][], action?: { label: string; href: string }) {
  const cells = rows
    .map(([k, v]) => `
      <tr>
        <td style="padding:7px 0;color:#8C8C96;font:600 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;vertical-align:top">${k}</td>
        <td style="padding:7px 0 7px 18px;color:#F4F4F6;font:400 15px/1.5 Arial,sans-serif">${v}</td>
      </tr>`)
    .join('');

  return `<!doctype html><html><body style="margin:0;background:#040405;padding:28px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#0d0d10;border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:hidden">
    <tr><td style="height:3px;background:${accent}"></td></tr>
    <tr><td style="padding:26px 26px 4px">
      <div style="color:#F4F4F6;font:800 19px/1.2 Arial,sans-serif;letter-spacing:.06em">SNAREBYT</div>
      <div style="color:${accent};font:700 11px/1.4 Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;margin-top:6px">${title}</div>
    </td></tr>
    <tr><td style="padding:14px 26px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cells}</table>
    </td></tr>
    ${action ? `<tr><td style="padding:22px 26px 30px">
      <a href="${action.href}" style="display:inline-block;background:#E01B36;color:#fff;text-decoration:none;font:700 13px/1 Arial,sans-serif;padding:13px 22px;border-radius:9px">${action.label}</a>
    </td></tr>` : '<tr><td style="height:22px"></td></tr>'}
  </table>
  <div style="max-width:520px;margin:14px auto 0;color:#5C5C66;font:400 11px/1.5 Arial,sans-serif;text-align:center">
    Sent by your own website. Change or switch these off in Admin &rarr; Settings.
  </div>
  </body></html>`;
}

export type NotifyInput = {
  event: NotifyEvent;
  subject: string;
  title: string;
  rows: [string, string][];
  action?: { label: string; href: string };
  /** Where the phone app should open on tap. Defaults to its dashboard. */
  appUrl?: string;
};

/**
 * Send one alert, by email and to the phone.
 *
 * The two channels are deliberately independent. Email is the durable record —
 * it survives a lost phone and it is searchable a year later. Push is the
 * interrupt — it reaches him in a session with his phone face down on the desk.
 * Neither is allowed to suppress the other, and neither is allowed to throw:
 * a failed alert must not roll back the verified payment that triggered it.
 *
 * Returns why it did not send rather than throwing, so a caller can log the
 * reason without having to guard the call.
 */
export async function notifyAdmin(input: NotifyInput): Promise<{ sent: boolean; reason?: string; pushed?: number }> {
  // Fired first and awaited alongside the email, so a slow mail API never
  // delays the buzz in his pocket.
  const push = sendPush(input).catch(() => ({ sent: 0 }));

  const mail = await (async (): Promise<{ sent: boolean; reason?: string }> => {
    try {
      const key = process.env.RESEND_API_KEY;
      if (!key) return { sent: false, reason: 'no_api_key' };

      const settings = await loadSettings();
      if (!settings) return { sent: false, reason: 'no_recipient' };
      if (!wants(settings, input.event)) return { sent: false, reason: 'event_disabled' };

      const accent = input.event === 'order.paid' ? '#2BB673' : '#E01B36';
      const { error } = await new Resend(key).emails.send({
        from: process.env.MAIL_FROM || 'SnareByt <onboarding@resend.dev>',
        to: settings.to,
        subject: input.subject,
        html: shell(input.title, accent, input.rows, input.action),
      });
      if (error) return { sent: false, reason: String(error.message ?? error) };
      return { sent: true };
    } catch (e) {
      return { sent: false, reason: String(e) };
    }
  })();

  const pushed = (await push).sent;
  // "Sent" is true if EITHER channel got through. Reporting failure because
  // email bounced, while the alert is sitting on his lock screen, would be a
  // lie in the audit log.
  return { sent: mail.sent || pushed > 0, reason: mail.reason, pushed };
}

/**
 * The push half.
 *
 * The body is built from the same rows the email uses rather than written
 * twice, so the two channels can never describe the same event differently.
 * Only the first two rows survive — a lock screen shows about two lines, and
 * the rest is noise the moment it is truncated.
 */
async function sendPush(input: NotifyInput): Promise<{ sent: number }> {
  try {
    const settings = await loadSettings();
    // The per-event switches on the Settings screen govern both channels. Two
    // sets of toggles for "tell me about orders" would be a trap.
    if (settings && !wants(settings, input.event)) return { sent: 0 };

    const { pushToAdmins, pushConfigured } = await import('./push');
    if (!pushConfigured()) return { sent: 0 };

    const body = input.rows.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' · ');
    const res = await pushToAdmins({
      title: input.subject,
      body: body || input.title,
      url: input.appUrl ?? '/app',
      // Tagged by event so three status changes on one order collapse into one
      // line on the lock screen instead of stacking three deep.
      tag: input.event,
    });
    return { sent: res.sent };
  } catch {
    return { sent: 0 };
  }
}

/** Used by the "send a test" button so the reason for silence is visible. */
export async function notifyStatus(): Promise<
  { ok: true; to: string } | { ok: false; problem: string; fix: string }
> {
  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      problem: 'No email service key is set on the server.',
      fix: 'Create a free account at resend.com, make an API key, then add RESEND_API_KEY in Vercel → Settings → Environment Variables and redeploy.',
    };
  }
  const s = await loadSettings();
  if (!s) {
    return {
      ok: false,
      problem: 'No address to send alerts to.',
      fix: 'Fill in the alert email below, or set a business email, and save.',
    };
  }
  return { ok: true, to: s.to };
}

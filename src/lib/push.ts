import 'server-only';
import webpush from 'web-push';
import { prisma } from './prisma';

/**
 * Push alerts to the installed phone dashboard.
 *
 * This sits alongside `notify.ts`, which sends email, and obeys the same first
 * rule: **it can never break the thing it is reporting on.** A verified payment
 * must not roll back because Apple's push service was slow, so every path here
 * swallows its errors. An alert that fails to send is a missed notification;
 * an alert that throws is a lost sale.
 *
 * Web Push payloads are encrypted end-to-end with keys the subscription itself
 * supplies, so Apple relays a blob it cannot read. That matters here: order
 * totals and customer names go through this pipe.
 *
 * ## iOS reality, stated plainly
 *
 * iOS only delivers Web Push to a site that has been added to the Home Screen
 * and opened from that icon, on iOS 16.4 or later. Notifications will not
 * arrive in Safari. The Notifications screen in the app says so rather than
 * showing a switch that quietly does nothing.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';

/**
 * The VAPID subject identifies who is sending, and push services reject a
 * malformed one. It must be a mailto: or https: URL.
 */
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:snarebyt@gmail.com';

export const pushConfigured = () => Boolean(PUBLIC_KEY && PRIVATE_KEY);

/**
 * The public key is the one piece of this that is *supposed* to reach the
 * browser — it is what `pushManager.subscribe()` takes. It is served through
 * an authenticated route rather than a NEXT_PUBLIC_ variable, so the pair
 * stays together in server env and nobody has to remember which half was safe.
 */
export const vapidPublicKey = () => PUBLIC_KEY;

let configured = false;
function ensure() {
  if (configured || !pushConfigured()) return pushConfigured();
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Path inside the app to open on tap, e.g. "/app/orders/abc". */
  url?: string;
  /**
   * Collapse key. Two alerts sharing a tag replace one another on the lock
   * screen instead of stacking — so five status changes on one order show as
   * one line, not five.
   */
  tag?: string;
};

/**
 * Send to every live device for a user.
 *
 * Endpoints that come back 404 or 410 are permanently gone: the app was deleted
 * or permission was withdrawn. Those are disabled with a reason rather than
 * deleted, so the Notifications screen can explain why alerts stopped instead
 * of silently showing zero devices. Any other failure is transient and the row
 * is left alone.
 */
export async function pushToUser(userId: string, payload: PushPayload) {
  if (!ensure()) return { sent: 0, failed: 0, skipped: 'VAPID keys are not set.' as const };

  const devices = await prisma.pushDevice.findMany({
    where: { userId, disabledReason: null },
  });
  if (!devices.length) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: 'high' },
        );
        sent++;
        await prisma.pushDevice
          .update({ where: { id: d.id }, data: { lastPushAt: new Date() } })
          .catch(() => {});
      } catch (err: unknown) {
        failed++;
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushDevice
            .update({
              where: { id: d.id },
              data: { disabledReason: 'This device stopped accepting alerts. Turn them on again from the phone.' },
            })
            .catch(() => {});
        }
      }
    }),
  );

  return { sent, failed };
}

/**
 * Alert every admin.
 *
 * Today that is one person, but the schema allows STAFF, and an order alert
 * that only reaches whoever happens to be row one would be a quiet bug the day
 * a second account exists.
 */
export async function pushToAdmins(payload: PushPayload) {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'STAFF'] } },
    select: { id: true },
  });
  const results = await Promise.all(admins.map((a) => pushToUser(a.id, payload)));
  return results.reduce((acc, r) => ({ sent: acc.sent + r.sent, failed: acc.failed + r.failed }), { sent: 0, failed: 0 });
}

export async function saveDevice(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  label?: string;
}) {
  // Upsert on endpoint: re-subscribing on the same phone must reuse the row and
  // clear any disabled flag, not pile up dead duplicates.
  return prisma.pushDevice.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      label: input.label ?? null,
    },
    update: {
      userId: input.userId,
      p256dh: input.p256dh,
      auth: input.auth,
      // Only overwritten when a label is actually supplied. The service
      // worker's silent re-subscribe sends none, and blanking the name on
      // every key rotation would leave an unidentifiable row in the device
      // list — exactly when you need to know which phone to revoke.
      ...(input.label ? { label: input.label } : {}),
      disabledReason: null,
    },
    select: { id: true },
  });
}

export async function removeDevice(userId: string, endpoint: string) {
  const { count } = await prisma.pushDevice.deleteMany({ where: { userId, endpoint } });
  return count > 0;
}

export async function listDevices(userId: string) {
  return prisma.pushDevice.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, createdAt: true, lastPushAt: true, disabledReason: true },
  });
}

import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/prisma-safe-auth';
import { pushToUser, pushConfigured } from '@/lib/push';

/**
 * Send a test alert to this admin's own devices.
 *
 * Worth having as a real endpoint rather than a hope: the push chain is long —
 * VAPID keys, the service worker's registration, the OS permission, Apple's
 * relay — and every link is invisible when it works. Without a way to prove the
 * whole path end to end, the first time anyone discovers push is broken is the
 * first sale that goes unannounced.
 *
 * It can only ever push to the caller's own devices. There is no user id in the
 * request, so this cannot be used to buzz anybody else.
 */

export const dynamic = 'force-dynamic';

export async function POST() {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });

  if (!pushConfigured()) {
    return NextResponse.json({
      ok: false,
      error: 'Push is not configured on the server — the VAPID keys are missing. Generate a pair and set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.',
    }, { status: 503 });
  }

  const result = await pushToUser(admin.id, {
    title: 'SnareByt',
    body: 'Alerts are working. This is what a new order will look like.',
    tag: 'test',
    url: '/app',
  });

  if (result.sent === 0) {
    return NextResponse.json({
      ok: false,
      // `failed` separates the two cases that look identical from here: no
      // device has ever registered, versus every registered device refused.
      // The fix is different for each, so the message has to be too.
      error: result.failed === 0
        ? 'No device is registered for alerts yet. Turn them on from this phone first.'
        : 'The push service rejected every device. They may need re-registering — turn alerts off and on again.',
    });
  }

  return NextResponse.json({
    ok: true,
    message: `Sent to ${result.sent} device${result.sent === 1 ? '' : 's'}.`,
  });
}

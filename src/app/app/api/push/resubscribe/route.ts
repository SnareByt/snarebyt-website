import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/prisma-safe-auth';
import { saveDevice, removeDevice } from '@/lib/push';

/**
 * Called by the service worker when the browser rotates a push subscription.
 *
 * The browser can invalidate an endpoint at any time and issue a new one. When
 * that happens the old endpoint silently stops delivering — the worst failure
 * mode a notification system has, because nothing appears to be wrong. The
 * worker catches `pushsubscriptionchange` and posts here with both the old
 * endpoint and the new subscription, so the swap is atomic from our side.
 *
 * The request arrives from the worker with `credentials: 'include'`, so the
 * session cookie comes with it and the same `currentAdmin()` check applies.
 * A worker whose session has since expired simply fails, and the device shows
 * as silent on the Account screen — which is the honest outcome.
 */

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });

  let body: {
    oldEndpoint?: string | null;
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ ok: false, error: 'Incomplete subscription.' }, { status: 400 });
  }

  await saveDevice({
    userId: admin.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  });

  /* Drop the dead endpoint only after the replacement is stored. If the order
     were reversed and the write failed, the device would end up registered for
     nothing at all — silent, with no row to explain why. */
  if (body.oldEndpoint && body.oldEndpoint !== sub.endpoint) {
    await removeDevice(admin.id, body.oldEndpoint);
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/prisma-safe-auth';
import { saveDevice, removeDevice, pushConfigured } from '@/lib/push';
import { audit } from '@/lib/audit';
import { deviceLabel } from '@/lib/app-format';

/**
 * Register or drop this device for push alerts.
 *
 * A route handler rather than a server action, because the subscription object
 * comes from `PushManager.subscribe()` — a browser API — and the natural shape
 * of that exchange is JSON over fetch. The authorisation is the same either
 * way: `currentAdmin()` is checked here, on the server, because this endpoint
 * is as public as any other.
 *
 * There is no user id in the request body on purpose. The device is bound to
 * whoever the session says is signed in; accepting an id from the caller would
 * let anyone with a valid session subscribe a device to somebody else's alerts.
 */

export const dynamic = 'force-dynamic';

type Body = {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  label?: string;
};

export async function POST(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });

  if (!pushConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Push is not configured on the server. The VAPID keys are missing.' },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json(
      { ok: false, error: 'That subscription is incomplete.' },
      { status: 400 },
    );
  }

  await saveDevice({
    userId: admin.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    label: body.label || deviceLabel(req.headers.get('user-agent') ?? ''),
  });

  await audit({
    actorId: admin.id, action: 'push.device.added', entity: 'User', entityId: admin.id,
    diff: { label: body.label ?? null },
  });

  return NextResponse.json({ ok: true });
}

/** Turn alerts off for this device. */
export async function DELETE(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }
  if (!body.subscription?.endpoint) {
    return NextResponse.json({ ok: false, error: 'No endpoint given.' }, { status: 400 });
  }

  // Scoped to this admin's own devices, so an endpoint belonging to someone
  // else cannot be unsubscribed by guessing it.
  await removeDevice(admin.id, body.subscription.endpoint);

  await audit({
    actorId: admin.id, action: 'push.device.removed', entity: 'User', entityId: admin.id,
  });

  return NextResponse.json({ ok: true });
}

import { requireAdmin } from '@/lib/prisma-safe-auth';
import { NavBar } from '@/components/app/Ui';
import { listDevices, vapidPublicKey, pushConfigured } from '@/lib/push';
import { notifyStatus } from '@/lib/notify';
import { shortDate, ago } from '@/lib/app-format';
import { AlertsPanel } from './AlertsPanel';

export const dynamic = 'force-dynamic';

/**
 * Alerts for new orders, payments and bookings.
 *
 * The VAPID *public* key is sent to the browser, which is what it is for — it
 * is the identity the push service checks a message against, and it is useless
 * without the private half that never leaves the server. Nothing secret goes
 * into this page; the Settings screen's rule that credentials live in server
 * env vars and are never `NEXT_PUBLIC_` still holds.
 */
export default async function AlertsPage() {
  const user = await requireAdmin();

  const [devices, mail] = await Promise.all([listDevices(user.id), notifyStatus()]);

  return (
    <>
      <NavBar title="Alerts" back="/app/more" />

      <AlertsPanel
        configured={pushConfigured()}
        publicKey={vapidPublicKey()}
        devices={devices.map((d) => ({
          id: d.id,
          label: d.label ?? 'Unnamed device',
          added: shortDate(d.createdAt),
          lastPush: d.lastPushAt ? ago(d.lastPushAt) : 'no alerts yet',
          disabledReason: d.disabledReason,
        }))}
        email={mail.ok ? { ok: true, to: mail.to } : { ok: false, problem: mail.problem, fix: mail.fix }}
      />
    </>
  );
}

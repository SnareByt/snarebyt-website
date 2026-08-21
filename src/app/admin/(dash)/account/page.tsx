import { prisma } from '@/lib/prisma';
import { requireAdmin, listSessions, currentSession } from '@/lib/prisma-safe-auth';
import { PasswordForm, TotpSetup } from './AccountForms';
import { Devices, type DeviceRow } from './Devices';
import { signOutDevice, signOutOtherDevices } from './actions';
import { deviceName, ago, until } from '@/lib/device-name';
import { Alerts, type PushDeviceRow } from './Alerts';
import { listDevices, pushConfigured, vapidPublicKey } from '@/lib/push';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const admin = await requireAdmin();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: admin.id },
    select: { email: true, name: true, twoFactorEnabled: true, lastLoginAt: true, lastLoginIp: true },
  });
  const [live, here, push] = await Promise.all([
    listSessions(admin.id), currentSession(), listDevices(admin.id),
  ]);

  const pushDevices: PushDeviceRow[] = push.map((d) => ({
    id: d.id,
    label: d.label ?? 'Unnamed device',
    added: ago(d.createdAt),
    lastPush: d.lastPushAt ? ago(d.lastPushAt) : 'never',
    disabledReason: d.disabledReason,
  }));
  const sessions = live.length;

  const devices: DeviceRow[] = live.map((s) => {
    const { name, detail } = deviceName(s.userAgent, s.label);
    return {
      id: s.id,
      name,
      detail,
      client: s.client,
      ip: s.ip,
      lastSeen: ago(s.lastSeenAt),
      signedIn: ago(s.createdAt),
      expires: until(s.expiresAt),
      current: here?.id === s.id,
    };
  });

  return (
    <>
      <header><div><div className="crumb">System</div><h1>Your account</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{user.name ?? user.email}</h2>
          <span className="chip">{user.email}</span>
          <span className={`chip ${user.twoFactorEnabled ? 'ok' : 'warn'}`}>
            {user.twoFactorEnabled ? '2FA on' : '2FA off'}
          </span>
          <span className="chip">{sessions} active session{sessions === 1 ? '' : 's'}</span>
        </div>

        <section className="sec">
          <Devices rows={devices} signOutOne={signOutDevice} signOutOthers={signOutOtherDevices} />
          <div className="note" style={{ marginTop: '1.1rem' }}>
            <span>🔑</span>
            <span>
              <b>To add a device, sign in on it.</b> Open{' '}
              <span className="mono">snarebyt.com/admin/login</span> on the phone or the Mac and
              sign in — it appears in this list. There is no invite to send and no code to type,
              because access belongs to whoever knows the password, not to a device. What matters
              is this list: if something here is not yours, sign it out and change the password.
            </span>
          </div>
        </section>

        <section className="sec" style={{ marginTop: '2rem' }}>
          <Alerts configured={pushConfigured()} publicKey={vapidPublicKey()} devices={pushDevices} />
        </section>

        <section className="sec" style={{ marginTop: '2rem' }}>
          <div className="sec-hd"><h2>Two-factor authentication</h2></div>
          <TotpSetup enabled={user.twoFactorEnabled} />
        </section>

        <section className="sec" style={{ marginTop: '2rem' }}>
          <div className="sec-hd"><h2>Password</h2></div>
          <PasswordForm />
        </section>

        <div className="note" style={{ marginTop: '2rem' }}>
          <span>🔒</span>
          <span>
            <b>Sessions store only a hash of their token.</b> A copy of the database cannot be
            replayed as a live login. Five wrong passwords lock the account for fifteen minutes,
            and sign-in is rate limited per connection on top of that.
            {user.lastLoginAt ? (
              <> Last signed in {user.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ')} UTC
                {user.lastLoginIp ? ` from ${user.lastLoginIp}` : ''}.</>
            ) : null}
          </span>
        </div>
      </div>
    </>
  );
}

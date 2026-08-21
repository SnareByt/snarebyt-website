import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentAccount, listDevices } from '@/lib/account';
import { getOverview } from '@/lib/account-data';
import { PortalNav } from '@/components/account/PortalNav';
import { ProfileForm, PasswordForm, DeviceList, SignOutButton } from './Forms';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings — SnareByt',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const me = await currentAccount();
  if (!me) redirect('/account/login?next=/account/settings');

  const [devices, { unread }] = await Promise.all([listDevices(me.id), getOverview(me.id)]);

  return (
    <div className="pt">
      <div className="pt-hd">
        <div>
          <div className="eyebrow">Artist account</div>
          <h1>Settings</h1>
          <p>Your details, your password, and where you are signed in.</p>
        </div>
        <SignOutButton />
      </div>

      <PortalNav unread={unread} />

      <div className="pt-split">
        <div>
          <div className="pt-panel">
            <h3>Your details</h3>
            <ProfileForm
              name={me.name ?? ''}
              artistName={me.artistName ?? ''}
              phone={me.phone ?? ''}
              country={me.country ?? ''}
              email={me.email}
            />
          </div>

          <div className="pt-panel">
            <h3>Password</h3>
            <PasswordForm />
          </div>
        </div>

        <div>
          <div className="pt-panel">
            <h3>Where you are signed in</h3>
            <DeviceList devices={devices.map((d) => ({
              id: d.id,
              current: d.current,
              label: d.label,
              ip: d.ip,
              lastSeenAt: d.lastSeenAt.toISOString(),
            }))} />
          </div>

          <div className="pt-panel">
            <h3>Your data</h3>
            <p style={{ fontSize: '.84rem', color: 'var(--muted)', lineHeight: 1.7 }}>
              Your orders, licences and project files stay on your account for as long as it
              exists — a licence has to stay provable years after the sale.
            </p>
            <p style={{ fontSize: '.84rem', color: 'var(--muted)', lineHeight: 1.7, marginTop: '.8rem' }}>
              To close your account or ask for a copy of everything held about you, message
              SnareByt and it will be handled directly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

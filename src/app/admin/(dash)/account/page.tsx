import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { PasswordForm, TotpSetup } from './AccountForms';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const admin = await requireAdmin();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: admin.id },
    select: { email: true, name: true, twoFactorEnabled: true, lastLoginAt: true, lastLoginIp: true },
  });
  const sessions = await prisma.session.count({ where: { userId: admin.id } });

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

import { requireAdmin } from '@/lib/prisma-safe-auth';
import { prisma } from '@/lib/prisma';
import { NavBar } from '@/components/app/Ui';
import { shortDate, ago } from '@/lib/app-format';
import { myPasskeys, mySessions } from '@/app/app/account/actions';
import { SecurityPanel } from './SecurityPanel';

export const dynamic = 'force-dynamic';

/**
 * How this account is protected, and what is currently signed in.
 *
 * The one screen where an admin needs to be able to answer "is anything on
 * this account that should not be?" from wherever they happen to be — which
 * is precisely when a phone is the only thing to hand.
 */
export default async function SecurityPage() {
  const user = await requireAdmin();

  const [passkeys, sessions, account] = await Promise.all([
    myPasskeys(),
    mySessions(),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorEnabled: true, lastLoginAt: true, lastLoginIp: true, email: true },
    }),
  ]);

  return (
    <>
      <NavBar title="Security" back="/app/more" />

      <SecurityPanel
        email={account.email}
        twoFactorEnabled={account.twoFactorEnabled}
        lastLogin={account.lastLoginAt ? `${shortDate(account.lastLoginAt)} · ${ago(account.lastLoginAt)}` : 'Never'}
        lastLoginIp={account.lastLoginIp ?? '—'}
        passkeys={passkeys.map((p) => ({
          id: p.id,
          label: p.label,
          added: shortDate(p.createdAt),
          lastUsed: p.lastUsedAt ? ago(p.lastUsedAt) : 'never used',
        }))}
        sessions={sessions.map((s) => ({
          id: s.id,
          label: s.label ?? (s.client === 'APP' ? 'Phone dashboard' : 'Browser'),
          client: s.client,
          ip: s.ip ?? '—',
          lastSeen: ago(s.lastSeenAt ?? s.createdAt),
          expires: shortDate(s.expiresAt),
          current: s.current,
        }))}
      />
    </>
  );
}

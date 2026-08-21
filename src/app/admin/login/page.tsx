import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { secretSegment } from '@/lib/admin-path';
import { LoginForm, FirstRunForm } from './LoginForm';
// Login sits OUTSIDE the (dash) route group on purpose: that group's layout
// calls requireAdmin() and redirects when there is no session, so wrapping the
// login page in it made /admin/login redirect to itself forever. It still
// needs the admin stylesheet, hence the direct import.
import '../admin.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in — SnareByt',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ created?: string }> }) {
  // Defence in depth. The middleware already 404s this path once a secret door
  // is configured, but middleware can be bypassed by a rewrite rule or a
  // future matcher change, and a door that only *usually* closes is not shut.
  if (secretSegment()) notFound();

  const sp = await searchParams;

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { email: true, passwordHash: true },
  });

  // No hash at all means the account has never been set up. That is the only
  // state in which the password-creation form is reachable.
  const needsSetup = Boolean(admin) && !admin!.passwordHash;

  return (
    <div className="login-wrap">
      <div className="login-glow" aria-hidden="true" />
      {needsSetup
        ? <FirstRunForm email={admin!.email} />
        : <LoginForm defaultEmail={admin?.email ?? ''} justCreated={sp.created === '1'} />}
    </div>
  );
}

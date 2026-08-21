import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { LoginForm, FirstRunForm } from '../login/LoginForm';
import { secretSegment } from '@/lib/admin-path';
// Same reason as /admin/login: this sits outside the (dash) route group,
// whose layout redirects anyone without a session, so it needs the admin
// stylesheet imported directly.
import '../admin.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in — SnareByt',
  robots: { index: false, follow: false },
};

/**
 * The sign-in form at a path only Samir knows.
 *
 * Live only when ADMIN_SECRET_PATH is set in the server environment; every
 * other value of this segment answers 404, including when no secret is
 * configured at all. The comparison is against the environment, never against
 * anything in the request, so guessing the URL is the only way in and there is
 * nothing here that tells you whether you are close.
 *
 * The form itself is the same component as /admin/login — one implementation,
 * so a fix to sign-in cannot land on one door and miss the other.
 */
export default async function SecretLoginPage({
  params, searchParams,
}: {
  params: Promise<{ secret: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { secret } = await params;
  const configured = secretSegment();

  if (!configured || secret !== configured) notFound();

  const sp = await searchParams;

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { email: true, passwordHash: true },
  });

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

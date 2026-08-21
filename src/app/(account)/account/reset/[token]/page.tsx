import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { sha256 } from '@/lib/account';
import { ResetForm } from './ResetForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Choose a new password — SnareByt',
  robots: { index: false, follow: false },
};

/**
 * The token is checked here as well as in the action.
 *
 * Not belt and braces — it is the difference between someone typing a whole
 * new password before being told the link died, and being told on arrival.
 * The action still re-checks, because this page's verdict is a courtesy and
 * the action's is the one that counts.
 */
export default async function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const row = await prisma.token.findUnique({
    where: { hash: sha256(token) },
    select: { kind: true, usedAt: true, expiresAt: true },
  });

  const dead = !row || row.kind !== 'PASSWORD_RESET' || row.usedAt || row.expiresAt < new Date();

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-hd">
          <div className="eyebrow">Password reset</div>
          <h1>{dead ? 'This link has expired' : 'Choose a new password'}</h1>
          <p>
            {dead
              ? 'Reset links work once and last 30 minutes. Request a fresh one and it will arrive in a moment.'
              : 'Pick something you have not used anywhere else. Every other signed-in device will be signed out.'}
          </p>
        </div>

        {dead ? (
          <Link href="/account/forgot" className="btn btn-red btn-full">Send a new link</Link>
        ) : (
          <ResetForm token={token} />
        )}

        <div className="auth-alt">
          <Link href="/account/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}

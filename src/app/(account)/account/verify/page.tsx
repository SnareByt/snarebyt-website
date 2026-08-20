import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/account';
import { readPending } from '../actions';
import { VerifyForm } from './VerifyForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Confirm your email — SnareByt',
  robots: { index: false, follow: false },
};

/** Shows a@b.com as a•••@b.com — enough to recognise, not enough to harvest. */
function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}${'•'.repeat(Math.max(3, user.length - 2))}@${domain}`;
}

export default async function VerifyPage() {
  if (await currentAccount()) redirect('/account');

  const pending = await readPending();
  if (!pending) redirect('/account/register');

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-hd">
          <div className="eyebrow">One more step</div>
          <h1>Check your email</h1>
          <p>
            We sent a six-digit code to <b style={{ color: 'var(--text)' }}>{maskEmail(pending.email)}</b>.
            It expires in ten minutes.
          </p>
        </div>

        <VerifyForm />
      </div>
    </div>
  );
}

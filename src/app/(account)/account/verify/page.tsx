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

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ nomail?: string }>;
}) {
  if (await currentAccount()) redirect('/account');

  const pending = await readPending();
  if (!pending) redirect('/account/register');

  const { nomail } = await searchParams;

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

        {nomail === '1' && (
          <div className="banner bad" role="alert">
            <i aria-hidden="true">!</i>
            <span>
              <b>The code could not be emailed.</b> This is a problem at our end, not yours —
              the site&rsquo;s mail service is not responding. Try &ldquo;Send another code&rdquo;
              below, and if it still fails, message SnareByt and your account will be opened
              manually.
            </span>
          </div>
        )}

        <VerifyForm />
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/account';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in — SnareByt',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  if (await currentAccount()) redirect('/account');
  const sp = await searchParams;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-hd">
          <div className="eyebrow">Artist account</div>
          <h1>Welcome back</h1>
          <p>Your licences, files and project updates.</p>
        </div>

        <LoginForm
          next={sp.next ?? ''}
          justReset={sp.reset === '1'}
        />

        <div className="auth-alt">
          No account yet? <Link href="/account/register">Create one</Link>
          <br />
          <Link href="/account/forgot" style={{ display: 'inline-block', marginTop: '.5rem' }}>
            Forgotten your password?
          </Link>
        </div>
      </div>
    </div>
  );
}

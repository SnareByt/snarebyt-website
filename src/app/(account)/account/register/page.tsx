import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/account';
import { RegisterForm } from './RegisterForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create your artist account — SnareByt',
  description: 'Track your orders, licences, project files and deliveries in one place.',
  // A sign-up page has nothing to offer a search engine and everything to lose
  // by being indexed alongside the catalogue.
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  if (await currentAccount()) redirect('/account');

  return (
    <div className="auth-wrap">
      <div className="auth-card wide">
        <div className="auth-hd">
          <div className="eyebrow">Artist account</div>
          <h1>Everything you buy, in one place</h1>
          <p>
            Your licences, receipts, project files and delivery links — kept together and
            downloadable whenever you need them again.
          </p>
        </div>

        <RegisterForm />

        <div className="auth-alt">
          Already have an account? <Link href="/account/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotForm } from './ForgotForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reset your password — SnareByt',
  robots: { index: false, follow: false },
};

export default function ForgotPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-hd">
          <div className="eyebrow">Password reset</div>
          <h1>Send me a reset link</h1>
          <p>Enter the address on your account and we will email a link that works once.</p>
        </div>

        <ForgotForm />

        <div className="auth-alt">
          Remembered it? <Link href="/account/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

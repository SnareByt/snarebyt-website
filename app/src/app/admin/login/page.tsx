import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
// Login sits OUTSIDE the (dash) route group on purpose: that group's layout
// calls requireAdmin() and redirects when there is no session, so wrapping the
// login page in it made /admin/login redirect to itself forever. It still
// needs the admin stylesheet, hence the direct import.
import '../admin.css';
import { signIn } from '@/lib/prisma-safe-auth';
import { rateLimit } from '@/lib/audit';

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;

  async function action(formData: FormData) {
    'use server';
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';

    // Five attempts per IP per 10 minutes, on top of the per-account lockout.
    const limited = await rateLimit(`login:ip:${ip}`, 5, 10 * 60_000);
    if (!limited.ok) redirect('/admin/login?error=Too+many+attempts.+Wait+ten+minutes.');

    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const res = await signIn(email, password, ip, h.get('user-agent') ?? undefined);
    if (!res.ok) redirect(`/admin/login?error=${encodeURIComponent(res.error)}`);

    const next = String(formData.get('next') ?? '/admin');
    redirect(next.startsWith('/admin') ? next : '/admin');
  }

  return (
    <div className="login-wrap">
      <form action={action} className="login-box">
        <div className="eyebrow">Admin access</div>
        <h1 className="display">Sign in</h1>
        {sp.error ? <p className="err-box">{sp.error}</p> : null}
        <input type="hidden" name="next" value={sp.next ?? '/admin'} />
        <label className="fl">Email</label>
        <input className="in" name="email" type="email" autoComplete="username" required />
        <label className="fl">Password</label>
        <input className="in" name="password" type="password" autoComplete="current-password" required />
        <button className="btn b-red b-full" type="submit">Sign in →</button>
      </form>
    </div>
  );
}

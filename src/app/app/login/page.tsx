import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/prisma-safe-auth';
import { prisma } from '@/lib/prisma';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

/**
 * Sign in to the phone dashboard.
 *
 * Lives outside the (tabs) group on purpose — that layout calls requireAdmin()
 * and would redirect straight back here, which is the loop the desktop admin
 * avoids the same way.
 */
export default async function AppLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already signed in on this device: skip the screen entirely rather than
  // showing a sign-in form to someone who is signed in.
  if (await currentAdmin()) redirect('/app');

  const { next } = await searchParams;

  /**
   * Only ever follow a path inside the app.
   *
   * `next` arrives from the URL, so it is attacker-controlled. Without this
   * check a crafted link like /app/login?next=https://evil.example would
   * bounce a freshly authenticated Samir off-site — the classic open-redirect,
   * which is most dangerous immediately after a login because that is exactly
   * when a user expects to be sent somewhere.
   *
   * The second condition rejects "//evil.example", which is protocol-relative
   * and therefore off-site despite starting with a slash.
   */
  const target = next && next.startsWith('/app') && !next.startsWith('//') ? next : '/app';

  /**
   * Whether to offer Face ID at all.
   *
   * Counting credentials rather than naming them: the screen needs to know if
   * the button is worth showing, and a login page should never confirm who is
   * enrolled. Zero passkeys means the button would raise a system sheet that
   * can only fail, which reads as the app being broken.
   */
  const passkeys = await prisma.webAuthnCredential.count();

  return <LoginForm next={target} hasPasskeys={passkeys > 0} />;
}

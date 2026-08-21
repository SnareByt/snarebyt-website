import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/prisma-safe-auth';
import { prisma } from '@/lib/prisma';
import { TabBar } from '@/components/app/TabBar';

/**
 * Everything behind the tab bar.
 *
 * `currentAdmin()` here is a redirect, not the authorisation check. The real
 * check is the `requireAdmin()` at the top of every page and every server
 * action underneath — a server action is a public HTTP endpoint and can be
 * called without ever loading a layout. This mirrors the rule already stated
 * in middleware.ts and in the desktop admin, and it is the one thing about
 * this codebase that must not be "simplified" later.
 */
export const dynamic = 'force-dynamic'; // live counts must never be cached

export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  const user = await currentAdmin();
  if (!user) redirect('/app/login');

  // The only badge that earns a red dot: orders that have been placed but not
  // paid. Anything else would train him to ignore it.
  const pendingOrders = await prisma.order.count({ where: { status: 'PENDING_PAYMENT' } });

  return (
    <>
      <div className="app-main">{children}</div>
      <TabBar badges={{ orders: pendingOrders }} />
    </>
  );
}

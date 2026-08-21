import { redirect } from 'next/navigation';
import '../admin.css'; // admin-only styles — see the header of that file
import { currentAdmin, signOut } from '@/lib/prisma-safe-auth';
import { prisma } from '@/lib/prisma';
import { SideNav, MobileNav } from './Nav';
import { loginPath } from '@/lib/admin-path';

export const dynamic = 'force-dynamic'; // counts must never be cached

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentAdmin();
  if (!user) redirect(loginPath());

  const [pendingOrders, openProjects] = await Promise.all([
    prisma.order.count({ where: { status: 'PENDING_PAYMENT' } }),
    prisma.project.count({ where: { status: { not: 'DELIVERED' } } }),
  ]);
  const badge: Record<string, number> = { '/admin/orders': pendingOrders, '/admin/projects': openProjects };

  return (
    <div className="admin-shell">
      <aside>
        <div className="side-hd"><Wordmark /><span className="chip red">Admin</span></div>
        <SideNav badge={badge} />
        <form action={async () => { 'use server'; await signOut(); redirect(loginPath()); }} className="side-ft">
          <span>{user.name ?? user.email}</span>
          <button className="btn b-gh b-sm" type="submit">Sign out</button>
        </form>
      </aside>
      <main>{children}</main>
      <MobileNav badge={badge} user={user.name ?? user.email} />
    </div>
  );
}

function Wordmark() {
  return (
    <svg className="wm" viewBox="0 0 306 46" role="img" aria-label="SnareByt">
      <defs>
        <linearGradient id="wc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" /><stop offset="30%" stopColor="#d6d6dd" />
          <stop offset="50%" stopColor="#74747f" /><stop offset="64%" stopColor="#f6f6f9" />
          <stop offset="100%" stopColor="#8d8d98" />
        </linearGradient>
      </defs>
      <text className="wm-t" x="0" y="31" textLength="288" lengthAdjust="spacing" fill="url(#wc)">SNAREBYT</text>
      <g fill="#FF2D4A">
        <rect x="292" y="6" width="3" height="10" rx="1.5" />
        <rect x="298" y="1" width="3" height="20" rx="1.5" />
        <rect x="304" y="9" width="3" height="5" rx="1.5" />
      </g>
    </svg>
  );
}

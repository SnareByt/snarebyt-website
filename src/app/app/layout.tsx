import type { Metadata, Viewport } from 'next';
import './app.css';
import { ToastHost } from '@/components/app/Ui';
import { ServiceWorker } from '@/components/app/ServiceWorker';

/**
 * The installed phone dashboard.
 *
 * Not a second system. Every screen under here reads the same database
 * through the same Prisma client and writes through the same server actions
 * as `/admin`, which means a rule can never be enforced on the desktop and
 * missing on the phone — there is only one copy of each rule. The difference
 * is the shell: a tab bar instead of a sidebar, sheets instead of pages,
 * and a layout built for one thumb.
 *
 * `/admin` is untouched. Samir keeps the full desktop dashboard for the work
 * that genuinely wants a keyboard and a big screen — writing Bangla licence
 * terms, laying out page sections — and picks the phone up for the work that
 * happens away from the desk.
 */

export const metadata: Metadata = {
  title: 'SnareByt',
  // The name under the home-screen icon. Kept to one word because iOS
  // truncates at roughly twelve characters and "SnareByt Adm…" looks broken.
  applicationName: 'SnareByt',
  appleWebApp: {
    capable: true,
    title: 'SnareByt',
    // Lets the app's own background run under the status bar, so the red glow
    // reaches the top of the screen instead of stopping at a black bar.
    statusBarStyle: 'black-translucent',
  },
  // A private dashboard must never appear in a search result. The header set
  // in next.config.ts says the same thing; both are cheap.
  robots: { index: false, follow: false, nocache: true },
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  /**
   * `viewport-fit=cover` is what makes env(safe-area-inset-*) return anything
   * other than zero. Without it the layout stops at the notch and the tab bar
   * sits above the home indicator with a black band beneath — the single most
   * obvious tell that an installed web app is a web page.
   */
  viewportFit: 'cover',
  themeColor: '#040405',
  /**
   * Zoom is left enabled on purpose.
   *
   * `maximumScale: 1` is the usual way to stop iOS zooming when a field is
   * focused, and it is also how you take pinch-zoom away from anyone who needs
   * it. The zoom-on-focus problem is solved properly in app.css instead, by
   * giving every input a 16px font size, which is the actual trigger.
   */
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastHost>
      <div className="app-shell">
        <div className="app-glow" aria-hidden="true" />
        {children}
      </div>
      <ServiceWorker />
    </ToastHost>
  );
}

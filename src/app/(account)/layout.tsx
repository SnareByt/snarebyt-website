import { SiteHeader, type NavLink } from '@/components/site/SiteHeader';
import { AccountButton } from '@/components/site/AccountButton';
import { SiteFooter } from '@/components/site/SiteFooter';
import { CurrencyProvider } from '@/components/site/Currency';
import { getNav, getTheme, themeStyle } from '@/lib/content';
import { getUsdRate } from '@/lib/money';

/**
 * Shell for the artist portal.
 *
 * Shares the public site's header, footer and brand tokens so signing in does
 * not feel like leaving for a different product — but deliberately omits the
 * cart, the audio player and the analytics beacon. A signed-in artist reading
 * their own receipts is not someone to record page views on, and the player
 * belongs to the store.
 */
export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [menu, theme, rate] = await Promise.all([getNav('MENU'), getTheme(), getUsdRate()]);
  const links: NavLink[] = menu.map((m) => ({ label: m.label, href: m.href }));

  return (
    <CurrencyProvider rate={rate}>
      <div style={themeStyle(theme)} data-motion={theme.motion ? 'on' : 'off'}>
        {theme.grain ? <div className="grain" aria-hidden="true" /> : null}
        <SiteHeader links={links} account={<AccountButton />} />
        <main>{children}</main>
        <SiteFooter />
      </div>
    </CurrencyProvider>
  );
}

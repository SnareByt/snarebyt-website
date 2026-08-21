import { SiteHeader, type NavLink } from '@/components/site/SiteHeader';
import { AccountButton } from '@/components/site/AccountButton';
import { SiteFooter } from '@/components/site/SiteFooter';
import { CurrencyProvider } from '@/components/site/Currency';
import { PlayerProvider } from '@/components/site/Player';
import { CartProvider } from '@/components/site/Cart';
import { Analytics } from '@/components/site/Analytics';
import { PointerSheen } from '@/components/site/PointerSheen';
import { pointerSheenOn } from '@/lib/store-state';
import { getNav, getTheme, themeStyle } from '@/lib/content';
import { getUsdRate } from '@/lib/money';

/**
 * Public site shell.
 *
 * Nav, brand tokens and the USD rate are all database rows, so Samir can
 * change any of them from the dashboard without a deploy. Dynamic because a
 * content edit has to show up immediately — caching this would mean a headline
 * change appearing "sometime later", which is exactly the confusion the CMS
 * exists to avoid.
 */
export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [menu, theme, rate, sheen] = await Promise.all([
    getNav('MENU'), getTheme(), getUsdRate(), pointerSheenOn(),
  ]);

  const links: NavLink[] = menu.map((m) => ({ label: m.label, href: m.href }));

  return (
    <CurrencyProvider rate={rate}>
      <div style={themeStyle(theme)} data-motion={theme.motion ? 'on' : 'off'}>
        {/* Film grain, at the very low opacity the design calls for. The admin
            Design screen can switch it off entirely. */}
        {theme.grain ? <div className="grain" aria-hidden="true" /> : null}

        <Analytics />
        {sheen ? <PointerSheen /> : null}

        <CartProvider>
          <PlayerProvider>
            <SiteHeader links={links} account={<AccountButton />} />
            <main>{children}</main>
            <SiteFooter />
          </PlayerProvider>
        </CartProvider>
      </div>
    </CurrencyProvider>
  );
}

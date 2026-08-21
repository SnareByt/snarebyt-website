import { SiteHeader, type NavLink } from '@/components/site/SiteHeader';
import { AccountButton } from '@/components/site/AccountButton';
import { SiteFooter } from '@/components/site/SiteFooter';
import { CurrencyProvider } from '@/components/site/Currency';
import { PlayerProvider } from '@/components/site/Player';
import { CartProvider } from '@/components/site/Cart';
import { Analytics } from '@/components/site/Analytics';
import { PointerSheen } from '@/components/site/PointerSheen';
import { SiteGate, GatePreviewBar } from '@/components/site/SiteGate';
import { pointerSheenOn } from '@/lib/store-state';
import { siteGate, whatsappNumber } from '@/lib/site-mode';
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
  const [menu, theme, rate, sheen, gate, whatsapp] = await Promise.all([
    getNav('MENU'), getTheme(), getUsdRate(), pointerSheenOn(), siteGate(), whatsappNumber(),
  ]);

  const links: NavLink[] = menu.map((m) => ({ label: m.label, href: m.href }));

  const shell = (
    <>
      {/* Film grain, at the very low opacity the design calls for. The admin
          Design screen can switch it off entirely. */}
      {theme.grain ? <div className="grain" aria-hidden="true" /> : null}

      {/* No beacon while the site is closed: someone meeting a coming-soon
          panel is not a visit worth counting, and it would distort the
          numbers for the day it actually opens. */}
      {gate.gated ? null : <Analytics />}
      {sheen && !gate.gated ? <PointerSheen /> : null}

      <CartProvider>
        <PlayerProvider>
          <SiteHeader links={links} account={<AccountButton />} />
          <main>{children}</main>
          <SiteFooter />
        </PlayerProvider>
      </CartProvider>
    </>
  );

  return (
    <CurrencyProvider rate={rate}>
      <div style={themeStyle(theme)} data-motion={theme.motion ? 'on' : 'off'}>
        {/* Coming soon keeps the real site behind the panel, blurred and
            inert, so there is visibly something being built. Maintenance does
            not: the page may be mid-deploy, and blurring a half-rendered site
            looks like a fault rather than a decision. */}
        {gate.gated ? (
          <>
            {gate.mode === 'soon' ? (
              <div className="gated-behind" aria-hidden="true" inert>{shell}</div>
            ) : null}
            <SiteGate mode={gate.mode} whatsapp={whatsapp} />
          </>
        ) : (
          <>
            {shell}
            {/* Signed in as admin, looking at a site the public cannot see. */}
            {'preview' in gate && gate.preview ? <GatePreviewBar mode={gate.mode} /> : null}
          </>
        )}
      </div>
    </CurrencyProvider>
  );
}

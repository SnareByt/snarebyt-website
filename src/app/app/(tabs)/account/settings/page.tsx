import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { NavBar } from '@/components/app/Ui';
import { normaliseFlow } from '@/lib/checkout-flow-rules';
import { normaliseMode } from '@/lib/site-mode-rules';
import { paymentsConfigured } from '@/lib/sslcommerz';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

/**
 * The values that change how the site behaves without a deploy.
 *
 * Secrets are deliberately absent, exactly as on the desktop Settings screen:
 * the SSLCOMMERZ credentials, the R2 keys, the Resend key and the VAPID
 * private key live in server environment variables, are never rendered, and
 * are never editable from a browser. A phone is the least appropriate place
 * of all to make an exception to that.
 *
 * EVERY FIELD `saveSettings` PARSES HAS TO BE ON THIS SCREEN.
 *
 * Not for completeness — for correctness. The action is shared with the
 * desktop, and its schema gives `siteMode` and `checkoutFlow` defaults of
 * `live` and `direct`. A field this form does not render is a field the
 * browser does not submit, and a field the browser does not submit arrives at
 * the server as its default. So while these two were missing here, changing
 * the USD rate on a phone quietly put a site that was under maintenance back
 * online, and reset the checkout flow on the way past. Nothing warned, because
 * from the action's point of view nothing was wrong.
 *
 * Adding a setting to `settingsSchema` therefore means adding it here in the
 * same commit. `scripts/check-app.ts` fails the build if the two drift apart.
 */
export default async function AppSettingsPage() {
  await requireAdmin();

  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'usdRate', 'whatsapp', 'businessEmail', 'youtubeChannel',
          'beatsComingSoon', 'notifyEmail', 'notifyOnOrder', 'notifyOnPaid',
          'notifyOnEnquiry', 'pointerSheen', 'siteMode', 'checkoutFlow',
        ],
      },
    },
  });
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? '';

  return (
    <>
      <NavBar title="Settings" back="/app/more" />

      <SettingsForm
        // Whether, not what. The credentials themselves never leave the server.
        paymentsConfigured={paymentsConfigured()}
        values={{
          usdRate: get('usdRate') || '122',
          whatsapp: get('whatsapp'),
          businessEmail: get('businessEmail'),
          youtubeChannel: get('youtubeChannel'),
          notifyEmail: get('notifyEmail'),
          // Both parsers are total and both fall back to the open, working
          // state — `live` and `direct`. A missing row or a value written by
          // an older build can never close the shop or strand a customer.
          siteMode: normaliseMode(get('siteMode')),
          checkoutFlow: normaliseFlow(get('checkoutFlow')),
          // These four default ON. Someone who has configured an address wants
          // to hear about sales; opting in per event would mean missing the
          // first one.
          beatsComingSoon: get('beatsComingSoon') === 'true',
          notifyOnOrder: get('notifyOnOrder') !== 'false',
          notifyOnPaid: get('notifyOnPaid') !== 'false',
          notifyOnEnquiry: get('notifyOnEnquiry') !== 'false',
          pointerSheen: get('pointerSheen') !== 'false',
        }}
      />
    </>
  );
}

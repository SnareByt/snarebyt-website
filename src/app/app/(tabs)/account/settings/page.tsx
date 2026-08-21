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

  /* Every row, not the subset this screen edits. The fingerprint below is
     compared against one the server computes from the whole table, so a
     filtered query here would never match and every save would be refused as
     stale. */
  const rows = await prisma.setting.findMany();
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? '';

  /**
   * The same fingerprint the desktop computes, built the same way.
   *
   * The form submits it and `saveSettings` refuses to write if the stored
   * values have moved on since. That guard exists because this form saves
   * every field at once: a screen left open does not merely look stale, it
   * RESTORES its old state over anything changed elsewhere — and the docblock
   * on the action names this phone as one side of the collision that produced
   * it. Sending no signature would skip the check entirely and make the phone
   * the one surface that can still overwrite the desktop silently.
   */
  const signature = rows
    .map((r) => `${r.key}=${r.value}`)
    .sort()
    .join('|');

  return (
    <>
      <NavBar title="Settings" back="/app/more" />

      <SettingsForm
        /* Keyed on the stored values, so a save remounts the form and every
           uncontrolled field shows what is really saved rather than what was
           last typed. */
        key={signature}
        signature={signature}
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
          notifyOnAccount: get('notifyOnAccount') !== 'false',
          pointerSheen: get('pointerSheen') !== 'false',
        }}
      />
    </>
  );
}

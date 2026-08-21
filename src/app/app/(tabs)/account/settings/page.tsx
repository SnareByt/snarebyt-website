import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { NavBar } from '@/components/app/Ui';
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
 */
export default async function AppSettingsPage() {
  await requireAdmin();

  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'usdRate', 'whatsapp', 'businessEmail', 'youtubeChannel',
          'beatsComingSoon', 'notifyEmail', 'notifyOnOrder', 'notifyOnPaid',
          'notifyOnEnquiry', 'pointerSheen',
        ],
      },
    },
  });
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? '';

  return (
    <>
      <NavBar title="Settings" back="/app/more" />

      <SettingsForm
        values={{
          usdRate: get('usdRate') || '122',
          whatsapp: get('whatsapp'),
          businessEmail: get('businessEmail'),
          youtubeChannel: get('youtubeChannel'),
          notifyEmail: get('notifyEmail'),
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

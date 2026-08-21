import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

/** Credentials that live in server env and must never reach a browser. */
const SECRETS = [
  ['DATABASE_URL', 'Neon connection string'],
  ['AUTH_SECRET', 'Session signing key'],
  ['SSLC_STORE_ID / SSLC_STORE_PASSWORD', 'SSLCOMMERZ credentials'],
  ['R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY', 'Cloudflare R2 file storage'],
  ['RESEND_API_KEY', 'Email sending'],
];

export default async function SettingsPage() {
  await requireAdmin();

  const rows = await prisma.setting.findMany();
  const get = (k: string, fallback = '') => rows.find((r) => r.key === k)?.value ?? fallback;

  return (
    <>
      <header><div><div className="crumb">System</div><h1>Settings</h1></div></header>
      <div className="wrap">
        <SettingsForm
          usdRate={get('usdRate', '122')}
          whatsapp={get('whatsapp')}
          youtubeChannel={get('youtubeChannel')}
          beatsComingSoon={get('beatsComingSoon') === 'true'}
          notifyEmail={get('notifyEmail')}
          notifyOnOrder={get('notifyOnOrder') !== 'false'}
          notifyOnPaid={get('notifyOnPaid') !== 'false'}
          notifyOnEnquiry={get('notifyOnEnquiry') !== 'false'}
          pointerSheen={get('pointerSheen') !== 'false'}
          siteMode={(['soon', 'maintenance'] as const).find((m) => m === get('siteMode')) ?? 'live'}
          businessEmail={get('businessEmail', 'hello@snarebyt.com')}
        />

        <section className="sec" style={{ marginTop: '2rem' }}>
          <div className="sec-hd"><h2>Keys and credentials</h2></div>
          <div className="note">
            <span>🔒</span>
            <span>
              <b>These are set in the server environment and are deliberately not editable here.</b>{' '}
              Anything typed into a browser form can be read by a browser. Change them in Vercel →
              Settings → Environment Variables, then redeploy.
            </span>
          </div>
          <table style={{ marginTop: '1rem' }}>
            <thead><tr><th>Variable</th><th>Used for</th><th>Status</th></tr></thead>
            <tbody>
              {SECRETS.map(([name, use]) => (
                <tr key={name}>
                  <td className="mono">{name}</td>
                  <td className="sub">{use}</td>
                  <td><span className="chip off">set in server env — never in the browser</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

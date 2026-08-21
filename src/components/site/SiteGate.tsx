import { Wordmark } from './Wordmark';
import type { SiteMode } from '@/lib/site-mode';

/**
 * The whole site, closed.
 *
 * Two modes, deliberately shown differently:
 *
 *   soon        — the real site renders behind this, blurred and inert. There
 *                 is something there, it is nearly ready, and you can see the
 *                 shape of it. That is the impression a pre-launch page wants.
 *
 *   maintenance — nothing behind it. The site may be mid-deploy or genuinely
 *                 broken, and blurring a half-rendered page would look like a
 *                 fault rather than a decision.
 *
 * The blur is presentation, not protection. Blurred content has still been
 * sent to the browser and CSS can be turned off, so the actual refusal to
 * take orders lives in the server actions, not here.
 */
export function SiteGate({
  mode, whatsapp, message,
}: {
  mode: 'soon' | 'maintenance';
  whatsapp?: string;
  message?: string;
}) {
  const soon = mode === 'soon';

  return (
    <div className={`gate gate-${mode}`} role="dialog" aria-modal="true" aria-label={soon ? 'Coming soon' : 'Under maintenance'}>
      <div className="gate-aura" aria-hidden="true" />

      <div className="gate-panel">
        <span className="gate-sheen" aria-hidden="true" />

        <div className="gate-mark">
          <Wordmark idPrefix="wmGate" />
        </div>

        <div className="gate-eyebrow">
          <span className="gate-dot" aria-hidden="true" />
          {soon ? 'Launching soon' : 'Back shortly'}
        </div>

        <h1 className="gate-title">
          <span className="gate-text">{soon ? 'Coming soon' : 'Under maintenance'}</span>
        </h1>

        <p className="gate-lead">
          {message?.trim()
            ? message
            : soon
              ? 'Something is being built here — beats, mixing, mastering and cover art out of Dhaka. It opens when every part of it is finished properly, and not before.'
              : 'The site is having some work done and will be back very shortly. Nothing you have bought is affected — your licences and files are safe.'}
        </p>

        <p className="gate-bn bn">
          {soon
            ? 'শীঘ্রই আসছে। সবকিছু সঠিকভাবে প্রস্তুত হলেই ওয়েবসাইটটি চালু হবে।'
            : 'ওয়েবসাইটে কিছু কাজ চলছে। খুব শীঘ্রই আবার চালু হবে।'}
        </p>

        {whatsapp ? (
          <div className="gate-cta">
            <a
              className="btn btn-red"
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
                soon
                  ? 'Hi SnareByt — let me know when the site opens.'
                  : 'Hi SnareByt — trying to reach you while the site is down.',
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {soon ? 'Tell me when it opens' : 'Message SnareByt'}
            </a>
          </div>
        ) : null}

        <div className="gate-foot">Dhaka, Bangladesh</div>
      </div>
    </div>
  );
}

/**
 * The strip an admin sees when the site is closed but they are being let past.
 *
 * Fixed to the bottom rather than the top: the top of the page is the design,
 * and a bar pushing it down would mean previewing something other than what a
 * visitor eventually gets.
 */
export function GatePreviewBar({ mode }: { mode: SiteMode }) {
  if (mode === 'live') return null;
  return (
    <div className="gate-bar" role="status">
      <span className="gate-bar-dot" aria-hidden="true" />
      <span>
        <b>{mode === 'soon' ? 'Coming soon' : 'Under maintenance'} is on.</b>{' '}
        Visitors cannot see this — you can because you are signed in as admin.
      </span>
      <a href="/admin/settings">Change</a>
    </div>
  );
}

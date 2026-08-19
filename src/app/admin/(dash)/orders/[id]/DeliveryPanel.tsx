'use client';

import { useState, useTransition } from 'react';
import { regenerateLicencePdf, reissueDownloadLink, revokeDownloadGrant } from '../actions';

export type GrantView = {
  id: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  maxAttempts: number;
  revoked: boolean;
  expired: boolean;
};

/**
 * Delivery controls for one purchased beat.
 *
 * A fresh link is shown once, right here, because only its SHA-256 is stored —
 * there is no way to look it up again afterwards. So it is presented ready to
 * copy into WhatsApp, and said plainly that it will not be shown twice.
 */
export function DeliveryPanel({
  orderItemId, title, grants, canDeliver, licence,
}: {
  orderItemId: string;
  title: string;
  grants: GrantView[];
  canDeliver: boolean;
  licence: { id: string; number: string; ready: boolean } | null;
}) {
  const [busy, start] = useTransition();
  // The licence button gets its own transition. Sharing one means clicking
  // "Create download link" also makes this button read "Generating…", which
  // suggests a PDF is being written when nothing of the sort is happening.
  const [pdfBusy, startPdf] = useTransition();
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="card" style={{ padding: '1.1rem', marginTop: '.8rem' }}>
      <div className="ttl">{title}</div>

      {licence ? (
        <div className="card" style={{ padding: '.85rem', marginTop: '.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.8rem', flexWrap: 'wrap' }}>
            <div>
              <div className="ttl">{licence.number}</div>
              <div className="sub">Licence PDF · {licence.ready ? 'ready in private storage' : 'not generated yet'}</div>
            </div>
            <button
              type="button" className="btn b-gh b-sm" disabled={pdfBusy || !canDeliver}
              onClick={() => startPdf(async () => {
                setError(null); setPdfNote(null);
                const res = await regenerateLicencePdf(licence.id);
                // Success was silent before: the label only changed once the
                // page revalidated, so a slow render looked like a dead button.
                if (res.ok) setPdfNote(res.message ?? 'Licence PDF generated.');
                else setError(res.error);
              })}
            >
              {pdfBusy ? 'Generating…' : licence.ready ? 'Regenerate PDF' : 'Generate PDF'}
            </button>
          </div>
          {pdfNote ? <div className="ok-box">{pdfNote}</div> : null}
        </div>
      ) : null}

      {grants.length ? (
        <table style={{ marginTop: '.8rem' }}>
          <thead>
            <tr><th>Issued</th><th>Expires</th><th>Used</th><th>State</th><th /></tr>
          </thead>
          <tbody>
            {grants.map((g) => {
              const state = g.revoked ? 'revoked'
                : g.expired ? 'expired'
                : g.attempts >= g.maxAttempts ? 'used up'
                : 'active';
              return (
                <tr key={g.id}>
                  <td className="sub">{g.createdAt}</td>
                  <td className="sub">{g.expiresAt}</td>
                  <td className="sub">{g.attempts} of {g.maxAttempts}</td>
                  <td>
                    <span className={`chip ${state === 'active' ? 'ok' : state === 'revoked' ? 'red' : 'off'}`}>
                      {state}
                    </span>
                  </td>
                  <td>
                    {state === 'active' ? (
                      <button
                        type="button" className="btn b-gh b-sm" disabled={busy}
                        onClick={() => start(async () => {
                          const res = await revokeDownloadGrant(g.id);
                          if (!res.ok) setError(res.error);
                        })}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="sub" style={{ marginTop: '.6rem' }}>No download link has been issued yet.</p>
      )}

      {error ? <div className="err-box" style={{ marginTop: '.8rem' }}>{error}</div> : null}

      {link ? (
        <div style={{ marginTop: '.9rem' }}>
          <label className="lb" htmlFor={`link-${orderItemId}`}>
            Send this to the customer — it is not shown again
          </label>
          <input
            className="inp mono" id={`link-${orderItemId}`} readOnly value={link}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button" className="btn b-gh b-sm" style={{ marginTop: '.5rem' }}
            onClick={() => {
              navigator.clipboard?.writeText(link).then(
                () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
                () => setError('Could not copy. Select the link above and copy it by hand.'),
              );
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      ) : null}

      {canDeliver ? (
        <button
          type="button" className="btn b-red b-sm" style={{ marginTop: '.9rem' }} disabled={busy}
          onClick={() => {
            setError(null); setLink(null);
            start(async () => {
              const res = await reissueDownloadLink(orderItemId);
              if (res.ok) setLink(res.url); else setError(res.error);
            });
          }}
        >
          {busy ? 'Creating…' : grants.length ? 'Create a new link' : 'Create download link'}
        </button>
      ) : (
        <p className="sub" style={{ marginTop: '.9rem' }}>
          Links can only be issued once the order is paid.
        </p>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateOrderContact, setOrderStatus, recordRefund, deleteOrder,
  reissueDownloadLink, revokeDownloadGrant, regenerateLicencePdf,
} from '@/app/admin/(dash)/orders/actions';
import { Sheet, useToast, useConfirm } from '@/components/app/Ui';
import { humanStatus } from '@/lib/app-format';
import { bdt } from '@/lib/money-client';

type Order = {
  id: string; number: string; status: string; totalBdt: number; refundedBdt: number;
  billingName: string; billingEmail: string; billingPhone: string;
  billingCountry: string; adminNote: string;
};

/**
 * Everything that changes an order, from a phone.
 *
 * Each button calls the server action the desktop already uses, so every rule
 * in src/lib/order-rules.ts applies unchanged: a paid order cannot be edited
 * or deleted, a refund cannot exceed what is left, and nothing at all can move
 * an order into the paid state. The buttons that would always be refused are
 * simply not rendered — but the server refusing is what actually enforces it,
 * because a server action is a public HTTP endpoint.
 */
export function OrderActions({
  order, items, licences, grants, nextStatuses,
}: {
  order: Order;
  items: { id: string; title: string }[];
  licences: { id: string; number: string; hasPdf: boolean }[];
  grants: { id: string; item: string; expiresAt: string; attempts: number; maxAttempts: number; dead: boolean }[];
  nextStatuses: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [editing, setEditing] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const paid = order.status === 'PAID' || order.status === 'PARTIALLY_REFUNDED';
  const leftToRefund = order.totalBdt - order.refundedBdt;

  async function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) { toast(res.error ?? 'That was refused.', 'bad'); return false; }
      if (res.message) toast(res.message);
      router.refresh();
      return true;
    } catch {
      toast('Could not reach the server.', 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* ---------- Delivery ---------- */}
      {paid && items.length > 0 && (
        <div>
          <div className="sec"><h3>Delivery</h3></div>
          <div className="list">
            {items.map((i) => (
              <div key={i.id} className="row">
                <div className="row-main">
                  <div className="row-t">{i.title}</div>
                  <div className="row-s">Issue a fresh download link</div>
                </div>
                <button
                  type="button"
                  className="btn gh btn-sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await reissueDownloadLink(i.id);
                      if (!res.ok) { toast(res.error, 'bad'); return; }
                      /* Shown rather than auto-copied: clipboard writes from an
                         async callback are blocked on iOS unless they happen in
                         the same gesture, and a "Copied!" that silently did
                         nothing is worse than a link to long-press. */
                      setLink(res.url);
                      router.refresh();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Re-issue
                </button>
              </div>
            ))}
          </div>
          <p className="hint" style={{ padding: '0 .3rem' }}>
            Links expire, cap their attempts and log every fetch. Re-issuing is how a buyer
            whose link died gets what they already paid for.
          </p>
        </div>
      )}

      {/* ---------- Live links ---------- */}
      {grants.length > 0 && (
        <div>
          <div className="sec"><h3>Download links</h3></div>
          <div className="list">
            {grants.map((g) => (
              <div key={g.id} className="row">
                <div className="row-main">
                  <div className="row-t">{g.item}</div>
                  <div className="row-s">
                    {g.dead ? 'Dead' : `Until ${g.expiresAt}`} · {g.attempts}/{g.maxAttempts} used
                  </div>
                </div>
                {!g.dead && (
                  <button
                    type="button"
                    className="btn danger btn-sm"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await confirm(
                        'Revoke this link?',
                        'The link stops working immediately. The licence itself is untouched, and you can issue a new link at any time.',
                        'Revoke',
                      );
                      if (ok) await run(() => revokeDownloadGrant(g.id));
                    }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Licences ---------- */}
      {licences.length > 0 && (
        <div>
          <div className="sec"><h3>Licences</h3></div>
          <div className="list">
            {licences.map((l) => (
              <div key={l.id} className="row">
                <div className="row-main">
                  <div className="row-t mono">{l.number}</div>
                  <div className="row-s">{l.hasPdf ? 'PDF stored privately' : 'No PDF yet'}</div>
                </div>
                <button
                  type="button"
                  className="btn gh btn-sm"
                  disabled={busy}
                  onClick={() => run(() => regenerateLicencePdf(l.id))}
                >
                  {l.hasPdf ? 'Regenerate' : 'Generate'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Actions ---------- */}
      <div className="stack">
        <button type="button" className="btn gh btn-full" onClick={() => setEditing(true)}>
          Edit customer details
        </button>

        {nextStatuses.map((s) => (
          <button
            key={s}
            type="button"
            className="btn gh btn-full"
            disabled={busy}
            onClick={() => run(() => setOrderStatus(order.id, s))}
          >
            Mark {humanStatus(s).toLowerCase()}
          </button>
        ))}

        {paid && leftToRefund > 0 && (
          <button type="button" className="btn danger btn-full" onClick={() => setRefunding(true)}>
            Record a refund
          </button>
        )}

        {!paid && (
          <button
            type="button"
            className="btn danger btn-full"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm(
                `Delete order ${order.number}?`,
                'This cannot be undone. An order that has been paid, has a validated payment or has issued licences will be refused — those have to stay provable.',
                'Delete',
              );
              if (!ok) return;
              const done = await run(() => deleteOrder(order.id));
              if (done) router.push('/app/orders');
            }}
          >
            Delete order
          </button>
        )}
      </div>

      {paid && (
        <p className="note">
          There is no <b>mark as paid</b> button, here or on the desktop. If a customer
          insists they paid, the payment gets re-validated with SSLCOMMERZ instead of taken
          on trust.
        </p>
      )}

      {/* ---------- Re-issued link ---------- */}
      <Sheet open={Boolean(link)} onClose={() => setLink(null)} title="Download link">
        <p className="hint" style={{ marginBottom: '.8rem' }}>
          Send this to the customer. It expires, caps its attempts and logs every fetch.
        </p>
        <textarea
          className="in selectable"
          readOnly
          value={link ?? ''}
          rows={4}
          onFocus={(e) => e.currentTarget.select()}
          style={{ fontFamily: 'var(--font-mono), monospace', fontSize: '13px' }}
        />
        <button
          type="button"
          className="btn btn-full"
          style={{ marginTop: '1rem' }}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link ?? '');
              toast('Copied.');
            } catch {
              toast('Could not copy. Long-press the link to select it.', 'bad');
            }
          }}
        >
          Copy link
        </button>
      </Sheet>

      {/* ---------- Contact sheet ---------- */}
      <Sheet open={editing} onClose={() => setEditing(false)} title="Customer details">
        <form
          action={async (formData: FormData) => {
            const done = await run(() => updateOrderContact(order.id, formData));
            if (done) setEditing(false);
          }}
        >
          <div className="field">
            <label className="fl" htmlFor="o-name">Name</label>
            <input id="o-name" name="billingName" className="in" defaultValue={order.billingName} required maxLength={120} />
          </div>
          <div className="field">
            <label className="fl" htmlFor="o-email">Email</label>
            <input id="o-email" name="billingEmail" className="in" type="email"
                   autoCapitalize="none" autoCorrect="off" spellCheck={false}
                   defaultValue={order.billingEmail} required maxLength={160} />
          </div>
          <div className="field">
            <label className="fl" htmlFor="o-phone">Phone</label>
            <input id="o-phone" name="billingPhone" className="in" type="tel"
                   inputMode="tel" defaultValue={order.billingPhone} maxLength={40} />
            <p className="hint">
              A mistyped number is the usual reason a paid customer never receives anything.
            </p>
          </div>
          <div className="field">
            <label className="fl" htmlFor="o-country">Country</label>
            <input id="o-country" name="billingCountry" className="in" defaultValue={order.billingCountry} maxLength={80} />
          </div>
          <div className="field">
            <label className="fl" htmlFor="o-note">Your note</label>
            <textarea id="o-note" name="adminNote" className="in" defaultValue={order.adminNote} maxLength={4000} />
            <p className="hint">Admin only. Never shown to the customer.</p>
          </div>
          <button type="submit" className="btn btn-full" disabled={busy}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </form>
      </Sheet>

      {/* ---------- Refund sheet ---------- */}
      <Sheet open={refunding} onClose={() => setRefunding(false)} title="Record a refund">
        <p className="note warn" style={{ marginBottom: '1rem' }}>
          This records a refund you have already made through SSLCOMMERZ. It does not move
          any money on its own.
        </p>
        <form
          action={async (formData: FormData) => {
            const done = await run(() => recordRefund(order.id, formData));
            if (done) setRefunding(false);
          }}
        >
          <div className="field">
            <label className="fl" htmlFor="r-amount">Amount in taka</label>
            <input id="r-amount" name="amountBdt" className="in" type="number"
                   inputMode="numeric" min={1} max={leftToRefund}
                   defaultValue={leftToRefund} required />
            <p className="hint">{bdt(leftToRefund)} is left to refund on this order.</p>
          </div>
          <div className="field">
            <label className="fl" htmlFor="r-reason">Reason</label>
            <input id="r-reason" name="reason" className="in" required maxLength={200} />
          </div>
          <div className="field">
            <label className="fl" htmlFor="r-ref">Gateway reference</label>
            <input id="r-ref" name="gatewayRefId" className="in" maxLength={120} />
            <p className="hint">Optional. The refund id SSLCOMMERZ gave you.</p>
          </div>
          <button type="submit" className="btn danger btn-full" disabled={busy}>
            {busy ? 'Recording…' : 'Record refund'}
          </button>
        </form>
      </Sheet>

      {confirmNode}
    </>
  );
}

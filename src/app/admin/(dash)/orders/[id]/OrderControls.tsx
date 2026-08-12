'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  updateOrderContact, setOrderStatus, removeOrderItem,
  recordRefund, deleteOrder, type Result,
} from '../actions';

/** Shared feedback strip so every control reports the same way. */
function Note({ res }: { res: Result | null }) {
  if (!res) return null;
  return res.ok
    ? <div className="ok-box" style={{ marginTop: '.8rem' }}>{res.message ?? 'Saved.'}</div>
    : <div className="err-box" style={{ marginTop: '.8rem' }}>{res.error}</div>;
}

export type OrderShape = {
  id: string;
  number: string;
  status: string;
  totalBdt: number;
  refundedBdt: number;
  billingName: string;
  billingEmail: string;
  billingPhone: string;
  billingCountry: string;
  adminNote: string;
  canDelete: boolean;
  nextStatuses: string[];
};

/** Customer details. Editable whatever the status — this is how a mistyped
 *  WhatsApp number gets fixed, and that is the usual reason a paid order
 *  never reaches anybody. */
export function ContactForm({ order }: { order: OrderShape }) {
  const [busy, start] = useTransition();
  const [res, setRes] = useState<Result | null>(null);

  return (
    <form
      action={(fd) => start(async () => setRes(await updateOrderContact(order.id, fd)))}
    >
      <div className="form">
        <div className="field">
          <label className="lb" htmlFor="billingName">Name</label>
          <input className="inp" id="billingName" name="billingName" defaultValue={order.billingName} />
        </div>
        <div className="field">
          <label className="lb" htmlFor="billingEmail">Email</label>
          <input className="inp" id="billingEmail" name="billingEmail" type="email" defaultValue={order.billingEmail} />
        </div>
        <div className="field">
          <label className="lb" htmlFor="billingPhone">WhatsApp number</label>
          <input className="inp" id="billingPhone" name="billingPhone" defaultValue={order.billingPhone} />
        </div>
        <div className="field">
          <label className="lb" htmlFor="billingCountry">Country</label>
          <input className="inp" id="billingCountry" name="billingCountry" defaultValue={order.billingCountry} />
        </div>
        <div className="field full">
          <label className="lb" htmlFor="adminNote">Your note (never shown to the customer)</label>
          <textarea className="inp" id="adminNote" name="adminNote" rows={3} defaultValue={order.adminNote} />
        </div>
      </div>
      <button className="btn btn-red btn-sm" type="submit" disabled={busy} style={{ marginTop: '.9rem' }}>
        {busy ? 'Saving…' : 'Save details'}
      </button>
      <Note res={res} />
    </form>
  );
}

/** Status moves, refunds and deletion. */
export function DangerZone({ order }: { order: OrderShape }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [res, setRes] = useState<Result | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canRefund = order.status === 'PAID' || order.status === 'PARTIALLY_REFUNDED';
  const left = order.totalBdt - order.refundedBdt;

  return (
    <div className="card" style={{ padding: '1.2rem' }}>
      {order.nextStatuses.length ? (
        <>
          <div className="lb">Change status</div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.6rem' }}>
            {order.nextStatuses.map((s) => (
              <button
                key={s} type="button" className="btn btn-ghost btn-sm" disabled={busy}
                onClick={() => start(async () => setRes(await setOrderStatus(order.id, s)))}
              >
                Mark {s.replace(/_/g, ' ').toLowerCase()}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="sub">
          {order.status === 'PAID'
            ? 'A paid order cannot be moved by hand. Record a refund below if money is going back.'
            : 'There is no status change available for this order.'}
        </p>
      )}

      {canRefund ? (
        <>
          <div className="hairline" style={{ margin: '1.3rem 0 1rem' }} />
          <div className="lb">Record a refund</div>
          <p className="sub" style={{ marginTop: '.4rem' }}>
            This records the refund here. <b>It does not send the money</b> — issue that in the
            SSLCOMMERZ merchant panel. ৳{left.toLocaleString('en-US')} left to refund.
          </p>
          <form
            action={(fd) => start(async () => setRes(await recordRefund(order.id, fd)))}
            style={{ marginTop: '.8rem' }}
          >
            <div className="form">
              <div className="field">
                <label className="lb" htmlFor="amountBdt">Amount (৳)</label>
                <input className="inp" id="amountBdt" name="amountBdt" type="number" min={1} max={left} defaultValue={left} />
              </div>
              <div className="field full">
                <label className="lb" htmlFor="reason">Reason</label>
                <input className="inp" id="reason" name="reason" placeholder="Why is this being refunded?" />
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" type="submit" disabled={busy} style={{ marginTop: '.7rem' }}>
              {busy ? 'Recording…' : 'Record refund'}
            </button>
          </form>
          <p className="sub" style={{ marginTop: '.6rem' }}>
            A full refund revokes the download links and puts any exclusive back on sale.
          </p>
        </>
      ) : null}

      <div className="hairline" style={{ margin: '1.3rem 0 1rem' }} />
      <div className="lb">Delete this order</div>
      {order.canDelete ? (
        <>
          <p className="sub" style={{ marginTop: '.4rem' }}>
            Permanent. Only possible because no payment ever reached this order.
          </p>
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.7rem' }}>
              <button
                type="button" className="btn btn-red btn-sm" disabled={busy}
                onClick={() => start(async () => {
                  const r = await deleteOrder(order.id);
                  setRes(r);
                  if (r.ok) router.push('/admin/orders');
                })}
              >
                {busy ? 'Deleting…' : `Yes, delete ${order.number}`}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </div>
          ) : (
            <button
              type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '.7rem' }}
              onClick={() => setConfirmDelete(true)}
            >
              Delete order
            </button>
          )}
        </>
      ) : (
        <p className="sub" style={{ marginTop: '.4rem' }}>
          This order was paid, so it cannot be deleted — the licence it backs has to stay
          provable. Refund it instead.
        </p>
      )}

      <Note res={res} />
    </div>
  );
}

/** Removing a line, only while the order is unpaid. */
export function RemoveItemButton({ itemId, disabled }: { itemId: string; disabled: boolean }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (disabled) return null;
  return (
    <>
      <button
        type="button" className="btn btn-ghost btn-sm" disabled={busy}
        onClick={() => start(async () => {
          const r = await removeOrderItem(itemId);
          if (!r.ok) setError(r.error);
        })}
      >
        {busy ? 'Removing…' : 'Remove'}
      </button>
      {error ? <div className="err">{error}</div> : null}
    </>
  );
}

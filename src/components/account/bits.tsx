import { Figure } from '@/components/admin/Figure';

/**
 * Small shared pieces for the portal.
 *
 * Status vocabulary lives here rather than in each page so an order is never
 * described one way on the overview and another on its own page.
 */

const ORDER_PILL: Record<string, { cls: string; label: string }> = {
  CART: { cls: 'off', label: 'Not placed' },
  PENDING_PAYMENT: { cls: 'wait', label: 'Awaiting payment' },
  PAID: { cls: 'ok', label: 'Paid' },
  FULFILLED: { cls: 'ok', label: 'Delivered' },
  CANCELLED: { cls: 'off', label: 'Cancelled' },
  REFUNDED: { cls: 'off', label: 'Refunded' },
  FAILED: { cls: 'off', label: 'Payment failed' },
};

const PROJECT_PILL: Record<string, { cls: string; label: string }> = {
  ORDER_RECEIVED: { cls: 'wait', label: 'Received' },
  PAYMENT_CONFIRMED: { cls: 'live', label: 'Payment confirmed' },
  FILES_RECEIVED: { cls: 'live', label: 'Files received' },
  IN_PROGRESS: { cls: 'live', label: 'In progress' },
  FIRST_PREVIEW_READY: { cls: 'red', label: 'Preview ready' },
  REVISION_REQUESTED: { cls: 'wait', label: 'Revision requested' },
  FINALISING: { cls: 'live', label: 'Finalising' },
  COMPLETED: { cls: 'ok', label: 'Completed' },
  DELIVERED: { cls: 'ok', label: 'Delivered' },
};

export function OrderPill({ status }: { status: string }) {
  const p = ORDER_PILL[status] ?? { cls: 'off', label: status.replace(/_/g, ' ').toLowerCase() };
  return <span className={`pill ${p.cls}`}>{p.label}</span>;
}

export function ProjectPill({ status }: { status: string }) {
  const p = PROJECT_PILL[status] ?? { cls: 'off', label: status.replace(/_/g, ' ').toLowerCase() };
  return <span className={`pill ${p.cls}`}>{p.label}</span>;
}

/** A date the way a person says it, not the way a database stores it. */
export function when(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "in 3 days" / "2 weeks ago". A deadline is only meaningful as a distance
 * from today, and working that out from a date is exactly the arithmetic a
 * customer should not have to do.
 */
export function relative(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return days < 14 ? `in ${days} days` : `in ${Math.round(days / 7)} weeks`;
  const ago = Math.abs(days);
  return ago < 14 ? `${ago} days ago` : ago < 60 ? `${Math.round(ago / 7)} weeks ago` : `${Math.round(ago / 30)} months ago`;
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="pt-stat">
      <div className="l">{label}</div>
      <Figure className="v" value={value} />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

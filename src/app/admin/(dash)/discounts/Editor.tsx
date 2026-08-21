'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CodeResult } from './actions';

type Save = (id: string, fd: FormData) => Promise<CodeResult>;
type Act = (id: string) => Promise<CodeResult>;

export type CodeRow = {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffBdt: number | null;
  minSpendBdt: number | null;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number | null;
  startsAt: string;
  endsAt: string;
  active: boolean;
  orders: number;
  /** What the public site would say about it right now. */
  state: 'live' | 'off' | 'scheduled' | 'expired' | 'used-up';
};

const STATE_LABEL: Record<CodeRow['state'], string> = {
  live: 'Working now',
  off: 'Switched off',
  scheduled: 'Starts later',
  expired: 'Expired',
  'used-up': 'Fully used',
};

const STATE_CHIP: Record<CodeRow['state'], string> = {
  live: 'ok', off: 'off', scheduled: 'warn', expired: 'off', 'used-up': 'warn',
};

/**
 * The fields shared by creating and editing.
 *
 * One component so the two forms cannot drift apart — a validation rule added
 * to one and not the other is how a code gets created in a state the editor
 * would refuse.
 */
function Fields({ row, idPrefix }: { row?: CodeRow; idPrefix: string }) {
  const [kind, setKind] = useState<'percent' | 'amount'>(
    row?.amountOffBdt ? 'amount' : 'percent',
  );

  return (
    <>
      <div className="fg">
        <label className="fl">What it takes off</label>
        <div className="modes">
          <label className={kind === 'percent' ? 'mode on' : 'mode'}>
            <input type="radio" name={`${idPrefix}-kind`} checked={kind === 'percent'}
              onChange={() => setKind('percent')} />
            <span className="mode-t">A percentage</span>
            <span className="mode-d">Scales with the cart — 20% off ৳5,000 is ৳1,000.</span>
          </label>
          <label className={kind === 'amount' ? 'mode on' : 'mode'}>
            <input type="radio" name={`${idPrefix}-kind`} checked={kind === 'amount'}
              onChange={() => setKind('amount')} />
            <span className="mode-t">A fixed amount</span>
            <span className="mode-d">Always the same reduction, never more than the cart.</span>
          </label>
        </div>
      </div>

      {kind === 'percent' ? (
        <div className="fg">
          <label className="fl" htmlFor={`${idPrefix}-pc`}>Percent off</label>
          <input className="in" id={`${idPrefix}-pc`} name="percentOff" type="number"
            min="1" max="100" step="1" defaultValue={row?.percentOff ?? ''} placeholder="20" />
          {/* The unused field is still submitted, empty, so the server clears it. */}
          <input type="hidden" name="amountOffBdt" value="" />
        </div>
      ) : (
        <div className="fg">
          <label className="fl" htmlFor={`${idPrefix}-amt`}>Amount off (৳)</label>
          <input className="in" id={`${idPrefix}-amt`} name="amountOffBdt" type="number"
            min="1" step="1" defaultValue={row?.amountOffBdt ?? ''} placeholder="500" />
          <input type="hidden" name="percentOff" value="" />
        </div>
      )}

      <div className="two">
        <div className="fg">
          <label className="fl" htmlFor={`${idPrefix}-min`}>Minimum spend (৳)</label>
          <input className="in" id={`${idPrefix}-min`} name="minSpendBdt" type="number" min="1" step="1"
            defaultValue={row?.minSpendBdt ?? ''} placeholder="No minimum" />
        </div>
        <div className="fg">
          <label className="fl" htmlFor={`${idPrefix}-max`}>Total uses</label>
          <input className="in" id={`${idPrefix}-max`} name="maxUses" type="number" min="1" step="1"
            defaultValue={row?.maxUses ?? ''} placeholder="Unlimited" />
          <div className="hint">Counted when a payment clears, not when a cart is filled.</div>
        </div>
      </div>

      <div className="two">
        <div className="fg">
          <label className="fl" htmlFor={`${idPrefix}-per`}>Uses per person</label>
          <input className="in" id={`${idPrefix}-per`} name="perUserLimit" type="number" min="1" step="1"
            defaultValue={row?.perUserLimit ?? ''} placeholder="Unlimited" />
          <div className="hint">Matched on the email that paid.</div>
        </div>
        <div className="fg">
          <label className="fl" htmlFor={`${idPrefix}-from`}>Starts</label>
          <input className="in" id={`${idPrefix}-from`} name="startsAt" type="date"
            defaultValue={row?.startsAt ?? ''} />
          <div className="hint">Blank means immediately.</div>
        </div>
      </div>

      <div className="fg">
        <label className="fl" htmlFor={`${idPrefix}-to`}>Ends</label>
        <input className="in" id={`${idPrefix}-to`} name="endsAt" type="date"
          defaultValue={row?.endsAt ?? ''} />
        <div className="hint">Blank means it runs until you switch it off.</div>
      </div>

      <label className="check" style={{ marginTop: '.9rem' }}>
        <input type="checkbox" name="active" defaultChecked={row ? row.active : true} />
        <span>Working on the site</span>
      </label>
    </>
  );
}

/** One existing code, with its usage and an editor. */
export function CodeEditor({
  row, save, toggle, remove,
}: { row: CodeRow; save: Save; toggle: Act; remove: Act }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = (fn: () => Promise<CodeResult>) => start(async () => {
    const res = await fn();
    setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  });

  const worth = row.percentOff ? `${row.percentOff}% off` : `৳${(row.amountOffBdt ?? 0).toLocaleString('en-US')} off`;

  return (
    <section className="sec">
      <div className="sec-hd">
        <h2 className="mono">{row.code}</h2>
        <span className="chip red">{worth}</span>
        <span className={`chip ${STATE_CHIP[row.state]}`}>{STATE_LABEL[row.state]}</span>
        <span className="sp" />
        <button type="button" className="btn b-gh b-sm" disabled={busy} onClick={() => run(() => toggle(row.id))}>
          {row.active ? 'Switch off' : 'Switch on'}
        </button>
        <button type="button" className="btn b-gh b-sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Edit'}
        </button>
      </div>

      <div className="sub">
        Used <b>{row.usedCount}</b>
        {row.maxUses ? ` of ${row.maxUses}` : ' times'}
        {row.minSpendBdt ? ` · needs a cart of ৳${row.minSpendBdt.toLocaleString('en-US')}` : ''}
        {row.perUserLimit ? ` · ${row.perUserLimit} per person` : ''}
        {row.endsAt ? ` · ends ${row.endsAt}` : ''}
      </div>

      {msg ? <div className={msg.ok ? 'ok-box' : 'err-box'}>{msg.text}</div> : null}

      {open ? (
        <form
          className="svc-block" style={{ marginTop: '1rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => save(row.id, fd));
          }}
        >
          <div className="sec-hd" style={{ marginBottom: '.8rem' }}>
            <h3 style={{ margin: 0, fontSize: '.82rem' }}>Edit {row.code}</h3>
            <span className="sp" />
            <button className="btn b-red b-sm" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>

          <Fields row={row} idPrefix={row.id} />

          <div className="hairline" style={{ margin: '1.2rem 0 .9rem' }} />

          {row.orders > 0 ? (
            <div className="hint">
              Used on {row.orders} order{row.orders === 1 ? '' : 's'}, so it cannot be deleted — those
              receipts refer to it. Switching it off stops it working immediately.
            </div>
          ) : confirming ? (
            <div className="err-box" style={{ display: 'flex', alignItems: 'center', gap: '.7rem', flexWrap: 'wrap' }}>
              <span>Delete {row.code} permanently?</span>
              <span className="sp" style={{ flex: 1 }} />
              <button type="button" className="btn b-gh b-sm" onClick={() => setConfirming(false)}>Keep it</button>
              <button type="button" className="btn b-red b-sm" disabled={busy}
                onClick={() => run(() => remove(row.id))}>Delete</button>
            </div>
          ) : (
            <button type="button" className="btn b-gh b-sm" onClick={() => setConfirming(true)}>
              Delete this code
            </button>
          )}
        </form>
      ) : null}
    </section>
  );
}

/** Make a new code. */
export function NewCode({ action }: { action: Save }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!open) {
    return <button type="button" className="btn b-red b-sm" onClick={() => setOpen(true)}>New code</button>;
  }

  return (
    <form
      className="svc-block" style={{ marginTop: '1rem', width: '100%' }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await action('new', fd);
          setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
          if (res.ok) { setOpen(false); router.refresh(); }
        });
      }}
    >
      <div className="sec-hd" style={{ marginBottom: '.8rem' }}>
        <h3 style={{ margin: 0, fontSize: '.82rem' }}>New discount code</h3>
        <span className="sp" />
        <button type="button" className="btn b-gh b-sm" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn b-red b-sm" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>

      {msg ? <div className={msg.ok ? 'ok-box' : 'err-box'}>{msg.text}</div> : null}

      <div className="fg">
        <label className="fl" htmlFor="new-code">The code</label>
        <input className="in mono" id="new-code" name="code" placeholder="LAUNCH25"
          autoCapitalize="characters" autoComplete="off" spellCheck={false} />
        <div className="hint">
          What customers type. Letters, numbers and hyphens. It cannot be changed afterwards —
          it ends up printed on things.
        </div>
      </div>

      <Fields idPrefix="new" />
    </form>
  );
}

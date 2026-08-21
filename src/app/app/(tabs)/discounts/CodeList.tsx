'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createDiscount, updateDiscount, toggleDiscount, deleteDiscount,
} from '@/app/admin/(dash)/discounts/actions';
import {
  describeDiscount, CODE_STATE_LABEL, type CodeState,
} from '@/lib/discount-rules';
import { Sheet, Switch, useToast, useConfirm } from '@/components/app/Ui';
import { IcPlus } from '@/components/app/Icons';

export type Code = {
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
  state: CodeState;
};

const TONE: Record<CodeState, string> = {
  live: 'ok', off: 'off', scheduled: 'warn', expired: 'off', 'used-up': 'warn',
};

export function CodeList({
  codes, givenAwayLabel, givenAwayBdt,
}: {
  codes: Code[];
  givenAwayLabel: string;
  givenAwayBdt: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  /** `'new'` opens an empty sheet; a row opens it populated. */
  const [editing, setEditing] = useState<Code | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const live = codes.filter((c) => c.state === 'live').length;

  async function submit(formData: FormData) {
    setBusy(true);
    try {
      const res = editing === 'new'
        ? await createDiscount('', formData)
        : await updateDiscount((editing as Code).id, formData);

      if (!res.ok) { toast(res.error, 'bad'); return; }
      toast(res.message);
      setEditing(null);
      router.refresh();
    } catch {
      toast('Could not reach the server. Nothing was saved.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="big-title">
        <h2>Discount codes</h2>
        <p>
          {live} working now · {givenAwayLabel} given away
          {givenAwayBdt === 0 ? ' so far' : ' on paid orders'}
        </p>
      </div>

      <div className="wrap stack-lg">
        <button type="button" className="btn btn-full" onClick={() => setEditing('new')}>
          <IcPlus className="ic-sm" /> New code
        </button>

        {codes.length === 0 ? (
          <div className="list"><div className="empty">No codes yet.</div></div>
        ) : (
          <div className="list">
            {codes.map((c) => (
              <div key={c.id} className="row">
                <div
                  className="row-main"
                  onClick={() => setEditing(c)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="row-t mono">{c.code}</div>
                  <div className="row-s">
                    {describeDiscount(c)} · {CODE_STATE_LABEL[c.state]}
                    {c.maxUses !== null && ` · ${c.usedCount}/${c.maxUses} used`}
                    {c.maxUses === null && c.usedCount > 0 && ` · used ${c.usedCount}×`}
                  </div>
                </div>
                <span className={`chip ${TONE[c.state]}`}>{c.state === 'live' ? 'live' : c.state}</span>
                {/* The switch controls `active` only. It cannot revive an
                    expired or exhausted code, and the chip keeps saying so —
                    a toggle that appears to do nothing is better than one that
                    claims a code is working when the cart will refuse it. */}
                <Switch
                  label={`${c.code} active`}
                  on={c.active}
                  onChange={async (next) => {
                    const res = await toggleDiscount(c.id);
                    if (res.ok) router.refresh();
                    return res.ok
                      ? { ok: true, message: `${c.code} ${next ? 'switched on' : 'switched off'}.` }
                      : { ok: false, error: res.error };
                  }}
                />
              </div>
            ))}
          </div>
        )}

        <p className="note">
          <b>A code is never read from the browser.</b> The cart sends the letters someone
          typed and nothing else — every figure comes from the row here and the order&apos;s own
          subtotal, so an edited form cannot turn 10% off into 100%.
        </p>
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New code' : `Edit ${(editing as Code)?.code ?? ''}`}
      >
        {editing !== null && (
          <Editor
            row={editing === 'new' ? null : editing}
            busy={busy}
            onSubmit={submit}
            /* Delete is offered only for a code nothing refers to. The
               server refuses to delete a used one — an order records WHICH
               code discounted it, and removing the row leaves a paid receipt
               citing something that no longer exists. Showing a button that
               can only produce that refusal would be a worse way of saying
               the same thing than not showing one. */
            onDelete={
              editing === 'new' || (editing as Code).orders > 0 || (editing as Code).usedCount > 0
                ? undefined
                : async () => {
                    const row = editing as Code;
                    const ok = await confirm(
                      `Delete ${row.code}?`,
                      'It has never been used, so nothing refers to it and nothing else changes.',
                      'Delete code',
                    );
                    if (!ok) return;
                    const res = await deleteDiscount(row.id);
                    if (!res.ok) { toast(res.error, 'bad'); return; }
                    toast(res.message);
                    setEditing(null);
                    router.refresh();
                  }
            }
          />
        )}
      </Sheet>

      {confirmNode}
    </>
  );
}

/**
 * The form.
 *
 * A percentage and a fixed amount are mutually exclusive — both set would need
 * a precedence rule, and a rule nobody remembers is how "20% off" quietly
 * becomes ৳500 off. The server refuses both, and this picker makes it
 * impossible to send both: the unused field is submitted as an empty string,
 * which the action reads as "not set" rather than zero.
 */
function Editor({
  row, busy, onSubmit, onDelete,
}: {
  row: Code | null;
  busy: boolean;
  onSubmit: (fd: FormData) => void;
  onDelete?: () => void;
}) {
  const [kind, setKind] = useState<'percent' | 'amount'>(
    row?.amountOffBdt ? 'amount' : 'percent',
  );

  return (
    <form action={onSubmit} className="stack-lg">
      {row === null ? (
        <div className="field">
          <label className="fl" htmlFor="d-code">Code</label>
          <input
            id="d-code" name="code" className="in mono" placeholder="LAUNCH25"
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            required maxLength={24}
          />
          <p className="hint">
            3–24 characters: letters, numbers and hyphens. Saved in capitals however it is
            typed, so a customer entering it in lower case still works.
          </p>
        </div>
      ) : (
        /* The code itself is fixed once made. It has been printed on a story
           or read out in a DM, and renaming it would break every place it
           already exists while looking like an edit. */
        <div className="field">
          <label className="fl">Code</label>
          <div className="in mono" aria-readonly="true">{row.code}</div>
          <p className="hint">Codes cannot be renamed — this one may already be out there.</p>
        </div>
      )}

      <div>
        <div className="sec"><h3>What it takes off</h3></div>
        <div className="seg" role="group" aria-label="Kind of discount">
          <button
            type="button" data-on={kind === 'percent' ? '1' : '0'}
            onClick={() => setKind('percent')}
          >
            Percentage
          </button>
          <button
            type="button" data-on={kind === 'amount' ? '1' : '0'}
            onClick={() => setKind('amount')}
          >
            Fixed taka
          </button>
        </div>

        {kind === 'percent' ? (
          <div className="field" style={{ marginTop: '.8rem' }}>
            <label className="fl" htmlFor="d-pc">Percent off</label>
            <input
              id="d-pc" name="percentOff" className="in" type="number"
              inputMode="numeric" min="1" max="100" step="1"
              defaultValue={row?.percentOff ?? ''} placeholder="25"
            />
            <input type="hidden" name="amountOffBdt" value="" />
          </div>
        ) : (
          <div className="field" style={{ marginTop: '.8rem' }}>
            <label className="fl" htmlFor="d-amt">Taka off</label>
            <input
              id="d-amt" name="amountOffBdt" className="in" type="number"
              inputMode="numeric" min="1" step="1"
              defaultValue={row?.amountOffBdt ?? ''} placeholder="500"
            />
            <input type="hidden" name="percentOff" value="" />
            <p className="hint">
              Clamped to the cart total, so a ৳2,000 code on a ৳500 order makes it free
              rather than owing anyone ৳1,500.
            </p>
          </div>
        )}
      </div>

      <div>
        <div className="sec"><h3>Limits</h3></div>
        <p className="hint" style={{ marginTop: 0 }}>Leave any of these blank for no limit.</p>

        <div className="field">
          <label className="fl" htmlFor="d-min">Minimum spend (৳)</label>
          <input id="d-min" name="minSpendBdt" className="in" type="number"
                 inputMode="numeric" min="1" step="1" defaultValue={row?.minSpendBdt ?? ''} />
        </div>
        <div className="field">
          <label className="fl" htmlFor="d-max">Total uses</label>
          <input id="d-max" name="maxUses" className="in" type="number"
                 inputMode="numeric" min="1" step="1" defaultValue={row?.maxUses ?? ''} />
          <p className="hint">
            Counted when a payment is verified, never when an order is merely placed —
            otherwise filling a cart and walking away would burn a use.
          </p>
        </div>
        <div className="field">
          <label className="fl" htmlFor="d-per">Uses per person</label>
          <input id="d-per" name="perUserLimit" className="in" type="number"
                 inputMode="numeric" min="1" step="1" defaultValue={row?.perUserLimit ?? ''} />
        </div>
      </div>

      <div>
        <div className="sec"><h3>Dates</h3></div>
        <div className="field">
          <label className="fl" htmlFor="d-from">Starts</label>
          <input id="d-from" name="startsAt" className="in" type="date"
                 defaultValue={row?.startsAt ?? ''} />
        </div>
        <div className="field">
          <label className="fl" htmlFor="d-to">Ends</label>
          <input id="d-to" name="endsAt" className="in" type="date"
                 defaultValue={row?.endsAt ?? ''} />
        </div>
      </div>

      <div className="list">
        <label className="row">
          <div className="row-main">
            <div className="row-t">Active</div>
            <div className="row-s">Off means the cart refuses it, whatever the dates say</div>
          </div>
          <span className="sw">
            {/* The action reads `formData.get('active') === 'on'`, which is
                what a checkbox with no value attribute submits. Giving it
                value="true" here would switch every code off on save. */}
            <input type="checkbox" name="active" defaultChecked={row ? row.active : true}
                   aria-label="Active" />
            <i />
          </span>
        </label>
      </div>

      <button type="submit" className="btn btn-full" disabled={busy}>
        {busy ? 'Saving…' : row ? 'Save changes' : 'Create code'}
      </button>

      {onDelete ? (
        <button type="button" className="btn gh btn-full" onClick={onDelete} disabled={busy}>
          Delete code
        </button>
      ) : row ? (
        <p className="hint">
          {row.code} has been used, so it cannot be deleted — paid orders record which code
          reduced them and the receipts have to keep adding up. Switching it off stops it
          working immediately and keeps the history intact.
        </p>
      ) : null}
    </form>
  );
}

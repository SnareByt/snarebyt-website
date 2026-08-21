'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  savePortfolioItem, togglePortfolioPublished, deletePortfolioItem,
} from '@/app/admin/(dash)/portfolio/actions';
import { Sheet, Switch, useToast, useConfirm } from '@/components/app/Ui';
import { IcPlus } from '@/components/app/Icons';

type Item = {
  id: string; title: string; clientName: string; category: string; role: string;
  externalUrl: string; ctaLabel: string; majorCredit: boolean;
  summary: string; published: boolean;
};

const CATEGORIES = [
  { key: 'PRODUCED_BY_SNAREBYT', label: 'Produced by SnareByt' },
  { key: 'MIXED_AND_MASTERED_BY_SNAREBYT', label: 'Mixed & mastered by SnareByt' },
  { key: 'SNAREBYT_RELEASES', label: 'SnareByt releases' },
  { key: 'SELECTED_VISUAL_WORK', label: 'Selected visual work' },
] as const;

const CTA = ['Listen', 'Watch', 'Read', 'Open'] as const;

const categoryLabel = (key: string) =>
  CATEGORIES.find((c) => c.key === key)?.label ?? key;

export function PortfolioList({ items }: { items: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const current = editing === 'new' ? null : editing;

  async function submit(formData: FormData) {
    setBusy(true);
    setErrors({});
    try {
      if (current) formData.set('id', current.id);
      const res = await savePortfolioItem(formData);
      if (!res.ok) {
        setErrors(res.errors);
        toast(Object.values(res.errors)[0] ?? 'Could not save.', 'bad');
        return;
      }
      setEditing(null);
      toast('Saved.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="big-title">
        <h2>Portfolio</h2>
        <p>{items.filter((i) => i.published).length} credits on the site</p>
      </div>

      <div className="wrap stack-lg">
        <button type="button" className="btn btn-full" onClick={() => setEditing('new')}>
          <IcPlus className="ic-sm" />
          Add a credit
        </button>

        <div className="list">
          {items.map((i) => (
            <div key={i.id} className="row">
              <div className="row-main" onClick={() => setEditing(i)} style={{ cursor: 'pointer' }}>
                <div className="row-t">{i.title}</div>
                <div className="row-s">{i.clientName || '—'}</div>
                {/* The role is given its own line and its own colour. It is the
                    field that decides whether this reads as a production or a
                    mix, so it must never be the thing that gets truncated. */}
                <div className="row-s" style={{ color: i.role ? 'var(--red-b)' : '#ff9aa8' }}>
                  {i.role || 'NO ROLE — will not publish'}
                </div>
                <div className="row-s dim">{categoryLabel(i.category)}</div>
              </div>
              <Switch
                label={`${i.title} published`}
                on={i.published}
                onChange={async () => {
                  const res = await togglePortfolioPublished(i.id);
                  router.refresh();
                  return res;
                }}
              />
            </div>
          ))}
          {items.length === 0 && <div className="empty">No credits yet.</div>}
        </div>

        <p className="hint" style={{ padding: '0 .3rem' }}>
          Every credit has to state exactly what SnareByt did. That is what stops a mix
          credit ever being shown as a production credit.
        </p>
      </div>

      {/* ---------- Edit sheet ---------- */}
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? current.title : 'New credit'}
      >
        <form action={submit}>
          <div className="field">
            <label className="fl" htmlFor="p-title">Track or project title</label>
            <input id="p-title" name="title" className="in" defaultValue={current?.title ?? ''} required maxLength={160} />
            {errors.title && <p className="err">{errors.title}</p>}
          </div>

          <div className="field">
            <label className="fl" htmlFor="p-client">Artist or brand</label>
            <input id="p-client" name="clientName" className="in" defaultValue={current?.clientName ?? ''} required maxLength={120} />
            {errors.clientName && <p className="err">{errors.clientName}</p>}
          </div>

          <div className="field">
            <label className="fl" htmlFor="p-role">What SnareByt did</label>
            <input
              id="p-role" name="role" className="in" required maxLength={80}
              defaultValue={current?.role ?? ''}
              placeholder="Produced · Mixed and mastered · Mix"
            />
            <p className="hint">
              Required. Write the exact credit — &ldquo;Mixed and mastered&rdquo; is not
              &ldquo;Produced&rdquo;, and claiming the wrong one is a false statement about
              somebody else&rsquo;s record.
            </p>
            {errors.role && <p className="err">{errors.role}</p>}
          </div>

          <div className="field">
            <label className="fl" htmlFor="p-cat">Section</label>
            <select id="p-cat" name="category" className="in" defaultValue={current?.category ?? 'PRODUCED_BY_SNAREBYT'}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="fl" htmlFor="p-url">Link</label>
            <input
              id="p-url" name="externalUrl" className="in" type="url"
              inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              defaultValue={current?.externalUrl ?? ''}
              placeholder="https://…"
            />
            <p className="hint">YouTube, Spotify or the official page. Optional.</p>
            {errors.externalUrl && <p className="err">{errors.externalUrl}</p>}
          </div>

          <div className="field">
            <label className="fl" htmlFor="p-cta">Button label</label>
            <select id="p-cta" name="ctaLabel" className="in" defaultValue={current?.ctaLabel ?? 'Listen'}>
              {CTA.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="fl" htmlFor="p-summary">Summary</label>
            <textarea
              id="p-summary" name="summary" className="in" maxLength={1000}
              defaultValue={current?.summary ?? ''}
            />
            <p className="hint">
              Describe the work, not its reach. No stream counts, view counts or ratings
              that cannot be sourced.
            </p>
          </div>

          <div className="list" style={{ marginBottom: '1rem' }}>
            <label className="row">
              <div className="row-main">
                <div className="row-t">Major credit</div>
                <div className="row-s">Given more weight on the portfolio page</div>
              </div>
              <span className="sw">
                <input type="checkbox" name="majorCredit" value="true" defaultChecked={current?.majorCredit ?? false} aria-label="Major credit" />
                <i />
              </span>
            </label>
            <label className="row">
              <div className="row-main">
                <div className="row-t">Published</div>
                <div className="row-s">Visible on the public site</div>
              </div>
              <span className="sw">
                <input type="checkbox" name="published" value="true" defaultChecked={current?.published ?? true} aria-label="Published" />
                <i />
              </span>
            </label>
          </div>

          <button type="submit" className="btn btn-full" disabled={busy}>
            {busy ? 'Saving…' : current ? 'Save credit' : 'Add credit'}
          </button>

          {current && (
            <button
              type="button"
              className="btn danger btn-full"
              style={{ marginTop: '.7rem' }}
              disabled={busy}
              onClick={async () => {
                const ok = await confirm(
                  `Delete the ${current.title} credit?`,
                  'This removes it from the site and from the database. To take it off the site only, switch Published off instead.',
                  'Delete',
                );
                if (!ok) return;
                setBusy(true);
                try {
                  const res = await deletePortfolioItem(current.id);
                  if (!res.ok) { toast(res.error, 'bad'); return; }
                  setEditing(null);
                  toast(res.message);
                  router.refresh();
                } catch {
                  toast('That was refused. Deleting a credit needs the owner account.', 'bad');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete credit
            </button>
          )}
        </form>
      </Sheet>

      {confirmNode}
    </>
  );
}

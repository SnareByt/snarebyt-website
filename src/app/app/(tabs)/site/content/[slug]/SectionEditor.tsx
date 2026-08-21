'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateField, toggleSection } from '@/app/admin/(dash)/site/actions';
import { Sheet, Switch, useToast } from '@/components/app/Ui';
import { IcNext } from '@/components/app/Icons';

type Field = { k: string; l: string; t: string; h: string; v: string };

type Section = {
  id: string; key: string; name: string; about: string;
  visible: boolean; fields: Field[]; skipped: number;
};

export function SectionEditor({
  pageSlug, pageTitle, sections,
}: {
  pageSlug: string; pageTitle: string; sections: Section[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<Section | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Save one field at a time.
   *
   * `updateField` patches a single dotted path rather than overwriting the
   * section's whole JSON blob, which is what stops two tabs open at once from
   * wiping each other's work. Only changed fields are sent, so an untouched
   * field is never rewritten with its own value.
   */
  async function save(section: Section, formData: FormData) {
    setBusy(true);
    try {
      const changed = section.fields.filter((f) => String(formData.get(f.k) ?? '') !== f.v);
      if (changed.length === 0) {
        setOpen(null);
        toast('Nothing changed.');
        return;
      }

      for (const f of changed) {
        const raw = String(formData.get(f.k) ?? '');
        const res = await updateField({
          pageSlug,
          sectionKey: section.key,
          path: f.k,
          value: f.t === 'num' ? Number(raw) : raw,
        });
        if (!res.ok) {
          toast(res.error, 'bad');
          return;
        }
      }

      setOpen(null);
      toast(`Saved. ${pageTitle} is updated.`);
      router.refresh();
    } catch {
      toast('Could not reach the server.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="big-title">
        <h2>{pageTitle}</h2>
        <p>{sections.length} section{sections.length === 1 ? '' : 's'}</p>
      </div>

      <div className="wrap stack-lg">
        <div className="list">
          {sections.map((s) => (
            <div key={s.id} className="row">
              <div
                className="row-main"
                onClick={() => s.fields.length > 0 && setOpen(s)}
                style={{ cursor: s.fields.length ? 'pointer' : 'default' }}
              >
                <div className="row-t">{s.name}</div>
                <div className="row-s" style={{ whiteSpace: 'normal' }}>{s.about}</div>
                <div className="row-s dim">
                  {s.fields.length} text field{s.fields.length === 1 ? '' : 's'}
                  {s.skipped > 0 && ` · ${s.skipped} image/list field${s.skipped === 1 ? '' : 's'} on desktop`}
                </div>
              </div>
              <Switch
                label={`${s.name} visible`}
                on={s.visible}
                onChange={async (next) => {
                  const res = await toggleSection(s.id, next);
                  router.refresh();
                  return res;
                }}
              />
              {s.fields.length > 0 && <span className="row-x"><IcNext /></span>}
            </div>
          ))}
          {sections.length === 0 && (
            <div className="empty">
              No editable sections on this page yet.
            </div>
          )}
        </div>

        <p className="hint" style={{ padding: '0 .3rem' }}>
          The switch hides a section without deleting a word of it. Images, lists and
          section order are edited from the desktop dashboard — they need more room than a
          phone honestly has.
        </p>
      </div>

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open?.name ?? ''}>
        {open && (
          <form action={(fd) => save(open, fd)}>
            {open.fields.map((f) => (
              <div className="field" key={f.k}>
                <label className="fl" htmlFor={`f-${f.k}`}>{f.l}</label>
                {f.t === 'area' || f.t === 'bn' ? (
                  <textarea
                    id={`f-${f.k}`}
                    name={f.k}
                    className={`in${f.t === 'bn' ? ' bn' : ''}`}
                    defaultValue={f.v}
                    rows={f.t === 'bn' ? 5 : 4}
                    /* Bangla fields get the language hint so iOS offers the
                       right keyboard rather than making him switch by hand. */
                    lang={f.t === 'bn' ? 'bn' : undefined}
                  />
                ) : (
                  <input
                    id={`f-${f.k}`}
                    name={f.k}
                    className="in"
                    type={f.t === 'num' ? 'number' : f.t === 'link' ? 'url' : 'text'}
                    inputMode={f.t === 'num' ? 'numeric' : f.t === 'link' ? 'url' : undefined}
                    autoCapitalize={f.t === 'link' ? 'none' : undefined}
                    autoCorrect={f.t === 'link' ? 'off' : undefined}
                    spellCheck={f.t === 'link' ? false : undefined}
                    defaultValue={f.v}
                  />
                )}
                {f.h && <p className="hint">{f.h}</p>}
              </div>
            ))}

            <button type="submit" className="btn btn-full" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <p className="hint" style={{ textAlign: 'center', marginTop: '.7rem' }}>
              This goes live immediately.
            </p>
          </form>
        )}
      </Sheet>
    </>
  );
}

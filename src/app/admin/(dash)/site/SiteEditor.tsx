'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateField, toggleSection, reorderSections, saveVersion } from './actions';
import type { Field, SectionSpec } from '@/lib/content-spec';
import { MediaPicker, type PickerAsset } from '@/components/admin/MediaPicker';

export type SectionRow = {
  id: string;
  key: string;
  name: string;
  about: string | null;
  visible: boolean;
  values: Record<string, unknown>;
};

export type PageRow = { slug: string; label: string; sections: SectionRow[] };

/**
 * Page → section → typed field.
 *
 * Every input saves on blur through `updateField`, which patches one key of one
 * section's JSON. Nothing here posts a whole document, so two tabs open at once
 * cannot overwrite each other, and the field spec on the server is an
 * allow-list — a crafted request cannot invent a key.
 */
export function SiteEditor({ pages, specs, assets }: { pages: PageRow[]; specs: Record<string, SectionSpec[]>; assets: PickerAsset[] }) {
  const [pageSlug, setPageSlug] = useState(pages[0]?.slug ?? 'home');
  const [sectionKey, setSectionKey] = useState(pages[0]?.sections[0]?.key ?? '');
  const [saving, startSaving] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  const page = pages.find((p) => p.slug === pageSlug);
  const section = page?.sections.find((s) => s.key === sectionKey) ?? page?.sections[0];
  const spec = specs[pageSlug]?.find((s) => s.key === section?.key);

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 2200); };

  const save = (path: string, value: unknown) => {
    if (!section) return;
    startSaving(async () => {
      const res = await updateField({ pageSlug, sectionKey: section.key, path, value });
      flash(res.ok ? 'Saved' : res.error ?? 'Could not save');
      // The section values on screen come from the server render. Without this
      // a newly chosen image still reads "Nothing chosen" until a manual
      // reload, which looks exactly like the save having failed.
      if (res.ok) router.refresh();
    });
  };

  return (
    <>
      <div className="pagepick">
        {pages.map((p) => (
          <button
            key={p.slug}
            type="button"
            className={p.slug === pageSlug ? 'on' : undefined}
            onClick={() => { setPageSlug(p.slug); setSectionKey(p.sections[0]?.key ?? ''); }}
          >
            {p.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn b-gh b-sm"
          onClick={() => startSaving(async () => {
            await saveVersion(`Before editing ${pageSlug}`);
            flash('Version saved — you can restore this later');
          })}
        >
          Save a version
        </button>
        {note ? <span className="chip ok">{note}</span> : null}
        {saving && !note ? <span className="chip">Saving…</span> : null}
      </div>

      <div className="ed">
        <div className="ed-col">
          <div className="seclist">
            {page?.sections.map((s, i) => (
              <div
                key={s.id}
                className={`secrow ${s.key === section?.key ? 'sel' : ''} ${s.visible ? '' : 'hidden-sec'}`}
                onClick={() => setSectionKey(s.key)}
              >
                <span className="nm">
                  {s.name}
                  <small>{s.about || `Section “${s.key}”`}</small>
                </span>

                <div className="ord">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      const ids = page.sections.map((x) => x.id);
                      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                      startSaving(async () => { await reorderSections(pageSlug, ids); flash('Reordered'); });
                    }}
                  >▲</button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === page.sections.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      const ids = page.sections.map((x) => x.id);
                      [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                      startSaving(async () => { await reorderSections(pageSlug, ids); flash('Reordered'); });
                    }}
                  >▼</button>
                </div>

                {/* Hiding is not deleting — every word is kept. */}
                <button
                  type="button"
                  className={`sw ${s.visible ? 'on' : ''}`}
                  aria-label={s.visible ? 'Hide section' : 'Show section'}
                  onClick={(e) => {
                    e.stopPropagation();
                    startSaving(async () => {
                      await toggleSection(s.id, !s.visible);
                      flash(s.visible ? 'Hidden from the site' : 'Now showing');
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="ed-col">
          {section && spec ? (
            <div className="fieldbox">
              <h4>{spec.name}</h4>
              <div className="sub" style={{ marginBottom: '1rem' }}>{spec.about}</div>
              {spec.fields.map((f) => (
                <FieldEditor key={f.k} field={f} values={section.values} onSave={save} assets={assets} />
              ))}
            </div>
          ) : (
            <div className="note">
              <span>✎</span>
              <span>
                This section has no field spec yet, so it cannot be edited safely. Add it to
                <code> src/lib/content-spec.ts</code> and it appears here.
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FieldEditor({
  field, values, onSave, assets,
}: { field: Field; values: Record<string, unknown>; onSave: (path: string, value: unknown) => void; assets: PickerAsset[] }) {
  const raw = values[field.k];

  if (field.t === 'list') return <ListEditor field={field} values={values} onSave={onSave} />;

  if (field.t === 'toggle') {
    return (
      <div className="fg">
        <label className="fl">{field.l} <span className="ftype">{field.t}</span></label>
        <button
          type="button"
          className={`sw ${raw ? 'on' : ''}`}
          onClick={() => onSave(field.k, !raw)}
          aria-label={field.l}
        />
        {field.h ? <div className="hint">{field.h}</div> : null}
      </div>
    );
  }

  // Media fields store a MediaAsset id, so replacing the file updates every
  // page that uses it instead of leaving stale copies of a URL behind.
  if (field.t === 'image' || field.t === 'audio') {
    return (
      <div className="fg">
        <label className="fl">{field.l} <span className="ftype">{field.t}</span></label>
        <MediaPicker
          kind={field.t}
          value={typeof raw === 'string' ? raw : ''}
          assets={assets}
          onChange={(id) => onSave(field.k, id)}
        />
        {field.h ? <div className="hint">{field.h}</div> : null}
      </div>
    );
  }

  const value = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  const long = field.t === 'area' || field.t === 'bn';

  return (
    <div className="fg">
      <label className="fl" htmlFor={field.k}>
        {field.l} <span className="ftype">{field.t}</span>
      </label>
      {long ? (
        <textarea
          id={field.k}
          className={`in ${field.t === 'bn' ? 'bn' : ''}`}
          rows={3}
          defaultValue={value}
          onBlur={(e) => { if (e.target.value !== value) onSave(field.k, e.target.value); }}
        />
      ) : (
        <input
          id={field.k}
          className="in"
          type={field.t === 'num' ? 'number' : field.t === 'colour' ? 'color' : 'text'}
          defaultValue={value}
          onBlur={(e) => { if (e.target.value !== value) onSave(field.k, e.target.value); }}
        />
      )}
      {field.h ? <div className="hint">{field.h}</div> : null}
    </div>
  );
}

function ListEditor({
  field, values, onSave,
}: { field: Field; values: Record<string, unknown>; onSave: (path: string, value: unknown) => void }) {
  const items = Array.isArray(values[field.k]) ? (values[field.k] as Record<string, unknown>[]) : [];
  const itemSpec = field.item ?? [];
  const blank = () => Object.fromEntries(itemSpec.map((f) => [f.k, '']));

  return (
    <div className="fg">
      <label className="fl">{field.l} <span className="ftype">list</span></label>
      {field.h ? <div className="hint" style={{ marginBottom: '.5rem' }}>{field.h}</div> : null}

      {items.map((item, i) => (
        <div className="listitem" key={i}>
          <div className="lifields">
            {itemSpec.map((f) => {
              const v = typeof item[f.k] === 'string' ? (item[f.k] as string) : '';
              return f.t === 'area' ? (
                <textarea
                  key={f.k} className="in" rows={2} placeholder={f.l} defaultValue={v}
                  onBlur={(e) => { if (e.target.value !== v) onSave(`${field.k}.${i}.${f.k}`, e.target.value); }}
                />
              ) : (
                <input
                  key={f.k} className="in" placeholder={f.l} defaultValue={v}
                  onBlur={(e) => { if (e.target.value !== v) onSave(`${field.k}.${i}.${f.k}`, e.target.value); }}
                />
              );
            })}
          </div>
          <button
            type="button" className="btn b-gh b-sm" aria-label="Remove item"
            onClick={() => onSave(field.k, items.filter((_, j) => j !== i))}
          >✕</button>
        </div>
      ))}

      <button
        type="button" className="btn b-gh b-sm"
        onClick={() => onSave(field.k, [...items, blank()])}
      >
        + Add item
      </button>
    </div>
  );
}

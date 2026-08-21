'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PriceResult } from './actions';

type Save = (id: string, fd: FormData) => Promise<PriceResult>;

export type EditableService = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  audience: string;
  deliveryDays: string;
  revisions: string;
  included: string[];
  required: string[];
};

export type EditableTier = {
  id: string;
  name: string;
  priceBdt: number;
  description: string;
  descriptionBn: string;
  recommended: boolean;
};

/**
 * Edit a service and its packages in place.
 *
 * Everything a customer reads is here — the name, the one-line tagline, who it
 * is for, how long it takes, how many revisions, the bullet lists, and each
 * package's wording and price. The rule from the brief is that if changing it
 * needs code, the feature is not finished; this is what closes that gap for
 * services.
 *
 * One form per thing, each saving on its own. A single giant save would mean a
 * typo in one package's Bangla blocks a correction to the delivery time, and
 * they are unrelated edits.
 */
export function ServiceEditor({
  service, tiers, saveService, saveTier,
}: {
  service: EditableService;
  tiers: EditableTier[];
  saveService: Save;
  saveTier: Save;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="svc-edit">
      <button
        type="button" className="btn b-gh b-sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? 'Close editor' : 'Edit service & packages'}
      </button>

      {open ? (
        <div className="svc-edit-body">
          <SaveForm
            id={service.id} action={saveService} title="Service details"
            chip={`/services/${service.slug}`}
          >
            <div className="fg">
              <label className="fl" htmlFor={`t-${service.id}`}>Service name</label>
              <input className="in" id={`t-${service.id}`} name="title" defaultValue={service.title} />
            </div>
            <div className="fg">
              <label className="fl" htmlFor={`tg-${service.id}`}>Tagline</label>
              <input className="in" id={`tg-${service.id}`} name="tagline" defaultValue={service.tagline} />
              <div className="hint">The single line under the service name on the site.</div>
            </div>
            <div className="fg">
              <label className="fl" htmlFor={`au-${service.id}`}>Who this is for</label>
              <input className="in" id={`au-${service.id}`} name="audience" defaultValue={service.audience} />
            </div>
            <div className="two">
              <div className="fg">
                <label className="fl" htmlFor={`dd-${service.id}`}>Delivery time</label>
                <input className="in" id={`dd-${service.id}`} name="deliveryDays" defaultValue={service.deliveryDays} />
                <div className="hint">As you want it printed, e.g. 3–5 days.</div>
              </div>
              <div className="fg">
                <label className="fl" htmlFor={`rv-${service.id}`}>Revisions</label>
                <input className="in" id={`rv-${service.id}`} name="revisions" defaultValue={service.revisions} />
              </div>
            </div>
            <div className="fg">
              <label className="fl" htmlFor={`in-${service.id}`}>What&rsquo;s included</label>
              <textarea className="in" id={`in-${service.id}`} name="included" rows={5}
                defaultValue={service.included.join('\n')} />
              <div className="hint">One per line. Blank lines are ignored.</div>
            </div>
            <div className="fg">
              <label className="fl" htmlFor={`rq-${service.id}`}>What you&rsquo;ll need from them</label>
              <textarea className="in" id={`rq-${service.id}`} name="required" rows={4}
                defaultValue={service.required.join('\n')} />
              <div className="hint">
                One per line. This is the list printed on the site. What is actually collected at
                checkout is set separately, below.
              </div>
            </div>
          </SaveForm>

          {tiers.map((t) => (
            <SaveForm
              key={t.id} id={t.id} action={saveTier}
              title={`Package — ${t.name}`}
              chip={t.recommended ? 'Recommended' : undefined}
            >
              <div className="two">
                <div className="fg">
                  <label className="fl" htmlFor={`n-${t.id}`}>Package name</label>
                  <input className="in" id={`n-${t.id}`} name="name" defaultValue={t.name} />
                </div>
                <div className="fg">
                  <label className="fl" htmlFor={`p-${t.id}`}>Price (৳)</label>
                  <input className="in" id={`p-${t.id}`} name="priceBdt" type="number" min="1" step="1"
                    defaultValue={t.priceBdt} />
                </div>
              </div>
              <div className="fg">
                <label className="fl" htmlFor={`d-${t.id}`}>Description (English)</label>
                <textarea className="in" id={`d-${t.id}`} name="description" rows={3} defaultValue={t.description} />
              </div>
              <div className="fg">
                <label className="fl" htmlFor={`db-${t.id}`}>বিবরণ (Bangla)</label>
                <textarea className="in bn" id={`db-${t.id}`} name="descriptionBn" rows={3}
                  defaultValue={t.descriptionBn} />
                <div className="hint">
                  Required. Both languages print on the package card and into the licence, so a
                  Bangladeshi buyer is never shown an English-only description of what they paid for.
                </div>
              </div>
              <label className="check" style={{ marginTop: '.8rem' }}>
                <input type="checkbox" name="recommended" defaultChecked={t.recommended} />
                <span>Show the &ldquo;Recommended&rdquo; badge on this package</span>
              </label>
              <div className="hint">Only one package per service can carry it; ticking this clears the others.</div>
            </SaveForm>
          ))}

          <div className="note">
            <span>✓</span>
            <span>
              <b>Orders already placed are never rewritten.</b> Each order froze the title and the
              price it was sold at, so editing anything here changes only what the next customer
              sees.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** One independently-saving block, with its own message. */
function SaveForm({
  id, action, title, chip, children,
}: {
  id: string;
  action: Save;
  title: string;
  chip?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      className="svc-block"
      /* onSubmit rather than the `action` prop, deliberately. React resets a
         form after an action runs, so a refused save — a blank Bangla box, a
         price with a decimal — would silently discard every other edit made
         alongside it. */
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await action(id, fd);
          setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
          if (res.ok) router.refresh();
        });
      }}
    >
      <div className="sec-hd" style={{ marginBottom: '.8rem' }}>
        <h3 style={{ margin: 0, fontSize: '.82rem' }}>{title}</h3>
        {chip ? <span className="chip">{chip}</span> : null}
        <span className="sp" />
        <button className="btn b-red b-sm" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {msg ? <div className={msg.ok ? 'ok-box' : 'err-box'}>{msg.text}</div> : null}

      {children}
    </form>
  );
}

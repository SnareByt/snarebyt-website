'use client';

import { useActionState } from 'react';
import { submitBrief, type BriefState } from '@/app/(site)/contact/actions';

export type ServiceOption = { id: string; title: string };

const ENQUIRY_TYPES = [
  'Service booking',
  'Custom beat',
  'Collaboration',
  'Artist booking / performance',
  'Business & partnership',
  'General question',
];

const initial: BriefState = { ok: false, attempt: 0 };

function Field({
  label, name, error, children, full = false, required = false,
}: {
  label: string; name: string; error?: string; children: React.ReactNode; full?: boolean; required?: boolean;
}) {
  return (
    <div className={`field${full ? ' full' : ''}${error ? ' bad' : ''}`}>
      <label className="lb" htmlFor={name}>
        {label}{required ? ' *' : ''}
      </label>
      {children}
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}

export function BriefForm({ services }: { services: ServiceOption[] }) {
  const [state, action, pending] = useActionState(submitBrief, initial);
  const e = state.errors ?? {};
  // Re-populate from whatever was submitted, so a rejected brief keeps every
  // answer. On success the map is empty and the form comes back blank.
  const v = state.values ?? {};
  const val = (name: string) => v[name] ?? '';

  return (
    <form className="card rv-l" style={{ padding: '1.6rem' }} action={action}>
      <div className="eyebrow" style={{ marginBottom: '1.3rem' }}>Project brief</div>

      {state.ok ? (
        <div className="ok-note show">
          <span>✓</span>
          <span>
            Brief received — your reference is <strong>{state.number}</strong>. You will get a reply
            within one business day with a price and a delivery date.
          </span>
        </div>
      ) : null}

      {state.message ? <div className="err-box">{state.message}</div> : null}

      <div className="form" style={{ marginTop: '1rem' }} key={state.attempt}>
        <Field label="Full name" name="name" error={e.name} required>
          <input className="inp" id="name" name="name" placeholder="Your legal name" defaultValue={val('name')} />
        </Field>
        <Field label="Artist name" name="artistName">
          <input className="inp" id="artistName" name="artistName" placeholder="How you are credited" defaultValue={val('artistName')} />
        </Field>
        <Field label="Email" name="email" error={e.email} required>
          <input className="inp" id="email" name="email" type="email" placeholder="you@email.com" defaultValue={val('email')} />
        </Field>
        <Field label="Phone / WhatsApp" name="phone">
          <input className="inp" id="phone" name="phone" placeholder="+880…" defaultValue={val('phone')} />
        </Field>
        <Field label="Country" name="country">
          <input className="inp" id="country" name="country" placeholder="Bangladesh" defaultValue={val('country')} />
        </Field>
        <Field label="Enquiry type" name="enquiryType" error={e.enquiryType} required>
          <select className="sel" id="enquiryType" name="enquiryType" defaultValue={val('enquiryType')}>
            <option value="">Choose…</option>
            {ENQUIRY_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Service" name="serviceId" error={e.serviceId} required>
          <select className="sel" id="serviceId" name="serviceId" defaultValue={val('serviceId')}>
            <option value="">Choose…</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Field>
        <Field label="Project title" name="projectTitle">
          <input className="inp" id="projectTitle" name="projectTitle" placeholder="Working title" defaultValue={val('projectTitle')} />
        </Field>
        <Field label="Genre" name="genre">
          <input className="inp" id="genre" name="genre" placeholder="Trap, R&B, Afrobeats…" defaultValue={val('genre')} />
        </Field>
        <Field label="Deadline" name="deadline">
          <input className="inp" id="deadline" name="deadline" type="date" defaultValue={val('deadline')} />
        </Field>
        {/* Budget is captured in BDT because that is what everything is stored
            and charged in. Showing a USD box here would invite a figure that
            silently becomes the wrong number. */}
        <Field label="Budget (BDT)" name="budgetBdt">
          <input className="inp" id="budgetBdt" name="budgetBdt" type="number" min="0" placeholder="e.g. 8500" defaultValue={val('budgetBdt')} />
        </Field>
        <Field label="Required formats" name="formatsWanted">
          <input className="inp" id="formatsWanted" name="formatsWanted" placeholder="WAV, MP3, stems, 4K MP4…" defaultValue={val('formatsWanted')} />
        </Field>
        <Field label="Reference links" name="referenceLinks" full>
          <input className="inp" id="referenceLinks" name="referenceLinks" placeholder="Spotify / YouTube links, comma separated" defaultValue={val('referenceLinks')} />
        </Field>
        <Field label="Project description" name="description" error={e.description} full required>
          <textarea
            className="inp"
            id="description"
            name="description"
            rows={4}
            placeholder="What are you making, what is the mood, what is not working yet?"
            defaultValue={val('description')}
          />
        </Field>
        <div className={`field full${e.terms ? ' bad' : ''}`}>
          <label className="check">
            <input type="checkbox" name="terms" defaultChecked={val('terms') === 'on'} />
            <span>I have read and accept the Terms &amp; Conditions, Privacy Policy and Revision Policy. *</span>
          </label>
          {e.terms ? <div className="err">{e.terms}</div> : null}
        </div>
      </div>

      <button className="btn btn-red btn-full" type="submit" style={{ marginTop: '1.2rem' }} disabled={pending}>
        {pending ? 'Sending…' : 'Submit project brief →'}
      </button>
      <p style={{ fontSize: '.72rem', color: 'var(--dim)', textAlign: 'center', marginTop: '.8rem' }}>
        Protected by rate limiting. No payment is taken at this step.
      </p>

      {/* File upload is deliberately absent until private storage is wired.
          An input that accepts a 2GB stems file and silently discards it is
          worse than not offering one. */}
    </form>
  );
}

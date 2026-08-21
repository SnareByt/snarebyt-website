/**
 * What a service needs from the customer before the order can be placed.
 *
 * The problem this solves is a real one in this business: an order arrives,
 * money moves, and then the work cannot start because nobody has the stems.
 * Chasing that over WhatsApp days later is the single most common way a
 * booking stalls. Asking at the point of ordering costs the customer thirty
 * seconds and saves the exchange entirely.
 *
 * `Service.required` already existed but is display copy — the list printed on
 * the services page saying what you will need. This is the collected version:
 * the same idea, but it goes in a field, gets validated, and travels with the
 * order.
 *
 * Pure functions, no Prisma, no request context: this decides whether an order
 * may be placed, so it is worth being able to run it in a test.
 */

export type IntakeKind = 'links' | 'text';

export type IntakeSpec = {
  key: string;
  label: string;
  /** Placeholder shown in the field. */
  placeholder: string;
  hint: string;
  kind: IntakeKind;
  /** Minimum useful length. A one-word brief is not a brief. */
  min: number;
  max: number;
};

/**
 * The vocabulary. Deliberately small and shared rather than free text per
 * service, so the checkout knows how to render and validate each one without
 * a per-service special case.
 */
export const INTAKE_FIELDS: Record<string, IntakeSpec> = {
  FILE_LINKS: {
    key: 'FILE_LINKS',
    label: 'Link to your files',
    placeholder: 'Google Drive, Dropbox or WeTransfer link',
    hint: 'Stems, raw footage or session files — whatever this job needs. Paste a shared link; make sure anyone with it can open it.',
    kind: 'links',
    min: 8,
    max: 2000,
  },
  CONCEPT: {
    key: 'CONCEPT',
    label: 'Your concept',
    placeholder: 'What should it look and feel like? Mood, colours, anything you already have in mind.',
    hint: 'A few lines is enough. This is what the first draft is built from, so more detail here means fewer revisions later.',
    kind: 'text',
    min: 20,
    max: 2000,
  },
  REFERENCES: {
    key: 'REFERENCES',
    label: 'Reference tracks or videos',
    placeholder: 'Links, or names of tracks that sound like what you want',
    hint: 'The fastest way to say what you are after.',
    kind: 'text',
    min: 3,
    max: 1000,
  },
  TITLE_TEXT: {
    key: 'TITLE_TEXT',
    label: 'Exact text to appear',
    placeholder: 'Track title and artist name, spelled exactly as it should appear',
    hint: 'Copied character for character onto the artwork, so send it exactly right.',
    kind: 'text',
    min: 2,
    max: 200,
  },
};

export const INTAKE_KEYS = Object.keys(INTAKE_FIELDS);

export const isIntakeKey = (k: string): boolean =>
  Object.prototype.hasOwnProperty.call(INTAKE_FIELDS, k);

/** Drops anything the code no longer knows about, and de-duplicates. */
export function resolveFields(stored: readonly string[] | null | undefined): IntakeSpec[] {
  const seen = new Set<string>();
  const out: IntakeSpec[] = [];
  for (const raw of stored ?? []) {
    const k = String(raw).trim();
    if (isIntakeKey(k) && !seen.has(k)) {
      seen.add(k);
      out.push(INTAKE_FIELDS[k]);
    }
  }
  return out;
}

/**
 * What one brief field is called in the form.
 *
 * Scoped by service tier, because a cart can hold a mix AND a cover art, both
 * of which want references. One name per field would have the second answer
 * overwrite the first, and the customer would never know which brief was lost.
 * The server rebuilds the same names rather than trusting a submitted mapping.
 */
export function intakeName(serviceTierId: string, fieldKey: string): string {
  return `intake:${serviceTierId}:${fieldKey}`;
}

/** Pull one service tier's answers back out of submitted form data. */
export function readIntake(
  form: { get(name: string): unknown },
  serviceTierId: string,
  fields: readonly IntakeSpec[],
): IntakeAnswers {
  const answers: IntakeAnswers = {};
  for (const f of fields) {
    const v = form.get(intakeName(serviceTierId, f.key));
    answers[f.key] = typeof v === 'string' ? v.trim() : '';
  }
  return answers;
}

/** At least one http(s) URL. A bare "on my drive" is not a link. */
const LINK_RE = /https?:\/\/[^\s]+/i;

export type IntakeAnswers = Record<string, string>;

/**
 * Check one service's answers.
 *
 * Returns a message per failing field, keyed the same way the form names its
 * inputs, so the caller can put each error next to the box it belongs to
 * rather than showing one lump at the top.
 */
export function validateIntake(
  fields: readonly IntakeSpec[],
  answers: IntakeAnswers,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const f of fields) {
    const value = (answers[f.key] ?? '').trim();

    if (!value) {
      errors[f.key] = `${f.label} is needed before this can be ordered.`;
      continue;
    }
    if (value.length < f.min) {
      errors[f.key] = f.kind === 'links'
        ? 'That does not look like a link. Paste the full address, starting with https://'
        : `A little more detail, please — at least ${f.min} characters.`;
      continue;
    }
    if (value.length > f.max) {
      errors[f.key] = `That is longer than ${f.max} characters. Put the detail in the files instead.`;
      continue;
    }
    if (f.kind === 'links' && !LINK_RE.test(value)) {
      errors[f.key] = 'Include a full link starting with https:// so the files can actually be opened.';
    }
  }

  return errors;
}

/**
 * Flatten answers into the prose a Project's brief is built from.
 *
 * The Project model has one `description`, and this is what fills it, so the
 * work arrives with the brief attached rather than "to be collected".
 */
export function intakeToBrief(fields: readonly IntakeSpec[], answers: IntakeAnswers): string {
  return fields
    .map((f) => {
      const v = (answers[f.key] ?? '').trim();
      return v ? `${f.label}:\n${v}` : null;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Any http(s) URLs in the answers, for Project.referenceLinks. */
export function intakeLinks(answers: IntakeAnswers): string[] {
  const found = new Set<string>();
  for (const v of Object.values(answers)) {
    for (const m of String(v ?? '').matchAll(/https?:\/\/[^\s,]+/gi)) found.add(m[0]);
  }
  return [...found].slice(0, 20);
}

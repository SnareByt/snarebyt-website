/**
 * Shared shape for the portal's form actions.
 *
 * Kept out of actions.ts because a `'use server'` module may only export async
 * functions — a plain constant there is a build error, not a lint warning, and
 * the message names the file rather than the export.
 */
export type FormState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
  /** Set when the flow should move on without a redirect. */
  step?: 'verify' | 'sent';
};

export const initialFormState: FormState = { ok: false };

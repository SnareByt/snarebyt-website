import type { ProjectStatus, FileOwner } from '@prisma/client';

/**
 * What may be done to a project, decided from facts alone.
 *
 * Written to the same shape as `order-rules.ts` and for the same reason:
 * deliberately free of Prisma, auth and `server-only`, so the rules sit in one
 * readable place and can be checked without a database. The server actions
 * gather facts, ask here, and only then write.
 *
 * A project is a piece of paid work in progress. The rules that matter:
 *
 *  · Status only ever moves forward, except for the one backward step that
 *    genuinely happens — a client asking for a revision after hearing a
 *    preview. Every other backward jump is a mis-tap, and a mis-tap that
 *    silently rewrites history is how a delivered project ends up looking
 *    unstarted.
 *  · DELIVERED is terminal. Once the client has the final files, the record of
 *    that delivery is not editable by hand.
 *  · Nothing may be marked delivered without a deliverable file attached.
 *    "Delivered" with nothing to download is the services-side equivalent of
 *    a published beat with no untagged MP3: the customer paid and received
 *    nothing.
 */

export type ProjectFacts = {
  status: ProjectStatus;
  /** Files marked as the finished work, not the client's raw uploads. */
  deliverableCount: number;
  revisionsUsed: number;
  revisionsAllowed: number;
};

export type Verdict = { ok: true } | { ok: false; error: string };

const human = (s: string) => s.replace(/_/g, ' ').toLowerCase();

/**
 * The pipeline, in order. Position in this array is what "forward" means.
 */
export const PROJECT_FLOW: ProjectStatus[] = [
  'ORDER_RECEIVED',
  'PAYMENT_CONFIRMED',
  'FILES_RECEIVED',
  'IN_PROGRESS',
  'FIRST_PREVIEW_READY',
  'REVISION_REQUESTED',
  'FINALISING',
  'COMPLETED',
  'DELIVERED',
];

export const PROJECT_LABEL: Record<ProjectStatus, string> = {
  ORDER_RECEIVED: 'Order received',
  PAYMENT_CONFIRMED: 'Payment confirmed',
  FILES_RECEIVED: 'Files received',
  IN_PROGRESS: 'In progress',
  FIRST_PREVIEW_READY: 'First preview ready',
  REVISION_REQUESTED: 'Revision requested',
  FINALISING: 'Finalising',
  COMPLETED: 'Completed',
  DELIVERED: 'Delivered',
};

/**
 * The only statuses from which a revision can be requested.
 *
 * A revision is a response to something the client has heard. Asking for one
 * before anything was sent is not just nonsense — `setProjectStatus` counts a
 * revision against the package, so it would silently spend one of the three
 * the client paid for on work that was never delivered.
 *
 * REVISION_REQUESTED sits in the middle of PROJECT_FLOW because that is where
 * it falls in a normal job, which means a naive "everything after here" slice
 * offers it from ORDER_RECEIVED onwards. It has to be excluded explicitly.
 */
const REVISABLE_FROM: ProjectStatus[] = ['FIRST_PREVIEW_READY', 'FINALISING', 'COMPLETED'];

/**
 * Which statuses this project may move to next.
 *
 * Forward by any number of steps — real work skips stages, and forcing Samir
 * to tap through four of them to record where a project actually is would just
 * mean he stops recording it.
 *
 * REVISION_REQUESTED is the exception in both directions: it is offered from
 * the three points above (including backwards, from FINALISING or COMPLETED)
 * and from nowhere else.
 */
export function nextProjectStatuses(f: ProjectFacts): ProjectStatus[] {
  if (f.status === 'DELIVERED') return [];

  const here = PROJECT_FLOW.indexOf(f.status);
  const forward = PROJECT_FLOW.slice(here + 1).filter((s) => s !== 'REVISION_REQUESTED');

  return REVISABLE_FROM.includes(f.status)
    ? ['REVISION_REQUESTED', ...forward]
    : forward;
}

export function canSetProjectStatus(f: ProjectFacts, next: ProjectStatus): Verdict {
  if (f.status === next) return { ok: false, error: 'That is already the status.' };

  if (f.status === 'DELIVERED') {
    return {
      ok: false,
      error: 'This project has been delivered. That record is not editable — start a new project if there is more work.',
    };
  }

  if (!nextProjectStatuses(f).includes(next)) {
    return {
      ok: false,
      error: `A project that is ${human(f.status)} cannot be moved back to ${human(next)}.`,
    };
  }

  if (next === 'DELIVERED' && f.deliverableCount === 0) {
    return {
      ok: false,
      error: 'Attach the final files and mark them as the delivery first. Marking this delivered with nothing to download means the customer paid and received nothing.',
    };
  }

  return { ok: true };
}

/**
 * Revisions are counted, not capped.
 *
 * The allowance is what was sold, and going over it is a commercial
 * conversation rather than something software should block — refusing the
 * eighth revision on a package that included three would leave Samir unable to
 * record work he has already agreed to do. So this reports, and he decides.
 */
export function revisionNote(f: ProjectFacts): string | null {
  if (f.revisionsUsed < f.revisionsAllowed) {
    return `${f.revisionsAllowed - f.revisionsUsed} of ${f.revisionsAllowed} revisions left.`;
  }
  if (f.revisionsUsed === f.revisionsAllowed) {
    return `All ${f.revisionsAllowed} included revisions used.`;
  }
  return `${f.revisionsUsed - f.revisionsAllowed} revision(s) beyond the ${f.revisionsAllowed} included.`;
}

/** Where a project's files live in the private bucket. */
export const projectFileKey = (projectNumber: string, owner: FileOwner, filename: string) =>
  `projects/${projectNumber}/${owner.toLowerCase()}/${filename}`;

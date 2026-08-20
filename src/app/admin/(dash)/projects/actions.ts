'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import type { ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireOwner } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { presignUpload, presignDownload } from '@/lib/storage';
import { canSetProjectStatus, PROJECT_LABEL, type ProjectFacts } from '@/lib/project-rules';

/**
 * Running a booked job: status, notes and the final files.
 *
 * These are new — the Projects screen has been read-only since it was built,
 * which meant a booking could be taken and paid for but never moved, and the
 * finished master had to be sent by hand from outside the system entirely.
 *
 * They live here, next to the other admin actions and behind requireAdmin(),
 * so the desktop dashboard and the phone both call the same code. The rules
 * themselves are in src/lib/project-rules.ts, with no Prisma and no auth, for
 * the same reason order-rules.ts is: rules that can be read in one place are
 * rules that can be checked.
 */

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const facts = (p: {
  status: ProjectStatus;
  revisionsUsed: number;
  revisionsAllowed: number;
  files: { isDeliverable: boolean }[];
}): ProjectFacts => ({
  status: p.status,
  deliverableCount: p.files.filter((f) => f.isDeliverable).length,
  revisionsUsed: p.revisionsUsed,
  revisionsAllowed: p.revisionsAllowed,
});

/**
 * Move a project along.
 *
 * Every move writes a ProjectEvent as well as the new status. The event log is
 * the answer to "when did I send the first preview?", which is the question
 * that actually comes up when a client says they have been waiting a month.
 * Losing that history to save a row would be a false economy.
 */
export async function setProjectStatus(
  projectId: string,
  next: string,
  note?: string,
): Promise<Result> {
  const admin = await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { files: { select: { isDeliverable: true } } },
  });
  if (!project) return { ok: false, error: 'That project no longer exists.' };

  if (!(next in PROJECT_LABEL)) return { ok: false, error: 'Unknown status.' };
  const target = next as ProjectStatus;

  const verdict = canSetProjectStatus(facts(project), target);
  if (!verdict.ok) return verdict;

  // A revision going out is the one status change that costs the customer
  // something they bought, so it is counted rather than merely recorded.
  const usesRevision = target === 'REVISION_REQUESTED';

  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: {
        status: target,
        ...(usesRevision ? { revisionsUsed: { increment: 1 } } : {}),
      },
    }),
    prisma.projectEvent.create({
      data: {
        projectId,
        status: target,
        note: note?.trim().slice(0, 1000) || null,
        actorId: admin.id,
      },
    }),
  ]);

  await audit({
    actorId: admin.id, action: 'project.status.changed', entity: 'Project', entityId: projectId,
    diff: { number: project.number, from: project.status, to: target },
  });

  revalidatePath('/admin/projects');
  revalidatePath('/app/projects');
  return { ok: true, message: `Marked ${PROJECT_LABEL[target].toLowerCase()}.` };
}

const notesSchema = z.object({
  notes: z.string().trim().max(4000).optional().default(''),
  deadline: z.string().trim().optional().default(''),
});

/** Admin-only working notes and the agreed deadline. Never shown to the client. */
export async function updateProjectNotes(projectId: string, formData: FormData): Promise<Result> {
  const admin = await requireAdmin();

  const parsed = notesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Check the details and try again.' };

  // An empty date field means "no deadline", not "the epoch". Parsing a blank
  // string with `new Date()` yields Invalid Date, which Prisma rejects with an
  // error that has nothing to do with what happened.
  const raw = parsed.data.deadline;
  let deadline: Date | null = null;
  if (raw) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'That deadline is not a valid date.' };
    deadline = d;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { notes: parsed.data.notes || null, deadline },
  });

  await audit({
    actorId: admin.id, action: 'project.notes.updated', entity: 'Project', entityId: projectId,
  });

  revalidatePath('/admin/projects');
  revalidatePath('/app/projects');
  return { ok: true, message: 'Saved.' };
}

/* ============================================================
   Final files
   ============================================================ */

/** Everything a studio sends back. Client uploads arrive by a different path. */
const DELIVERY_MAX_MB = 2048;

export type UploadTicket =
  | { ok: true; url: string; key: string }
  | { ok: false; error: string };

/**
 * Presign an upload for a finished file.
 *
 * Always the PRIVATE bucket, with no exception and no toggle: a client's
 * master sitting on a public URL is the worst outcome this project has. The
 * key carries a random suffix so replacing "final.wav" produces a new key
 * rather than silently serving the previous version from cache.
 */
export async function getProjectUploadUrl(input: {
  projectId: string;
  filename: string;
  contentType: string;
  bytes: number;
}): Promise<UploadTicket> {
  const admin = await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, number: true },
  });
  if (!project) return { ok: false, error: 'That project no longer exists.' };

  if (input.bytes <= 0) return { ok: false, error: 'That file is empty.' };
  if (input.bytes > DELIVERY_MAX_MB * 1024 * 1024) {
    return { ok: false, error: `Too large — the limit is ${DELIVERY_MAX_MB} MB.` };
  }

  const safe = input.filename.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'file';
  const key = `projects/${project.number}/studio/${randomBytes(4).toString('hex')}-${safe}`;

  const url = await presignUpload({ key, contentType: input.contentType, visibility: 'private' });

  await audit({
    actorId: admin.id, action: 'project.upload.presign', entity: 'Project',
    entityId: project.id, diff: { key },
  });

  return { ok: true, url, key };
}

/**
 * Record a file once the browser has finished PUTting it.
 *
 * The key is checked rather than trusted. This action is reachable on its own,
 * and an object key written straight into the database is a pointer to any
 * file in the private bucket — including another client's masters.
 */
export async function confirmProjectUpload(input: {
  projectId: string;
  key: string;
  filename: string;
  mime: string;
  bytes: number;
  label?: string;
  isDeliverable: boolean;
}): Promise<Result> {
  const admin = await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, number: true },
  });
  if (!project) return { ok: false, error: 'That project no longer exists.' };

  if (!input.key.startsWith(`projects/${project.number}/studio/`)) {
    return { ok: false, error: 'That file does not belong to this project.' };
  }

  await prisma.projectFile.create({
    data: {
      projectId: project.id,
      uploadedBy: 'STUDIO',
      label: input.label?.trim().slice(0, 120) || null,
      filename: input.filename.slice(0, 200),
      objectKey: input.key,
      mime: input.mime.slice(0, 120),
      bytes: BigInt(input.bytes),
      isDeliverable: input.isDeliverable,
    },
  });

  await audit({
    actorId: admin.id, action: 'project.file.added', entity: 'Project', entityId: project.id,
    diff: { key: input.key, deliverable: input.isDeliverable, bytes: input.bytes },
  });

  revalidatePath('/admin/projects');
  revalidatePath('/app/projects');
  return { ok: true, message: input.isDeliverable ? 'Final file attached.' : 'File attached.' };
}

/**
 * A time-limited link to one project file.
 *
 * Presigned straight from R2 rather than going through the grant machinery in
 * storage.ts. That machinery is bound to an OrderItem — it checks the licence
 * tier's included assets — and a project has no order item to bind to.
 *
 * The trade-off is real and worth stating plainly rather than hiding: unlike a
 * beat download, this link has NO attempt cap and NO per-fetch log. Anyone
 * holding it can fetch the file until it expires. That is why the expiry is
 * days rather than the fortnight a beat grant gets, and why the screen says so
 * before handing the link over.
 */
export async function getProjectFileLink(
  fileId: string,
  days = 7,
): Promise<{ ok: true; url: string; expiresInDays: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();

  const file = await prisma.projectFile.findUnique({
    where: { id: fileId },
    include: { project: { select: { id: true, number: true } } },
  });
  if (!file) return { ok: false, error: 'That file no longer exists.' };

  // S3-compatible presigning caps at seven days. Asking for more does not
  // fail at signing time — it produces a URL the service rejects on use,
  // which would look like a broken delivery to the client.
  const capped = Math.min(Math.max(1, days), 7);

  const url = await presignDownload(file.objectKey, capped * 86400, file.filename);

  await audit({
    actorId: admin.id, action: 'project.file.link', entity: 'ProjectFile', entityId: fileId,
    diff: { project: file.project.number, days: capped },
  });

  return { ok: true, url, expiresInDays: capped };
}

/**
 * Detach a file.
 *
 * The R2 object is deliberately left in place, for the same reason beat files
 * are: a client may be mid-download on a link that was already handed over,
 * and a 404 after money changed hands is a far worse outcome than an orphaned
 * object costing a fraction of a penny.
 */
export async function removeProjectFile(fileId: string): Promise<Result> {
  const admin = await requireOwner();

  const file = await prisma.projectFile.findUnique({
    where: { id: fileId },
    include: { project: { select: { id: true, number: true, status: true } } },
  });
  if (!file) return { ok: false, error: 'That file no longer exists.' };

  if (file.isDeliverable && file.project.status === 'DELIVERED') {
    return {
      ok: false,
      error: 'This is the delivered file on a delivered project. Removing it would leave a customer who has paid with nothing to download.',
    };
  }

  await prisma.projectFile.delete({ where: { id: fileId } });

  await audit({
    actorId: admin.id, action: 'project.file.removed', entity: 'Project',
    entityId: file.project.id, diff: { filename: file.filename },
  });

  revalidatePath('/admin/projects');
  revalidatePath('/app/projects');
  return { ok: true, message: 'File detached. The stored copy is kept.' };
}

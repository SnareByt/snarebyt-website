'use server';

import { z } from 'zod';
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAccount } from '@/lib/account';
import { presignUpload } from '@/lib/storage';
import { rateLimit } from '@/lib/audit';
import { notifyAdmin } from '@/lib/notify';
import { siteUrl } from '@/lib/seo';

/**
 * What an artist may do to their own project.
 *
 * Every action here proves ownership the same way: the project id goes into a
 * `where` alongside the signed-in user's id, and the action stops if that
 * matched nothing. Nothing is fetched first and checked afterwards.
 */

export type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Ownership check and a project row, or null. One query, no gap. */
async function owned(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true, number: true, status: true,
      revisionsUsed: true, revisionsAllowed: true,
    },
  });
}

/* ------------------------------------------------------------------ *
 *  Uploads
 * ------------------------------------------------------------------ */

const MAX_MB = 2048;

// Anything a studio actually receives. Deliberately a list rather than "any
// file": this bucket also holds masters and licence PDFs, and an upload form
// that accepts .html or .svg is a stored-XSS delivery mechanism the moment
// something serves it back.
const ALLOWED_EXT = [
  'wav', 'aif', 'aiff', 'mp3', 'm4a', 'flac', 'ogg',
  'zip', 'rar', '7z',
  'pdf', 'txt', 'rtf', 'md', 'docx',
  'jpg', 'jpeg', 'png', 'webp', 'avif', 'heic',
  'mp4', 'mov',
  'als', 'flp', 'logicx', 'ptx', 'cpr', 'rpp',
];

export type UploadTicket =
  | { ok: true; url: string; key: string }
  | { ok: false; error: string };

export async function getProjectUploadUrl(input: {
  projectId: string;
  filename: string;
  contentType: string;
  bytes: number;
}): Promise<UploadTicket> {
  const me = await requireAccount();

  const limit = await rateLimit(`upload:${me.id}`, 60, 60 * 60_000);
  if (!limit.ok) return { ok: false, error: 'Too many uploads in the last hour. Try again shortly.' };

  const project = await owned(me.id, input.projectId);
  if (!project) return { ok: false, error: 'That project is not on your account.' };

  const ext = input.filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
  if (!ALLOWED_EXT.includes(ext)) {
    return { ok: false, error: `.${ext || '?'} files are not accepted here. Zip it and upload the archive.` };
  }
  if (input.bytes <= 0) return { ok: false, error: 'That file is empty.' };
  if (input.bytes > MAX_MB * 1024 * 1024) {
    return { ok: false, error: `Too large — the limit is ${MAX_MB} MB. Split it or send a link.` };
  }

  // The key is built here from ids we control, never from anything the browser
  // sent. A filename is attacker-controlled text; letting it choose a path is
  // how an upload lands somewhere it should not.
  const key = `projects/${project.id}/client/${randomBytes(8).toString('hex')}.${ext}`;

  const url = await presignUpload({ key, contentType: input.contentType, visibility: 'private' });
  return { ok: true, url, key };
}

const confirmSchema = z.object({
  projectId: z.string().min(1),
  key: z.string().min(1),
  filename: z.string().trim().min(1).max(255),
  mime: z.string().trim().max(160).default(''),
  bytes: z.number().int().positive().max(MAX_MB * 1024 * 1024),
  label: z.string().trim().max(120).default(''),
});

export async function confirmProjectUpload(input: unknown): Promise<Result> {
  const me = await requireAccount();

  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That upload could not be recorded.' };
  const d = parsed.data;

  const project = await owned(me.id, d.projectId);
  if (!project) return { ok: false, error: 'That project is not on your account.' };

  // The key is re-derived rather than trusted. This action is reachable on its
  // own, and an object key written straight into the database is a pointer to
  // any file in the bucket — including another artist's masters.
  if (!d.key.startsWith(`projects/${project.id}/client/`)) {
    return { ok: false, error: 'That file does not belong to this project.' };
  }

  await prisma.projectFile.create({
    data: {
      projectId: project.id,
      uploadedBy: 'CUSTOMER',
      label: d.label || null,
      // Stored for display only. It is never used to build a path.
      filename: d.filename.slice(0, 255),
      objectKey: d.key,
      mime: d.mime || 'application/octet-stream',
      bytes: BigInt(d.bytes),
    },
  });

  await prisma.projectEvent.create({
    data: { projectId: project.id, status: project.status, note: `Client uploaded ${d.filename}` },
  });

  // Moving to FILES_RECEIVED is only ever a step forward from the opening
  // state — a file arriving late in a project must not reset its status.
  if (project.status === 'ORDER_RECEIVED' || project.status === 'PAYMENT_CONFIRMED') {
    await prisma.project.update({ where: { id: project.id }, data: { status: 'FILES_RECEIVED' } });
  }

  const base = await siteUrl();
  void notifyAdmin({
    event: 'enquiry.received',
    subject: `${project.number}: client uploaded ${d.filename}`,
    title: 'Project file uploaded',
    rows: [['Project', project.number], ['File', d.filename], ['From', me.email]],
    action: base ? { label: 'Open the project', href: `${base}/admin/projects/${project.id}` } : undefined,
  });

  revalidatePath(`/account/projects/${project.id}`);
  return { ok: true, message: 'Uploaded.' };
}

export async function deleteOwnFile(fileId: string): Promise<Result> {
  const me = await requireAccount();

  // Scoped three ways at once: the file, the owning project's user, and that
  // it was the client who uploaded it. An artist cannot delete a deliverable
  // the studio sent — that is the studio's record of what was handed over.
  const res = await prisma.projectFile.deleteMany({
    where: { id: fileId, uploadedBy: 'CUSTOMER', project: { userId: me.id } },
  });

  if (!res.count) return { ok: false, error: 'That file cannot be removed.' };
  revalidatePath('/account/projects');
  return { ok: true, message: 'Removed.' };
}

/* ------------------------------------------------------------------ *
 *  Messages and revisions
 * ------------------------------------------------------------------ */

const messageSchema = z.object({
  projectId: z.string().min(1),
  body: z.string().trim().min(2, 'Say a little more than that').max(4000),
  isRevision: z.union([z.literal('on'), z.literal('')]).optional(),
});

export async function postMessage(_prev: Result | null, fd: FormData): Promise<Result> {
  const me = await requireAccount();

  const parsed = messageSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the message' };
  }
  const { projectId, body, isRevision } = parsed.data;

  const limit = await rateLimit(`msg:${me.id}`, 30, 60 * 60_000);
  if (!limit.ok) return { ok: false, error: 'Too many messages in the last hour.' };

  const project = await owned(me.id, projectId);
  if (!project) return { ok: false, error: 'That project is not on your account.' };

  const wantsRevision = isRevision === 'on';
  if (wantsRevision && project.revisionsUsed >= project.revisionsAllowed) {
    return {
      ok: false,
      error: `You have used all ${project.revisionsAllowed} revisions on this project. Send a note and SnareByt will tell you what an extra one costs.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectMessage.create({
      data: { projectId: project.id, authorId: me.id, fromStudio: false, body },
    });

    if (wantsRevision) {
      await tx.project.update({
        where: { id: project.id },
        data: { status: 'REVISION_REQUESTED', revisionsUsed: { increment: 1 } },
      });
      await tx.projectEvent.create({
        data: {
          projectId: project.id,
          status: 'REVISION_REQUESTED',
          note: `Revision ${project.revisionsUsed + 1} of ${project.revisionsAllowed} requested`,
        },
      });
    }
  });

  const base = await siteUrl();
  void notifyAdmin({
    event: 'enquiry.received',
    subject: wantsRevision
      ? `${project.number}: revision requested`
      : `${project.number}: new message from ${me.name ?? me.email}`,
    title: wantsRevision ? 'Revision requested' : 'Project message',
    rows: [['Project', project.number], ['From', me.email], ['Message', body.slice(0, 400)]],
    action: base ? { label: 'Open the project', href: `${base}/admin/projects/${project.id}` } : undefined,
  });

  revalidatePath(`/account/projects/${project.id}`);
  return { ok: true, message: wantsRevision ? 'Revision requested.' : 'Sent.' };
}

/** Marks studio messages read once the artist has actually opened the page. */
export async function markRead(projectId: string) {
  const me = await requireAccount();
  await prisma.projectMessage.updateMany({
    where: { projectId, fromStudio: true, readAt: null, project: { userId: me.id } },
    data: { readAt: new Date() },
  });
}

'use server';

import { z } from 'zod';
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireOwner } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { presignUpload } from '@/lib/storage';
import { issueOtp } from '@/lib/account';
import { sendOtpEmail } from '@/lib/account-mail';

/**
 * Artist account administration.
 *
 * The rule this section exists to satisfy: Samir should never have to open the
 * database to run his business. So everything here is an action with a reason
 * attached and an audit row behind it, rather than a raw edit.
 *
 * Two things are deliberately NOT possible from here, and both are load-bearing:
 *
 *   - There is no way to read or set a password. Support cannot become a
 *     credential-reset channel that works by asking nicely; the artist resets
 *     their own through their own inbox.
 *   - There is no way to delete an artist who has paid orders. A licence has
 *     to stay provable years after the sale, and deleting the buyer destroys
 *     the other half of the record.
 */

export type Result = { ok: true; message: string } | { ok: false; error: string };

/* ------------------------------------------------------------------ *
 *  Account state
 * ------------------------------------------------------------------ */

const suspendSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().min(3, 'Give a reason — it is what you will read in six months').max(300),
});

/**
 * Suspend. Reversible, and it destroys nothing.
 *
 * Live sessions are revoked in the same transaction. Without that, someone
 * already signed in keeps working until their cookie happens to expire, which
 * makes "suspended" mean "suspended eventually".
 */
export async function suspendArtist(_prev: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireOwner();

  const parsed = suspendSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' };
  const { userId, reason } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'CUSTOMER' },
    select: { id: true, email: true, suspendedAt: true },
  });
  if (!user) return { ok: false, error: 'That artist account no longer exists.' };
  if (user.suspendedAt) return { ok: false, error: 'That account is already suspended.' };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { suspendedAt: new Date(), suspendedReason: reason },
    }),
    prisma.session.updateMany({
      where: { userId: user.id, kind: 'ACCOUNT', revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await audit({
    actorId: admin.id, action: 'artist.suspend', entity: 'User', entityId: user.id,
    diff: { email: user.email, reason },
  });

  revalidatePath(`/admin/customers/${user.id}`);
  revalidatePath('/admin/customers');
  return { ok: true, message: 'Suspended. They cannot sign in, and every device was signed out.' };
}

export async function restoreArtist(userId: string): Promise<Result> {
  const admin = await requireOwner();

  const res = await prisma.user.updateMany({
    where: { id: userId, role: 'CUSTOMER', suspendedAt: { not: null } },
    data: { suspendedAt: null, suspendedReason: null },
  });
  if (!res.count) return { ok: false, error: 'That account is not suspended.' };

  await audit({ actorId: admin.id, action: 'artist.restore', entity: 'User', entityId: userId });

  revalidatePath(`/admin/customers/${userId}`);
  revalidatePath('/admin/customers');
  return { ok: true, message: 'Restored. They can sign in again — they will need to sign in fresh.' };
}

const noteSchema = z.object({
  userId: z.string().min(1),
  note: z.string().trim().max(4000).default(''),
});

/** Private. No query the artist's own pages run ever selects this column. */
export async function saveAdminNote(_prev: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();

  const parsed = noteSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: 'Note too long.' };

  const res = await prisma.user.updateMany({
    where: { id: parsed.data.userId, role: 'CUSTOMER' },
    data: { adminNote: parsed.data.note || null },
  });
  if (!res.count) return { ok: false, error: 'That artist account no longer exists.' };

  await audit({
    actorId: admin.id, action: 'artist.note', entity: 'User', entityId: parsed.data.userId,
  });

  revalidatePath(`/admin/customers/${parsed.data.userId}`);
  return { ok: true, message: 'Note saved.' };
}

/**
 * Send a fresh verification code.
 *
 * Useful when someone says the email never arrived. It does not verify the
 * address on their behalf — that would defeat the point of verifying it, and
 * it is what attaches their guest order history.
 */
export async function resendVerification(userId: string): Promise<Result> {
  const admin = await requireAdmin();

  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'CUSTOMER' },
    select: { id: true, email: true, emailVerified: true, suspendedAt: true },
  });
  if (!user) return { ok: false, error: 'That artist account no longer exists.' };
  if (user.emailVerified) return { ok: false, error: 'That address is already verified.' };
  if (user.suspendedAt) return { ok: false, error: 'That account is suspended. Restore it first.' };

  const otp = await issueOtp(user.id);
  if (!otp.ok) return { ok: false, error: otp.error };

  const sent = await sendOtpEmail(user.email, otp.code);
  await audit({
    actorId: admin.id, action: 'artist.resend_verification', entity: 'User', entityId: user.id,
    diff: { sent: sent.sent, reason: sent.reason ?? null },
  });

  if (!sent.sent) {
    return {
      ok: false,
      error: sent.reason === 'no_api_key'
        ? 'No email service key is set on the server, so nothing was sent.'
        : `The code could not be sent: ${sent.reason}`,
    };
  }
  return { ok: true, message: `A new code is on its way to ${user.email}.` };
}

/**
 * Sign every device out without suspending.
 *
 * The right response to "I think someone else is in my account" — it stops
 * the intruder without locking out the owner.
 */
export async function signOutArtistEverywhere(userId: string): Promise<Result> {
  const admin = await requireAdmin();

  const res = await prisma.session.updateMany({
    where: { userId, kind: 'ACCOUNT', revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await audit({
    actorId: admin.id, action: 'artist.signout_all', entity: 'User', entityId: userId,
    diff: { sessions: res.count },
  });

  revalidatePath(`/admin/customers/${userId}`);
  return {
    ok: true,
    message: res.count ? `Signed out ${res.count} ${res.count === 1 ? 'device' : 'devices'}.` : 'No devices were signed in.',
  };
}

/* ------------------------------------------------------------------ *
 *  Projects
 * ------------------------------------------------------------------ */

const STATUSES = [
  'ORDER_RECEIVED', 'PAYMENT_CONFIRMED', 'FILES_RECEIVED', 'IN_PROGRESS',
  'FIRST_PREVIEW_READY', 'REVISION_REQUESTED', 'FINALISING', 'COMPLETED', 'DELIVERED',
] as const;

const statusSchema = z.object({
  projectId: z.string().min(1),
  status: z.enum(STATUSES),
  note: z.string().trim().max(500).default(''),
});

export async function setProjectStatus(_prev: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();

  const parsed = statusSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: 'Pick a status.' };
  const { projectId, status, note } = parsed.data;

  const project = await prisma.project.findUnique({
    where: { id: projectId }, select: { id: true, number: true, status: true, userId: true },
  });
  if (!project) return { ok: false, error: 'That project no longer exists.' };
  if (project.status === status) return { ok: true, message: 'Already at that status.' };

  await prisma.$transaction([
    prisma.project.update({ where: { id: project.id }, data: { status } }),
    // The event row is what the artist's timeline reads, so the change is
    // visible to them rather than only in the database.
    prisma.projectEvent.create({
      data: { projectId: project.id, status, note: note || null, actorId: admin.id },
    }),
  ]);

  await audit({
    actorId: admin.id, action: 'project.status', entity: 'Project', entityId: project.id,
    diff: { number: project.number, from: project.status, to: status },
  });

  revalidatePath(`/admin/customers/${project.userId ?? ''}`);
  revalidatePath(`/account/projects/${project.id}`);
  return { ok: true, message: `${project.number} is now ${status.replace(/_/g, ' ').toLowerCase()}.` };
}

/** A message from the studio, which is what the artist sees in their thread. */
export async function replyToProject(_prev: Result | null, fd: FormData): Promise<Result> {
  const admin = await requireAdmin();

  const projectId = String(fd.get('projectId') ?? '');
  const body = String(fd.get('body') ?? '').trim();
  if (body.length < 2) return { ok: false, error: 'Say a little more than that.' };
  if (body.length > 4000) return { ok: false, error: 'That is too long for a message.' };

  const project = await prisma.project.findUnique({
    where: { id: projectId }, select: { id: true, userId: true },
  });
  if (!project) return { ok: false, error: 'That project no longer exists.' };

  await prisma.projectMessage.create({
    data: { projectId: project.id, authorId: admin.id, fromStudio: true, body },
  });

  revalidatePath(`/admin/customers/${project.userId ?? ''}`);
  revalidatePath(`/account/projects/${project.id}`);
  return { ok: true, message: 'Sent.' };
}

/* ------------------------------------------------------------------ *
 *  Studio deliveries
 * ------------------------------------------------------------------ */

const DELIVERY_EXT = [
  'wav', 'aif', 'aiff', 'mp3', 'm4a', 'flac',
  'zip', 'rar', '7z', 'pdf',
  'jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov',
];

export async function getDeliveryUploadUrl(input: {
  projectId: string;
  filename: string;
  contentType: string;
  bytes: number;
}): Promise<{ ok: true; url: string; key: string } | { ok: false; error: string }> {
  await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: input.projectId }, select: { id: true },
  });
  if (!project) return { ok: false, error: 'That project no longer exists.' };

  const ext = input.filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
  if (!DELIVERY_EXT.includes(ext)) {
    return { ok: false, error: `.${ext || '?'} is not a delivery format. Zip it and send the archive.` };
  }
  if (input.bytes <= 0) return { ok: false, error: 'That file is empty.' };

  // Built from ids, never from the filename, and foldered separately from
  // client uploads so the two can never be confused for one another.
  const key = `projects/${project.id}/studio/${randomBytes(8).toString('hex')}.${ext}`;
  const url = await presignUpload({ key, contentType: input.contentType, visibility: 'private' });
  return { ok: true, url, key };
}

const deliverySchema = z.object({
  projectId: z.string().min(1),
  key: z.string().min(1),
  filename: z.string().trim().min(1).max(255),
  mime: z.string().trim().max(160).default(''),
  bytes: z.number().int().positive(),
  label: z.string().trim().max(120).default(''),
  isDeliverable: z.boolean().default(false),
});

export async function confirmDelivery(input: unknown): Promise<Result> {
  const admin = await requireAdmin();

  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That upload could not be recorded.' };
  const d = parsed.data;

  const project = await prisma.project.findUnique({
    where: { id: d.projectId }, select: { id: true, number: true, status: true, userId: true },
  });
  if (!project) return { ok: false, error: 'That project no longer exists.' };
  if (!d.key.startsWith(`projects/${project.id}/studio/`)) {
    return { ok: false, error: 'That file does not belong to this project.' };
  }

  await prisma.projectFile.create({
    data: {
      projectId: project.id,
      uploadedBy: 'STUDIO',
      label: d.label || null,
      filename: d.filename.slice(0, 255),
      objectKey: d.key,
      mime: d.mime || 'application/octet-stream',
      bytes: BigInt(d.bytes),
      isDeliverable: d.isDeliverable,
    },
  });

  await audit({
    actorId: admin.id, action: 'project.deliver', entity: 'Project', entityId: project.id,
    diff: { file: d.filename, final: d.isDeliverable },
  });

  revalidatePath(`/admin/customers/${project.userId ?? ''}`);
  revalidatePath(`/account/projects/${project.id}`);
  return { ok: true, message: d.isDeliverable ? 'Final delivery uploaded.' : 'Preview uploaded.' };
}

/**
 * What deleting this artist account would take with it.
 *
 * Shown BEFORE the button is pressed, because "delete" on a screen full of
 * someone's order history is not a decision to make blind.
 */
export async function artistDeletionImpact(userId: string): Promise<
  | { ok: true; email: string; paidOrders: number; otherOrders: number; projects: number; licences: number }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  if (!user) return { ok: false, error: 'That account no longer exists.' };
  if (user.role !== 'CUSTOMER') {
    return { ok: false, error: 'Only artist accounts can be deleted here.' };
  }

  const [paidOrders, otherOrders, projects, licences] = await Promise.all([
    prisma.order.count({ where: { userId, status: 'PAID' } }),
    prisma.order.count({ where: { userId, status: { not: 'PAID' } } }),
    prisma.project.count({ where: { userId } }),
    prisma.licenceDocument.count({ where: { order: { userId } } }),
  ]);

  return { ok: true, email: user.email, paidOrders, otherOrders, projects, licences };
}

/**
 * Delete an artist account.
 *
 * The account goes; the BUSINESS RECORD stays. Order, Project and DownloadLog
 * all hold `userId` as an optional column, so deleting the user detaches those
 * rows rather than destroying them — a paid order keeps its number, its
 * amount, its billing name and email, and its licence stays provable. That is
 * the rule this project has held to throughout and it is not relaxed here just
 * because the deletion is deliberate.
 *
 * What genuinely goes is what belongs only to the account: sessions, passkeys,
 * push devices, tokens and favourites, all of which cascade.
 *
 * Guarded to CUSTOMER accounts, so this can never be pointed at the admin
 * account and lock Samir out of his own site.
 */
export async function deleteArtist(userId: string): Promise<Result> {
  const admin = await requireOwner();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, role: true },
  });
  if (!user) return { ok: false, error: 'That account no longer exists.' };
  if (user.role !== 'CUSTOMER') {
    return { ok: false, error: 'Only artist accounts can be deleted. This is a staff or admin account.' };
  }
  if (userId === admin.id) {
    return { ok: false, error: 'You cannot delete the account you are signed in with.' };
  }

  const [paidOrders, projects] = await Promise.all([
    prisma.order.count({ where: { userId, status: 'PAID' } }),
    prisma.project.count({ where: { userId } }),
  ]);

  await prisma.user.delete({ where: { id: userId } });

  // Recorded in detail because the account itself is gone: this row is now the
  // only place the deletion is written down.
  await audit({
    actorId: admin.id, action: 'artist.deleted', entity: 'User', entityId: userId,
    diff: {
      email: user.email,
      name: user.name,
      ordersDetached: paidOrders,
      projectsDetached: projects,
    },
  });

  revalidatePath('/admin/customers');

  const kept: string[] = [];
  if (paidOrders) kept.push(`${paidOrders} paid order${paidOrders === 1 ? '' : 's'}`);
  if (projects) kept.push(`${projects} project${projects === 1 ? '' : 's'}`);

  return {
    ok: true,
    message: kept.length
      ? `${user.email} deleted. ${kept.join(' and ')} kept as records, no longer linked to an account.`
      : `${user.email} deleted.`,
  };
}

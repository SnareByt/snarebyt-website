'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireOwner } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { beatSchema } from '@/lib/validators';
import { presignUpload } from '@/lib/storage';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export type ActionResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * A server action is a public HTTP endpoint. requireAdmin() is not
 * belt-and-braces on top of middleware — it IS the authorisation check.
 */
export async function saveBeat(formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();

  const parsed = beatSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] = issue.message;
    return { ok: false, errors };
  }
  const d = parsed.data;
  const tags = d.tags ? d.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

  // A published beat with no untagged MP3 would take money and deliver
  // nothing. Refuse rather than trust the person clicking Save.
  if (d.status === 'PUBLISHED' && d.id) {
    const assets = await prisma.beatAsset.findMany({ where: { beatId: d.id }, select: { kind: true } });
    const kinds = new Set(assets.map((a) => a.kind));
    if (!kinds.has('MP3_UNTAGGED')) {
      return { ok: false, errors: { status: 'Upload the untagged MP3 before publishing — a buyer would receive nothing.' } };
    }
    const beat = await prisma.beat.findUnique({ where: { id: d.id }, select: { previewKey: true } });
    if (!beat?.previewKey) {
      return { ok: false, errors: { status: 'Upload the tagged preview before publishing — the store has nothing to stream.' } };
    }
  }
  if (d.status === 'PUBLISHED' && !d.id) {
    return { ok: false, errors: { status: 'Save as a draft first, upload the files, then publish.' } };
  }

  const data = {
    title: d.title, genre: d.genre, mood: d.mood, bpm: d.bpm, musicalKey: d.musicalKey,
    tags, basePriceBdt: d.basePriceBdt, status: d.status,
    exclusiveAvailable: d.exclusiveAvailable, description: d.description ?? null,
    publishedAt: d.status === 'PUBLISHED' ? new Date() : null,
  };

  const beat = d.id
    ? await prisma.beat.update({ where: { id: d.id }, data })
    : await prisma.beat.create({ data: { ...data, slug: slugify(d.title) } });

  await audit({
    actorId: user.id, action: d.id ? 'beat.update' : 'beat.create',
    entity: 'Beat', entityId: beat.id, diff: data,
    ip: (await headers()).get('x-forwarded-for'),
  });

  revalidatePath('/admin/beats');
  revalidatePath('/beats');
  return { ok: true };
}

/** Deleting a beat with sales would orphan issued licences. Archive instead. */
export async function deleteBeat(id: string): Promise<ActionResult> {
  const user = await requireOwner();

  const sales = await prisma.orderItem.count({
    where: { beatId: id, order: { status: 'PAID' } },
  });
  if (sales > 0) {
    await prisma.beat.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await audit({ actorId: user.id, action: 'beat.archive', entity: 'Beat', entityId: id,
      diff: { reason: `has ${sales} paid sale(s)` } });
    revalidatePath('/admin/beats');
    return { ok: false, errors: { _: `This beat has ${sales} paid sale(s), so it was archived instead of deleted — the licences must stay provable.` } };
  }

  await prisma.beat.delete({ where: { id } });
  await audit({ actorId: user.id, action: 'beat.delete', entity: 'Beat', entityId: id });
  revalidatePath('/admin/beats');
  return { ok: true };
}

const PRIVATE_KINDS = ['MP3_UNTAGGED', 'WAV', 'STEMS_ZIP', 'SESSION_NOTES'] as const;

/**
 * Hand the browser a presigned URL so the file uploads straight to R2.
 * A 2GB stems zip must never stream through the web server.
 *
 * `preview` and `cover` go to the PUBLIC bucket. Everything else is
 * private and only reachable through a validated download grant.
 */
export async function getUploadUrl(input: {
  beatId: string;
  slot: 'cover' | 'preview' | 'MP3_UNTAGGED' | 'WAV' | 'STEMS_ZIP' | 'SESSION_NOTES';
  filename: string;
  contentType: string;
}) {
  const user = await requireAdmin();
  const isPrivate = (PRIVATE_KINDS as readonly string[]).includes(input.slot);
  const ext = input.filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'bin';
  const key = `beats/${input.beatId}/${input.slot.toLowerCase()}.${ext}`;

  const url = await presignUpload({
    key, contentType: input.contentType, visibility: isPrivate ? 'private' : 'public',
  });

  await audit({ actorId: user.id, action: 'beat.upload.presign', entity: 'Beat',
    entityId: input.beatId, diff: { slot: input.slot, key } });

  return { url, key, visibility: isPrivate ? 'private' : 'public' };
}

/** Called after the browser finishes PUTting the file to R2. */
export async function confirmUpload(input: {
  beatId: string;
  slot: 'cover' | 'preview' | 'MP3_UNTAGGED' | 'WAV' | 'STEMS_ZIP' | 'SESSION_NOTES';
  key: string;
  bytes: number;
}) {
  await requireAdmin();

  if (input.slot === 'cover') {
    await prisma.beat.update({ where: { id: input.beatId }, data: { coverKey: input.key } });
  } else if (input.slot === 'preview') {
    await prisma.beat.update({ where: { id: input.beatId }, data: { previewKey: input.key } });
  } else {
    await prisma.beatAsset.upsert({
      where: { beatId_kind: { beatId: input.beatId, kind: input.slot } },
      create: { beatId: input.beatId, kind: input.slot, objectKey: input.key, bytes: BigInt(input.bytes) },
      update: { objectKey: input.key, bytes: BigInt(input.bytes) },
    });
  }
  revalidatePath('/admin/beats');
  return { ok: true as const };
}

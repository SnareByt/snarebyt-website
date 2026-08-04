'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireOwner } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { presignUpload } from '@/lib/storage';
import type { MediaKind } from '@prisma/client';

const ALLOWED: Record<string, MediaKind> = {
  'image/jpeg': 'IMAGE', 'image/png': 'IMAGE', 'image/webp': 'IMAGE', 'image/avif': 'IMAGE',
  'audio/mpeg': 'AUDIO', 'audio/wav': 'AUDIO', 'audio/x-wav': 'AUDIO', 'audio/mp4': 'AUDIO',
};

const MAX_BYTES: Record<MediaKind, number> = {
  IMAGE: 15 * 1024 ** 2,
  AUDIO: 60 * 1024 ** 2,
  VIDEO: 500 * 1024 ** 2,
  DOCUMENT: 20 * 1024 ** 2,
};

/**
 * The browser uploads straight to R2 with this URL. Two checks happen
 * before we hand one out: the mime type is on the allow-list, and the
 * size is sane. An "image" that is really a script never gets a key.
 */
export async function getMediaUploadUrl(input: { filename: string; contentType: string; bytes: number }) {
  await requireAdmin();

  const kind = ALLOWED[input.contentType];
  if (!kind) return { ok: false as const, error: 'Only JPG, PNG, WebP, AVIF, MP3, WAV and M4A are accepted.' };
  if (input.bytes > MAX_BYTES[kind]) {
    return { ok: false as const, error: `That file is too large. Limit for ${kind.toLowerCase()} is ${MAX_BYTES[kind] / 1024 ** 2}MB.` };
  }

  const ext = input.filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'bin';
  const safe = input.filename.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').slice(0, 60);
  const key = `media/${Date.now().toString(36)}-${safe}.${ext}`;

  const url = await presignUpload({ key, contentType: input.contentType, visibility: 'public' });
  return { ok: true as const, url, key, kind };
}

/** Called once the browser has finished PUTting the file. */
export async function registerMedia(input: {
  kind: MediaKind; filename: string; objectKey: string; mime: string;
  bytes: number; width?: number; height?: number; durationSec?: number; alt?: string;
}) {
  const user = await requireAdmin();
  const asset = await prisma.mediaAsset.create({
    data: { ...input, bytes: BigInt(input.bytes), alt: input.alt ?? '' },
  });
  await audit({ actorId: user.id, action: 'media.upload', entity: 'MediaAsset',
    entityId: asset.id, diff: { filename: input.filename } });
  revalidatePath('/admin/media');
  return { ok: true as const, id: asset.id };
}

/** Alt text is not decoration: screen readers and image search both use it. */
export async function updateAlt(id: string, alt: string) {
  const user = await requireAdmin();
  await prisma.mediaAsset.update({ where: { id }, data: { alt: alt.trim().slice(0, 300) } });
  await audit({ actorId: user.id, action: 'media.alt', entity: 'MediaAsset', entityId: id });
  revalidatePath('/admin/media');
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

/**
 * Deleting a file that a page still points at would leave a hole, so
 * we count references first and make the caller confirm.
 */
export async function deleteMedia(id: string, force = false) {
  const user = await requireOwner();

  const [asOg, sections] = await Promise.all([
    prisma.page.count({ where: { ogImageId: id } }),
    prisma.pageSection.findMany({ select: { id: true, values: true } }),
  ]);
  const inUse = asOg + sections.filter((s) => JSON.stringify(s.values).includes(id)).length;

  if (inUse > 0 && !force) {
    return { ok: false as const, inUse,
      error: `This file is used in ${inUse} place${inUse > 1 ? 's' : ''}. Delete anyway and those spots fall back to a placeholder.` };
  }

  await prisma.mediaAsset.delete({ where: { id } });
  await audit({ actorId: user.id, action: 'media.delete', entity: 'MediaAsset', entityId: id, diff: { inUse } });
  revalidatePath('/admin/media');
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

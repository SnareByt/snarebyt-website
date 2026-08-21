'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireOwner } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { releaseSchema } from '@/lib/validators';
import { parseSpotifyUrl, verifySpotify } from '@/lib/spotify';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export type ReleaseResult =
  | { ok: true; verifiedTitle?: string; warning?: string }
  | { ok: false; errors: Record<string, string> };

/**
 * Paste a Spotify URL, get a live player and Spotify's own cover art.
 * No artwork upload for anything already released.
 *
 * The oEmbed check exists because a wrong ID means someone else's song
 * playing on your site. It caught two real mistakes in this catalogue:
 * an "album" link that was actually TOO TOXIC, and KATSUKI turning out
 * to be a WRONG TAPE track.
 */
export async function saveRelease(formData: FormData): Promise<ReleaseResult> {
  const user = await requireAdmin();

  const raw = Object.fromEntries(formData);
  const parsed = releaseSchema.safeParse({
    ...raw,
    live: raw.live === 'on' || raw.live === 'true',
    featured: raw.featured === 'on' || raw.featured === 'true',
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] = i.message;
    return { ok: false, errors };
  }
  const d = parsed.data;
  const ref = parseSpotifyUrl(d.spotifyUrl);

  let verifiedTitle: string | undefined;
  let warning: string | undefined;
  if (ref) {
    const meta = await verifySpotify(ref);
    if (!meta) {
      warning = 'Spotify did not recognise that link. It has been saved, but check it renders before going live.';
    } else {
      verifiedTitle = meta.title;
      if (meta.title && meta.title.toLowerCase() !== d.title.toLowerCase()) {
        warning = `Spotify says this ${ref.type} is “${meta.title}”, not “${d.title}”. Check you pasted the right link.`;
      }
    }
  }

  const data = {
    title: d.title, type: d.type, trackCount: d.trackCount, releasedAt: d.releasedAt,
    about: d.about, credits: d.credits,
    spotifyUrl: d.spotifyUrl || null,
    youtubeUrl: d.youtubeUrl || null,
    spotifyEmbedType: ref?.type ?? null,
    spotifyEmbedId: ref?.id ?? null,
    live: d.live, featured: d.featured, published: d.live,
  };

  const rel = d.id
    ? await prisma.release.update({ where: { id: d.id }, data })
    : await prisma.release.create({ data: { ...data, slug: slugify(d.title) } });

  await audit({ actorId: user.id, action: d.id ? 'release.update' : 'release.create',
    entity: 'Release', entityId: rel.id, diff: data });

  revalidatePath('/admin/releases');
  revalidatePath('/music');
  revalidatePath('/');
  return { ok: true, verifiedTitle, warning };
}

/**
 * The live switch is the whole "only show what is actually out" rule.
 * Off means invisible to the public site — a taken-down record can
 * never keep advertising itself.
 */
export async function toggleLive(id: string, live: boolean) {
  const user = await requireAdmin();
  await prisma.release.update({ where: { id }, data: { live, published: live } });
  await audit({ actorId: user.id, action: live ? 'release.publish' : 'release.hide',
    entity: 'Release', entityId: id });
  revalidatePath('/admin/releases');
  revalidatePath('/app/site/releases');
  revalidatePath('/music');
  revalidatePath('/');
  return { ok: true as const };
}

export async function toggleFeatured(id: string, featured: boolean) {
  const user = await requireAdmin();
  await prisma.release.update({ where: { id }, data: { featured } });
  await audit({ actorId: user.id, action: 'release.featured', entity: 'Release', entityId: id,
    diff: { featured } });
  revalidatePath('/admin/releases');
  revalidatePath('/app/site/releases');
  revalidatePath('/');
  return { ok: true as const };
}

export async function deleteRelease(id: string) {
  const user = await requireOwner();
  await prisma.release.delete({ where: { id } });
  await audit({ actorId: user.id, action: 'release.delete', entity: 'Release', entityId: id });
  revalidatePath('/admin/releases');
  revalidatePath('/app/site/releases');
  revalidatePath('/music');
  return { ok: true as const };
}

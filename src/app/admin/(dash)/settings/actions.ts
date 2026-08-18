'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { audit } from '@/lib/audit';
import { settingsSchema } from '@/lib/validators';
import { diagnoseYouTube } from '@/lib/youtube';

export type SettingsState = { ok: boolean; message?: string; errors?: Record<string, string> };

/**
 * The handful of values that change how the public site behaves without a
 * deploy. Secrets are deliberately NOT here — they live in server environment
 * variables and are never rendered, never editable from a browser.
 */
export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const admin = await requireAdmin();

  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? 'form');
      if (!errors[k]) errors[k] = i.message;
    }
    return { ok: false, errors };
  }

  const { usdRate, whatsapp, businessEmail, youtubeChannel, beatsComingSoon } = parsed.data;
  const values: Record<string, string> = {
    usdRate: String(usdRate),
    whatsapp,
    businessEmail,
    youtubeChannel,
    beatsComingSoon: String(beatsComingSoon),
  };

  for (const [key, value] of Object.entries(values)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  await audit({
    actorId: admin.id,
    action: 'settings.update',
    entity: 'Setting',
    entityId: 'site',
    diff: values,
  });

  // Every public page reads these, so they all have to re-render.
  revalidatePath('/', 'layout');
  revalidatePath('/beats');

  return { ok: true, message: 'Saved. The site is already using these.' };
}

export type YtCheck =
  | { ok: true; title: string; subscribers: string; views: string; videos: string }
  | { ok: false; problem: string; fix: string };

/**
 * Ask YouTube directly, right now, and report what came back.
 *
 * requireAdmin because a server action is a public endpoint. The API key is
 * never returned — only whether one exists and what YouTube said about it.
 */
export async function testYouTube(): Promise<YtCheck> {
  await requireAdmin();
  const d = await diagnoseYouTube();
  if (!d.ok) return { ok: false, problem: d.problem, fix: d.fix };
  return {
    ok: true,
    title: d.stats.title,
    subscribers: d.stats.subscribersHidden ? 'hidden' : d.stats.subscribers.toLocaleString('en-US'),
    views: d.stats.views.toLocaleString('en-US'),
    videos: d.stats.videos.toLocaleString('en-US'),
  };
}

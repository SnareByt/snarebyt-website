import type { AssetKind } from '@prisma/client';

/**
 * Browser-side upload plumbing, shared by the desktop admin and the phone app.
 *
 * Extracted from `src/components/admin/BeatFiles.tsx` when the phone dashboard
 * needed the same behaviour. Duplicating it would have meant two copies of the
 * MIME-guessing table and, worse, two copies of the CORS diagnosis below —
 * which is the single most useful error message in the upload path and the one
 * most likely to rot in a copy.
 *
 * No 'server-only' import here, and nothing from Prisma at runtime: this file
 * is bundled into the browser. `AssetKind` is a type-only import and erases.
 */

export type SlotKey = 'cover' | 'preview' | AssetKind;

/**
 * A presigned PUT is signed for one exact Content-Type, so the browser has to
 * send back the same string it asked for. Some systems hand over a File with
 * an empty `type` — .wav and .aiff especially — and guessing at PUT time
 * rather than at signing time produces a 403 that looks like a broken bucket.
 */
const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aiff: 'audio/aiff', aif: 'audio/aiff',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif',
  pdf: 'application/pdf', txt: 'text/plain', rtf: 'application/rtf', md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
export const mimeOf = (f: File) => f.type || MIME_BY_EXT[extOf(f.name)] || 'application/octet-stream';

/** What the file picker offers for each slot. The server enforces it again. */
export const ACCEPT: Record<SlotKey, string> = {
  cover: 'image/*,.jpg,.jpeg,.png,.webp,.avif',
  preview: 'audio/*,.mp3,.m4a',
  MP3_UNTAGGED: 'audio/mpeg,.mp3',
  WAV: '.wav,.aiff,.aif,audio/*',
  STEMS_ZIP: '.zip,.rar,.7z',
  SESSION_NOTES: '.pdf,.txt,.rtf,.md,.docx',
};

/**
 * PUT the file straight to R2.
 *
 * XHR rather than fetch, for one reason: fetch cannot report upload progress,
 * and a four-minute silent upload of a stems archive looks exactly like a
 * broken one. On a phone, on mobile data, that distinction is the difference
 * between waiting and force-quitting the app halfway through.
 */
export function putToR2(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
) {
  return new Promise<{ ok: boolean; status: number }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
    xhr.onerror = () => resolve({ ok: false, status: 0 });
    xhr.send(file);
  });
}

/**
 * Turn a failed PUT into a sentence that names the actual cause.
 *
 * Status 0 means the request never completed — no HTTP response at all. In
 * practice that is one thing: the bucket has no CORS rule allowing this site,
 * so the browser refused before sending a byte. Worth naming exactly, because
 * "upload failed" sends you looking at the file, which is the one thing that
 * is not wrong.
 */
export function uploadError(status: number, isPublicSlot: boolean): string {
  if (status === 0) {
    return 'Storage refused the connection. The R2 bucket needs a CORS rule allowing PUT from this site — '
      + `Cloudflare → R2 → snarebyt-${isPublicSlot ? 'public' : 'private'} → Settings → CORS policy. `
      + 'Nothing is wrong with the file.';
  }
  if (status === 403) {
    return 'Storage rejected the upload as unauthorised (403). The signed link may have expired — try again.';
  }
  return `Storage refused the file (HTTP ${status}).`;
}

/** Which slots land in the public bucket. Mirrors SLOTS in the beats action. */
export const PUBLIC_SLOTS: SlotKey[] = ['cover', 'preview'];
export const isPublicSlot = (slot: SlotKey) => PUBLIC_SLOTS.includes(slot);

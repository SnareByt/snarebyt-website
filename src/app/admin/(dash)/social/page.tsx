import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { publicUrl } from '@/lib/storage';
import { hasBuiltInMark } from '@/components/site/SocialIcon';
import { SocialEditor, type SocialRow } from './Editor';
import {
  saveSocialLink, setSocialIcon, addSocialLink, deleteSocialLink, moveSocialLink,
} from './actions';

/* What an icon should be. Defined here, in a server module: a constant
   exported from a 'use client' file becomes a client reference, and reading a
   property off it on the server yields undefined.

   20px on screen inside a 40px circle, so 128px covers a 3x display with room
   to spare. Bigger is not better — it is the same picture, downloaded more
   slowly, on every page of the site. */
const ICON_ADVICE = { px: 128, maxKb: 60 };

export const dynamic = 'force-dynamic';

export default async function AdminSocialPage() {
  await requireAdmin();

  const items = await prisma.navItem.findMany({
    where: { group: 'SOCIAL' },
    orderBy: { sortOrder: 'asc' },
    include: { icon: { select: { objectKey: true } } },
  });

  const rows: SocialRow[] = items.map((it, i) => ({
    id: it.id,
    label: it.label,
    href: it.href,
    visible: it.visible,
    iconUrl: it.icon ? publicUrl(it.icon.objectKey) : null,
    hasBuiltIn: hasBuiltInMark(it.label),
    first: i === 0,
    last: i === items.length - 1,
  }));

  // Same check the media library makes: uploads need R2 credentials.
  const storageReady = Boolean(
    process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY,
  );

  const custom = rows.filter((r) => r.iconUrl).length;
  const hidden = rows.filter((r) => !r.visible || !r.href.trim()).length;

  return (
    <>
      <header><div><div className="crumb">Content</div><h1>Social links</h1></div></header>
      <div className="wrap">
        <div className="sec-hd" style={{ marginBottom: '.4rem' }}>
          <span className="chip">{custom} custom {custom === 1 ? 'icon' : 'icons'}</span>
          {hidden ? <span className="chip warn">{hidden} not showing</span> : null}
        </div>

        <div className="note" style={{ marginBottom: '1.2rem' }}>
          <span>◆</span>
          <span>
            <b>Every link already has a built-in icon drawn in code</b> — those are the marks in
            the footer now. Upload one only to override it, or for a platform that has no
            built-in mark. Icons appear in the footer and on the contact page, both at once.
          </span>
        </div>

        <div className="note" style={{ marginBottom: '1.4rem' }}>
          <span>↔</span>
          <span>
            <b>Best results: a square PNG, {ICON_ADVICE.px}×{ICON_ADVICE.px} pixels, under{' '}
            {ICON_ADVICE.maxKb}KB, transparent background.</b>{' '}
            It is shown at 20px inside a 40px circle, so {ICON_ADVICE.px}px covers even a 3×
            retina screen — anything larger is the same picture downloaded more slowly on every
            page. Make it white or light grey: the footer is near-black, and a dark mark
            disappears into it. WebP, JPG and AVIF also work; <b>SVG is refused on purpose</b>,
            because an SVG can carry scripts and these are served from a public bucket.
          </span>
        </div>

        <SocialEditor
          rows={rows}
          save={saveSocialLink}
          setIcon={setSocialIcon}
          add={addSocialLink}
          remove={deleteSocialLink}
          move={moveSocialLink}
          storageReady={storageReady}
        />

        <div className="note" style={{ marginTop: '1.4rem' }}>
          <span>✓</span>
          <span>
            <b>A link with no address is hidden from the site automatically</b>, so an unfinished
            profile can never render as an icon that goes nowhere. Deleting a link here leaves the
            uploaded image in Media, where it can be reused or removed.
          </span>
        </div>
      </div>
    </>
  );
}

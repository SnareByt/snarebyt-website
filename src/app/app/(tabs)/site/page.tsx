import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { NavBar } from '@/components/app/Ui';
import { IcNext, IcRelease, IcPortfolio, IcMedia, IcSite, IcService } from '@/components/app/Icons';

export const dynamic = 'force-dynamic';

/**
 * Site — everything the public actually sees.
 *
 * A hub rather than a screen of its own. Four things live under here and they
 * have nothing in common except their audience, so forcing them into one
 * scrolling page would mean four unrelated sections competing for the top.
 * The counts on each row are the point: they turn a menu into a status
 * report, so "3 without a Spotify link" is visible without opening anything.
 */
export default async function SitePage() {
  await requireAdmin();

  const [
    liveReleases, hiddenReleases, noSpotify,
    publishedCredits, draftCredits, noRole,
    pages, mediaCount, missingAlt,
    activeServices,
  ] = await Promise.all([
    prisma.release.count({ where: { live: true } }),
    prisma.release.count({ where: { live: false } }),
    prisma.release.count({ where: { live: true, spotifyEmbedId: null } }),
    prisma.portfolioItem.count({ where: { published: true } }),
    prisma.portfolioItem.count({ where: { published: false } }),
    prisma.portfolioItem.count({ where: { role: '' } }),
    prisma.page.count(),
    prisma.mediaAsset.count(),
    // Alt text is not decoration — screen readers and image search both use
    // it, and the desktop admin already flags anything missing it.
    prisma.mediaAsset.count({ where: { alt: '', kind: 'IMAGE' } }),
    prisma.service.count({ where: { active: true } }),
  ]);

  return (
    <>
      <NavBar title="Site" />

      <div className="big-title">
        <h2>Site</h2>
        <p>What the public sees</p>
      </div>

      <div className="wrap stack-lg">
        {noRole > 0 && (
          <Link href="/app/site/portfolio" className="note red" style={{ display: 'block' }}>
            <b>{noRole} credit{noRole > 1 ? 's have' : ' has'} no role.</b>
            <br />
            A credit has to say exactly what SnareByt did, or a mix reads as a production.
          </Link>
        )}

        <div className="list">
          <Row
            href="/app/site/releases"
            Icon={IcRelease}
            title="Releases"
            sub={`${liveReleases} live · ${hiddenReleases} hidden${noSpotify ? ` · ${noSpotify} without Spotify` : ''}`}
            chip={noSpotify ? { text: String(noSpotify), tone: 'warn' } : undefined}
          />
          <Row
            href="/app/site/portfolio"
            Icon={IcPortfolio}
            title="Portfolio"
            sub={`${publishedCredits} published · ${draftCredits} draft`}
            chip={noRole ? { text: 'needs role', tone: 'red' } : undefined}
          />
          <Row
            href="/app/site/content"
            Icon={IcSite}
            title="Page content"
            sub={`${pages} pages · headlines, paragraphs, images`}
          />
          <Row
            href="/app/site/media"
            Icon={IcMedia}
            title="Media library"
            sub={`${mediaCount} file${mediaCount === 1 ? '' : 's'}${missingAlt ? ` · ${missingAlt} without alt text` : ''}`}
            chip={missingAlt ? { text: String(missingAlt), tone: 'warn' } : undefined}
          />
          <Row
            href="/app/services"
            Icon={IcService}
            title="Services and pricing"
            sub={`${activeServices} service${activeServices === 1 ? '' : 's'} on the site`}
          />
        </div>

        <p className="hint" style={{ padding: '0 .3rem' }}>
          Everything on the public site is a database row, so a change here is live the
          moment it saves. Laying out whole page sections and writing long Bangla licence
          terms is still easier on the desktop dashboard.
        </p>
      </div>
    </>
  );
}

function Row({
  href, Icon, title, sub, chip,
}: {
  href: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  title: string;
  sub: string;
  chip?: { text: string; tone: string };
}) {
  return (
    <Link href={href} className="row">
      <span className="thumb" style={{ width: 38, height: 38, color: 'var(--muted)' }} aria-hidden="true">
        <Icon className="ic-sm" />
      </span>
      <div className="row-main">
        <div className="row-t">{title}</div>
        <div className="row-s">{sub}</div>
      </div>
      {chip && <span className={`chip ${chip.tone}`}>{chip.text}</span>}
      <span className="row-x"><IcNext /></span>
    </Link>
  );
}

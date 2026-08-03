import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { toggleLive, toggleFeatured } from './actions';
import ReleaseForm from './ReleaseForm';

export const dynamic = 'force-dynamic';

export default async function ReleasesPage() {
  await requireAdmin();
  const releases = await prisma.release.findMany({ orderBy: [{ sortOrder: 'asc' }, { releasedAt: 'desc' }] });
  const live = releases.filter((r) => r.live).length;
  const withPlayer = releases.filter((r) => r.spotifyEmbedId).length;

  return (
    <>
      <header><div><div className="crumb">Catalogue</div><h1>Releases &amp; Spotify</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{releases.length} releases</h2>
          <span className="chip ok">{live} live</span>
          <span className="chip off">{releases.length - live} hidden</span>
          <span className="chip info">{withPlayer} with a Spotify player</span>
          <span className="sp" />
          <ReleaseForm mode="create" />
        </div>

        <table>
          <thead>
            <tr><th>Release</th><th>Type</th><th>Released</th><th>Spotify</th><th>Featured</th><th>Live</th><th /></tr>
          </thead>
          <tbody>
            {releases.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="ttl">{r.title}</div>
                  <div className="sub">
                    {r.trackCount ?? 1} track{(r.trackCount ?? 1) > 1 ? 's' : ''}
                    {!r.spotifyEmbedId && ' · cover art pending'}
                  </div>
                </td>
                <td><span className="chip">{r.type.replace('_', ' ')}</span></td>
                {/* A dash means the date is genuinely unknown, which is the
                    prompt to go and confirm it — not a rendering bug. */}
                <td>
                  {r.releasedAt
                    ? r.releasedAt.toISOString().slice(0, 10)
                    : <span className="chip warn">Date unknown</span>}
                </td>
                <td>
                  {r.spotifyEmbedId
                    ? <><span className="chip ok">{r.spotifyEmbedType}</span>
                        <div className="sub mono">{r.spotifyEmbedId.slice(0, 10)}…</div></>
                    : <span className="chip warn">No link</span>}
                </td>
                <td>
                  <form action={async () => { 'use server'; await toggleFeatured(r.id, !r.featured); }}>
                    <button className={`sw ${r.featured ? 'on' : ''}`} aria-label="Toggle featured" />
                  </form>
                </td>
                <td>
                  <form action={async () => { 'use server'; await toggleLive(r.id, !r.live); }}>
                    <button className={`sw ${r.live ? 'on' : ''}`} aria-label="Toggle live" />
                  </form>
                </td>
                <td className="acts">
                  <ReleaseForm mode="edit" release={{
                    id: r.id, title: r.title, type: r.type, trackCount: r.trackCount ?? 1,
                    releasedAt: r.releasedAt?.toISOString().slice(0, 10) ?? '',
                    about: r.about ?? '', credits: r.credits ?? '',
                    spotifyUrl: r.spotifyUrl ?? '', live: r.live, featured: r.featured,
                  }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="note">
          <span>✎</span>
          <span>
            <b>Live is the switch that matters.</b> The public site renders nothing unless Live is on, so a release that
            has been taken down cannot keep advertising itself. <b>Featured</b> pins a track to the homepage strip.
          </span>
        </div>
      </div>
    </>
  );
}

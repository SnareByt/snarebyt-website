import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt, usd, getUsdRate, licencePrice } from '@/lib/money';
import { PriceField, ToggleButton } from '@/components/admin/PriceField';
import { ASSET_ORDER, ASSET_LABEL, missingFor, publishBlockers } from '@/lib/beat-files';
import { coverCss, seedFrom } from '@/lib/cover-art';
import type { TierInfo } from '@/components/admin/BeatFiles';
import BeatForm, { type BeatFormData } from './BeatForm';
import { setBeatPrice, toggleBeatPublished, setTierMultiplier } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_CHIP: Record<string, string> = {
  DRAFT: 'off', PUBLISHED: 'ok', SOLD_EXCLUSIVE: 'red', ARCHIVED: 'off',
};

export default async function BeatsPage() {
  await requireAdmin();
  const [beats, tiers, rate] = await Promise.all([
    prisma.beat.findMany({ orderBy: { createdAt: 'desc' }, include: { assets: true } }),
    prisma.licenceTier.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    getUsdRate(),
  ]);

  const base = process.env.R2_PUBLIC_BASE_URL ?? '';
  const pub = (key: string | null) => (key && base ? `${base}/${key}` : null);

  // Only what the drawer needs. LicenceTier carries both languages of its terms
  // and they are long; shipping them to the browser for a readiness list would
  // put several kilobytes of contract into every page load.
  const tierInfo: TierInfo[] = tiers.map((t) => ({
    id: t.id, name: t.name, multiplier: t.multiplier, filesLabel: t.filesLabel,
    includedAssets: t.includedAssets, isExclusive: t.isExclusive,
  }));

  const rows = beats.map((b) => {
    const have = b.assets.map((a) => a.kind);
    const byKind = new Map(b.assets.map((a) => [a.kind, a]));
    const blockers = publishBlockers({ previewKey: b.previewKey, have });
    const sellable = tiers.filter((t) => missingFor(t.includedAssets, have).length === 0).length;

    const form: BeatFormData = {
      id: b.id,
      title: b.title,
      basePriceBdt: b.basePriceBdt,
      status: b.status,
      genre: b.genre,
      mood: b.mood,
      bpm: b.bpm,
      musicalKey: b.musicalKey,
      tags: b.tags,
      description: b.description ?? '',
      exclusiveAvailable: b.exclusiveAvailable,
      cover: { key: b.coverKey, bytes: 0, url: pub(b.coverKey) },
      preview: { key: b.previewKey, bytes: 0, url: pub(b.previewKey) },
      assets: Object.fromEntries(b.assets.map((a) => [a.kind, { bytes: Number(a.bytes) }])),
      fileCount: b.assets.length + (b.coverKey ? 1 : 0) + (b.previewKey ? 1 : 0),
    };

    return { b, have, byKind, blockers, sellable, form, coverUrl: pub(b.coverKey) };
  });

  const ready = rows.filter((r) => r.blockers.length === 0).length;
  const noFiles = rows.filter((r) => r.form.fileCount === 0).length;

  return (
    <>
      <header><div><div className="crumb">Catalogue</div><h1>Beat catalogue</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{beats.length} beats</h2>
          <span className="chip ok">{beats.filter((b) => b.status === 'PUBLISHED').length} published</span>
          <span className="chip off">{beats.filter((b) => b.status === 'DRAFT').length} draft</span>
          <span className={`chip ${ready === beats.length ? 'ok' : 'warn'}`}>
            {ready} of {beats.length} deliverable
          </span>
          <span className="sp" />
          <BeatForm mode="create" tiers={tierInfo} />
        </div>

        {noFiles > 0 && (
          <div className="note" style={{ marginBottom: '1rem' }}>
            <span>⚠</span>
            <span>
              <b>{noFiles} {noFiles === 1 ? 'beat has' : 'beats have'} no files uploaded at all.</b>{' '}
              Open a beat and use the <b>Files &amp; delivery</b> tab to add the artwork, the tagged
              preview, and the untagged MP3 a buyer receives. Nothing can be published until those exist.
            </span>
          </div>
        )}

        <div className="tbl-wrap">
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr><th>Beat</th><th>Genre / mood</th><th>BPM · Key</th><th>Base price</th>
                  <th>Files</th><th>Sells</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {rows.map(({ b, have, blockers, sellable, form, coverUrl }) => (
                  <tr key={b.id}>
                    <td>
                      <div className="beatcell">
                        <div className="beatart" style={coverUrl ? undefined : { background: coverCss(seedFrom(b.slug)) }}>
                          {coverUrl
                            /* eslint-disable-next-line @next/next/no-img-element */
                            ? <img src={coverUrl} alt="" />
                            : <span className="pl" title="No cover art uploaded">♪</span>}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="ttl">{b.title}</div>
                          <div className="sub">{b.playCount} plays · {b.purchaseCount} sales</div>
                        </div>
                      </div>
                    </td>
                    <td>{b.genre}<div className="sub">{b.mood}</div></td>
                    <td>{b.bpm}<div className="sub">{b.musicalKey}</div></td>
                    <td>
                      <PriceField
                        id={b.id} initial={b.basePriceBdt} action={setBeatPrice}
                        step="basePriceBdt" label={`Base price for ${b.title}`}
                      />
                      <div className="sub">{usd(b.basePriceBdt, rate)} · MP3 {bdt(licencePrice(b.basePriceBdt, 1))}</div>
                    </td>
                    <td>
                      {/* Four pips, one per deliverable, in a fixed order — so the
                          column can be read down the page rather than per row. */}
                      <div className="pips" title={ASSET_ORDER.map((k) => `${ASSET_LABEL[k]}: ${have.includes(k) ? 'yes' : 'no'}`).join('\n')}>
                        {ASSET_ORDER.map((k) => (
                          <i key={k} className={`pip ${have.includes(k) ? 'on' : k === 'MP3_UNTAGGED' ? 'miss' : ''}`} />
                        ))}
                      </div>
                      <div className="sub">
                        {blockers.length ? `Needs ${blockers.join(' + ')}` : `${form.fileCount} files`}
                      </div>
                    </td>
                    <td>
                      <span className={`chip ${sellable === tiers.length ? 'ok' : sellable === 0 ? 'warn' : 'info'}`}>
                        {sellable} / {tiers.length} tiers
                      </span>
                    </td>
                    <td><span className={`chip ${STATUS_CHIP[b.status]}`}>{b.status.replace('_', ' ')}</span></td>
                    <td className="acts">
                      <div style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'center' }}>
                        <BeatForm mode="edit" beat={form} tiers={tierInfo} />
                        <ToggleButton
                          id={b.id} action={toggleBeatPublished}
                          on={b.status === 'PUBLISHED'}
                          onLabel="Hide" offLabel="Publish"
                          disabled={b.status === 'SOLD_EXCLUSIVE'}
                          disabledReason="Exclusive sold"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={8}><div className="empty">No beats yet. Add one to get started.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <section className="sec" style={{ marginTop: '1.6rem' }}>
          <div className="sec-hd">
            <h2>Licence tiers</h2>
            <span className="chip">every beat, every tier</span>
          </div>
          <div className="sub" style={{ marginBottom: '.9rem' }}>
            Each tier multiplies a beat&rsquo;s base price. Changing one here moves that tier on
            <b> every beat at once</b>. Prices shown are for a ৳1,500 beat.
          </div>
          <div className="tbl-wrap">
            <div className="tbl-scroll">
              <table>
                <thead><tr><th>Tier</th><th>Multiplier</th><th>Buyer receives</th><th>On a ৳1,500 beat</th></tr></thead>
                <tbody>
                  {tiers.map((t) => (
                    <tr key={t.id}>
                      <td><div className="ttl">{t.name}</div><div className="sub bn">{t.nameBn}</div></td>
                      <td>
                        <PriceField
                          id={t.id} initial={t.multiplier} action={setTierMultiplier}
                          step="multiplier" prefix="×" label={`Multiplier for ${t.name}`}
                        />
                      </td>
                      <td>
                        <div className="sub">{t.includedAssets.map((k) => ASSET_LABEL[k]).join(' + ') || '—'}</div>
                      </td>
                      <td>
                        {bdt(licencePrice(1500, t.multiplier))}
                        <div className="sub">{usd(licencePrice(1500, t.multiplier), rate)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <div className="note">
          <span>🔒</span>
          <span>
            <b>The tagged preview is the only audio the public ever hears.</b> Untagged MP3, WAV and stems live in the
            private bucket and are only reachable through a signed, expiring, attempt-limited link issued after a
            verified payment. A tier whose files are missing is not offered for sale on that beat.
          </span>
        </div>
      </div>
    </>
  );
}

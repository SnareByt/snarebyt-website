import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt, usd, getUsdRate, licencePrice } from '@/lib/money';
import { PriceField, ToggleButton } from '@/components/admin/PriceField';
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

  return (
    <>
      <header><div><div className="crumb">Catalogue</div><h1>Beat catalogue</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{beats.length} beats</h2>
          <span className="chip ok">{beats.filter((b) => b.status === 'PUBLISHED').length} published</span>
          <span className="chip off">{beats.filter((b) => b.status === 'DRAFT').length} draft</span>
          <span className="sp" />
          {/* BeatForm follows the same pattern as ReleaseForm */}
        </div>

        <table>
          <thead>
            <tr><th>Beat</th><th>Genre / mood</th><th>BPM · Key</th><th>Base price</th>
              <th>Deliverables</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {beats.map((b) => {
              const kinds = new Set(b.assets.map((a) => a.kind));
              const ready = Boolean(b.coverKey) && Boolean(b.previewKey) && kinds.has('MP3_UNTAGGED');
              return (
                <tr key={b.id}>
                  <td>
                    <div className="ttl">{b.title}</div>
                    <div className="sub">{b.playCount} plays · {b.purchaseCount} sales</div>
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
                    <span className={`chip ${ready ? 'ok' : 'warn'}`}>
                      {ready ? 'Deliverable' : 'Files missing'}
                    </span>
                  </td>
                  <td><span className={`chip ${STATUS_CHIP[b.status]}`}>{b.status.replace('_', ' ')}</span></td>
                  <td className="acts">
                    <ToggleButton
                      id={b.id} action={toggleBeatPublished}
                      on={b.status === 'PUBLISHED'}
                      onLabel="Hide" offLabel="Publish"
                      disabled={b.status === 'SOLD_EXCLUSIVE'}
                      disabledReason="Exclusive sold"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <section className="sec">
          <div className="sec-hd">
            <h2>Licence tiers</h2>
            <span className="chip">every beat, every tier</span>
          </div>
          <div className="sub" style={{ marginBottom: '.9rem' }}>
            Each tier multiplies a beat&rsquo;s base price. Changing one here moves that tier on
            <b> every beat at once</b>. Prices shown are for a ৳1,500 beat.
          </div>
          <table>
            <thead><tr><th>Tier</th><th>Multiplier</th><th>On a ৳1,500 beat</th></tr></thead>
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
                    {bdt(licencePrice(1500, t.multiplier))}
                    <div className="sub">{usd(licencePrice(1500, t.multiplier), rate)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="note">
          <span>🔒</span>
          <span>
            <b>The tagged preview is the only audio the public ever hears.</b> Untagged MP3, WAV and stems live in the
            private bucket and are only reachable through a signed, expiring, attempt-limited link issued after a
            verified payment.
          </span>
        </div>
      </div>
    </>
  );
}

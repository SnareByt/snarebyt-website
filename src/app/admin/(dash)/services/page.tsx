import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt, usd, getUsdRate } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AdminServicesPage() {
  await requireAdmin();
  const [services, rate] = await Promise.all([
    prisma.service.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { tiers: { orderBy: { sortOrder: 'asc' } }, addons: true },
    }),
    getUsdRate(),
  ]);

  const missingBangla = services.flatMap((s) => s.tiers).filter((t) => !t.descriptionBn.trim()).length;

  return (
    <>
      <header><div><div className="crumb">Catalogue</div><h1>Services</h1></div></header>
      <div className="wrap">
        <div className="sec-hd">
          <h2>{services.length} services</h2>
          <span className="chip">{services.flatMap((s) => s.tiers).length} packages</span>
          <span className={`chip ${missingBangla ? 'warn' : 'ok'}`}>
            {missingBangla ? `${missingBangla} missing Bangla` : 'All bilingual'}
          </span>
        </div>

        {services.map((s) => (
          <section className="sec" key={s.id}>
            <div className="sec-hd">
              <h2>{s.title}</h2>
              <span className="chip">{s.deliveryDays}</span>
              <span className="chip">{s.revisions}</span>
              <span className={`chip ${s.active ? 'ok' : 'off'}`}>{s.active ? 'Active' : 'Hidden'}</span>
            </div>
            <div className="sub" style={{ marginBottom: '.8rem' }}>{s.tagline}</div>
            <table>
              <thead><tr><th>Package</th><th>Price</th><th>English</th><th>বাংলা</th></tr></thead>
              <tbody>
                {s.tiers.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="ttl">{t.name}</div>
                      {t.recommended ? <span className="chip red">Recommended</span> : null}
                    </td>
                    <td>{bdt(t.priceBdt)}<div className="sub">{usd(t.priceBdt, rate)}</div></td>
                    <td className="sub">{t.description.slice(0, 90)}</td>
                    {/* Bangla is non-nullable in the schema, so an empty cell here
                        means something bypassed validation and needs looking at. */}
                    <td className="sub bn">
                      {t.descriptionBn.trim()
                        ? t.descriptionBn.slice(0, 70)
                        : <span className="chip warn">Missing</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <div className="note" style={{ marginTop: '1.4rem' }}>
          <span>✎</span>
          <span>
            <b>Read-only for now.</b> Editing prices and package text from here is not built yet.
            Every package carries both languages because a Bangladeshi buyer must never be shown an
            English-only description of what they are paying for.
          </span>
        </div>
      </div>
    </>
  );
}

import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt, usd, getUsdRate } from '@/lib/money';
import { PriceField, ToggleButton } from '@/components/admin/PriceField';
import { setServicePrice, setServiceIntake, toggleService, saveService, saveServiceTier } from './actions';
import { IntakeEditor } from './IntakeEditor';
import { ServiceEditor } from './ServiceEditor';

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
              <span className="sp" />
              <ToggleButton
                id={s.id} action={toggleService} on={s.active}
                onLabel="Hide from site" offLabel="Show on site"
              />
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
                    <td>
                      <PriceField
                        id={t.id} initial={t.priceBdt} action={setServicePrice}
                        step="priceBdt" label={`Price for ${s.title} ${t.name}`}
                      />
                      <div className="sub">{usd(t.priceBdt, rate)}</div>
                    </td>
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

            <ServiceEditor
              service={{
                id: s.id, slug: s.slug, title: s.title, tagline: s.tagline,
                audience: s.audience, deliveryDays: s.deliveryDays, revisions: s.revisions,
                included: s.included, required: s.required,
              }}
              tiers={s.tiers.map((t) => ({
                id: t.id, name: t.name, priceBdt: t.priceBdt,
                description: t.description, descriptionBn: t.descriptionBn,
                recommended: t.recommended,
              }))}
              saveService={saveService}
              saveTier={saveServiceTier}
            />

            <IntakeEditor
              serviceId={s.id} serviceTitle={s.title}
              initial={s.intakeFields} action={setServiceIntake}
            />
          </section>
        ))}

        <div className="note" style={{ marginTop: '1.4rem' }}>
          <span>✎</span>
          <span>
            <b>Everything here saves immediately and the site updates at once.</b> Orders already
            placed keep the wording and the price they were sold at — editing anything on this
            screen never rewrites what someone already owes or what they were told they bought.
          </span>
        </div>
      </div>
    </>
  );
}

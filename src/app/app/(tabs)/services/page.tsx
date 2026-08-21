import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { getUsdRate } from '@/lib/money';
import { NavBar } from '@/components/app/Ui';
import { ServiceList } from './ServiceList';

export const dynamic = 'force-dynamic';

/**
 * Services and what each package costs.
 *
 * Prices and the on/off switch are editable here. The package *descriptions*
 * are not — `descriptionBn` is non-nullable for a reason, and a screen that
 * let the English be edited on a phone while the Bangla sat on the desktop
 * would be the exact mechanism by which the two drift apart. Both languages
 * are written together, on the desktop, or not at all.
 */
export default async function ServicesPage() {
  await requireAdmin();

  const [services, rate] = await Promise.all([
    prisma.service.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { tiers: { orderBy: { sortOrder: 'asc' } } },
    }),
    getUsdRate(),
  ]);

  return (
    <>
      <NavBar title="Services" back="/app/more" />

      <ServiceList
        usdRate={rate}
        services={services.map((s) => ({
          id: s.id,
          title: s.title,
          tagline: s.tagline,
          active: s.active,
          tiers: s.tiers.map((t) => ({
            id: t.id,
            name: t.name,
            priceBdt: t.priceBdt,
            recommended: t.recommended,
            // Flagged, not editable. An empty Bangla description means a
            // Bangladeshi buyer reads an English-only account of what they are
            // paying for, which is the thing the schema exists to prevent.
            missingBangla: !t.descriptionBn.trim(),
          })),
        }))}
      />
    </>
  );
}

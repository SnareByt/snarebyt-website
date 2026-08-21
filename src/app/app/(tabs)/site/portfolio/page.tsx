import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { resolveOrder } from '@/lib/portfolio-order';
import { NavBar } from '@/components/app/Ui';
import { PortfolioList } from './PortfolioList';
import { SectionOrder } from './SectionOrder';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  await requireAdmin();

  const [items, orderRow] = await Promise.all([
    prisma.portfolioItem.findMany({
      orderBy: [{ published: 'desc' }, { majorCredit: 'desc' }, { sortOrder: 'asc' }],
    }),
    prisma.setting.findUnique({ where: { key: 'portfolioOrder' } }),
  ]);

  /* Counts only the PUBLISHED credits, because that is what decides whether a
     section appears on the site. Counting drafts too would show "3 credits"
     next to a heading no visitor can see. */
  const counts: Record<string, number> = {};
  for (const i of items) if (i.published) counts[i.category] = (counts[i.category] ?? 0) + 1;

  return (
    <>
      <NavBar title="Portfolio" back="/app/site" />
      <PortfolioList
        items={items.map((i) => ({
          id: i.id,
          title: i.title,
          clientName: i.clientName ?? '',
          category: i.category,
          role: i.role,
          externalUrl: i.externalUrl ?? '',
          videoUrl: i.videoUrl ?? '',
          ctaLabel: i.ctaLabel ?? 'Listen',
          majorCredit: i.majorCredit,
          summary: i.summary,
          published: i.published,
        }))}
      />
      <div className="wrap" style={{ paddingTop: 0 }}>
        {/* Below the credits themselves, because reordering sections is the
            rarer job — you add a credit often and rearrange the page once. */}
        <SectionOrder initial={resolveOrder(orderRow?.value)} counts={counts} />
      </div>
    </>
  );
}

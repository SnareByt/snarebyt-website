import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { NavBar } from '@/components/app/Ui';
import { PortfolioList } from './PortfolioList';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  await requireAdmin();

  const items = await prisma.portfolioItem.findMany({
    orderBy: [{ published: 'desc' }, { majorCredit: 'desc' }, { sortOrder: 'asc' }],
  });

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
          ctaLabel: i.ctaLabel ?? 'Listen',
          majorCredit: i.majorCredit,
          summary: i.summary,
          published: i.published,
        }))}
      />
    </>
  );
}

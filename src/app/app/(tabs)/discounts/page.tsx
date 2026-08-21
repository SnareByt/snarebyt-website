import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/prisma-safe-auth';
import { bdt } from '@/lib/money';
import { codeState } from '@/lib/discount-rules';
import { NavBar } from '@/components/app/Ui';
import { CodeList } from './CodeList';

export const dynamic = 'force-dynamic';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

/**
 * Discount codes, from the phone.
 *
 * This is on the phone rather than desktop-only because of when codes are
 * actually needed: a story goes up, a show is announced, someone asks for a
 * price in a DM. Waiting until you are back at a desk to create LAUNCH25 is
 * how the code goes out after the post it belonged to.
 *
 * The screen reuses the desktop's four server actions unchanged. It is not a
 * second implementation of discounting — there is exactly one, and both the
 * cart and both admin surfaces go through it.
 *
 * A code that has been used cannot be deleted here — or anywhere. The server
 * refuses it, because a paid order records which code reduced it and deleting
 * the row would leave a receipt that no longer adds up. Switching it off does
 * the same job and keeps the history.
 */
export default async function AppDiscountsPage() {
  await requireAdmin();

  const [codes, given] = await Promise.all([
    prisma.discountCode.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { orders: true } } },
    }),
    /* What the codes have really cost, taken from the ORDERS rather than the
       codes: only a paid order actually gave money away. `usedCount` counts
       redemptions, which is a different question. */
    prisma.order.aggregate({
      where: { status: 'PAID', discountBdt: { gt: 0 } },
      _sum: { discountBdt: true },
    }),
  ]);

  return (
    <>
      <NavBar title="Discount codes" back="/app/more" />
      <CodeList
        givenAwayBdt={given._sum.discountBdt ?? 0}
        givenAwayLabel={bdt(given._sum.discountBdt ?? 0)}
        codes={codes.map((c) => ({
          id: c.id,
          code: c.code,
          percentOff: c.percentOff,
          amountOffBdt: c.amountOffBdt,
          minSpendBdt: c.minSpendBdt,
          maxUses: c.maxUses,
          usedCount: c.usedCount,
          perUserLimit: c.perUserLimit,
          startsAt: day(c.startsAt),
          endsAt: day(c.endsAt),
          active: c.active,
          orders: c._count.orders,
          // Decided on the server with the same function the desktop uses, so
          // the two screens can never label the same code differently.
          state: codeState(c),
        }))}
      />
    </>
  );
}

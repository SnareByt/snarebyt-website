import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { paymentsConfigured } from '@/lib/sslcommerz';
import { getCheckoutFlow } from '@/lib/checkout-flow';
import { goStraightToGateway } from '@/lib/checkout-flow-rules';
import { PageHead } from '@/components/site/PageHead';
import {
  CartView, type CatalogueBeat, type CatalogueTier, type CatalogueService,
} from '@/components/site/CartView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your cart — SnareByt',
  description: 'Review your beat licences and service packages, then place an order.',
  // A cart is per-visitor and worthless in a search index.
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  // The cart in the browser holds ids only, so the catalogue is sent here and
  // matched client-side. That keeps prices coming from the database.
  const [beats, tiers, serviceTiers] = await Promise.all([
    prisma.beat.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, title: true, basePriceBdt: true, exclusiveAvailable: true },
    }),
    prisma.licenceTier.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, nameBn: true, multiplier: true, filesLabel: true, isExclusive: true },
    }),
    prisma.serviceTier.findMany({
      where: { service: { active: true } },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, name: true, priceBdt: true, descriptionBn: true,
        service: { select: { title: true, deliveryDays: true, intakeFields: true } },
      },
    }),
  ]);

  const services: CatalogueService[] = serviceTiers.map((t) => ({
    id: t.id,
    name: t.name,
    priceBdt: t.priceBdt,
    descriptionBn: t.descriptionBn,
    serviceTitle: t.service.title,
    deliveryDays: t.service.deliveryDays,
    intakeFields: t.service.intakeFields,
  }));

  const payable = paymentsConfigured();
  // Whether pressing the button ends at the gateway or at a confirmation
  // screen. The cart says which, so nobody is surprised by where they land.
  const straightToPay = goStraightToGateway(await getCheckoutFlow(), { payable });

  return (
    <>
      <PageHead
        eyebrow="Cart"
        h1="Your"
        h2="order"
        lead={straightToPay
          ? 'Review what you are buying, then place the order and pay by card, bKash, Nagad or Rocket.'
          : payable
            ? 'Review what you are buying, then place the order. You can pay by card, bKash, Nagad or Rocket, or arrange it with SnareByt directly.'
            : 'Review what you are buying, then send the order. Payment and delivery are arranged directly with SnareByt.'}
      />
      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <CartView
            beats={beats as CatalogueBeat[]}
            tiers={tiers as CatalogueTier[]}
            services={services}
            payable={payable}
            straightToPay={straightToPay}
          />
        </div>
      </section>
    </>
  );
}

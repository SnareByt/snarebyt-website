'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/audit';
import { licencePrice } from '@/lib/money';

export type OrderState = {
  ok: boolean;
  number?: string;
  totalBdt?: number;
  whatsapp?: string;
  errors?: Record<string, string>;
  message?: string;
  attempt: number;
  values?: Record<string, string>;
};

const schema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  email: z.string().trim().email('Enter a valid email').max(160),
  phone: z.string().trim().min(6, 'We need a number to reach you on').max(40),
  artistName: z.string().trim().max(120).default(''),
  country: z.string().trim().max(80).default(''),
  notes: z.string().trim().max(2000).default(''),
  terms: z.literal('on', { message: 'You must accept the licence terms' }),
  lines: z.string(),
});

const lineSchema = z.array(z.object({ beatId: z.string().min(1), tierId: z.string().min(1) })).min(1).max(20);

/**
 * Place an order request.
 *
 * NO PAYMENT HAPPENS HERE. This records what someone wants and hands it to
 * SnareByt to arrange over WhatsApp. Consequently:
 *
 *  - the order is PENDING_PAYMENT and nothing can move it to PAID from a
 *    browser. That transition belongs to a verified gateway callback and
 *    nowhere else.
 *  - no licence is generated and no download grant is issued.
 *  - an exclusive in the cart does NOT pull the beat off sale. A beat is only
 *    withdrawn once its exclusive is actually paid for; otherwise anyone could
 *    take every beat off the store by filling a cart.
 *
 * Prices are read from the database, never from the submitted form. The browser
 * only ever sends ids.
 */
export async function placeOrder(prev: OrderState, formData: FormData): Promise<OrderState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';

  const raw = Object.fromEntries(formData);
  const values = Object.fromEntries(
    Object.entries(raw).filter(([k]) => k !== 'lines').map(([k, v]) => [k, typeof v === 'string' ? v : '']),
  );

  const limited = await rateLimit(`order:ip:${ip}`, 8, 60 * 60_000);
  if (!limited.ok) {
    return { ok: false, attempt, values, message: 'Too many orders from this connection. Try again in an hour.' };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? 'form');
      if (!errors[k]) errors[k] = i.message;
    }
    return { ok: false, attempt, errors, values };
  }

  let lines: { beatId: string; tierId: string }[];
  try {
    lines = lineSchema.parse(JSON.parse(parsed.data.lines));
  } catch {
    return { ok: false, attempt, values, message: 'Your cart is empty or unreadable. Add a licence and try again.' };
  }

  // Only beats that are actually on sale. A draft or an already-sold exclusive
  // cannot be ordered even if its id is submitted directly.
  const [beats, tiers] = await Promise.all([
    prisma.beat.findMany({
      where: { id: { in: lines.map((l) => l.beatId) }, status: 'PUBLISHED' },
    }),
    prisma.licenceTier.findMany({ where: { id: { in: lines.map((l) => l.tierId) }, active: true } }),
  ]);

  const beatById = new Map(beats.map((b) => [b.id, b]));
  const tierById = new Map(tiers.map((t) => [t.id, t]));

  const items = [];
  for (const line of lines) {
    const beat = beatById.get(line.beatId);
    const tier = tierById.get(line.tierId);
    if (!beat || !tier) continue;
    if (tier.isExclusive && !beat.exclusiveAvailable) continue;

    items.push({
      kind: 'BEAT_LICENCE' as const,
      beatId: beat.id,
      licenceTierId: tier.id,
      titleSnapshot: `${beat.title} — ${tier.name}`,
      priceBdt: licencePrice(beat.basePriceBdt, tier.multiplier),
      quantity: 1,
    });
  }

  if (!items.length) {
    return {
      ok: false, attempt, values,
      message: 'Nothing in your cart is still available. It may have sold or been taken off sale.',
    };
  }

  const subtotal = items.reduce((n, i) => n + i.priceBdt, 0);

  const year = new Date().getUTCFullYear();
  const count = await prisma.order.count();
  const number = `SB-${year}-${String(count + 1).padStart(6, '0')}`;

  const rate = await prisma.setting.findUnique({ where: { key: 'usdRate' } });

  const order = await prisma.order.create({
    data: {
      number,
      status: 'PENDING_PAYMENT',
      guestName: parsed.data.name,
      guestEmail: parsed.data.email.toLowerCase(),
      billingName: parsed.data.name,
      billingEmail: parsed.data.email.toLowerCase(),
      billingPhone: parsed.data.phone,
      billingCountry: parsed.data.country || null,
      subtotalBdt: subtotal,
      totalBdt: subtotal,
      usdRateAtSale: rate ? Number(rate.value) : null,
      termsAcceptedAt: new Date(),
      ip,
      userAgent: h.get('user-agent') ?? undefined,
      items: { create: items },
    },
    select: { number: true, totalBdt: true },
  });

  const wa = await prisma.setting.findUnique({ where: { key: 'whatsapp' } });

  return {
    ok: true,
    attempt,
    number: order.number,
    totalBdt: order.totalBdt,
    whatsapp: (wa?.value ?? '').replace(/[^0-9]/g, ''),
  };
}

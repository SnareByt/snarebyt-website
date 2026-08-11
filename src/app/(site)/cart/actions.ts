'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/audit';
import { licencePrice } from '@/lib/money';
import { createPaymentSession, isSandbox, paymentsConfigured } from '@/lib/sslcommerz';
import { siteUrl } from '@/lib/seo';

export type OrderState = {
  ok: boolean;
  number?: string;
  totalBdt?: number;
  whatsapp?: string;
  errors?: Record<string, string>;
  message?: string;
  attempt: number;
  values?: Record<string, string>;
  orderId?: string;
  /** False when SSLCOMMERZ is not configured, so the UI can fall back. */
  payable?: boolean;
  /** True when the order contains a service package, which needs a brief. */
  hasService?: boolean;
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

/**
 * A cart line is either a beat licence or a service package. Carts saved before
 * services were sellable carry no `kind`, so that case is read as a beat —
 * rejecting them would empty a cart someone had already built.
 */
const lineSchema = z
  .array(
    z.union([
      z.object({ kind: z.literal('service'), serviceTierId: z.string().min(1) }),
      z.object({
        kind: z.literal('beat').optional(),
        beatId: z.string().min(1),
        tierId: z.string().min(1),
      }),
    ]),
  )
  .min(1)
  .max(20);

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

  let lines: z.infer<typeof lineSchema>;
  try {
    lines = lineSchema.parse(JSON.parse(parsed.data.lines));
  } catch {
    return { ok: false, attempt, values, message: 'Your cart is empty or unreadable. Add a licence and try again.' };
  }

  const beatLines = lines.filter((l) => l.kind !== 'service') as { beatId: string; tierId: string }[];
  const serviceLines = lines.filter((l) => l.kind === 'service') as { serviceTierId: string }[];

  // Only beats that are actually on sale, and only packages belonging to an
  // active service. A draft, a withdrawn package or an already-sold exclusive
  // cannot be ordered even if its id is submitted directly.
  const [beats, tiers, serviceTiers] = await Promise.all([
    prisma.beat.findMany({
      where: { id: { in: beatLines.map((l) => l.beatId) }, status: 'PUBLISHED' },
    }),
    prisma.licenceTier.findMany({ where: { id: { in: beatLines.map((l) => l.tierId) }, active: true } }),
    prisma.serviceTier.findMany({
      where: { id: { in: serviceLines.map((l) => l.serviceTierId) }, service: { active: true } },
      include: { service: { select: { id: true, title: true } } },
    }),
  ]);

  const beatById = new Map(beats.map((b) => [b.id, b]));
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const svcTierById = new Map(serviceTiers.map((t) => [t.id, t]));

  const items = [];
  for (const line of lines) {
    if (line.kind === 'service') {
      const st = svcTierById.get(line.serviceTierId);
      if (!st) continue;
      items.push({
        kind: 'SERVICE_PACKAGE' as const,
        serviceTierId: st.id,
        titleSnapshot: `${st.service.title} — ${st.name}`,
        priceBdt: st.priceBdt,
        quantity: 1,
      });
      continue;
    }

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
    select: { id: true, number: true, totalBdt: true },
  });

  const wa = await prisma.setting.findUnique({ where: { key: 'whatsapp' } });

  return {
    ok: true,
    attempt,
    orderId: order.id,
    number: order.number,
    totalBdt: order.totalBdt,
    whatsapp: (wa?.value ?? '').replace(/[^0-9]/g, ''),
    payable: paymentsConfigured(),
    hasService: items.some((i) => i.kind === 'SERVICE_PACKAGE'),
  };
}

/**
 * Hand an existing order to SSLCOMMERZ and return the gateway URL.
 *
 * The amount comes from the order row, never from the browser. The Payment row
 * is written BEFORE the gateway is called, because the IPN's whole job is to
 * compare what the gateway reports against what we recorded here — if the row
 * did not exist first, there would be nothing to check against.
 */
export async function startPayment(orderId: string): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';

  const limited = await rateLimit(`pay:ip:${ip}`, 12, 60 * 60_000);
  if (!limited.ok) return { ok: false, error: 'Too many payment attempts. Try again in an hour.' };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { ok: false, error: 'That order no longer exists.' };
  if (order.status === 'PAID') return { ok: false, error: 'This order is already paid.' };
  if (order.status !== 'PENDING_PAYMENT') return { ok: false, error: 'This order cannot be paid.' };

  const base = await siteUrl();
  if (!base) return { ok: false, error: 'The site address could not be determined.' };

  // A fresh transaction id per attempt. Reusing one would collide with the
  // Payment.tranId unique constraint and make a retry look like a duplicate.
  const tranId = `SB-${order.number.replace(/[^A-Z0-9]/gi, '')}-${Date.now().toString(36).toUpperCase()}`;

  const session = await createPaymentSession({
    tranId,
    amountBdt: order.totalBdt,
    customer: {
      name: order.billingName ?? order.guestName ?? 'Customer',
      email: order.billingEmail,
      phone: order.billingPhone ?? '',
      country: order.billingCountry,
    },
    baseUrl: base,
    itemCount: order.items.length,
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      environment: isSandbox() ? 'sandbox' : 'live',
      tranId,
      amountBdt: order.totalBdt,
      status: session.ok ? 'INITIATED' : 'FAILED',
      failureReason: session.ok ? null : session.error.slice(0, 300),
      validationRawJson: (session.raw ?? null) as never,
    },
  });

  if (!session.ok) return { ok: false, error: session.error };
  return { ok: true, url: session.gatewayUrl };
}

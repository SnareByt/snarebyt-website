'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/audit';
import { licencePrice } from '@/lib/money';
import { createPaymentSession, isSandbox, paymentsConfigured } from '@/lib/sslcommerz';
import { siteUrl } from '@/lib/seo';
import { beatStoreClosed } from '@/lib/store-state';
import { siteClosedForBusiness, getSiteMode, closedMessage } from '@/lib/site-mode';
import { missingFor } from '@/lib/beat-files';
import { notifyAdmin } from '@/lib/notify';
import {
  resolveFields, readIntake, validateIntake, intakeName, type IntakeAnswers,
} from '@/lib/service-intake';
import { getCheckoutFlow } from '@/lib/checkout-flow';
import { resolveDiscount } from '@/lib/discount';
import { goStraightToGateway } from '@/lib/checkout-flow-rules';

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
  /**
   * The SSLCOMMERZ page to go to, opened by this action so that placing an
   * order and paying for it are one step. Absent when payments are not
   * configured or the gateway refused, in which case the UI falls back to the
   * order-received screen with its own pay button.
   */
  payUrl?: string;
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

  // The gate a visitor sees is a rendering decision, and rendering is not
  // security — a blurred page has still been sent to the browser and this
  // action is a public HTTP endpoint. So it refuses on its own account.
  if (await siteClosedForBusiness()) {
    return { ok: false, attempt, values, message: closedMessage(await getSiteMode()) };
  }

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

  // Closing the store hides the UI, but placeOrder is a public HTTP endpoint —
  // anyone holding an old beat id could still post one. Beat lines are dropped
  // server-side while it is closed; service packages are unaffected.
  const storeClosed = await beatStoreClosed();

  const beatLines = storeClosed
    ? []
    : (lines.filter((l) => l.kind !== 'service') as { beatId: string; tierId: string }[]);
  const serviceLines = lines.filter((l) => l.kind === 'service') as { serviceTierId: string }[];

  // Only beats that are actually on sale, and only packages belonging to an
  // active service. A draft, a withdrawn package or an already-sold exclusive
  // cannot be ordered even if its id is submitted directly.
  const [beats, tiers, serviceTiers] = await Promise.all([
    prisma.beat.findMany({
      where: { id: { in: beatLines.map((l) => l.beatId) }, status: 'PUBLISHED' },
      include: { assets: { select: { kind: true } } },
    }),
    prisma.licenceTier.findMany({ where: { id: { in: beatLines.map((l) => l.tierId) }, active: true } }),
    prisma.serviceTier.findMany({
      where: { id: { in: serviceLines.map((l) => l.serviceTierId) }, service: { active: true } },
      include: { service: { select: { id: true, title: true, intakeFields: true } } },
    }),
  ]);

  const beatById = new Map(beats.map((b) => [b.id, b]));
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const svcTierById = new Map(serviceTiers.map((t) => [t.id, t]));

  const items = [];
  // Brief errors, keyed by the same input names the form used, so each message
  // lands under the box it belongs to.
  const intakeErrors: Record<string, string> = {};
  // Tiers whose files do not exist on the beat. Selling one means taking
  // ৳7,500 for stems and delivering a single MP3, so the order is refused
  // outright rather than quietly reduced — a smaller total than the cart
  // showed is its own kind of broken.
  const undeliverable: string[] = [];

  for (const line of lines) {
    if (line.kind === 'service') {
      const st = svcTierById.get(line.serviceTierId);
      if (!st) continue;

      // What this service cannot start without. Checked here, on the server,
      // because the form is only a convenience — this action is a public HTTP
      // endpoint and an order posted straight at it must be held to the same
      // rule. The fields come from the service row, never from the browser.
      const fields = resolveFields(st.service.intakeFields);
      const answers = readIntake(formData, st.id, fields);
      for (const [key, msg] of Object.entries(validateIntake(fields, answers))) {
        intakeErrors[intakeName(st.id, key)] = msg;
      }

      items.push({
        kind: 'SERVICE_PACKAGE' as const,
        serviceTierId: st.id,
        titleSnapshot: `${st.service.title} — ${st.name}`,
        priceBdt: st.priceBdt,
        quantity: 1,
        intakeJson: fields.length ? (answers as IntakeAnswers) : undefined,
      });
      continue;
    }

    const beat = beatById.get(line.beatId);
    const tier = tierById.get(line.tierId);
    if (!beat || !tier) continue;
    if (tier.isExclusive && !beat.exclusiveAvailable) continue;

    // The files that back this tier must actually exist before money moves.
    // Nothing else in the chain checks this: the download route correctly
    // serves the intersection of "paid for" and "exists", which for a missing
    // file is an empty set — a paying customer with nothing to download.
    if (missingFor(tier.includedAssets, beat.assets.map((a) => a.kind)).length) {
      undeliverable.push(`${beat.title} — ${tier.name}`);
      continue;
    }

    items.push({
      kind: 'BEAT_LICENCE' as const,
      beatId: beat.id,
      licenceTierId: tier.id,
      titleSnapshot: `${beat.title} — ${tier.name}`,
      priceBdt: licencePrice(beat.basePriceBdt, tier.multiplier),
      quantity: 1,
    });
  }

  // A missing brief stops the order rather than being collected later. Taking
  // the money first and chasing the stems afterwards is what leaves a job
  // stalled and a customer out of pocket with nothing happening.
  if (Object.keys(intakeErrors).length) {
    return {
      ok: false, attempt, values, errors: intakeErrors,
      message: 'Almost there — each service needs its brief before it can be ordered.',
    };
  }

  if (undeliverable.length) {
    return {
      ok: false, attempt, values,
      message: `Not ready to sell yet: ${undeliverable.join(', ')}. The files for that licence are not uploaded, so it would be paid for and not delivered. Message SnareByt — it will be sorted quickly.`,
    };
  }

  if (!items.length) {
    return {
      ok: false, attempt, values,
      message: storeClosed
        ? 'The beat store is closed while the catalogue is being prepared. Service packages can still be ordered.'
        : 'Nothing in your cart is still available. It may have sold or been taken off sale.',
    };
  }

  const subtotal = items.reduce((n, i) => n + i.priceBdt, 0);

  /* The discount is recomputed here from the database row, never taken from
     the form. The browser sends a string of characters; the amount it is worth
     is decided on this side, against the subtotal this side calculated.
     Otherwise "10% off" typed into a hidden field would be whatever the person
     typing it wanted.

     A code that has become invalid between the cart and this moment — expired
     overnight, used up by someone else — refuses the order rather than quietly
     charging full price. Being charged more than the screen said is the worst
     outcome available here. */
  let discount: { id: string; code: string; amountBdt: number } | null = null;
  const submittedCode = String(raw.discountCode ?? '').trim();

  if (submittedCode) {
    const res = await resolveDiscount(submittedCode, {
      subtotalBdt: subtotal,
      email: parsed.data.email,
    });
    if (!res.ok) {
      return {
        ok: false, attempt, values,
        errors: { discountCode: res.reason },
        message: 'That discount code cannot be used on this order. Remove it or fix it, then place the order again.',
      };
    }
    discount = res.discount;
  }

  const discountBdt = discount?.amountBdt ?? 0;
  const total = Math.max(0, subtotal - discountBdt);

  const year = new Date().getUTCFullYear();
  const count = await prisma.order.count();
  const number = `SB-${year}-${String(count + 1).padStart(6, '0')}`;

  const rate = await prisma.setting.findUnique({ where: { key: 'usdRate' } });
  const base = await siteUrl();

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
      artistName: parsed.data.artistName || null,
      subtotalBdt: subtotal,
      discountBdt,
      discountCodeId: discount?.id ?? null,
      totalBdt: total,
      usdRateAtSale: rate ? Number(rate.value) : null,
      termsAcceptedAt: new Date(),
      customerNote: parsed.data.notes || null,
      ip,
      userAgent: h.get('user-agent') ?? undefined,
      items: { create: items },
    },
    select: { id: true, number: true, totalBdt: true },
  });

  // Fire-and-forget: an alert must never delay or fail an order.
  void notifyAdmin({
    event: 'order.placed',
    subject: `New order ${order.number} — ৳${order.totalBdt.toLocaleString('en-US')} awaiting payment`,
    title: 'Order placed',
    rows: [
      ['Order', order.number],
      ['Total', `৳${order.totalBdt.toLocaleString('en-US')}`],
      ['Customer', parsed.data.name],
      ['WhatsApp', parsed.data.phone],
      ['Email', parsed.data.email],
      ['Items', items.map((i) => i.titleSnapshot).join('<br>')],
    ],
    action: base ? { label: 'Open the order', href: `${base}/admin/orders/${order.id}` } : undefined,
  });

  const wa = await prisma.setting.findUnique({ where: { key: 'whatsapp' } });

  // Open the gateway now, so ordering and paying are one step — but only if
  // that is how Samir has the shop set. On `review` the customer gets the
  // confirmation screen with a pay button and a WhatsApp button instead.
  //
  // A failure here is deliberately NOT an order failure: the order is already
  // saved and is the customer's either way, so a gateway wobble drops them
  // onto the confirmation screen rather than losing what they asked for.
  let payUrl: string | undefined;
  if (goStraightToGateway(await getCheckoutFlow(), { payable: paymentsConfigured() })) {
    const session = await startPayment(order.id);
    if (session.ok) payUrl = session.url;
  }

  return {
    ok: true,
    attempt,
    orderId: order.id,
    number: order.number,
    totalBdt: order.totalBdt,
    whatsapp: (wa?.value ?? '').replace(/[^0-9]/g, ''),
    payable: paymentsConfigured(),
    hasService: items.some((i) => i.kind === 'SERVICE_PACKAGE'),
    payUrl,
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

export type DiscountPreview =
  | { ok: true; code: string; amountBdt: number; label: string }
  | { ok: false; error: string };

/**
 * Check a code and say what it would take off, without placing anything.
 *
 * The subtotal is recalculated here from the submitted lines rather than
 * trusted from the browser, for the same reason placeOrder does it: a preview
 * that flatters the total and an order that does not match it is how a
 * customer ends up feeling cheated at the gateway.
 *
 * This is a preview only. Nothing is reserved, nothing is counted, and the
 * code is checked again at the moment the order is placed — between the two,
 * it can expire or be used up by someone else.
 */
export async function previewDiscount(
  code: string,
  linesJson: string,
  email: string,
): Promise<DiscountPreview> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';

  // Guessing codes is the obvious abuse here, so it is rate limited like a
  // login rather than like a page view.
  const limited = await rateLimit(`discount:ip:${ip}`, 20, 15 * 60_000);
  if (!limited.ok) {
    return { ok: false, error: 'Too many codes tried. Wait a few minutes.' };
  }

  if (await siteClosedForBusiness()) {
    return { ok: false, error: closedMessage(await getSiteMode()) };
  }

  let lines: z.infer<typeof lineSchema>;
  try {
    lines = lineSchema.parse(JSON.parse(linesJson));
  } catch {
    return { ok: false, error: 'Your cart is empty.' };
  }

  const beatLines = lines.filter((l) => l.kind !== 'service') as { beatId: string; tierId: string }[];
  const serviceLines = lines.filter((l) => l.kind === 'service') as { serviceTierId: string }[];

  const [beats, tiers, svcTiers] = await Promise.all([
    prisma.beat.findMany({
      where: { id: { in: beatLines.map((l) => l.beatId) }, status: 'PUBLISHED' },
      select: { id: true, basePriceBdt: true },
    }),
    prisma.licenceTier.findMany({
      where: { id: { in: beatLines.map((l) => l.tierId) }, active: true },
      select: { id: true, multiplier: true },
    }),
    prisma.serviceTier.findMany({
      where: { id: { in: serviceLines.map((l) => l.serviceTierId) }, service: { active: true } },
      select: { id: true, priceBdt: true },
    }),
  ]);

  const beatById = new Map(beats.map((b) => [b.id, b]));
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const svcById = new Map(svcTiers.map((t) => [t.id, t]));

  let subtotal = 0;
  for (const l of lines) {
    if (l.kind === 'service') {
      subtotal += svcById.get(l.serviceTierId)?.priceBdt ?? 0;
    } else {
      const b = beatById.get(l.beatId);
      const t = tierById.get(l.tierId);
      if (b && t) subtotal += licencePrice(b.basePriceBdt, t.multiplier);
    }
  }

  if (subtotal <= 0) return { ok: false, error: 'Nothing in your cart is still available.' };

  const res = await resolveDiscount(code, { subtotalBdt: subtotal, email });
  if (!res.ok) return { ok: false, error: res.reason };

  return {
    ok: true,
    code: res.discount.code,
    amountBdt: res.discount.amountBdt,
    label: res.discount.label,
  };
}

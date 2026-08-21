import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { issueDownloadGrant } from '@/lib/storage';
import { generateLicenceDocument } from '@/lib/licence-pdf';
import { notifyAdmin } from '@/lib/notify';
import { resolveFields, intakeToBrief, intakeLinks } from '@/lib/service-intake';

/**
 * SSLCOMMERZ IPN listener — the single most security-sensitive file
 * in the project.
 *
 * The rule: NOTHING in this request body is trusted. The callback is
 * a public URL, so anyone can POST a "payment successful" message to
 * it. The only thing that makes a payment real is asking SSLCOMMERZ
 * ourselves, with the val_id, and then comparing what they say against
 * the amount we recorded when we created the order.
 *
 * Order of operations:
 *   1. Find our own Payment row by tran_id. Unknown id → ignore.
 *   2. If it already has a val_id, this is a duplicate callback → stop.
 *   3. Call the Transaction Validation API server-side.
 *   4. Compare status, amount and currency against OUR figures.
 *   5. Only then: mark paid, generate licences, issue grants, send mail,
 *      and pull any exclusive beat off the store.
 */

const VALIDATION_URL =
  process.env.SSLC_SANDBOX === 'true'
    ? 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php'
    : 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php';

type ValidationResponse = {
  status?: string;            // VALID | VALIDATED | INVALID_TRANSACTION | FAILED
  tran_id?: string;
  amount?: string;
  currency?: string;
  bank_tran_id?: string;
  card_type?: string;
  error?: string;
};

export async function POST(req: NextRequest) {
  // The comment above says "always 200". That has to survive an unexpected
  // exception too, or the gateway retries the same callback for hours against
  // a route that keeps throwing. An unhandled error means we do NOT fulfil —
  // which is the safe direction — so acknowledging costs nothing.
  try {
    return await handle(req);
  } catch (e) {
    await audit({ action: 'payment.ipn.error', entity: 'Payment', entityId: 'unknown',
      diff: { error: String(e) } }).catch(() => {});
    return NextResponse.json({ received: true });
  }
}

async function handle(req: NextRequest) {
  const form = await req.formData();
  const tranId = String(form.get('tran_id') ?? '');
  const valId = String(form.get('val_id') ?? '');

  // Always 200 to the gateway so it stops retrying. Never leak detail.
  const ack = () => NextResponse.json({ received: true });

  if (!tranId) return ack();

  // A failed or cancelled transaction carries no val_id, so there is nothing to
  // validate against and this message can never be trusted. Record it on the
  // attempt and stop.
  //
  // The ORDER deliberately stays PENDING_PAYMENT. Flipping it to FAILED on an
  // unverifiable POST would let anyone who guessed a transaction id lock a real
  // buyer out of retrying, because startPayment refuses any other status.
  if (!valId) {
    const attempt = await prisma.payment.findUnique({ where: { tranId } });
    if (attempt && attempt.status === 'INITIATED') {
      await prisma.payment.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          failureReason: `gateway_reported_${String(form.get('status') ?? 'failure')}`.slice(0, 300),
          ipnRawJson: Object.fromEntries(form) as never,
        },
      });
      await audit({ action: 'payment.ipn.unvalidatable', entity: 'Payment', entityId: attempt.id,
        diff: { tranId, status: String(form.get('status') ?? '') } });
    }
    return ack();
  }

  const payment = await prisma.payment.findUnique({
    where: { tranId },
    include: { order: { include: { items: { include: { beat: true, licenceTier: true, serviceTier: true } } } } },
  });
  if (!payment) {
    await audit({ action: 'payment.ipn.unknown', entity: 'Payment', entityId: tranId,
      diff: { note: 'IPN for a transaction id we never issued' } });
    return ack();
  }

  // ---- 2. Duplicate guard -------------------------------------------------
  if (payment.valId || payment.status === 'VALIDATED') {
    await audit({ action: 'payment.ipn.duplicate', entity: 'Payment', entityId: payment.id,
      diff: { tranId, valId } });
    return ack();
  }

  // ---- 3. Ask SSLCOMMERZ directly ----------------------------------------
  const url = new URL(VALIDATION_URL);
  url.searchParams.set('val_id', valId);
  url.searchParams.set('store_id', process.env.SSLC_STORE_ID!);
  url.searchParams.set('store_passwd', process.env.SSLC_STORE_PASSWORD!);
  url.searchParams.set('format', 'json');

  let v: ValidationResponse;
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    v = (await res.json()) as ValidationResponse;
  } catch (e) {
    // Do not fail the order. Leave it pending so it can be re-validated
    // from the admin panel — losing a real payment is worse than a delay.
    await prisma.payment.update({
      where: { id: payment.id },
      data: { failureReason: 'validation_request_failed', ipnRawJson: Object.fromEntries(form) as never },
    });
    await audit({ action: 'payment.validation.error', entity: 'Payment', entityId: payment.id,
      diff: { error: String(e) } });
    return ack();
  }

  const validStatus = v.status === 'VALID' || v.status === 'VALIDATED';

  // ---- 4. Compare against OUR record -------------------------------------
  const gatewayAmount = Number(v.amount ?? NaN);
  const amountMatches = Number.isFinite(gatewayAmount)
    && Math.round(gatewayAmount) === payment.amountBdt;
  const currencyMatches = (v.currency ?? '').toUpperCase() === 'BDT';
  const tranMatches = v.tran_id === tranId;

  if (!validStatus || !amountMatches || !currencyMatches || !tranMatches) {
    // Only the ATTEMPT is marked failed. The order stays PENDING_PAYMENT on
    // purpose: this endpoint is public, so anyone who learned a transaction id
    // could otherwise POST a bogus val_id and permanently block a real buyer
    // from retrying, since startPayment refuses any other status. Nothing is
    // lost by leaving it pending — no money arrived either way, and every
    // rejected attempt is recorded here and in the audit log.
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        // valId is NOT written here. It is the duplicate guard, so recording a
        // val_id we just rejected would make a later genuine callback for this
        // transaction look like a replay and be dropped — the buyer would pay
        // and never be fulfilled. It is unique too, so a forged value repeated
        // across rows would throw. The raw body below keeps it for disputes.
        gatewayAmount: v.amount ?? null,
        gatewayCurrency: v.currency ?? null,
        ipnRawJson: Object.fromEntries(form) as never,
        validationRawJson: v as never,
        failureReason: !validStatus ? `status=${v.status}`
          : !amountMatches ? `amount_mismatch expected=${payment.amountBdt} got=${v.amount}`
          : !currencyMatches ? `currency=${v.currency}`
          : 'tran_id_mismatch',
      },
    });
    await audit({ action: 'payment.rejected', entity: 'Order', entityId: payment.orderId,
      diff: { expected: payment.amountBdt, got: v.amount, status: v.status } });
    return ack();
  }

  // ---- 5. Verified. Fulfil. ---------------------------------------------
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'VALIDATED', valId, validatedAt: new Date(),
        bankTranId: v.bank_tran_id ?? null, cardType: v.card_type ?? null,
        gatewayAmount: v.amount ?? null, gatewayCurrency: v.currency ?? null,
        ipnRawJson: Object.fromEntries(form) as never, validationRawJson: v as never,
      },
    });
    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: 'PAID', paidAt: new Date() },
    });

    // A paid service package has to become a project inside this transaction.
    // If it did not, the money would land with nothing recorded to work on and
    // the booking would exist only in the order line.
    let seq = await tx.project.count();
    for (const item of payment.order.items) {
      if (item.kind !== 'SERVICE_PACKAGE' || !item.serviceTier) continue;
      seq += 1;

      // The brief the customer filled in at checkout, carried onto the project
      // so the work arrives with its stems and its concept attached. Orders
      // placed before intake existed have no answers; those still say the
      // brief is to be collected rather than showing an empty description.
      const answers = (item.intakeJson ?? {}) as Record<string, string>;
      const fields = resolveFields(Object.keys(answers));
      const brief = intakeToBrief(fields, answers);
      const links = intakeLinks(answers);

      await tx.project.create({
        data: {
          number: `PRJ-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`,
          orderId: payment.orderId,
          serviceId: item.serviceTier.serviceId,
          serviceTierId: item.serviceTierId,
          status: 'ORDER_RECEIVED',
          contactName: payment.order.billingName ?? payment.order.guestName ?? 'Customer',
          email: payment.order.billingEmail,
          phone: payment.order.billingPhone,
          country: payment.order.billingCountry,
          description: brief
            ? `${brief}\n\n---\nPaid via ${payment.order.number}.${
                payment.order.customerNote ? `\n\nAlso said:\n${payment.order.customerNote}` : ''
              }`
            : `Paid via ${payment.order.number}. Brief to be collected.`,
          referenceLinks: links,
        },
      });
    }

    for (const item of payment.order.items) {
      if (!item.beatId || !item.licenceTier) continue;

      // Licence terms are SNAPSHOT, not referenced. If the wording is
      // revised next year, this buyer keeps what they actually agreed to.
      await tx.licenceDocument.create({
        data: {
          number: `SB-LIC-${new Date().getFullYear()}-${item.id.slice(-6).toUpperCase()}`,
          orderId: payment.orderId,
          orderItemId: item.id,
          licenseeName: payment.order.billingName ?? payment.order.guestName ?? 'Licensee',
          licenseeEmail: payment.order.billingEmail,
          // Frozen onto the licence, not read from the order later: an admin
          // correcting a typo next year must not silently rewrite a contract
          // somebody already holds.
          licenseeArtist: payment.order.artistName,
          licenseeCountry: payment.order.billingCountry,
          beatTitle: item.titleSnapshot,
          tierName: item.licenceTier.name,
          purchasedAt: new Date(),
          termsSnapshot: `${item.licenceTier.termsMarkdown}\n\n---\n\n${item.licenceTier.termsMarkdownBn}`,
          pdfObjectKey: `licences/${payment.orderId}/${item.id}.pdf`,
          signatureHash: '', // filled by the PDF generator
        },
      });

      // Exclusive sold → off the store immediately, in the same
      // transaction as the payment. Any gap here is a double-sale.
      if (item.licenceTier.isExclusive && item.beatId) {
        await tx.beat.update({
          where: { id: item.beatId },
          data: { status: 'SOLD_EXCLUSIVE', exclusiveAvailable: false },
        });
      }
      await tx.beat.update({
        where: { id: item.beatId },
        data: { purchaseCount: { increment: 1 } },
      });
    }
  });

  // PDF rendering, R2 writes, grants and email are outside the transaction:
  // an unavailable storage provider must never roll back a verified payment.
  //
  // The base URL comes from the request, not APP_URL. That variable is unset
  // in production by design, and using it built the literal string
  // "undefined/download/…" — a dead link handed to someone who had paid.
  const base = req.nextUrl.origin;
  const links: string[] = [];
  for (const item of payment.order.items) {
    if (item.beatId) links.push(await issueDownloadGrant(item.id, base));
  }

  const licenceResults: Array<{ licenceId: string; ready: boolean; error?: string }> = [];
  const licences = await prisma.licenceDocument.findMany({
    where: { orderId: payment.orderId }, select: { id: true, signatureHash: true },
  });
  for (const licence of licences) {
    if (licence.signatureHash) {
      licenceResults.push({ licenceId: licence.id, ready: true });
      continue;
    }
    try {
      await generateLicenceDocument(licence.id);
      licenceResults.push({ licenceId: licence.id, ready: true });
    } catch (error) {
      // The paid order remains valid. Admin can regenerate the PDF from the
      // order screen once R2 or the renderer is available again.
      licenceResults.push({
        licenceId: licence.id, ready: false,
        error: error instanceof Error ? error.message.slice(0, 300) : 'PDF generation failed',
      });
    }
  }

  // Recorded in the audit log so the links can be recovered and re-sent by
  // hand. Until the delivery email exists this is the only copy there is.
  await audit({ action: 'payment.validated', entity: 'Order', entityId: payment.orderId,
    diff: { valId, amount: payment.amountBdt, links, licences: licenceResults } });

  // Deliberately last, and deliberately not awaited: the payment is already
  // verified and fulfilled by this point, and a slow or failing mail provider
  // must never delay the acknowledgement the gateway is waiting for — nor
  // leave it retrying a callback that already succeeded.
  const items = payment.order.items.map((i) => i.titleSnapshot).join('<br>');
  void notifyAdmin({
    event: 'order.paid',
    subject: `PAID — ${payment.order.number} — ৳${payment.amountBdt.toLocaleString('en-US')}`,
    title: 'Payment confirmed',
    rows: [
      ['Order', payment.order.number],
      ['Amount', `৳${payment.amountBdt.toLocaleString('en-US')}`],
      ['Customer', payment.order.billingName ?? payment.order.guestName ?? '—'],
      ['WhatsApp', payment.order.billingPhone ?? '—'],
      ['Items', items],
      ['Next', links.length
        ? 'Download links are ready on the order page — send them on WhatsApp.'
        : 'No download links needed for this order.'],
    ],
    action: { label: 'Open the order', href: `${req.nextUrl.origin}/admin/orders/${payment.orderId}` },
  });

  // Customer-facing receipt and delivery email are still to come; for now the
  // links are sent by hand from the order page.

  return ack();
}

/** SSLCOMMERZ occasionally probes with GET. Answer, reveal nothing. */
export async function GET() {
  return NextResponse.json({ ok: true });
}

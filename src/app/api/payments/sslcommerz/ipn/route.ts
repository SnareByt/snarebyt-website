import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { issueDownloadGrant } from '@/lib/storage';

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
  const form = await req.formData();
  const tranId = String(form.get('tran_id') ?? '');
  const valId = String(form.get('val_id') ?? '');

  // Always 200 to the gateway so it stops retrying. Never leak detail.
  const ack = () => NextResponse.json({ received: true });

  if (!tranId || !valId) return ack();

  const payment = await prisma.payment.findUnique({
    where: { tranId },
    include: { order: { include: { items: { include: { beat: true, licenceTier: true } } } } },
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
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          valId: valId,
          gatewayAmount: v.amount ?? null,
          gatewayCurrency: v.currency ?? null,
          ipnRawJson: Object.fromEntries(form) as never,
          validationRawJson: v as never,
          failureReason: !validStatus ? `status=${v.status}`
            : !amountMatches ? `amount_mismatch expected=${payment.amountBdt} got=${v.amount}`
            : !currencyMatches ? `currency=${v.currency}`
            : 'tran_id_mismatch',
        },
      }),
      prisma.order.update({ where: { id: payment.orderId }, data: { status: 'FAILED' } }),
    ]);
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

  // Grants and email are outside the transaction: a slow mail provider
  // must never roll back a verified payment.
  const links: string[] = [];
  for (const item of payment.order.items) {
    if (item.beatId) links.push(await issueDownloadGrant(item.id));
  }

  await audit({ action: 'payment.validated', entity: 'Order', entityId: payment.orderId,
    diff: { valId, amount: payment.amountBdt, links: links.length } });

  // TODO: queue receipt + licence + download emails via Resend.
  // Deliberately last: if mail fails, the order is still correct and the
  // admin can hit "Resend delivery".

  return ack();
}

/** SSLCOMMERZ occasionally probes with GET. Answer, reveal nothing. */
export async function GET() {
  return NextResponse.json({ ok: true });
}

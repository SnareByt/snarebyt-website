/**
 * Sandbox payment harness.
 *
 * SSLCOMMERZ cannot reach a laptop, so the IPN never fires against a dev
 * server. This asks SSLCOMMERZ for the real transaction by tran_id, takes the
 * val_id it issued, and POSTs it at our own IPN route exactly as the gateway
 * would. Everything the IPN does after that — the server-side validation call,
 * the amount comparison, fulfilment — is the real code path, not a stub.
 *
 *   npx tsx scripts/check-payment.ts <tran_id> [ipnBase]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SANDBOX = process.env.SSLC_SANDBOX !== 'false';
const HOST = SANDBOX ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';

const tranId = process.argv[2];
const base = process.argv[3] ?? process.env.APP_URL ?? 'http://localhost:3001';

if (!tranId) {
  console.error('Usage: tsx scripts/check-payment.ts <tran_id> [baseUrl]');
  process.exit(1);
}

const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };
let failures = 0;

async function main() {
  console.log(`\nPayment check — ${tranId}\n`);

  // ---- Ask SSLCOMMERZ what it thinks happened -----------------------------
  const q = new URL(`${HOST}/validator/api/merchantTransIDvalidationAPI.php`);
  q.searchParams.set('tran_id', tranId);
  q.searchParams.set('store_id', process.env.SSLC_STORE_ID ?? '');
  q.searchParams.set('store_passwd', process.env.SSLC_STORE_PASSWORD ?? '');
  q.searchParams.set('format', 'json');

  const res = await fetch(q, { cache: 'no-store' });
  const body = (await res.json()) as { APIConnect?: string; element?: Record<string, string>[] };

  const el = body.element?.[0];
  if (!el) {
    fail(`gateway has no record of ${tranId} (APIConnect=${body.APIConnect})`);
    return;
  }
  pass(`gateway status ${el.status}, amount ${el.amount} ${el.currency}, val_id ${el.val_id}`);

  const before = await prisma.order.findFirst({
    where: { payments: { some: { tranId } } },
    include: { items: true, payments: { where: { tranId } }, projects: true, licences: true },
  });
  if (!before) { fail('no local order carries that tran_id'); return; }
  console.log(`  · order ${before.number} is ${before.status} before the IPN`);

  // ---- Fire the IPN exactly as the gateway would --------------------------
  const form = new URLSearchParams({
    tran_id: tranId,
    val_id: el.val_id,
    status: el.status,
    amount: el.amount,
    currency: el.currency,
    store_id: process.env.SSLC_STORE_ID ?? '',
  });
  const ipn = await fetch(`${base}/api/payments/sslcommerz/ipn`, {
    method: 'POST', body: form, cache: 'no-store',
  });
  ipn.ok ? pass(`IPN accepted (HTTP ${ipn.status})`) : fail(`IPN returned HTTP ${ipn.status}`);

  // ---- What it actually did ----------------------------------------------
  const after = await prisma.order.findUnique({
    where: { id: before.id },
    include: { items: { include: { serviceTier: true } }, payments: { where: { tranId } }, projects: true, licences: true },
  });
  if (!after) { fail('order vanished'); return; }

  after.status === 'PAID' ? pass('order marked PAID') : fail(`order is ${after.status}, expected PAID`);
  after.paidAt ? pass('paidAt stamped') : fail('paidAt not set');

  const p = after.payments[0];
  p?.status === 'VALIDATED' ? pass('payment VALIDATED') : fail(`payment is ${p?.status}`);
  p?.valId === el.val_id ? pass('val_id recorded') : fail('val_id not recorded');

  const beatItems = after.items.filter((i) => i.beatId).length;
  after.licences.length === beatItems
    ? pass(`${after.licences.length} licence(s) for ${beatItems} beat item(s)`)
    : fail(`${after.licences.length} licences for ${beatItems} beat items`);

  const svcItems = after.items.filter((i) => i.kind === 'SERVICE_PACKAGE').length;
  after.projects.length === svcItems
    ? pass(`${after.projects.length} project(s) for ${svcItems} service item(s)`)
    : fail(`${after.projects.length} projects for ${svcItems} service items`);

  // ---- The duplicate callback the gateway really does send ----------------
  const again = await fetch(`${base}/api/payments/sslcommerz/ipn`, {
    method: 'POST', body: form, cache: 'no-store',
  });
  const dup = await prisma.order.findUnique({
    where: { id: before.id }, include: { projects: true, licences: true },
  });
  again.ok && dup?.licences.length === after.licences.length && dup?.projects.length === after.projects.length
    ? pass('replayed IPN changed nothing (no duplicate licences or projects)')
    : fail('replaying the IPN duplicated fulfilment');
}

main()
  .catch((e) => { console.error(e); failures += 1; })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures ? `\n${failures} failure(s).\n` : '\nAll checks passed.\n');
    process.exit(failures ? 1 : 0);
  });

/**
 * The IPN callback URL is public. Anyone can POST "payment successful" at it.
 *
 * This proves they get nothing. Each case is an attack a real attacker would
 * actually try, run against the live route, checking the DATABASE afterwards
 * rather than the HTTP response — the route always answers 200 by design so
 * the gateway stops retrying, so the response tells you nothing.
 *
 *   npx tsx --env-file=.env scripts/check-ipn-forgery.ts <pendingTranId> [base]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const tranId = process.argv[2];
const base = process.argv[3] ?? process.env.APP_URL ?? 'http://localhost:3001';

if (!tranId) {
  console.error('Usage: tsx scripts/check-ipn-forgery.ts <pendingTranId> [baseUrl]');
  process.exit(1);
}

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };

const post = (fields: Record<string, string>) =>
  fetch(`${base}/api/payments/sslcommerz/ipn`, {
    method: 'POST', body: new URLSearchParams(fields), cache: 'no-store',
  });

async function orderState() {
  const p = await prisma.payment.findUnique({
    where: { tranId },
    include: { order: { include: { licences: true, projects: true } } },
  });
  return p;
}

async function main() {
  console.log(`\nIPN forgery attempts — ${tranId}\n`);

  const before = await orderState();
  if (!before) { fail('no such transaction locally'); return; }
  if (before.order.status === 'PAID') {
    fail('start from an UNPAID order, this one is already paid');
    return;
  }
  console.log(`  · order ${before.order.number} is ${before.order.status}, payment ${before.status}\n`);

  const attacks: [string, Record<string, string>][] = [
    ['bare success claim, no val_id',
      { tran_id: tranId, status: 'VALID', amount: String(before.amountBdt), currency: 'BDT' }],
    ['invented val_id',
      { tran_id: tranId, val_id: '000000000000FORGED', status: 'VALID',
        amount: String(before.amountBdt), currency: 'BDT' }],
    ['unknown transaction id',
      { tran_id: 'SB-NOT-A-REAL-TRANSACTION', val_id: '000000000000FORGED', status: 'VALID',
        amount: '1', currency: 'BDT' }],
    ['success claim for one taka',
      { tran_id: tranId, val_id: '000000000000FORGED', status: 'VALID', amount: '1', currency: 'BDT' }],
  ];

  for (const [name, fields] of attacks) {
    const res = await post(fields);
    const after = await orderState();
    const paid = after?.order.status === 'PAID';
    const gotLicence = (after?.order.licences.length ?? 0) > (before.order.licences.length);
    const gotProject = (after?.order.projects.length ?? 0) > (before.order.projects.length);

    if (!paid && !gotLicence && !gotProject) {
      pass(`${name} — rejected (HTTP ${res.status}, order still ${after?.order.status})`);
    } else {
      fail(`${name} — GOT THROUGH: paid=${paid} licence=${gotLicence} project=${gotProject}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); failures += 1; })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures ? `\n${failures} failure(s).\n` : '\nEvery forged callback was rejected.\n');
    process.exit(failures ? 1 : 0);
  });

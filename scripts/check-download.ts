/**
 * Download delivery, end to end, against a real order.
 *
 * Creates a paid order for a beat, issues a grant, then exercises the link the
 * way a buyer and an attacker each would. Everything it creates is removed
 * again at the end, whether it passed or not.
 *
 *   npx tsx --env-file=.env scripts/check-download.ts [baseUrl]
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();
const base = (process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3001').replace(/\/$/, '');

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };

/** Follow nothing — the redirect target is what we are inspecting. */
const hit = (url: string) => fetch(url, { redirect: 'manual', cache: 'no-store' });

let orderId = '';
let baitId = '';

async function main() {
  console.log(`\nDownload delivery — ${base}\n`);

  const beat = await prisma.beat.findFirst({
    where: { assets: { some: {} } },
    include: { assets: true },
  });
  if (!beat) { fail('no beat has any private assets uploaded — cannot test delivery'); return; }

  const tier = await prisma.licenceTier.findFirst({
    where: { active: true, isExclusive: false },
    orderBy: { sortOrder: 'asc' },
  });
  if (!tier) { fail('no active licence tier'); return; }

  // The escalation case is the one that matters most, so it is manufactured
  // rather than skipped when the catalogue happens not to provide it: a beat
  // with only an MP3 gives an MP3 licence nothing to steal. The placeholder
  // key never has to exist in R2 — a refusal is asserted, so nothing is
  // fetched. It is removed again in the cleanup below.
  const kinds = new Set(beat.assets.map((a) => a.kind));
  const bait = [...tier.includedAssets, 'STEMS_ZIP' as const]
    .includes('STEMS_ZIP') && !kinds.has('STEMS_ZIP') && !tier.includedAssets.includes('STEMS_ZIP')
    ? await prisma.beatAsset.create({
        data: {
          beatId: beat.id, kind: 'STEMS_ZIP',
          objectKey: `harness/never-uploaded-${Date.now()}.zip`, bytes: BigInt(1),
        },
      })
    : null;
  if (bait) { beat.assets.push(bait); baitId = bait.id; }

  const included = beat.assets.filter((a) => tier.includedAssets.includes(a.kind));
  const excluded = beat.assets.filter((a) => !tier.includedAssets.includes(a.kind));
  console.log(`  · ${beat.title} / ${tier.name}: ${included.length} file(s) included, ${excluded.length} excluded\n`);
  if (!included.length) { fail(`${tier.name} includes none of the uploaded files`); return; }

  // ---- a paid order, exactly as the IPN would leave it ---------------------
  const order = await prisma.order.create({
    data: {
      number: `SB-TEST-${Date.now().toString(36).toUpperCase()}`,
      status: 'PAID', paidAt: new Date(),
      billingEmail: 'download-harness@example.invalid',
      billingName: 'Download Harness',
      subtotalBdt: tier.multiplier * beat.basePriceBdt,
      totalBdt: tier.multiplier * beat.basePriceBdt,
      items: {
        create: [{
          kind: 'BEAT_LICENCE', beatId: beat.id, licenceTierId: tier.id,
          titleSnapshot: `${beat.title} — ${tier.name}`, priceBdt: beat.basePriceBdt, quantity: 1,
        }],
      },
    },
    include: { items: true },
  });
  orderId = order.id;
  const item = order.items[0];

  // Mint a grant directly so the raw token is known here.
  const raw = 'harness-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const grant = await prisma.downloadGrant.create({
    data: {
      orderItemId: item.id,
      tokenHash: createHash('sha256').update(raw).digest('hex'),
      maxAttempts: 2,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  // ---- the buyer's path ---------------------------------------------------
  const page = await hit(`${base}/download/${raw}`);
  const html = await page.text();
  page.status === 200 && html.includes(beat.title)
    ? pass('landing page renders the purchase')
    : fail(`landing page returned HTTP ${page.status}`);

  html.includes('noindex') || page.headers.get('x-robots-tag')?.includes('noindex')
    ? pass('page is noindex')
    : fail('download page is not marked noindex');

  const afterView = await prisma.downloadGrant.findUnique({ where: { id: grant.id } });
  afterView?.attempts === 0
    ? pass('viewing the page spends no attempt')
    : fail(`viewing spent ${afterView?.attempts} attempt(s)`);

  const good = await hit(`${base}/download/${raw}/file/${included[0].id}`);
  const target = good.headers.get('location') ?? '';
  good.status === 303 && /r2\.cloudflarestorage\.com/.test(target) && /X-Amz-Signature/i.test(target)
    ? pass('a purchased file redirects to a signed R2 URL')
    : fail(`file fetch returned HTTP ${good.status} → ${target.slice(0, 80)}`);

  const afterOne = await prisma.downloadGrant.findUnique({ where: { id: grant.id } });
  afterOne?.attempts === 1 ? pass('the fetch spent exactly one attempt') : fail(`attempts is ${afterOne?.attempts}`);

  // ---- the attacks --------------------------------------------------------
  if (excluded.length) {
    const sneak = await hit(`${base}/download/${raw}/file/${excluded[0].id}`);
    const loc = sneak.headers.get('location') ?? '';
    !/r2\.cloudflarestorage/.test(loc)
      ? pass(`a file outside the licence (${excluded[0].kind}) is refused`)
      : fail(`GOT ${excluded[0].kind} WITHOUT PAYING FOR IT`);
  } else {
    console.log('  · tier includes every uploaded file, so no out-of-licence case to test');
  }

  const forged = await hit(`${base}/download/${raw}xx/file/${included[0].id}`);
  !/r2\.cloudflarestorage/.test(forged.headers.get('location') ?? '')
    ? pass('a wrong token is refused')
    : fail('A FORGED TOKEN GOT A FILE');

  // Burn the cap.
  await hit(`${base}/download/${raw}/file/${included[0].id}`);
  const spent = await hit(`${base}/download/${raw}/file/${included[0].id}`);
  !/r2\.cloudflarestorage/.test(spent.headers.get('location') ?? '')
    ? pass('the attempt cap is enforced')
    : fail('DOWNLOADS CONTINUED PAST THE CAP');

  // ---- an unpaid order must deliver nothing -------------------------------
  await prisma.order.update({ where: { id: order.id }, data: { status: 'PENDING_PAYMENT' } });
  await prisma.downloadGrant.update({ where: { id: grant.id }, data: { attempts: 0 } });
  const unpaid = await hit(`${base}/download/${raw}/file/${included[0].id}`);
  !/r2\.cloudflarestorage/.test(unpaid.headers.get('location') ?? '')
    ? pass('an unpaid order delivers nothing, even with a valid token')
    : fail('AN UNPAID ORDER HANDED OVER A FILE');

  // ---- revocation ---------------------------------------------------------
  await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
  await prisma.downloadGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
  const revoked = await hit(`${base}/download/${raw}/file/${included[0].id}`);
  !/r2\.cloudflarestorage/.test(revoked.headers.get('location') ?? '')
    ? pass('a revoked link delivers nothing')
    : fail('A REVOKED LINK STILL WORKED');

  const logs = await prisma.downloadLog.count({ where: { orderId: null, objectKey: included[0].objectKey } });
  logs > 0 ? pass(`${logs} attempt(s) written to the download log`) : fail('nothing was logged');
}

main()
  .catch((e) => { console.error(e); failures += 1; })
  .finally(async () => {
    if (baitId) await prisma.beatAsset.delete({ where: { id: baitId } }).catch(() => {});
    if (orderId) {
      const items = await prisma.orderItem.findMany({ where: { orderId }, select: { id: true } });
      await prisma.downloadGrant.deleteMany({ where: { orderItemId: { in: items.map((i) => i.id) } } });
      await prisma.order.delete({ where: { id: orderId } });
      console.log('\n  · test order removed');
    }
    await prisma.$disconnect();
    console.log(failures ? `\n${failures} failure(s).\n` : '\nAll checks passed.\n');
    process.exit(failures ? 1 : 0);
  });

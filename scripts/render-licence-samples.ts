/**
 * Render one sample licence PDF per beat package, for review.
 *
 * Reads the REAL tiers from the database rather than restating them here, so
 * what comes out is exactly what a buyer of that package would receive — same
 * limits, same terms, same wording. A sample built from invented figures would
 * review well and ship wrong.
 *
 * Writes to the Desktop by default so they can be opened and read without
 * hunting through the repo.
 *
 *   npx tsx --env-file=.env scripts/render-licence-samples.ts
 *   npx tsx --env-file=.env scripts/render-licence-samples.ts --print   (white)
 *   npx tsx --env-file=.env scripts/render-licence-samples.ts --out ./output
 */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { PrismaClient } from '@prisma/client';
import { renderLicencePdf } from '../src/lib/licence-pdf';

const prisma = new PrismaClient();

/** A believable buyer, so the layout is exercised the way a real one is. */
const SAMPLE = {
  orderNumber: 'SB-2026-000000',
  licenseeName: 'Sample Artist',
  licenseeArtist: 'SAMPLE',
  licenseeEmail: 'artist@example.com',
  licenseeCountry: 'Bangladesh',
  beatTitle: 'Puran Dhaka',
  purchasedAt: new Date('2026-08-22T10:00:00.000Z'),
  basePriceBdt: 1500,
};

async function main() {
  const args = process.argv.slice(2);
  const printTheme = args.includes('--print');
  const outFlag = args.indexOf('--out');
  const outDir = outFlag !== -1 && args[outFlag + 1]
    ? path.resolve(args[outFlag + 1])
    : path.join(os.homedir(), 'Desktop', 'SnareByt licences');

  await mkdir(outDir, { recursive: true });

  const tiers = await prisma.licenceTier.findMany({ orderBy: { sortOrder: 'asc' } });
  if (!tiers.length) throw new Error('No licence tiers in the database.');

  console.log(`\nRendering ${tiers.length} sample licences${printTheme ? ' (print theme)' : ''}…\n`);

  for (const tier of tiers) {
    const SEPARATOR = '\n\n---\n\n';
    // The live generator splits the stored snapshot the same way. Matching it
    // here is what makes these samples representative rather than decorative.
    const combined = `${tier.termsMarkdown}${SEPARATOR}${tier.termsMarkdownBn}`;
    const at = combined.indexOf(SEPARATOR);

    const bytes = await renderLicencePdf({
      number: `SB-LIC-2026-${tier.code.toUpperCase()}`,
      orderNumber: SAMPLE.orderNumber,
      licenseeName: SAMPLE.licenseeName,
      licenseeArtist: SAMPLE.licenseeArtist,
      licenseeEmail: SAMPLE.licenseeEmail,
      licenseeCountry: SAMPLE.licenseeCountry,
      beatTitle: SAMPLE.beatTitle,
      tierName: tier.name,
      purchasedAt: SAMPLE.purchasedAt,
      priceBdt: Math.round((SAMPLE.basePriceBdt * tier.multiplier) / 50) * 50,
      isExclusive: tier.isExclusive,
      transfersOwnership: tier.transfersOwnership,
      filesLabel: tier.filesLabel,
      performanceRights: tier.performanceRights,
      creditRequired: tier.creditRequired,
      termsEnglish: combined.slice(0, at),
      termsBangla: combined.slice(at + SEPARATOR.length),
      streamLimit: tier.streamLimit,
      saleLimit: tier.saleLimit,
      videoLimit: tier.videoLimit,
      radioStations: tier.radioStations,
      monetisation: tier.monetisation,
      theme: printTheme ? 'print' : 'dark',
    });

    const slug = tier.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const file = path.join(outDir, `snarebyt-${slug}${printTheme ? '-print' : ''}.pdf`);
    await writeFile(file, bytes);

    const limits = [
      tier.streamLimit === null ? 'unlimited streams' : `${tier.streamLimit.toLocaleString('en-US')} streams`,
      tier.saleLimit === null ? 'unlimited sales' : `${tier.saleLimit.toLocaleString('en-US')} sales`,
      tier.videoLimit === null ? 'unlimited videos' : `${tier.videoLimit} video${tier.videoLimit === 1 ? '' : 's'}`,
    ].join(' · ');

    console.log(`  ✓ ${tier.name.padEnd(20)} ${(bytes.length / 1024).toFixed(0).padStart(4)}KB   ${limits}`);
  }

  console.log(`\nWritten to: ${outDir}\n`);
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(() => prisma.$disconnect());

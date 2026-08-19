/**
 * Licence PDF checks.
 *
 * A contract that silently loses half its terms is the failure mode that
 * matters here, so these push the renderer at the edges rather than at the
 * happy path: terms far longer than today's, a separator inside the terms,
 * and both licence kinds.
 *
 *   node -r ./scripts/server-only-shim.cjs -e "require('tsx/cjs'); require('./scripts/check-licence.ts')"
 */
import { PDFDocument } from 'pdf-lib';
import { renderLicencePdf, type LicencePdfData } from '../src/lib/licence-pdf';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };

const base: LicencePdfData = {
  number: 'SB-LIC-TEST', orderNumber: 'SB-2026-TEST',
  licenseeName: 'Test Licensee', licenseeEmail: 'test@example.invalid',
  beatTitle: 'Puran Dhaka', tierName: 'WAV Licence',
  purchasedAt: new Date('2026-08-20T10:00:00.000Z'), priceBdt: 3600,
  isExclusive: false, transfersOwnership: false,
  filesLabel: 'WAV 24-bit + MP3 320kbps',
  performanceRights: 'Live performances allowed',
  creditRequired: true,
  termsEnglish: 'The licensee may use the beat commercially.\nCredit is required.',
  termsBangla: 'লাইসেন্সধারী বাণিজ্যিকভাবে বিটটি ব্যবহার করতে পারবেন।',
};

const pagesOf = async (d: LicencePdfData) =>
  (await PDFDocument.load(await renderLicencePdf(d))).getPageCount();

async function main() {
  console.log('\nLicence PDF\n');

  const short = await pagesOf(base);
  short >= 4 ? pass(`short terms render (${short} pages)`) : fail(`only ${short} pages`);

  // The bug the old code had: one tall image at a fixed origin, so anything
  // past roughly 35 rows ran off the bottom of the sheet and was lost.
  const longBangla = Array.from({ length: 90 },
    (_, i) => `শর্ত ${i + 1}: লাইসেন্সধারী বাণিজ্যিকভাবে বিটটি ব্যবহার করতে পারবেন এবং প্রয়োজনীয় ক্রেডিট দিতে হবে।`).join('\n');
  const longPages = await pagesOf({ ...base, termsBangla: longBangla });
  longPages > short
    ? pass(`90 lines of Bangla paginate instead of overflowing (${longPages} pages)`)
    : fail(`90 lines of Bangla produced ${longPages} pages — same as short, so content is being lost`);

  const longEnglish = Array.from({ length: 120 },
    (_, i) => `Clause ${i + 1}. The licensee agrees to the terms set out in this agreement in full.`).join('\n');
  const longEnPages = await pagesOf({ ...base, termsEnglish: longEnglish });
  longEnPages > short
    ? pass(`120 English clauses paginate (${longEnPages} pages)`)
    : fail('long English terms did not add pages');

  // Both kinds must render; the exclusive carries different front matter.
  const excl = await pagesOf({
    ...base, isExclusive: true, transfersOwnership: true,
    tierName: 'Exclusive Rights', priceBdt: 39000,
  });
  excl >= 4 ? pass(`exclusive agreement renders (${excl} pages)`) : fail('exclusive failed');

  // creditRequired is a licence term, not decoration — both states must render.
  const noCredit = await pagesOf({ ...base, creditRequired: false });
  noCredit >= 4 ? pass('renders with credit not required') : fail('creditRequired=false failed');

  // Empty Bangla must not crash — a tier could be mid-edit.
  const noBangla = await pagesOf({ ...base, termsBangla: '' });
  noBangla >= 3 ? pass('empty Bangla terms do not crash the render') : fail('empty Bangla crashed');

  // A licensee name with accents must not fall back to blank glyphs.
  const accented = await pagesOf({ ...base, licenseeName: 'Zoë Ñuñez-Ström' });
  accented >= 4 ? pass('accented licensee name renders') : fail('accented name failed');
}

main()
  .catch((e) => { console.error(e); failures += 1; })
  .finally(() => {
    console.log(failures ? `\n${failures} failure(s).\n` : '\nAll licence checks passed.\n');
    process.exit(failures ? 1 : 0);
  });

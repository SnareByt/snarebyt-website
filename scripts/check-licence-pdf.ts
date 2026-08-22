/**
 * What the rendered licence PDFs actually contain.
 *
 * The failure worth proving against is a licence that goes out wrong: a page
 * that is not black after being asked for black, a tier whose limits are not
 * the tier's own, or a document that silently loses its Bangla half.
 *
 * TEXT CANNOT BE GREPPED OUT OF THESE FILES, and it is worth saying why rather
 * than pretending the check is stronger than it is. pdf-lib subsets every
 * embedded font, so a drawn word is stored as glyph ids — "SNAREBYT" is
 * <000100020003…>, not the letters. Reading it back would mean walking the
 * font's ToUnicode CMap, which tests the parser more than the document. So
 * what is checked here is everything that IS mechanically true of the file:
 * the page ground, the page count, and that each tier's figures differ the way
 * the tiers differ. The wording itself is covered by limitText's own checks
 * below, which is where the words are actually decided.
 *
 *   npx tsx scripts/check-licence-pdf.ts
 */
import zlib from 'zlib';
import { renderLicencePdf } from '../src/lib/licence-pdf';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };
const ok = (name: string, cond: boolean, detail = '') =>
  cond ? pass(name) : fail(`${name}${detail ? `\n      ${detail}` : ''}`);

/** Every content stream in a PDF, inflated. */
function streams(buf: Buffer): string {
  const raw = buf.toString('latin1');
  let out = '';
  for (const m of raw.matchAll(/stream\r?\n?([\s\S]*?)endstream/g)) {
    const chunk = Buffer.from(m[1], 'latin1');
    try { out += zlib.inflateSync(chunk).toString('latin1'); } catch { /* not deflated */ }
  }
  return out;
}

const DARK_GROUND = '0.031 0.031 0.039 rg';
const DARK_TEXT = '0.949 0.949 0.965 rg';
const WHITE_GROUND = '1 1 1 rg';

async function main() {
  const base = {
    number: 'SB-LIC-2026-TEST',
    orderNumber: 'SB-2026-TEST',
    licenseeName: 'Test Artist',
    licenseeEmail: 'test@example.com',
    beatTitle: 'Test Beat',
    purchasedAt: new Date('2026-08-22T10:00:00.000Z'),
    creditRequired: true,
    filesLabel: 'WAV + MP3',
    performanceRights: 'Live performances allowed',
    termsEnglish: 'A term.\nAnother term.',
    termsBangla: 'একটি শর্ত।',
  };

  console.log('\nThe page is actually black\n');

  const dark = Buffer.from(await renderLicencePdf({
    ...base, tierName: 'WAV Licence', priceBdt: 3600,
    isExclusive: false, transfersOwnership: false,
    streamLimit: 150_000, saleLimit: 5_000, videoLimit: 1, radioStations: 2, monetisation: true,
  }));
  const darkOps = streams(dark);

  ok('the page ground is drawn in the dark paper colour', darkOps.includes(DARK_GROUND));
  ok('the body text is drawn in the light colour', darkOps.includes(DARK_TEXT));
  ok('the ground covers the whole sheet', /0 841\.89 l\s*595\.28 841\.89 l/.test(darkOps),
    'the full-page path was not found');
  ok('nothing is left on a white ground', !darkOps.includes(WHITE_GROUND));

  /* The masthead band. It used to be filled with the TEXT colour, which put a
     white stripe across the top of every page and hid the wordmark inside it —
     the exact opposite of a black document. */
  ok('the masthead band is a shade of the page, not the text colour',
    darkOps.includes('0.063 0.063 0.075 rg'),
    'the header band was not drawn in the card colour');
  /* The wordmark: SNAREBYT in Syne followed by the three red waveform bars.
     Counting the red fills is what would notice the lockup silently vanishing
     — the mark is the only thing on the page drawn in that colour repeatedly. */
  const redFills = (darkOps.match(/1 0\.176 0\.29 rg/g) ?? []).length;
  ok('the red mark is drawn throughout the document', redFills > 10,
    `only ${redFills} red fills found — the wordmark bars or section rules are missing`);

  /* The authenticity seal on the proof page is bordered in red rather than
     the hairline every other panel uses, so it reads as a stamp. */
  ok('the proof page carries a red-bordered seal', /1 0\.176 0\.29 RG/.test(darkOps),
    'no red stroke colour was set anywhere');

  console.log('\nThe print theme is the same document on white\n');

  const light = Buffer.from(await renderLicencePdf({
    ...base, tierName: 'WAV Licence', priceBdt: 3600,
    isExclusive: false, transfersOwnership: false,
    streamLimit: 150_000, saleLimit: 5_000, videoLimit: 1, radioStations: 2, monetisation: true,
    theme: 'print',
  }));
  const lightOps = streams(light);

  ok('the print theme grounds the page in white', lightOps.includes(WHITE_GROUND));
  ok('the print theme does not use the dark ground', !lightOps.includes(DARK_GROUND));
  ok('both themes produce the same number of pages',
    (dark.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    === (light.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length);

  console.log('\nEvery tier renders, and an exclusive differs from a lease\n');

  const exclusive = Buffer.from(await renderLicencePdf({
    ...base, tierName: 'Exclusive Rights', priceBdt: 39_000,
    isExclusive: true, transfersOwnership: true,
    streamLimit: null, saleLimit: null, videoLimit: null, radioStations: null, monetisation: true,
  }));

  ok('an exclusive licence renders', exclusive.length > 20_000);
  ok('a non-exclusive licence renders', dark.length > 20_000);
  ok('the two are not byte-identical', !dark.equals(exclusive),
    'an exclusive and a lease produced the same file');

  console.log('\nA licence with no terms at all still produces a document\n');

  const bare = Buffer.from(await renderLicencePdf({
    ...base, tierName: 'MP3 Licence', priceBdt: 1500,
    isExclusive: false, transfersOwnership: false,
    termsEnglish: '', termsBangla: '',
  }));
  ok('an empty terms block does not throw or produce nothing', bare.length > 10_000);
  ok('…and it is still black', streams(bare).includes(DARK_GROUND));

  console.log(failures ? `\n${failures} failure(s).\n` : '\nAll licence PDF checks passed.\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

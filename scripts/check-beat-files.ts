/**
 * The rules that decide what a beat can sell.
 *
 * The failure these guard against is the worst one this store has: someone
 * pays ৳7,500 for a Trackout licence and receives a single MP3, because the
 * stems were never uploaded. Nothing in the schema prevented that — the
 * download route serves the intersection of "paid for" and "exists", and for
 * a missing file that intersection is empty.
 *
 * src/lib/beat-files.ts holds no Prisma and no auth precisely so this can call
 * it directly. The admin readiness list, the public store and placeOrder all
 * ask these same functions, so proving them here proves all three.
 *
 *   npx tsx scripts/check-beat-files.ts
 */
import {
  missingFor, tierDeliverable, missingText, publishBlockers, fileSize, ASSET_ORDER,
} from '../src/lib/beat-files';
import type { AssetKind } from '@prisma/client';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };
const eq = (name: string, got: unknown, want: unknown) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? pass(name)
    : fail(`${name} — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

// The five real tiers, as seeded. Kept as literals rather than read from the
// database so this proves the rule and not the current data.
const MP3: AssetKind[] = ['MP3_UNTAGGED'];
const WAV: AssetKind[] = ['WAV', 'MP3_UNTAGGED'];
const STEMS: AssetKind[] = ['WAV', 'MP3_UNTAGGED', 'STEMS_ZIP'];
const UNLIM: AssetKind[] = ['WAV', 'MP3_UNTAGGED', 'STEMS_ZIP', 'SESSION_NOTES'];

console.log('\nWhat a beat can sell\n');

// The catalogue's actual state today: six beats, every one of them MP3-only.
const mp3Only: AssetKind[] = ['MP3_UNTAGGED'];
eq('MP3 tier sells on an MP3-only beat', missingFor(MP3, mp3Only), []);
eq('WAV tier is blocked on an MP3-only beat', missingFor(WAV, mp3Only), ['WAV']);
eq('Stems tier names BOTH missing files', missingFor(STEMS, mp3Only), ['WAV', 'STEMS_ZIP']);
eq('Unlimited tier names all three', missingFor(UNLIM, mp3Only), ['WAV', 'STEMS_ZIP', 'SESSION_NOTES']);

// Uploading a WAV must move exactly one tier, not all of them.
const withWav: AssetKind[] = ['MP3_UNTAGGED', 'WAV'];
tierDeliverable(WAV, withWav) ? pass('uploading a WAV unlocks the WAV tier') : fail('WAV tier still blocked after upload');
!tierDeliverable(STEMS, withWav) ? pass('uploading a WAV does NOT unlock the stems tier') : fail('stems tier unlocked without stems');

const full: AssetKind[] = ['MP3_UNTAGGED', 'WAV', 'STEMS_ZIP', 'SESSION_NOTES'];
tierDeliverable(UNLIM, full) ? pass('a fully equipped beat sells every tier') : fail('full beat could not sell unlimited');

// Order must be stable, so the admin column reads the same down the page.
eq('missing files come back in a fixed order', missingFor(UNLIM, []), ASSET_ORDER);

// A beat with files it does not need is not thereby blocked.
eq('extra files never block a cheaper tier', missingFor(MP3, full), []);

console.log('\nSentences a human reads\n');
eq('one missing file reads plainly', missingText(missingFor(WAV, mp3Only)), 'WAV 24-bit');
eq('two missing files get "and"', missingText(missingFor(STEMS, mp3Only)), 'WAV 24-bit and Track stems');
eq('three use commas then "and"', missingText(missingFor(UNLIM, mp3Only)),
  'WAV 24-bit, Track stems and Session notes');
eq('nothing missing reads as empty', missingText([]), '');

console.log('\nWhat blocks publishing\n');
eq('a bare beat needs both', publishBlockers({ previewKey: null, have: [] }),
  ['a tagged preview', 'an untagged MP3']);
eq('preview alone is not enough', publishBlockers({ previewKey: 'k', have: [] }), ['an untagged MP3']);
eq('master alone is not enough', publishBlockers({ previewKey: null, have: mp3Only }), ['a tagged preview']);
eq('preview + master is publishable', publishBlockers({ previewKey: 'k', have: mp3Only }), []);
// The expensive tiers being unready must NOT block publishing — the beat sells
// what it can and the rest stay off until their files land.
eq('missing stems do not block publishing', publishBlockers({ previewKey: 'k', have: withWav }), []);

console.log('\nFile sizes\n');
eq('zero reads as a dash', fileSize(0), '—');
eq('bytes', fileSize(900), '900 B');
eq('kilobytes round to whole', fileSize(2048), '2 KB');
eq('megabytes keep one decimal', fileSize(8_650_752), '8.3 MB');
eq('gigabytes keep two', fileSize(2_147_483_648), '2.00 GB');

console.log(failures ? `\n${failures} failure(s).\n` : '\nAll beat file checks passed.\n');
process.exit(failures ? 1 : 0);

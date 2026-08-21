/**
 * The rules behind "a service cannot be ordered without its brief".
 *
 * The failure worth proving against is not a cosmetic one. It is money moving
 * for a mix whose stems nobody has, or a cover art with no concept — a job that
 * cannot start, a customer who has paid, and days of chasing on WhatsApp. So
 * these checks are about what validateIntake REFUSES, and about the brief
 * surviving intact all the way to the project.
 *
 *   npx tsx scripts/check-service-intake.ts
 */
import {
  INTAKE_FIELDS, resolveFields, validateIntake, intakeToBrief, intakeLinks,
  intakeName, readIntake,
} from '../src/lib/service-intake';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };
const ok = (name: string, cond: boolean, detail = '') =>
  cond ? pass(name) : fail(`${name}${detail ? `\n      ${detail}` : ''}`);

const MIX = resolveFields(['FILE_LINKS', 'REFERENCES']);
const ART = resolveFields(['CONCEPT', 'TITLE_TEXT']);

console.log('\nNothing gets through empty\n');

const emptyMix = validateIntake(MIX, {});
ok('a mix with no answers at all is refused on every field',
  Object.keys(emptyMix).length === 2 && !!emptyMix.FILE_LINKS && !!emptyMix.REFERENCES,
  JSON.stringify(emptyMix));
ok('the message names the field, so the customer knows what is missing',
  (emptyMix.FILE_LINKS ?? '').startsWith(INTAKE_FIELDS.FILE_LINKS.label));
ok('whitespace is not an answer',
  Object.keys(validateIntake(MIX, { FILE_LINKS: '    ', REFERENCES: '\n\t ' })).length === 2);
ok('a cover art with no concept is refused',
  !!validateIntake(ART, { TITLE_TEXT: 'Kotha Ko' }).CONCEPT);

console.log('\nA file link has to be a link\n');

const notLinks = [
  'its on my drive',
  'I will send them on whatsapp later',
  'drive.google.com/file/d/abc',   // no scheme: not clickable, not openable
  'ask me',
];
for (const value of notLinks) {
  const errs = validateIntake(resolveFields(['FILE_LINKS']), { FILE_LINKS: value });
  ok(`refused: ${JSON.stringify(value)}`, !!errs.FILE_LINKS, JSON.stringify(errs));
}
ok('accepted: a real https link',
  !validateIntake(resolveFields(['FILE_LINKS']), {
    FILE_LINKS: 'https://drive.google.com/drive/folders/1AbCdEf',
  }).FILE_LINKS);
ok('accepted: a link with words around it',
  !validateIntake(resolveFields(['FILE_LINKS']), {
    FILE_LINKS: 'stems here https://we.tl/t-9xQ password is snare',
  }).FILE_LINKS);
ok('accepted: plain http, since some hosts still are',
  !validateIntake(resolveFields(['FILE_LINKS']), {
    FILE_LINKS: 'http://files.example.com/stems.zip',
  }).FILE_LINKS);

console.log('\nText fields ask for enough to work from\n');

ok('a one-word concept is refused',
  !!validateIntake(ART, { CONCEPT: 'dark', TITLE_TEXT: 'X' }).CONCEPT);
ok('a real concept is accepted',
  !validateIntake(ART, {
    CONCEPT: 'Dark red, grainy, close-up of a face half in shadow. Like the Kotha Ko artwork.',
    TITLE_TEXT: 'SHEZAN — Kotha Ko',
  }).CONCEPT);
ok('a reference does not need to be a link',
  !validateIntake(resolveFields(['REFERENCES']), { REFERENCES: 'Awaaz Utha' }).REFERENCES);
const long = 'x'.repeat(INTAKE_FIELDS.CONCEPT.max + 1);
ok('an over-long answer is refused rather than silently truncated',
  !!validateIntake(ART, { CONCEPT: long, TITLE_TEXT: 'X' }).CONCEPT);

console.log('\nA complete brief passes\n');

const mixAnswers = {
  FILE_LINKS: 'https://drive.google.com/drive/folders/1AbCdEf',
  REFERENCES: 'Kotha Ko, and https://youtu.be/abc123 for the vocal tone',
};
ok('nothing is refused', Object.keys(validateIntake(MIX, mixAnswers)).length === 0,
  JSON.stringify(validateIntake(MIX, mixAnswers)));

console.log('\nThe brief survives into the project\n');

const brief = intakeToBrief(MIX, mixAnswers);
ok('every answer is carried, under its own heading',
  brief.includes(INTAKE_FIELDS.FILE_LINKS.label)
  && brief.includes(mixAnswers.FILE_LINKS)
  && brief.includes(INTAKE_FIELDS.REFERENCES.label)
  && brief.includes(mixAnswers.REFERENCES),
  brief);
ok('an empty brief is empty, not a heading with nothing under it',
  intakeToBrief(MIX, {}) === '');

const links = intakeLinks(mixAnswers);
ok('both links are pulled out for the project reference list',
  links.length === 2 && links.includes('https://drive.google.com/drive/folders/1AbCdEf')
  && links.includes('https://youtu.be/abc123'), JSON.stringify(links));
ok('a repeated link is listed once',
  intakeLinks({ a: 'https://x.com/1 https://x.com/1' }).length === 1);
ok('prose with no links yields none', intakeLinks({ a: 'call me' }).length === 0);

console.log('\nTwo services in one cart keep separate briefs\n');

const A = 'tier_mix_pro';
const B = 'tier_art_basic';
ok('field names are scoped by service tier',
  intakeName(A, 'REFERENCES') !== intakeName(B, 'REFERENCES'));

const form = new FormData();
form.set(intakeName(A, 'FILE_LINKS'), 'https://we.tl/t-mix');
form.set(intakeName(A, 'REFERENCES'), 'reference for the mix');
form.set(intakeName(B, 'CONCEPT'), 'A concept written only for the cover art job.');
form.set(intakeName(B, 'TITLE_TEXT'), 'Track — Artist');

const a = readIntake(form, A, MIX);
const b = readIntake(form, B, ART);
ok('the mix reads its own answers',
  a.FILE_LINKS === 'https://we.tl/t-mix' && a.REFERENCES === 'reference for the mix',
  JSON.stringify(a));
ok('the cover art reads its own, not the mix answers',
  b.CONCEPT.startsWith('A concept written only') && !('FILE_LINKS' in b), JSON.stringify(b));
ok('both are complete, so both would be accepted',
  Object.keys(validateIntake(MIX, a)).length === 0
  && Object.keys(validateIntake(ART, b)).length === 0);

// One service answered and the other left blank must refuse only the blank one,
// and must refuse it by ITS OWN name so the error appears in the right box.
const half = new FormData();
half.set(intakeName(A, 'FILE_LINKS'), 'https://we.tl/t-mix');
half.set(intakeName(A, 'REFERENCES'), 'reference for the mix');
const errsB = validateIntake(ART, readIntake(half, B, ART));
ok('the unanswered service is the one refused',
  Object.keys(validateIntake(MIX, readIntake(half, A, MIX))).length === 0
  && Object.keys(errsB).length === 2);

console.log('\nUnknown or missing configuration cannot break checkout\n');

ok('a service requiring nothing accepts an empty brief',
  Object.keys(validateIntake(resolveFields([]), {})).length === 0);
ok('an unknown field key is ignored, not rendered as a blank required box',
  resolveFields(['FILE_LINKS', 'FIELD_REMOVED_IN_2027']).length === 1);
ok('a duplicated key is asked for once',
  resolveFields(['CONCEPT', 'CONCEPT']).length === 1);
ok('null configuration is survivable', resolveFields(null).length === 0);
ok('every seeded key exists in the vocabulary',
  ['FILE_LINKS', 'CONCEPT', 'REFERENCES', 'TITLE_TEXT'].every((k) => k in INTAKE_FIELDS));
ok('every field has a label, placeholder and hint worth showing',
  Object.values(INTAKE_FIELDS).every((f) => f.label && f.placeholder && f.hint && f.min > 0));

console.log(failures ? `\n${failures} failure(s).\n` : '\nAll service intake checks passed.\n');
process.exit(failures ? 1 : 0);

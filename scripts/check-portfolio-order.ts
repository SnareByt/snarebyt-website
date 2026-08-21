/**
 * The rules behind portfolio section ordering.
 *
 * The failure worth proving against is not "the sections come out in the wrong
 * order" — it is a whole section of Samir's credits disappearing from his site
 * because a stored string went out of step with the code. resolveOrder is
 * total by design, and these checks are what say so.
 *
 *   npx tsx scripts/check-portfolio-order.ts
 */
import {
  PORTFOLIO_CATEGORIES, resolveOrder, serialiseOrder, move,
} from '../src/lib/portfolio-order';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };
const eq = (name: string, got: unknown, want: unknown) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? pass(name)
    : fail(`${name}\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`);

const [PROD, MIX, REL, VIS] = PORTFOLIO_CATEGORIES;
const ALL = [...PORTFOLIO_CATEGORIES];

console.log('\nEvery section survives, whatever is stored\n');

// The property that matters: the output always contains every category
// exactly once, no matter what went in.
const inputs: [string, string | null | undefined][] = [
  ['nothing stored', null],
  ['undefined', undefined],
  ['an empty string', ''],
  ['just commas', ',,,'],
  ['whitespace', '   '],
  ['an unknown category', 'NOT_A_CATEGORY'],
  ['a renamed enum value', 'PRODUCED_BY_SNAREBYT,OLD_NAME_FROM_2024'],
  ['a partial list', `${VIS}`],
  ['duplicates', `${VIS},${VIS},${VIS}`],
  ['a full list in reverse', [...ALL].reverse().join(',')],
  ['ragged spacing', `  ${MIX} ,${PROD}  `],
];

for (const [label, input] of inputs) {
  const got = resolveOrder(input);
  const complete = ALL.every((c) => got.filter((x) => x === c).length === 1);
  const noExtras = got.length === ALL.length;
  complete && noExtras
    ? pass(`${label} → all ${ALL.length} sections, exactly once each`)
    : fail(`${label} → ${JSON.stringify(got)}`);
}

console.log('\nA saved order is honoured\n');

eq('nothing stored gives the default order', resolveOrder(null), ALL);
eq('a full stored order is used verbatim',
  resolveOrder(`${VIS},${REL},${MIX},${PROD}`), [VIS, REL, MIX, PROD]);
eq('a partial list keeps its saved positions and appends the rest',
  resolveOrder(`${VIS},${MIX}`), [VIS, MIX, PROD, REL]);
eq('unknown names are dropped, not rendered as empty headings',
  resolveOrder(`${VIS},GHOST_CATEGORY,${PROD}`), [VIS, PROD, MIX, REL]);
eq('duplicates collapse to the first occurrence',
  resolveOrder(`${MIX},${MIX},${PROD}`), [MIX, PROD, REL, VIS]);
eq('spacing is tolerated', resolveOrder(` ${MIX} , ${PROD} `), [MIX, PROD, REL, VIS]);

console.log('\nSerialising round-trips\n');

eq('a full order survives a round trip',
  resolveOrder(serialiseOrder([VIS, REL, MIX, PROD])), [VIS, REL, MIX, PROD]);
eq('serialising repairs a partial list',
  serialiseOrder([VIS]), [VIS, PROD, MIX, REL].join(','));
eq('serialising repairs rubbish', serialiseOrder(['nonsense']), ALL.join(','));

console.log('\nMoving one section\n');

eq('down swaps with the next', move(ALL, PROD, 'down'), [MIX, PROD, REL, VIS]);
eq('up swaps with the previous', move(ALL, MIX, 'up'), [MIX, PROD, REL, VIS]);
eq('the first cannot move up', move(ALL, PROD, 'up'), ALL);
eq('the last cannot move down', move(ALL, VIS, 'down'), ALL);
eq('moving something absent changes nothing',
  move([PROD, MIX], VIS, 'up'), [PROD, MIX]);

// Moving must never lose or duplicate a section either.
const moved = move(move(move(ALL, PROD, 'down'), VIS, 'up'), REL, 'up');
ALL.every((c) => moved.filter((x) => x === c).length === 1) && moved.length === ALL.length
  ? pass('three moves in a row still leave every section exactly once')
  : fail(`three moves produced ${JSON.stringify(moved)}`);

// The array handed in is never mutated — the admin holds it in React state.
const original = [...ALL];
move(original, PROD, 'down');
eq('move does not mutate its input', original, ALL);

console.log(failures ? `\n${failures} failure(s).\n` : '\nAll portfolio order checks passed.\n');
process.exit(failures ? 1 : 0);

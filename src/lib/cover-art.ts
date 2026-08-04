/**
 * Deterministic placeholder cover art, ported from the prototype.
 *
 * A card with no uploaded artwork gets a generated gradient rather than a
 * grey box or, worse, a stock image that implies artwork exists. The same
 * seed always produces the same art, so a card does not change appearance
 * between renders or between server and client.
 *
 * Hues are constrained to the brand's crimson range so generated art never
 * fights the palette.
 */
const HUES = [352, 348, 0, 344, 356, 340, 8, 4];

function seeded(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function coverCss(seed: number): string {
  const r = seeded(seed);
  const h = HUES[Math.floor(r() * HUES.length)];
  const a = 12 + Math.floor(r() * 22);
  const b = 34 + Math.floor(r() * 26);
  const ang = Math.floor(r() * 360);
  return [
    `radial-gradient(circle at ${20 + r() * 60}% ${15 + r() * 50}%, hsl(${h} 82% ${b}% / .95), transparent 58%)`,
    `radial-gradient(circle at ${20 + r() * 60}% ${50 + r() * 45}%, hsl(${(h + 18) % 360} 70% ${a}%), transparent 62%)`,
    `linear-gradient(${ang}deg, #0b0b0e, #17171c 48%, #08080a)`,
  ].join(',');
}

/** A stable numeric seed from a string id, so art survives a reorder. */
export function seedFrom(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) % 100000;
  return h || 211;
}

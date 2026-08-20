/**
 * A number that always fits its card.
 *
 * The analytics numbers were clipping, and container queries alone do not fix
 * it: `14cqi` knows how wide the card is but not how many digits are going
 * into it, so "39" and "3,472,918" were rendered at the same size and only one
 * of them fitted.
 *
 * Syne is the reason it bites here. Its digits measure 1.08em wide at weight
 * 800 — roughly double a normal typeface — so a seven-figure number is about
 * eight ems across where you would expect four.
 *
 * So each figure publishes its own width to CSS as `--len`, counted in digit
 * widths, and the stylesheet takes whichever is smaller: the size the card
 * wants, or the size the digits allow. Punctuation counts as roughly a third
 * of a digit, which is what it actually measures, so a number full of commas
 * is not shrunk as if they were digits.
 *
 * No measuring in the browser, no resize listener, no layout thrash — the
 * value is known at render time and CSS does the rest.
 */
export function Figure({
  value, className, title,
}: {
  value: string | number;
  className?: string;
  title?: string;
}) {
  const text = typeof value === 'number' ? value.toLocaleString('en-US') : value;

  const len = [...text].reduce(
    (n, ch) => n + (ch === ',' || ch === '.' || ch === ' ' || ch === "'" ? 0.32 : 1),
    0,
  );

  return (
    <span
      className={className}
      title={title}
      style={{ '--len': len.toFixed(2) } as React.CSSProperties}
    >
      {text}
    </span>
  );
}

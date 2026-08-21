/**
 * What a screen looks like while its data is still in flight.
 *
 * Every screen in this app is `force-dynamic` and queries Postgres on the
 * server, which is correct — a cached order list is a lie with a timestamp —
 * but it means a tap is followed by a round trip to Neon before anything can
 * paint. On mobile data in Dhaka that is a few hundred milliseconds of
 * absolutely nothing, and "nothing" is what makes a web app feel like a web
 * app. Native apps do not have less latency; they just never show you a blank
 * screen while they wait.
 *
 * Next renders the nearest `loading.tsx` the instant a navigation starts, so
 * these paint before the server has been asked anything at all.
 *
 * The shapes deliberately match the real layout — row heights, the thumbnail
 * square, the two-line stack. A skeleton that does not match causes a visible
 * reflow when the content lands, which reads as jank and is worse than a
 * spinner. One that does match reads as the content sharpening into focus.
 */

/** One list row: thumbnail, two lines of text, a trailing value. */
function Row({ thumb = false }: { thumb?: boolean }) {
  return (
    <div className="row" aria-hidden="true">
      {thumb && <span className="sk" style={{ width: 46, height: 46, borderRadius: 10, flex: 'none' }} />}
      <div className="row-main">
        <span className="sk" style={{ display: 'block', height: 13, width: '58%' }} />
        <span className="sk" style={{ display: 'block', height: 11, width: '38%', marginTop: 7 }} />
      </div>
      <span className="sk" style={{ width: 52, height: 13, flex: 'none' }} />
    </div>
  );
}

/**
 * A grouped list. `rows` should be roughly what the screen usually shows —
 * too few and the page grows when data lands, too many and it shrinks.
 */
export function ListSkeleton({ rows = 6, thumb = false }: { rows?: number; thumb?: boolean }) {
  return (
    <div className="list">
      {Array.from({ length: rows }, (_, i) => <Row key={i} thumb={thumb} />)}
    </div>
  );
}

/** The two-up metric tiles on Today and Analytics. */
export function TilesSkeleton() {
  return (
    <div className="tiles" aria-hidden="true">
      {[0, 1].map((i) => (
        <div className="tile" key={i}>
          <span className="sk" style={{ display: 'block', height: 9, width: '52%' }} />
          <span className="sk" style={{ display: 'block', height: 26, width: '78%', marginTop: 11 }} />
          <span className="sk" style={{ display: 'block', height: 10, width: '64%', marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

/** The oversized title every screen opens with. */
export function TitleSkeleton({ sub = true }: { sub?: boolean }) {
  return (
    <div className="big-title" aria-hidden="true">
      <span className="sk" style={{ display: 'block', height: 30, width: '56%', borderRadius: 8 }} />
      {sub && <span className="sk" style={{ display: 'block', height: 12, width: '38%', marginTop: 10 }} />}
    </div>
  );
}

/** A section heading above a list. */
export function SectionSkeleton() {
  return (
    <div className="sec" aria-hidden="true">
      <span className="sk" style={{ height: 9, width: 96 }} />
    </div>
  );
}

/**
 * The whole-screen arrangement, announced once for screen readers.
 *
 * `aria-busy` plus a single polite "Loading" is the right amount: the shapes
 * themselves are all `aria-hidden`, because a screen reader narrating nine
 * empty boxes is worse than silence.
 */
export function ScreenSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">Loading</span>
      {children}
    </div>
  );
}

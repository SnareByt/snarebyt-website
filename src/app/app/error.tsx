'use client';

import { useEffect } from 'react';

/**
 * What a broken screen shows instead of Next's white "server-side exception".
 *
 * The default page gives a digest and nothing else, which is right for a
 * public site — an error message can leak table names and query shapes to
 * anyone who trips it. This is not a public site. It is one person's private
 * dashboard behind a login, and the person reading this is the only one who
 * can fix it. Withholding the message from him buys no security and costs the
 * entire diagnosis: two rounds of this were spent guessing at a digest that
 * the server already knew the answer to.
 *
 * So: the real message, the digest for cross-referencing the hosting log, and
 * a way out that is not "force-quit the app".
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Also to the browser console, so it survives navigating away from here.
    console.error('[app] screen failed:', error);
  }, [error]);

  /* A schema mismatch is by far the likeliest cause on this project and its
     Postgres wording is unmistakable, so it gets named rather than left for
     the reader to decode. Anything else falls through to the raw message. */
  const looksLikeSchema =
    /column|relation|enum|does not exist|invalid input value/i.test(error.message);

  return (
    <div className="wrap stack-lg" style={{ paddingTop: '3.5rem', paddingBottom: '3rem' }}>
      <div>
        <div className="eyebrow">Something broke</div>
        <h1 className="display" style={{ fontSize: '1.6rem', marginTop: '.4rem' }}>
          This screen did not load
        </h1>
      </div>

      <div className="note red selectable">
        <b style={{ display: 'block', marginBottom: '.4rem' }}>What the server said</b>
        <span className="mono" style={{ wordBreak: 'break-word', lineHeight: 1.6 }}>
          {error.message || 'No message was returned.'}
        </span>
      </div>

      {looksLikeSchema && (
        <div className="note warn">
          <b>This reads like the database and the code disagreeing.</b>
          <br />
          A column, table or enum value the code expects is not there. Redeploying runs the
          schema repair again, which is usually enough.
        </div>
      )}

      {error.digest && (
        <p className="hint" style={{ padding: '0 .3rem' }}>
          Digest <span className="mono">{error.digest}</span> — the same id appears in the
          hosting logs, if you need the full stack trace.
        </p>
      )}

      <div className="stack">
        {/* Re-runs the failed render without a full reload, so the tab bar and
            scroll position survive. Worth trying first: a transient database
            blip fixes itself here. */}
        <button type="button" className="btn btn-full" onClick={reset}>
          Try again
        </button>
        <a className="btn gh btn-full" href="/app">Back to Today</a>
      </div>
    </div>
  );
}

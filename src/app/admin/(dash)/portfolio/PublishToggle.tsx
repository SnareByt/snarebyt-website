'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { togglePortfolioPublished } from './actions';

/** Show or hide a credit, reporting a refusal rather than doing nothing. */
export function PublishToggle({ id, published }: { id: string; published: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        className={published ? 'btn b-gh b-sm' : 'btn b-red b-sm'}
        disabled={busy}
        onClick={() => start(async () => {
          setError(null);
          const res = await togglePortfolioPublished(id);
          if (!res.ok) setError(res.error);
          else router.refresh();
        })}
      >
        {busy ? '…' : published ? 'Hide' : 'Publish'}
      </button>
      {error ? <div className="pf-err">{error}</div> : null}
    </div>
  );
}

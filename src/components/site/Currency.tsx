'use client';

import { createContext, useContext, useEffect, useState } from 'react';

/**
 * DISPLAY currency only.
 *
 * Every price in the database is a whole number of BDT and SSLCOMMERZ always
 * settles in BDT. This switch changes what an international visitor reads,
 * nothing else — the rate is passed down from the `usdRate` setting so it can
 * be corrected from the dashboard without a deploy.
 */
export type Currency = 'BDT' | 'USD';

const Ctx = createContext<{ cur: Currency; setCur: (c: Currency) => void; rate: number }>({
  cur: 'BDT',
  setCur: () => {},
  rate: 122,
});

const KEY = 'sb_currency';

export function CurrencyProvider({ rate, children }: { rate: number; children: React.ReactNode }) {
  // Always start on BDT so the server and the first client render agree;
  // reading localStorage during render would be a hydration mismatch.
  const [cur, setCurState] = useState<Currency>('BDT');

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'USD' || saved === 'BDT') setCurState(saved);
  }, []);

  const setCur = (c: Currency) => {
    setCurState(c);
    window.localStorage.setItem(KEY, c);
  };

  return <Ctx.Provider value={{ cur, setCur, rate }}>{children}</Ctx.Provider>;
}

export const useCurrency = () => useContext(Ctx);

/** Renders one BDT amount in whichever currency the visitor has chosen. */
export function Price({ bdt }: { bdt: number }) {
  const { cur, rate } = useCurrency();
  if (cur === 'USD') return <>${(bdt / rate).toFixed(2)}</>;
  return <>৳{Math.round(bdt).toLocaleString('en-US')}</>;
}

export function CurrencySwitch() {
  const { cur, setCur } = useCurrency();
  return (
    <div className="cur-sw">
      <button
        type="button"
        className={cur === 'BDT' ? 'on' : undefined}
        onClick={() => setCur('BDT')}
        aria-pressed={cur === 'BDT'}
      >
        ৳ BDT
      </button>
      <button
        type="button"
        className={cur === 'USD' ? 'on' : undefined}
        onClick={() => setCur('USD')}
        aria-pressed={cur === 'USD'}
      >
        $ USD
      </button>
    </div>
  );
}

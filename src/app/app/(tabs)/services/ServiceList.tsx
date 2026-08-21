'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setServicePrice, toggleService } from '@/app/admin/(dash)/services/actions';
import { Sheet, Switch, useToast } from '@/components/app/Ui';
import { bdt, usd } from '@/lib/money-client';

type Tier = {
  id: string; name: string; priceBdt: number;
  recommended: boolean; missingBangla: boolean;
};

type Service = {
  id: string; title: string; tagline: string; active: boolean; tiers: Tier[];
};

export function ServiceList({ services, usdRate }: { services: Service[]; usdRate: number }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<{ tier: Tier; service: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const missing = services.flatMap((s) => s.tiers).filter((t) => t.missingBangla).length;

  return (
    <>
      <div className="big-title">
        <h2>Services</h2>
        <p>{services.filter((s) => s.active).length} on the site</p>
      </div>

      <div className="wrap stack-lg">
        {missing > 0 && (
          <div className="note warn">
            <b>{missing} package{missing > 1 ? 's have' : ' has'} no Bangla description.</b>
            <br />
            A buyer in Dhaka would read an English-only account of what they are paying for.
            Both languages are written on the desktop dashboard, together.
          </div>
        )}

        {services.map((s) => (
          <div key={s.id}>
            <div className="sec"><h3>{s.title}</h3></div>
            <div className="list">
              <div className="row">
                <div className="row-main">
                  <div className="row-t">On the site</div>
                  <div className="row-s" style={{ whiteSpace: 'normal' }}>{s.tagline}</div>
                </div>
                <Switch
                  label={`${s.title} active`}
                  on={s.active}
                  onChange={async () => {
                    const res = await toggleService(s.id);
                    router.refresh();
                    return res;
                  }}
                />
              </div>

              {s.tiers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="row"
                  onClick={() => setEditing({ tier: t, service: s.title })}
                >
                  <div className="row-main">
                    <div className="row-t">
                      {t.name}
                      {t.recommended && <span className="chip ok" style={{ marginLeft: '.4rem' }}>popular</span>}
                    </div>
                    <div className="row-s">{usd(t.priceBdt, usdRate)}</div>
                    {t.missingBangla && (
                      <div className="row-s" style={{ color: '#ff9aa8' }}>No Bangla description</div>
                    )}
                  </div>
                  <span className="row-v">{bdt(t.priceBdt)}</span>
                </button>
              ))}

              {s.tiers.length === 0 && <div className="empty">No packages yet.</div>}
            </div>
          </div>
        ))}

        <p className="hint" style={{ padding: '0 .3rem' }}>
          Changing a price never rewrites an order already placed — each line froze its own
          price at checkout. Package descriptions are edited on the desktop, so the English
          and the Bangla are always written together.
        </p>
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.service} — ${editing.tier.name}` : ''}
      >
        {editing && (
          <form
            action={async (formData: FormData) => {
              setBusy(true);
              try {
                const res = await setServicePrice(editing.tier.id, formData);
                if (!res.ok) { toast(res.error, 'bad'); return; }
                setEditing(null);
                toast(res.message);
                router.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="field">
              <label className="fl" htmlFor="s-price">Price in taka</label>
              <input
                id="s-price" name="priceBdt" className="in" type="number"
                inputMode="numeric" min={1} defaultValue={editing.tier.priceBdt} required autoFocus
              />
              <p className="hint">
                Whole taka only. The dollar figure on the site is worked out from this at the
                current rate and never stored.
              </p>
            </div>
            <button type="submit" className="btn btn-full" disabled={busy}>
              {busy ? 'Saving…' : 'Save price'}
            </button>
          </form>
        )}
      </Sheet>
    </>
  );
}

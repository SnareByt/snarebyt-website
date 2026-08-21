import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { getPage, getNav } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { PageHead } from '@/components/site/PageHead';
import { Faq, type FaqItem } from '@/components/site/Faq';
import { BriefForm } from '@/components/site/BriefForm';
import { SocialIcon } from '@/components/site/SocialIcon';

type Values = Record<string, unknown>;
const str = (v: Values, k: string, fallback = '') =>
  typeof v[k] === 'string' ? (v[k] as string) : fallback;
const list = <T,>(v: Values, k: string): T[] => (Array.isArray(v[k]) ? (v[k] as T[]) : []);

function initials(label: string) {
  return label.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata('contact');
}

export default async function ContactPage() {
  const [page, services, socials, whatsapp] = await Promise.all([
    getPage('contact'),
    prisma.service.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true },
    }),
    getNav('SOCIAL'),
    prisma.setting.findUnique({ where: { key: 'whatsapp' } }),
  ]);
  if (!page) return null;

  const sec = (key: string): Values =>
    (page.sections.find((s) => s.key === key)?.values ?? {}) as Values;

  const head = sec('head');
  const details = sec('details');
  const faq = sec('faq');

  const rows = list<{ k?: string; v?: string }>(details, 'rows').filter((r) => r.k);
  const faqItems = list<{ q?: string; a?: string }>(faq, 'items')
    .filter((x): x is FaqItem => Boolean(x.q && x.a));

  // The number is a setting, and the button only exists once it is filled in.
  // A wa.me link built from a placeholder opens a chat with nobody.
  const waNumber = (whatsapp?.value ?? '').replace(/[^0-9]/g, '');

  return (
    <>
      <PageHead
        eyebrow={str(head, 'eyebrow')}
        h1={str(head, 'h1')}
        h2={str(head, 'h2')}
        lead={str(head, 'lead')}
      />

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="split" style={{ alignItems: 'start' }}>
            <BriefForm services={services} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card rv" style={{ padding: '1.5rem' }}>
                <div className="eyebrow">Direct</div>
                <div className="kv" style={{ marginTop: '1rem' }}>
                  {rows.map((r) => (
                    <div key={r.k} style={{ display: 'contents' }}>
                      <dt>{r.k}</dt>
                      <dd>{r.v}</dd>
                    </div>
                  ))}
                </div>

                {waNumber ? (
                  <a
                    className="btn btn-red btn-full"
                    href={`https://wa.me/${waNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginTop: '1.1rem' }}
                  >
                    {str(details, 'waLabel', 'Message on WhatsApp →')}
                  </a>
                ) : (
                  <div style={{ fontSize: '.72rem', color: 'var(--dim)', marginTop: '1.1rem', textAlign: 'center' }}>
                    {str(details, 'waNote', 'Set your number in Settings and this button goes live.')}
                  </div>
                )}

                {/* The same marks as the footer. This row used to render
                    initials — "I S S AM T D F Y" — because it never called
                    SocialIcon, so the one page where somebody is deciding
                    whether to get in touch showed eight letters where the rest
                    of the site shows logos. */}
                {socials.length ? (
                  <div className="socials">
                    {socials.map((s) => (
                      <a
                        key={s.id} className="soc" href={s.href}
                        target="_blank" rel="noopener noreferrer"
                        title={s.label} aria-label={s.label}
                      >
                        <SocialIcon label={s.label} src={s.iconUrl} />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>

              {faqItems.length ? (
                <div className="card rv" style={{ padding: '1.5rem' }}>
                  <div className="eyebrow">{str(faq, 'eyebrow', 'Good to know')}</div>
                  <div style={{ marginTop: '1rem' }}>
                    <Faq items={faqItems} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

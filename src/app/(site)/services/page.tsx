import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Link from 'next/link';
import { getPage } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { PageHead } from '@/components/site/PageHead';
import { Faq, type FaqItem } from '@/components/site/Faq';
import { ServiceCards, type ServiceView } from '@/components/site/ServiceCards';

type Values = Record<string, unknown>;
const str = (v: Values, k: string, fallback = '') =>
  typeof v[k] === 'string' ? (v[k] as string) : fallback;
const list = <T,>(v: Values, k: string): T[] => (Array.isArray(v[k]) ? (v[k] as T[]) : []);

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata('services');
}

export default async function ServicesPage() {
  const [page, services] = await Promise.all([
    getPage('services'),
    prisma.service.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      include: { tiers: { orderBy: { sortOrder: 'asc' } } },
    }),
  ]);
  if (!page) return null;

  const sec = (key: string): Values =>
    (page.sections.find((s) => s.key === key)?.values ?? {}) as Values;

  const head = sec('head');
  const proof = sec('proof');
  const faq = sec('faq');

  // Trimmed to exactly what the client component renders — no point shipping
  // columns the browser never reads.
  const view: ServiceView[] = services.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    tagline: s.tagline,
    icon: s.icon,
    audience: s.audience,
    included: s.included,
    required: s.required,
    deliveryDays: s.deliveryDays,
    revisions: s.revisions,
    tiers: s.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      priceBdt: t.priceBdt,
      description: t.description,
      descriptionBn: t.descriptionBn,
      recommended: t.recommended,
    })),
  }));

  const faqItems = list<{ q?: string; a?: string }>(faq, 'items')
    .filter((x): x is FaqItem => Boolean(x.q && x.a));

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
          <ServiceCards services={view} />

          {str(proof, 'h1') ? (
            <>
              <div className="hairline" style={{ margin: '3.4rem 0 2.6rem' }} />
              <div className="cta rv">
                <div className="cta-in">
                  <div className="eyebrow" style={{ justifyContent: 'center' }}>{str(proof, 'eyebrow')}</div>
                  <h2 className="display">{str(proof, 'h1')}</h2>
                  <p className="lead" style={{ textAlign: 'center' }}>{str(proof, 'body')}</p>
                  {str(proof, 'btn') ? (
                    <Link href="/portfolio" className="btn btn-red">{str(proof, 'btn')}</Link>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          {faqItems.length ? (
            <>
              <div className="hairline" style={{ margin: '3.4rem 0 2.6rem' }} />
              <div className="sec-head rv-l">
                <div className="eyebrow">{str(faq, 'eyebrow')}</div>
                <h2 className="display" style={{ marginTop: '1rem' }}>{str(faq, 'h1')}</h2>
              </div>
              <Faq items={faqItems} />
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}

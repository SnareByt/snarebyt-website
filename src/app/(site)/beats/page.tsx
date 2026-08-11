import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { paymentsConfigured } from '@/lib/sslcommerz';
import { seedFrom } from '@/lib/cover-art';
import { PageHead } from '@/components/site/PageHead';
import { BeatStore, type BeatView, type LicenceView } from '@/components/site/BeatStore';

/**
 * BEATS — the store.
 *
 * Only PUBLISHED and SOLD_EXCLUSIVE beats are listed. Drafts never appear,
 * and a beat cannot reach PUBLISHED without a tagged preview and an untagged
 * MP3, so nothing purchasable can exist without something to deliver.
 *
 * A sold exclusive stays visible on purpose: pulling it entirely would erase
 * the record that backs the buyer's licence.
 */

type Values = Record<string, unknown>;
const str = (v: Values, k: string, fallback = '') =>
  typeof v[k] === 'string' ? (v[k] as string) : fallback;

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata('beats');
}

export default async function BeatsPage() {
  const [page, beats, tiers] = await Promise.all([
    getPage('beats'),
    prisma.beat.findMany({
      where: { status: { in: ['PUBLISHED', 'SOLD_EXCLUSIVE'] } },
      orderBy: [{ purchaseCount: 'desc' }, { publishedAt: 'desc' }],
    }),
    prisma.licenceTier.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  if (!page) return null;

  const sec = (key: string): Values =>
    (page.sections.find((s) => s.key === key)?.values ?? {}) as Values;

  const head = sec('head');
  const nonx = sec('nonx');
  const lic = sec('lic');

  const licences: LicenceView[] = tiers.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    nameBn: t.nameBn,
    multiplier: t.multiplier,
    filesLabel: t.filesLabel,
    filesLabelBn: t.filesLabelBn,
    terms: lines(t.termsMarkdown),
    termsBn: lines(t.termsMarkdownBn),
    isExclusive: t.isExclusive,
  }));

  const view: BeatView[] = beats.map((b) => ({
    id: b.id,
    slug: b.slug,
    title: b.title,
    genre: b.genre,
    mood: b.mood,
    bpm: b.bpm,
    musicalKey: b.musicalKey,
    tags: b.tags,
    basePriceBdt: b.basePriceBdt,
    exclusiveAvailable: b.exclusiveAvailable && b.status !== 'SOLD_EXCLUSIVE',
    soldExclusive: b.status === 'SOLD_EXCLUSIVE',
    coverUrl: b.coverKey ? `${process.env.R2_PUBLIC_BASE_URL}/${b.coverKey}` : null,
    seed: seedFrom(b.slug),
    purchaseCount: b.purchaseCount,
    publishedAt: b.publishedAt ? b.publishedAt.toISOString() : null,
    // previewKey is the TAGGED mp3 in the PUBLIC bucket. The untagged master,
    // WAV and stems live in the private bucket and never get a URL here.
    previewUrl: b.previewKey ? `${process.env.R2_PUBLIC_BASE_URL}/${b.previewKey}` : null,
  }));

  // Sample prices in the licensing section are quoted against a reference
  // beat, because tier prices are a multiple of each beat's own base price.
  const sampleBase = view.length ? view[0].basePriceBdt : 1500;

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
          <BeatStore beats={view} licences={licences} payable={paymentsConfigured()} />

          <div className="hairline" style={{ margin: '3.4rem 0 2.6rem' }} />

          <div className="sec-head">
            <div className="eyebrow">{str(lic, 'eyebrow')}</div>
            <h2 className="display" style={{ marginTop: '1rem' }}>{str(lic, 'h1')}</h2>
            <p className="lead">
              {str(lic, 'lead')}
              {str(lic, 'bnNote') ? (
                <span className="bn" style={{ display: 'block', marginTop: '.5rem', color: 'var(--muted)' }}>
                  {str(lic, 'bnNote')}
                </span>
              ) : null}
            </p>
          </div>

          {/* The single most misunderstood thing in a beat store, stated
              plainly in both languages before anyone reaches a price. */}
          {str(nonx, 'en') ? (
            <div className="nonx">
              <h4>{str(nonx, 'h1')}</h4>
              <p style={{ fontSize: '.9rem', color: '#DFDFE4', lineHeight: 1.7 }}>{str(nonx, 'en')}</p>
              <div className="bn-block">
                <span className="bn-tag">বাংলায়</span>
                <p className="bn" style={{ fontSize: '.95rem', color: '#DFDFE4' }}>{str(nonx, 'bn')}</p>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '.7rem', marginTop: '1.4rem' }}>
            {licences.map((l) => (
              <div className="lic" key={l.id} style={{ cursor: 'default' }}>
                <div className="lic-main">
                  <div className="lic-top">
                    <span className="lic-name">
                      {l.name}
                      <span className="bn" style={{ display: 'block', fontSize: '.8rem', fontWeight: 500, color: 'var(--muted)' }}>
                        {l.nameBn}
                      </span>
                    </span>
                    <span className="lic-price">
                      ৳{(Math.round((sampleBase * l.multiplier) / 50) * 50).toLocaleString('en-US')}
                    </span>
                  </div>
                  <div className="lic-files">{l.filesLabel}</div>
                  <div className="bn" style={{ fontSize: '.8rem', color: 'var(--dim)' }}>{l.filesLabelBn}</div>
                  <ul className="lic-terms">
                    {l.terms.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                  <div className="bn-block">
                    <span className="bn-tag">বাংলায়</span>
                    <ul className="bn-terms bn">
                      {l.termsBn.map((t) => <li key={t}>{t}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="notice" style={{ marginTop: '1.6rem' }}>
            <span>⚖</span>
            <span>
              <b>Lawyer review needed.</b> These licence terms are a working commercial draft
              written around how SnareByt actually operates. Before you take real payments, have a
              qualified music lawyer review the Exclusive Rights contract and the ownership clauses
              in particular.
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

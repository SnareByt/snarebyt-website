import Link from 'next/link';
import { Wordmark } from './Wordmark';
import { getNav } from '@/lib/content';
import { SocialIcon } from './SocialIcon';
import { prisma } from '@/lib/prisma';
import { LegalDialog } from './LegalDialog';

/** Two-letter badge for a social link, matching the prototype's pills. */
function initials(label: string) {
  return label.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

const LISTEN = ['Spotify', 'Apple Music', 'SoundCloud', 'TIDAL', 'Deezer'];

export async function SiteFooter() {
  // getNav already drops any link with an empty href, so an unfinished
  // profile (YouTube, currently) can never render as a dead icon.
  const [socials, services, legal] = await Promise.all([
    getNav('SOCIAL'),
    prisma.service.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, title: true },
      take: 5,
    }),
    // Whatever has actually been written. Nothing is hard-coded here, so a
    // link can never point at a page that does not exist.
    prisma.legalPage.findMany({ orderBy: { slug: 'asc' }, select: { slug: true, title: true } }),
  ]);

  const byLabel = new Map(socials.map((s) => [s.label, s.href]));
  const listen = LISTEN.filter((l) => byLabel.has(l));

  return (
    <footer>
      <div className="wrap">
        <div className="f-grid">
          <div className="f-col">
            <Link href="/" className="brand" style={{ marginBottom: '1.1rem' }}>
              <Wordmark idPrefix="wmFoot" large />
            </Link>
            <p className="lead" style={{ fontSize: '.88rem', maxWidth: '34ch' }}>
              Artist, producer and audio engineer building records and visuals for independent
              artists worldwide.
            </p>
            <div className="socials">
              {socials.map((s) => (
                <a
                  key={s.id}
                  className="soc"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.label}
                  aria-label={s.label}
                >
                  <SocialIcon label={s.label} />
                </a>
              ))}
            </div>
          </div>

          <div className="f-col">
            <h4>Listen</h4>
            {listen.map((l) => (
              <a key={l} href={byLabel.get(l)} target="_blank" rel="noopener noreferrer">
                {l} ↗
              </a>
            ))}
          </div>

          <div className="f-col">
            <h4>Services</h4>
            {services.map((s) => (
              <Link key={s.slug} href="/services">{s.title}</Link>
            ))}
          </div>

          <div className="f-col">
            <h4>Legal</h4>
            {/* Only pages that exist, and each opens in a panel rather than
                navigating away — see LegalDialog. A link to a page nobody has
                written is worse than no link. */}
            {legal.length
              ? <LegalDialog links={legal} />
              : <Link href="/contact">Ask about licensing</Link>}
          </div>
        </div>

        <div className="f-bot">
          <span>© {new Date().getFullYear()} SnareByt — Samir Islam, Dhaka. All rights reserved.</span>
          <nav>
            <Link href="/contact">hello@snarebyt.com</Link>
            <Link href="/beats">Licensing</Link>
            <Link href="/contact">Support</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

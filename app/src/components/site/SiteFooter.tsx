import Link from 'next/link';
import { Wordmark } from './Wordmark';
import { getNav } from '@/lib/content';
import { prisma } from '@/lib/prisma';

/** Two-letter badge for a social link, matching the prototype's pills. */
function initials(label: string) {
  return label.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

const LISTEN = ['Spotify', 'Apple Music', 'SoundCloud', 'TIDAL', 'Deezer'];

export async function SiteFooter() {
  // getNav already drops any link with an empty href, so an unfinished
  // profile (YouTube, currently) can never render as a dead icon.
  const [socials, services] = await Promise.all([
    getNav('SOCIAL'),
    prisma.service.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, title: true },
      take: 5,
    }),
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
                >
                  {initials(s.label)}
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
            {/* Legal pages are Phase 7. Until they exist these point at contact
                rather than at URLs that would 404. */}
            <Link href="/contact">Beat Licensing Agreement</Link>
            <Link href="/contact">Terms &amp; Conditions</Link>
            <Link href="/contact">Privacy Policy</Link>
            <Link href="/contact">Refund Policy</Link>
            <Link href="/contact">Cookie Policy</Link>
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

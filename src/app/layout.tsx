import type { Metadata } from 'next';
import {
  Syne, Archivo, Inter, Instrument_Serif, Hind_Siliguri, JetBrains_Mono,
} from 'next/font/google';
import './globals.css';

/**
 * The five typefaces of the approved design, plus the admin's mono.
 *
 * These were specified from the start — Syne carries every headline and the
 * wordmark — but nothing ever loaded them, so the whole site has been
 * rendering in system fallbacks since launch. That one omission is most of
 * the distance between the approved design and what visitors actually saw.
 *
 * next/font self-hosts the files at build time: no request to Google at
 * runtime (so no CSP exception and no third party seeing visitors), and
 * size-adjusted fallback metrics so the swap does not shift the layout.
 */
const syne = Syne({ subsets: ['latin'], variable: '--font-syne', display: 'swap' });
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });
const bangla = Hind_Siliguri({ subsets: ['bengali', 'latin'], weight: ['400', '500', '600'], variable: '--font-bangla', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

const fontVars = [syne, archivo, inter, serif, bangla, mono]
  .map((f) => f.variable)
  .join(' ');

/**
 * metadataBase makes every canonical and Open Graph URL absolute against
 * APP_URL. Without it, a page shared from the preview would advertise the
 * .vercel.app address, and those links live on in people's messages long
 * after the domain switch.
 */
export const metadata: Metadata = {
  metadataBase: process.env.APP_URL ? new URL(process.env.APP_URL) : undefined,
  title: 'SnareByt',
  description: 'SnareByt — music producer and recording artist, Dhaka.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}

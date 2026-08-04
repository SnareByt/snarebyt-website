import type { Metadata } from 'next';
import './globals.css';

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
  // suppressHydrationWarning: the inline script below adds a class to <html>
  // before React loads, so the server markup and the client DOM differ by
  // design. Without it React reports a mismatch and discards the class.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs during head parsing, before the body exists, so the reveal
            animation is armed with no flash either way. If JavaScript is off
            or fails, this class never lands and every `.rv` element simply
            renders visible — see the Reveal section of globals.css. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js-rv')",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

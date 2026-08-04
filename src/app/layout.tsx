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
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
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

import type { Metadata } from 'next';
import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { config } from '@/datum.config';
import { Providers } from '@/components/Providers';

// The same three faces as datumlab.xyz: Geist for text and numbers, Geist Mono for addresses and code,
// Source Serif 4 for the one display line on a page (the question).
const sans = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-source-serif', display: 'swap', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: { default: config.title, template: `%s · ${config.title}` },
  description: config.description,
  icons: { icon: [{ url: '/brand/favicon-32.png', sizes: '32x32' }, { url: '/brand/favicon-64.png', sizes: '64x64' }], apple: '/brand/apple-touch-icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}

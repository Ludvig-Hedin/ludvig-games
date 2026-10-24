import type { Metadata, Viewport } from 'next';
// Self-hosted fonts (OFL-1.1, Fontsource): no requests to Google Fonts.
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource-variable/outfit/wght.css';
import './globals.css';

const url = 'https://color-clash.ludvighedin.com/';
const description = 'A color-matching card game for 2–6 players. Play bots, pass one device around, or open a private room for friends.';

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: 'Color Clash',
  description,
  alternates: { canonical: url },
  openGraph: { title: 'Color Clash', description, url, type: 'website' },
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#142420',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en">
    <head>
      <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "118fef9f1df14c9884feec8d298b6afd"}'></script>
    </head>
    <body>{children}</body>
  </html>;
}

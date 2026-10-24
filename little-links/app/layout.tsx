import type { Metadata, Viewport } from 'next';
import './globals.css';

const description = 'Mini golf in 3D. Eighteen holes, against bots, on one device or online with up to eight friends.';

export const metadata: Metadata = {
  title: 'Little Links',
  description,
  alternates: { canonical: 'https://little-links.ludvighedin.com/' },
  openGraph: { title: 'Little Links', description, url: 'https://little-links.ludvighedin.com/', type: 'website' },
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, viewportFit: 'cover', themeColor: '#f5f3e9' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "118fef9f1df14c9884feec8d298b6afd"}' />
      </head>
      <body>{children}</body>
    </html>
  );
}

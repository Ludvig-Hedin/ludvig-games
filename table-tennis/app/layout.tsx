import type { Metadata, Viewport } from 'next';
import './globals.css';

const description = '3D table tennis. Play the computer, a friend online, or two players on one keyboard.';

export const metadata: Metadata = {
  title: 'Table Tennis',
  description,
  metadataBase: new URL('https://table-tennis.ludvighedin.com'),
  alternates: { canonical: '/' },
  openGraph: { title: 'Table Tennis', description, url: 'https://table-tennis.ludvighedin.com/', type: 'website' },
  appleWebApp: { capable: true, title: 'Table Tennis', statusBarStyle: 'black-translucent' },
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, themeColor: '#141716', viewportFit: 'cover' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

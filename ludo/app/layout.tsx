import type { Metadata, Viewport } from "next";
import "./globals.css";

const url = "https://ludo.ludvighedin.com/";
const description = "Classic Ludo for 2–4 players. Play bots, share one screen, or open a private room for friends.";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: "Ludo",
  description,
  alternates: { canonical: url },
  openGraph: { title: "Ludo", description, url, type: "website" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "118fef9f1df14c9884feec8d298b6afd"}'></script>
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

const url = "https://gravity-arena.ludvighedin.com/";
const description = "Four in a row on a 3D 4 × 4 × 4 board or a classic 7 × 6 board. Play the computer, a friend on one device, or online.";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: "Gravity Arena",
  description,
  alternates: { canonical: url },
  openGraph: { title: "Gravity Arena", description, url, type: "website" },
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

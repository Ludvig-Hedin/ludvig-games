import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Chess",
  description: "Play chess against the computer, a friend on the same screen, or online.",
  metadataBase: new URL("https://chess.ludvighedin.com"),
  alternates: { canonical: "/" },
  openGraph: { title: "Chess", description: "Play chess against the computer, a friend on the same screen, or online.", url: "https://chess.ludvighedin.com/", type: "website" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

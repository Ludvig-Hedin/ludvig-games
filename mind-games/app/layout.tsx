import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: "Mind Games",
  description: "Rock, paper, scissors against the computer, a friend on the same screen, or online.",
  metadataBase: new URL("https://mind-games.ludvighedin.com"),
  alternates: { canonical: "/" },
  openGraph: { title: "Mind Games", description: "Rock, paper, scissors against the computer, a friend on the same screen, or online.", url: "https://mind-games.ludvighedin.com/", type: "website" },
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
      <body>{children}</body>
    </html>
  );
}

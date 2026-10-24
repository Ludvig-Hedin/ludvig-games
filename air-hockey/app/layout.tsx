import type { Metadata, Viewport } from "next";
import "./globals.css";

const description = "3D air hockey. Play the computer, a friend online, or two players on one screen.";

export const metadata: Metadata = {
  title: "Air Hockey",
  description,
  metadataBase: new URL("https://air-hockey.ludvighedin.com"),
  alternates: { canonical: "/" },
  openGraph: { title: "Air Hockey", description, url: "https://air-hockey.ludvighedin.com/", type: "website" },
  appleWebApp: { capable: true, title: "Air Hockey", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#10171d",
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

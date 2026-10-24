import type { Metadata, Viewport } from "next";
import "./globals.css";

const description =
  "Hänga gubbe för 2–10 vänner med hemliga ord, bluffar och sabotage. På svenska eller engelska.";

export const metadata: Metadata = {
  title: "Hängd",
  description,
  alternates: { canonical: "https://hangd.ludvighedin.com/" },
  openGraph: {
    title: "Hängd",
    description,
    url: "https://hangd.ludvighedin.com/",
    type: "website",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f5ef",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <head>
        <script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "118fef9f1df14c9884feec8d298b6afd"}'
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

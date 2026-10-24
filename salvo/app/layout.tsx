import type { Metadata, Viewport } from "next";
// Self-hosted fonts (OFL-1.1, Fontsource): no requests to Google Fonts.
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

const description = "Hide your fleet and sink theirs. Play the computer, a friend on one device, or online.";

export const metadata: Metadata = {
  title: "Salvo",
  description,
  metadataBase: new URL("https://salvo.ludvighedin.com"),
  openGraph: { title: "Salvo", description, url: "https://salvo.ludvighedin.com/", type: "website" },
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#07161d" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="canonical" href="https://salvo.ludvighedin.com/"/></head><body>{children}<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "118fef9f1df14c9884feec8d298b6afd"}'></script></body></html>;
}

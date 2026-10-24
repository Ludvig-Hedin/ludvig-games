import type { Metadata, Viewport } from "next";
import "./globals.css";

const description = "A beautifully simple game of tic tac toe. Play the computer, share a private room with a friend, or play side by side. No signup required.";

export const metadata: Metadata = {
  title: "OX",
  description,
  metadataBase: new URL("https://ox.ludvighedin.com"),
  alternates: { canonical: "/" },
  openGraph: { title: "OX", description, url: "https://ox.ludvighedin.com/", type: "website" },
  applicationName: "O/X",
  appleWebApp: { capable: true, title: "O/X", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f5f1",
};

const themeScript = `(()=>{try{const p=JSON.parse(localStorage.getItem('ox.preferences.v1')||'{}');const dark=p.theme==='dark'||(p.theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',dark?'#1e201e':'#f6f5f1')}catch{}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "118fef9f1df14c9884feec8d298b6afd"}'></script></body>
    </html>
  );
}

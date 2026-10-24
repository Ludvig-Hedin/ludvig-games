import type { NextConfig } from "next";

// Static export (24 Oct 2026, Workers Free move): the page is prerendered to
// plain HTML in dist/client and served as a static asset, so page views never
// run the Worker. The Worker only handles /api/*.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;

// Serves a game's static files the way Cloudflare's asset handling does for these games:
// html_handling "auto-trailing-slash" and not_found_handling "404-page". Miniflare can hold only one asset
// folder per instance, so the app serves the files itself and sends only the Worker routes (/api/*) on.
import fs from "node:fs";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".rsc": "text/x-component; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".webmanifest": "application/manifest+json",
};
const HIDDEN = new Set(["_headers", "_redirects", ".assetsignore"]);

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Returns { file, status } to serve, { redirect } to send, or null for nothing found. */
export function resolveAsset(root, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (rel.includes("\0")) return null;
  const abs = path.join(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  if (HIDDEN.has(path.basename(abs))) return null;

  if (rel.endsWith("/")) {
    if (isFile(path.join(abs, "index.html"))) return { file: path.join(abs, "index.html") };
    const trimmed = abs.slice(0, -1);
    if (rel !== "/" && isFile(trimmed + ".html")) return { redirect: urlPath.slice(0, -1) };
    return null;
  }
  if (isFile(abs)) {
    if (abs.endsWith(".html")) {
      const base = urlPath.slice(0, -".html".length);
      return { redirect: base.endsWith("/index") ? base.slice(0, -"index".length) : base };
    }
    return { file: abs };
  }
  if (isFile(abs + ".html")) return { file: abs + ".html" };
  if (isFile(path.join(abs, "index.html"))) return { redirect: urlPath + "/" };
  return null;
}

/** The nearest 404.html above the requested path, as Cloudflare's "404-page" handling does. */
export function notFoundPage(root, urlPath) {
  let dir = path.dirname(path.join(root, urlPath.endsWith("/") ? urlPath + "x" : urlPath));
  while (dir.startsWith(root)) {
    const page = path.join(dir, "404.html");
    if (isFile(page)) return page;
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return null;
}

export const contentType = (file) => TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";

/** Serves one static request. `transformHtml` adds the desktop script to pages. */
export function serveStatic(root, req, res, transformHtml) {
  const url = new URL(req.url, "http://local");
  const found = resolveAsset(root, url.pathname);
  if (found && found.redirect) {
    res.writeHead(307, { Location: found.redirect + url.search, "Cache-Control": "no-store" });
    res.end();
    return;
  }
  let file = found && found.file;
  let status = 200;
  if (!file) {
    file = notFoundPage(root, url.pathname);
    status = 404;
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
  }
  const type = contentType(file);
  const headers = {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": url.pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache",
  };
  if (type.startsWith("text/html")) {
    const html = transformHtml(fs.readFileSync(file, "utf8"));
    headers["Content-Length"] = Buffer.byteLength(html);
    res.writeHead(status, headers);
    res.end(req.method === "HEAD" ? undefined : html);
    return;
  }
  const size = fs.statSync(file).size;
  headers["Accept-Ranges"] = "bytes";
  const range = status === 200 && /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = end - start + 1;
    res.writeHead(206, headers);
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  headers["Content-Length"] = size;
  res.writeHead(status, headers);
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(file).pipe(res);
}

/** Wrangler's run_worker_first patterns ("/api/*") as a matcher. */
export function workerRoutes(patterns) {
  const res = patterns.map((p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"));
  return (pathname) => res.some((re) => re.test(pathname));
}

// Tiny static file server for local use: `pnpm serve` then open http://localhost:8080
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const port = Number(process.env.PORT || 8080);
/** @type {Record<string, string>} */
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".glb": "model/gltf-binary", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://x");
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (path === "" || path.endsWith("/")) path += "index.html";
  if (path.split(/[/\\]/).includes("..")) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`http://localhost:${port}/`));

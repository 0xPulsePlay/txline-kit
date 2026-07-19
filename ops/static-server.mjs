import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT);
const root = process.env.STATIC_ROOT;
if (!Number.isInteger(port) || port < 1 || !root) throw new Error("PORT and STATIC_ROOT are required");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"], [".png", "image/png"], [".woff2", "font/woff2"],
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
]);

// Resolves a request path to a file on disk. A path that names a real file
// is served as-is. A path that names a directory (e.g. "/story") falls back
// to that directory's own index.html if one exists -- standard static-host
// directory-index behavior, needed so per-route HTML shells (dist/story/
// index.html) with their own OG/Twitter meta actually get served instead of
// always falling through to the root SPA shell. Anything else falls back to
// the root index.html (the SPA's own client-side router then takes over).
function resolveFile(rootDir, pathname) {
  const normalizedRoot = normalize(rootDir);
  const candidate = normalize(join(rootDir, pathname));
  if (!candidate.startsWith(normalizedRoot)) return join(rootDir, "index.html");
  if (existsSync(candidate)) {
    const stats = statSync(candidate);
    if (stats.isFile()) return candidate;
    if (stats.isDirectory()) {
      const dirIndex = join(candidate, "index.html");
      if (existsSync(dirIndex) && statSync(dirIndex).isFile()) return dirIndex;
    }
  }
  return join(rootDir, "index.html");
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const file = resolveFile(root, pathname);
  response.setHeader("Content-Type", contentTypes.get(extname(file)) ?? "application/octet-stream");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Cache-Control", file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable");
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => process.stdout.write(`serving ${root} on 127.0.0.1:${port}\n`));

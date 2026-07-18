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
]);

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const candidate = normalize(join(root, pathname));
  const file = candidate.startsWith(normalize(root)) && existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : join(root, "index.html");
  response.setHeader("Content-Type", contentTypes.get(extname(file)) ?? "application/octet-stream");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Cache-Control", file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable");
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => process.stdout.write(`serving ${root} on 127.0.0.1:${port}\n`));

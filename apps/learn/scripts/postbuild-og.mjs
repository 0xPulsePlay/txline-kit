// Stamps route-specific HTML shells so social crawlers (and curl) hitting
// https://txline-kit.claude.do/story or /feedback get distinct Open Graph /
// Twitter Card tags instead of the homepage's. The app is a client-side-
// routed SPA (one JS/CSS bundle for every route), so this script clones the
// built dist/index.html into dist/<route>/index.html and swaps only the
// <head> meta that differs -- title/description/og:*/twitter:* -- leaving
// every asset reference (script/link tags, which use content-hashed
// absolute paths like /assets/index-xxxx.js) untouched and shared across
// every shell.
//
// ops/static-server.mjs resolves a request for a directory to that
// directory's index.html (see resolveFile()), so a bare GET /story or
// /feedback is served that route's dist/<route>/index.html directly --
// confirmed by curl against the deployed release, not just assumed.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, "..", "dist");
const indexPath = join(distDir, "index.html");

if (!existsSync(indexPath)) {
  throw new Error(`postbuild-og: ${indexPath} not found -- run "vite build" first`);
}

const home = readFileSync(indexPath, "utf8");

function stampRoute(route, replacements) {
  let stamped = home;
  for (const [from, to] of replacements) {
    if (!stamped.includes(from)) {
      throw new Error(`postbuild-og: expected marker not found in dist/index.html: ${from}`);
    }
    stamped = stamped.replace(from, to);
  }
  const routeDir = join(distDir, route);
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "index.html"), stamped);
  console.log(`postbuild-og: wrote dist/${route}/index.html with ${route}-specific OG/Twitter meta`);
}

stampRoute("story", [
  [
    "<title>TxLINE Kit · Proofs you can inspect</title>",
    "<title>TxLINE Kit · The Story</title>",
  ],
  [
    '<meta property="og:url" content="https://txline-kit.claude.do/" />',
    '<meta property="og:url" content="https://txline-kit.claude.do/story" />',
  ],
  [
    '<meta property="og:title" content="TxLINE Kit · Proofs you can inspect" />',
    '<meta property="og:title" content="A live World Cup feed, turned into a Solana settlement you can inspect." />',
  ],
  [
    '<meta property="og:description" content="TxLINE Kit turns live sports data into deterministic replay, typed predicates, inspectable Merkle receipts, and proof-settled Solana transactions." />',
    '<meta property="og:description" content="TxLINE Kit is a typed integration layer that takes a live sports-data feed all the way to a proof-settled Solana transaction -- deterministic replay, inspectable Merkle receipts, and a Rust CPI crate." />',
  ],
  [
    '<meta property="og:image" content="https://txline-kit.claude.do/og/home.jpg" />',
    '<meta property="og:image" content="https://txline-kit.claude.do/og/story.jpg" />',
  ],
  [
    '<meta name="twitter:title" content="TxLINE Kit · Proofs you can inspect" />',
    '<meta name="twitter:title" content="A live World Cup feed, turned into a Solana settlement you can inspect." />',
  ],
  [
    '<meta name="twitter:description" content="TxLINE Kit turns live sports data into deterministic replay, typed predicates, inspectable Merkle receipts, and proof-settled Solana transactions." />',
    '<meta name="twitter:description" content="TxLINE Kit is a typed integration layer that takes a live sports-data feed all the way to a proof-settled Solana transaction -- deterministic replay, inspectable Merkle receipts, and a Rust CPI crate." />',
  ],
  [
    '<meta name="twitter:image" content="https://txline-kit.claude.do/og/home.jpg" />',
    '<meta name="twitter:image" content="https://txline-kit.claude.do/og/story.jpg" />',
  ],
]);

stampRoute("feedback", [
  [
    "<title>TxLINE Kit · Proofs you can inspect</title>",
    "<title>TxLINE Kit · API feedback</title>",
  ],
  [
    '<meta property="og:url" content="https://txline-kit.claude.do/" />',
    '<meta property="og:url" content="https://txline-kit.claude.do/feedback" />',
  ],
  [
    '<meta property="og:title" content="TxLINE Kit · Proofs you can inspect" />',
    '<meta property="og:title" content="TxLINE / TxODDS API feedback, from building this SDK." />',
  ],
  [
    '<meta property="og:description" content="TxLINE Kit turns live sports data into deterministic replay, typed predicates, inspectable Merkle receipts, and proof-settled Solana transactions." />',
    '<meta property="og:description" content="GameState lags reality, StatusId + Clock is the real live signal, SuperOddsType blends market periods silently -- six integration gotchas we hit building txline-kit, and why an SDK should absorb them." />',
  ],
  // Reuses the existing homepage OG image -- no dedicated /feedback image
  // asset exists yet, and inventing one is out of scope for this page.
  [
    '<meta name="twitter:title" content="TxLINE Kit · Proofs you can inspect" />',
    '<meta name="twitter:title" content="TxLINE / TxODDS API feedback, from building this SDK." />',
  ],
  [
    '<meta name="twitter:description" content="TxLINE Kit turns live sports data into deterministic replay, typed predicates, inspectable Merkle receipts, and proof-settled Solana transactions." />',
    '<meta name="twitter:description" content="GameState lags reality, StatusId + Clock is the real live signal, SuperOddsType blends market periods silently -- six integration gotchas we hit building txline-kit, and why an SDK should absorb them." />',
  ],
]);

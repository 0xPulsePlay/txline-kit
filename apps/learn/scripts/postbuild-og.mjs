// Stamps a /story-specific HTML shell so social crawlers hitting
// https://txline-kit.claude.do/story get distinct Open Graph / Twitter Card
// tags instead of the homepage's. The app is a client-side-routed SPA (one
// JS/CSS bundle for both "/" and "/story"), so this script clones the built
// dist/index.html into dist/story/index.html and swaps only the <head> meta
// that differs -- title/description/og:*/twitter:* -- leaving every asset
// reference (script/link tags, which use content-hashed absolute paths like
// /assets/index-xxxx.js) untouched and shared between both files.
//
// ops/static-server.mjs resolves a request for a directory to that
// directory's index.html (see resolveFile()), so a bare GET /story is served
// dist/story/index.html directly -- confirmed by curl against the deployed
// release, not just assumed.
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

const replacements = [
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
];

let story = home;
for (const [from, to] of replacements) {
  if (!story.includes(from)) {
    throw new Error(`postbuild-og: expected marker not found in dist/index.html: ${from}`);
  }
  story = story.replace(from, to);
}

const storyDir = join(distDir, "story");
mkdirSync(storyDir, { recursive: true });
writeFileSync(join(storyDir, "index.html"), story);
console.log("postbuild-og: wrote dist/story/index.html with story-specific OG/Twitter meta");

import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const phase = process.argv.slice(2).find((value) => /^\d+$/.test(value)) ?? "0";
const root = resolve(`proof/phase-${phase}`);
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const read = async (name) => {
  try { return await readFile(join(root, name), "utf8"); } catch { return "Not yet recorded."; }
};
const acceptance = await read("README.md");
const uat = await read("UAT.md");
const gateStatus = /\bBLOCKED\b/.test(acceptance) ? "PARTIAL / BLOCKED" : "GATE EVIDENCE";
const screenshotDir = join(root, "screenshots");
let images = [];
try {
  images = (await readdir(screenshotDir)).filter((name) => /\.(png|webp|jpe?g)$/i.test(name)).sort();
} catch {}
const mime = (name) => extname(name).toLowerCase() === ".webp" ? "image/webp" : extname(name).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
const gallery = (await Promise.all(images.map(async (name) => {
  const bytes = await readFile(join(screenshotDir, name));
  const data = bytes.toString("base64");
  const label = escape(basename(name, extname(name)).replaceAll("-", " "));
  return `<figure><a href="data:${mime(name)};base64,${data}"><img src="data:${mime(name)};base64,${data}" alt="${label} screenshot"></a><figcaption>${escape(name)}</figcaption></figure>`;
}))).join("\n");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TxLINE Kit · Phase ${escape(phase)} proof</title><style>
:root{color-scheme:dark;--bg:#081012;--panel:#101b1d;--line:#294044;--ink:#edf8f4;--muted:#9db4b0;--cyan:#4ce2ce;--gold:#f2bd65}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 78% 0,#17383c 0,transparent 34rem),var(--bg);color:var(--ink);font:15px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}main{width:min(1180px,calc(100% - 32px));margin:auto;padding:64px 0 100px}header{border-top:1px solid var(--cyan);padding:24px 0 42px;display:grid;grid-template-columns:1fr auto;gap:20px}h1{font:clamp(38px,7vw,86px)/.95 Georgia,serif;margin:10px 0;letter-spacing:-.05em}h2{font:30px/1.1 Georgia,serif;margin:0 0 18px}.eyebrow,figcaption{color:var(--cyan);font-size:11px;text-transform:uppercase;letter-spacing:.17em}.status{align-self:start;border:1px solid var(--gold);color:var(--gold);padding:8px 12px}section{background:linear-gradient(145deg,#122023,#0d1618);border:1px solid var(--line);padding:24px;margin:16px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;color:var(--muted)}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.gallery figure{margin:0;border:1px solid var(--line);background:#05090a;padding:10px}.gallery img{display:block;width:100%;height:auto}figcaption{padding:10px 4px 2px}@media(max-width:700px){main{width:min(100% - 20px,1180px);padding-top:30px}header{grid-template-columns:1fr}.gallery{grid-template-columns:1fr}section{padding:16px}h1{font-size:44px}}
</style></head><body><main><header><div><div class="eyebrow">0xPulsePlay / TxLINE Kit / Evidence ledger</div><h1>Phase ${escape(phase)} proof</h1><p>Deterministic implementation evidence, UAT findings, and responsive visual inspection.</p></div><div class="status">${gateStatus}</div></header><section><h2>Acceptance record</h2><pre>${escape(acceptance)}</pre></section><section><h2>Human-simulated UAT</h2><pre>${escape(uat)}</pre></section><section><h2>Screenshot matrix</h2><div class="gallery">${gallery || "<p>No screenshots captured yet.</p>"}</div></section></main></body></html>`;
await writeFile(join(root, "index.html"), html);
console.log(join(root, "index.html"));

import { readFileSync } from "node:fs";

const purpose = process.argv[2];
if (!purpose) throw new Error("Usage: node scripts/declared-port.mjs <purpose>");
const source = readFileSync(new URL("../.world/ports.yml", import.meta.url), "utf8");
const escaped = purpose.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const match = source.match(new RegExp(`- name: ${escaped}\\n(?:[ \\t].*\\n)*?[ \\t]+canonical: ([0-9]+)`));
if (!match) throw new Error(`No canonical port declared for ${purpose}`);
console.log(match[1]);

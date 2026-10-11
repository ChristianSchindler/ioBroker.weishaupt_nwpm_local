#!/usr/bin/env node
// Apply a new version + changelog to package.json and io-package.json.
// Usage: node scripts/set-version.mjs <x.y.z> "<changelog>"
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
const changelog = (process.argv[3] || "").trim() || `v${version}`;

if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
    console.error("Version must look like 1.2.3.");
    process.exit(1);
}

// package.json
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = version;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

// io-package.json (version + prepend news, keep the latest 7 entries)
const io = JSON.parse(readFileSync("io-package.json", "utf8"));
io.common.version = version;
const news = { [version]: { en: changelog, de: changelog } };
let kept = 1;
for (const key of Object.keys(io.common.news || {})) {
    if (key === version) continue;
    if (kept++ >= 7) break;
    news[key] = io.common.news[key];
}
io.common.news = news;
writeFileSync("io-package.json", JSON.stringify(io, null, 2) + "\n");

console.log(`Set version ${version}`);

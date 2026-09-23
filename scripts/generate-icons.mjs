// Regenerates the PWA's icons from public/logo.svg (the canonical mark, and
// also the general-purpose brand asset). Run after editing that SVG:
//
//   npm run generate:icons
//
// Uses sharp, which is already present as a Next.js transitive dependency
// rather than being added to package.json for this — the outputs are
// committed PNGs, so this only needs to run when the mark itself changes,
// and a missing sharp here can't break the app build. If it ever does go
// missing, `npm i -D sharp` and re-run.
//
// Why PNGs at all when the source is an SVG: Chrome accepts SVG in a
// manifest, but iOS apple-touch-icon does not, and Android adaptive icons
// are more reliable as raster. See public/manifest.json.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The master lives at public/logo.svg, NOT public/icon.svg, deliberately:
// app/icon.svg (written at the bottom of this script) is a Next.js metadata
// route that Next serves at /icon.svg, so a public/icon.svg would collide
// with it at the same URL — two different SVGs claiming one path.
const svg = await readFile(path.join(root, "public/logo.svg"), "utf8");

// iOS masks the apple-touch-icon itself and renders transparent corners as
// black, so that one variant gets square corners (rx=0) and a fully opaque
// field instead of the rounded card the other sizes use.
const squareSvg = svg.replace('rx="114"', 'rx="0"');

// A favicon is never mask-cropped, so it doesn't need the maskable safe-zone
// inset the PWA icons are built around — at 16-32px that inset just makes
// the mark read small in a browser tab. Same single source, scaled up.
const faviconSvg = svg.replace("scale(0.92)", "scale(1.1)");

const rasterTargets = [
  { file: "public/icon-192.png", size: 192, source: svg },
  { file: "public/icon-512.png", size: 512, source: svg },
  { file: "app/apple-icon.png", size: 180, source: squareSvg },
];

for (const { file, size, source } of rasterTargets) {
  const png = await sharp(Buffer.from(source)).resize(size, size).png().toBuffer();
  await writeFile(path.join(root, file), png);
  console.log(`wrote ${file} (${size}x${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}

// Next.js App Router serves app/icon.svg as the favicon automatically.
await writeFile(path.join(root, "app/icon.svg"), faviconSvg);
console.log("wrote app/icon.svg (favicon variant, tighter crop)");

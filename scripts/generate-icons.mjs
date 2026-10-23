// Renders the PWA and touch icons from public/icons/icon.svg. Run with `pnpm icons`.
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("public/icons/icon.svg");
// Maskable icons keep their content in the inner 80% (the safe zone).
const maskable = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#14181d"/><g transform="translate(8 8)">${svg
    .toString()
    .replace(/^<svg[^>]*>|<\/svg>\s*$/g, "")}</g></svg>`,
);

const outputs = [
  [svg, 192, "public/icons/icon-192.png"],
  [svg, 512, "public/icons/icon-512.png"],
  [svg, 180, "public/icons/apple-touch-icon.png"],
  [maskable, 512, "public/icons/maskable-512.png"],
];
for (const [input, size, file] of outputs) {
  await sharp(input, { density: 300 }).resize(size, size).png().toFile(file);
  console.log(file);
}

import { stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const assets = [
  ["docs/source-assets/backgrounds/hike-pixel-summit-v1.png", "public/backgrounds/hike-pixel-summit-v1.webp", 86],
  ["docs/source-assets/backgrounds/swim-pixel-depth.png", "public/backgrounds/swim-pixel-depth.webp", 86],
  ["docs/source-assets/backgrounds/fish-pixel-lake-v1.png", "public/backgrounds/fish-pixel-lake-v1.webp", 86],
  ["docs/source-assets/characters/evolution/mori-evolution-v1.png", "public/characters/evolution/mori-evolution-v1.webp", 92],
  ["docs/source-assets/characters/evolution/naru-evolution-v1.png", "public/characters/evolution/naru-evolution-v1.webp", 92],
  ["docs/source-assets/characters/evolution/bori-evolution-v1.png", "public/characters/evolution/bori-evolution-v1.webp", 92],
  ["docs/source-assets/characters/momo-hiking.png", "public/characters/momo-hiking.webp", 90],
  ["docs/source-assets/characters/podo-swimming.png", "public/characters/podo-swimming.webp", 90],
  ["docs/source-assets/characters/bori-fishing.png", "public/characters/bori-fishing.webp", 90],
  ["docs/source-assets/characters/mori-rest.png", "public/characters/mori-rest.webp", 90],
  ["docs/source-assets/characters/naru-rest.png", "public/characters/naru-rest.webp", 90],
  ["docs/source-assets/characters/bori-rest.png", "public/characters/bori-rest.webp", 90],
];

let sourceBytes = 0;
let outputBytes = 0;
for (const [source, output, quality] of assets) {
  await sharp(path.resolve(source)).webp({ effort: 6, quality }).toFile(path.resolve(output));
  const [before, after] = await Promise.all([stat(source), stat(output)]);
  sourceBytes += before.size;
  outputBytes += after.size;
  process.stdout.write(`${source} -> ${output} (${Math.round(after.size / 1024)} KiB)\n`);
}
const mark = path.resolve("public/brand/focus-quest-mark.png");
await sharp(mark).resize(192, 192, { fit: "contain" }).png({ compressionLevel: 9 })
  .toFile(path.resolve("public/brand/focus-quest-192.png"));
await sharp(mark).resize(512, 512, { fit: "contain" }).png({ compressionLevel: 9 })
  .toFile(path.resolve("public/brand/focus-quest-512.png"));
await sharp(mark)
  .resize(390, 390, { fit: "contain" })
  .extend({ top: 61, bottom: 61, left: 61, right: 61, background: "#160f1f" })
  .png({ compressionLevel: 9 })
  .toFile(path.resolve("public/brand/focus-quest-maskable-512.png"));
process.stdout.write(`Reduced active asset candidates by ${Math.round((1 - outputBytes / sourceBytes) * 100)}% without deleting originals.\n`);

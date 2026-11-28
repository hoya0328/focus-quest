import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const destination = new URL("public/previews/", root);
const scenes = [
  ["hike", "hike-pixel-summit-v1", "mori-evolution-v1"],
  ["swim", "swim-pixel-depth", "naru-evolution-v1"],
  ["fish", "fish-pixel-lake-v1", "bori-evolution-v1"],
];
const inputs = [
  ["public/brand/focus-quest-logo.png", "wordmark.webp", 528, 92],
  ...scenes.flatMap(([id, landscape, companion]) => [
    [`docs/source-assets/backgrounds/${landscape}.png`, `${id}-landscape.webp`, 640, 82],
    [`docs/source-assets/backgrounds/${landscape}.png`, `${id}-landscape-small.webp`, 384, 80],
    [`docs/source-assets/characters/evolution/${companion}.png`, `${id}-companion.webp`, 672, 83],
  ]),
];

// Generate menu-sized renditions without overwriting any in-scene art or PWA icons.
await mkdir(destination, { recursive: true });
for (const [source, name, width, quality] of inputs) {
  const output = new URL(name, destination);
  await sharp(fileURLToPath(new URL(source, root)))
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, alphaQuality: 100, effort: 6 })
    .toFile(fileURLToPath(output));
  const { size } = await stat(output);
  console.log(`${name}: ${size} bytes`);
}

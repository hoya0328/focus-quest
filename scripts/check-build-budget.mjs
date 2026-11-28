import { readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";

const root = process.cwd();
const clientRoot = join(root, "dist", "client");
const chunkRoot = join(clientRoot, "_next", "static", "chunks");
const styleRoot = join(clientRoot, "_next", "static", "css");
const publicRoot = join(root, "public");
const limits = {
  largestClientScript: 1_250_000,
  largestPublicImage: 2_600_000,
  mobileEntryPreviews: 260_000,
  desktopEntryPreviews: 370_000,
  // Aggregate across all routes: privacy + operator CSS are separate chunks.
  // The operator route adds ~6.3 KB; image and JS budgets stay unchanged.
  totalClientCss: 240_000,
  totalClientScripts: 2_600_000,
};

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const [chunkFiles, styleFiles, publicFiles] = await Promise.all([
  filesBelow(chunkRoot),
  filesBelow(styleRoot),
  filesBelow(publicRoot),
]);
const scripts = chunkFiles.filter((file) => [".js", ".mjs"].includes(extname(file)));
const styles = styleFiles.filter((file) => extname(file) === ".css");
const images = publicFiles.filter((file) =>
  [".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"].includes(extname(file).toLowerCase()),
);

async function measured(files) {
  return Promise.all(
    files.map(async (file) => ({ file, size: (await stat(file)).size })),
  );
}

const [scriptSizes, styleSizes, imageSizes] = await Promise.all([
  measured(scripts),
  measured(styles),
  measured(images),
]);
const sum = (items) => items.reduce((total, item) => total + item.size, 0);
const largest = (items) =>
  items.reduce((current, item) => (item.size > current.size ? item : current), {
    file: "",
    size: 0,
  });

const entryPreviews = imageSizes.filter(({ file }) => dirname(file) === join(publicRoot, "previews"));
const metrics = {
  largestClientScript: largest(scriptSizes),
  largestPublicImage: largest(imageSizes),
  mobileEntryPreviews: sum(entryPreviews.filter(({ file }) => !basename(file).endsWith("-landscape.webp"))),
  desktopEntryPreviews: sum(entryPreviews.filter(({ file }) => !basename(file).endsWith("-landscape-small.webp"))),
  totalClientCss: sum(styleSizes),
  totalClientScripts: sum(scriptSizes),
};
const failures = [];

for (const [name, limit] of Object.entries(limits)) {
  const value = typeof metrics[name] === "number" ? metrics[name] : metrics[name].size;
  if (value > limit) failures.push(`${name}: ${value} > ${limit}`);
}

console.log(
  JSON.stringify(
    {
      ...metrics,
      largestClientScript: {
        file: relative(root, metrics.largestClientScript.file),
        size: metrics.largestClientScript.size,
      },
      largestPublicImage: {
        file: relative(root, metrics.largestPublicImage.file),
        size: metrics.largestPublicImage.size,
      },
      limits,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  console.error(`Build budget exceeded:\n${failures.join("\n")}`);
  process.exit(1);
}

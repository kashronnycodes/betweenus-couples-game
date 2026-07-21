import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourceDirectory = path.resolve("public/avatars");
const outputDirectory = path.join(sourceDirectory, "generated");
const widths = [96, 192, 384];

await mkdir(outputDirectory, { recursive: true });

for (const avatar of ["male", "female"]) {
  const source = path.join(sourceDirectory, `${avatar}.png`);
  for (const width of widths) {
    await sharp(source)
      .resize({ width, kernel: sharp.kernel.nearest, withoutEnlargement: true })
      .webp({ lossless: true, effort: 6 })
      .toFile(path.join(outputDirectory, `${avatar}-${width}.webp`));
  }
  await sharp(source)
    .resize({ width: 192, kernel: sharp.kernel.nearest, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, effort: 10 })
    .toFile(path.join(outputDirectory, `${avatar}-192.png`));
}

console.log(`Optimized avatars written to ${outputDirectory}`);

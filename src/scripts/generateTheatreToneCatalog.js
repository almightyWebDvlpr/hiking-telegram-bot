import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTheatreToneCatalog } from "../tone/buildTheatreToneCatalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const toneDir = path.resolve(__dirname, "../tone");
const sourcePath = path.join(toneDir, "sources/theatre_texts_dataset_merged.json");
const outputDir = path.join(toneDir, "generated");
const outputPath = path.join(outputDir, "theatre-catalog.json");

async function main() {
  const raw = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const catalog = buildTheatreToneCatalog(raw);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} with ${catalog.meta.entriesCount} entries`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

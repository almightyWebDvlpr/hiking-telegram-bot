import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTheatreToneCatalog } from "../tone/buildTheatreToneCatalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const toneDir = path.resolve(__dirname, "../tone");
const sourcePaths = [
  path.join(toneDir, "sources/theatre_texts_dataset_merged.json"),
  path.join(toneDir, "sources/selected_requested_files_combined.json")
];
const outputDir = path.join(toneDir, "generated");
const outputPath = path.join(outputDir, "theatre-catalog.json");

async function main() {
  const sources = [];

  for (const sourcePath of sourcePaths) {
    try {
      const raw = JSON.parse(await fs.readFile(sourcePath, "utf8"));
      sources.push(raw);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  const catalog = buildTheatreToneCatalog({ sources });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} with ${catalog.meta.entriesCount} entries`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesFile = path.join(__dirname, "curatedRoutes.json");

export const CURATED_ROUTES = JSON.parse(fs.readFileSync(routesFile, "utf8"));

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesFile = path.join(__dirname, "curatedRoutes.json");

const rawRoutes = JSON.parse(fs.readFileSync(routesFile, "utf8"));

function normalizeAliasVariant(value) {
  return String(value || "")
    .trim()
    .replaceAll(/\s+/g, " ")
    .replaceAll("’", "'")
    .replaceAll("`", "'");
}

function pushAliasVariant(target, value) {
  const normalized = normalizeAliasVariant(value);
  if (normalized) {
    target.add(normalized);
  }
}

function buildAliasVariants(values = []) {
  const variants = new Set();
  const prefixes = new Set();

  for (const value of values) {
    const normalized = normalizeAliasVariant(value).toLowerCase();
    const match = normalized.match(/^(гора|полонина|озеро|кпп|урочище|станція)\s+/i);
    if (match?.[1]) {
      prefixes.add(match[1].toLowerCase());
    }
  }

  for (const value of values) {
    const normalized = normalizeAliasVariant(value);
    if (!normalized) {
      continue;
    }

    pushAliasVariant(variants, normalized);
    pushAliasVariant(variants, normalized.replaceAll("'", "’"));
    pushAliasVariant(variants, normalized.replaceAll("’", "'"));

    const stripped = normalized
      .replace(/^(гора|полонина|озеро|кпп|урочище|станція|смт|село|місто)\s+/i, "")
      .trim();

    if (stripped && stripped !== normalized) {
      pushAliasVariant(variants, stripped);
      for (const prefix of prefixes) {
        pushAliasVariant(variants, `${prefix} ${stripped}`);
      }
    }
  }

  return [...variants];
}

function enrichEndpoint(endpoint = {}) {
  const aliases = buildAliasVariants([endpoint.label, ...(endpoint.aliases || [])]);
  return {
    ...endpoint,
    aliases
  };
}

function enrichRequestAlias(requestAlias = {}) {
  return {
    ...requestAlias,
    from: buildAliasVariants(requestAlias.from || []),
    to: buildAliasVariants(requestAlias.to || [])
  };
}

export const CURATED_ROUTES = rawRoutes.map((route) => ({
  ...route,
  from: enrichEndpoint(route.from),
  to: enrichEndpoint(route.to),
  requestAliases: (route.requestAliases || []).map(enrichRequestAlias)
}));

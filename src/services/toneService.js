import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const toneDir = path.resolve(__dirname, "../tone");
const lastRandomSelections = new Map();

function readToneFile(name, options = {}) {
  const { optional = false } = options;
  const filePath = path.join(toneDir, `${name}.json`);

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (optional && error?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

const toneDictionaries = {
  default: readToneFile("default"),
  drunk: readToneFile("drunk")
};
const tonePacks = {
  drunk: readToneFile("drunk-pack", { optional: true })
};

function resolveMode(mode = "default") {
  return mode === "drunk" ? "drunk" : "default";
}

function getDictionary(mode = "default") {
  return toneDictionaries[resolveMode(mode)] || toneDictionaries.default;
}

function getTonePack(mode = "default") {
  return tonePacks[resolveMode(mode)] || {};
}

function getNestedValue(source, key = "") {
  return String(key || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, part) => (value && value[part] !== undefined ? value[part] : undefined), source);
}

function interpolate(value, params = {}) {
  if (typeof value !== "string") {
    return value;
  }

  return value.replace(/\{([^}]+)\}/g, (_, token) => {
    const resolved = params[token.trim()];
    return resolved === undefined || resolved === null ? "" : String(resolved);
  });
}

function materialize(value, params = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => materialize(item, params));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, materialize(nestedValue, params)])
    );
  }

  return interpolate(value, params);
}

function collectArrayValues(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.trim());
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}

export function resolveTripToneMode(trip = null) {
  return trip?.tripModes?.alco === true ? "drunk" : "default";
}

export function resolveContextToneMode(ctx = null, groupService = null) {
  const userId = String(ctx?.from?.id || "");
  if (!userId || !groupService || typeof groupService.findGroupByMember !== "function") {
    return "default";
  }

  const trip = groupService.findGroupByMember(userId);
  return resolveTripToneMode(trip);
}

export function t(key, mode = "default", params = {}) {
  const resolvedMode = resolveMode(mode);
  const value = getNestedValue(getDictionary(resolvedMode), key);
  const fallbackValue = getNestedValue(toneDictionaries.default, key);
  const selected = value === undefined ? fallbackValue : value;
  return materialize(selected, params);
}

export function tPack(key, mode = "default", params = {}) {
  const resolvedMode = resolveMode(mode);
  const value = getNestedValue(getTonePack(resolvedMode), key);
  return materialize(value, params);
}

export function tPackFirst(key, mode = "default", params = {}) {
  const value = tPack(key, mode, params);
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return typeof value === "string" ? value : "";
}

export function tPackRandom(key, mode = "default", params = {}, memoryKey = key) {
  const values = tPack(key, mode, params);
  if (!Array.isArray(values) || !values.length) {
    return typeof values === "string" ? values : "";
  }

  if (values.length === 1) {
    lastRandomSelections.set(`pack:${memoryKey}`, values[0]);
    return values[0];
  }

  const previous = lastRandomSelections.get(`pack:${memoryKey}`);
  const pool = values.filter((item) => item !== previous);
  const next = pool[Math.floor(Math.random() * pool.length)] || values[0];
  lastRandomSelections.set(`pack:${memoryKey}`, next);
  return next;
}

export function tRandom(key, mode = "default", params = {}, memoryKey = key) {
  const values = t(key, mode, params);
  if (!Array.isArray(values) || !values.length) {
    return typeof values === "string" ? values : "";
  }

  if (values.length === 1) {
    lastRandomSelections.set(memoryKey, values[0]);
    return values[0];
  }

  const previous = lastRandomSelections.get(memoryKey);
  const pool = values.filter((item) => item !== previous);
  const next = pool[Math.floor(Math.random() * pool.length)] || values[0];
  lastRandomSelections.set(memoryKey, next);
  return next;
}

export function maybeQuip(context, mode = "default", params = {}, probability = null) {
  const resolvedMode = resolveMode(mode);
  const chance = typeof probability === "number"
    ? probability
    : resolvedMode === "drunk"
      ? 0.42
      : 0.12;

  if (Math.random() > chance) {
    return "";
  }

  if (resolvedMode !== "drunk") {
    return tRandom(`random_quips.${context}`, resolvedMode, params, `quip:${resolvedMode}:${context}`);
  }

  const packContextMap = {
    generic: [
      "registers.camp_truth.generic",
      "registers.fatalistic_soft.generic",
      "registers.street_burn.soft_react"
    ],
    trip: [
      "registers.fatalistic_soft.trip",
      "registers.absurd_high.welcome",
      "registers.camp_truth.generic"
    ],
    food: [
      "registers.camp_truth.food",
      "registers.fatalistic_soft.generic"
    ],
    route: [
      "registers.camp_truth.route",
      "registers.fatalistic_soft.trip"
    ],
    gear: [
      "registers.camp_truth.gear",
      "registers.fatalistic_soft.generic"
    ],
    people: [
      "registers.fatalistic_soft.people",
      "registers.camp_truth.generic"
    ],
    idle: [
      "registers.street_burn.idle"
    ],
    edit_loop: [
      "registers.street_burn.edit_loop"
    ]
  };

  const values = [
    ...collectArrayValues(t(`random_quips.${context}`, resolvedMode, params)),
    ...collectArrayValues(t("random_quips.generic", resolvedMode, params))
  ];

  for (const key of packContextMap[context] || []) {
    values.push(...collectArrayValues(tPack(key, resolvedMode, params)));
  }

  const uniqueValues = [...new Set(values.filter(Boolean))];
  if (!uniqueValues.length) {
    return "";
  }

  if (uniqueValues.length === 1) {
    lastRandomSelections.set(`quip:${resolvedMode}:${context}`, uniqueValues[0]);
    return uniqueValues[0];
  }

  const memoryKey = `quip:${resolvedMode}:${context}`;
  const previous = lastRandomSelections.get(memoryKey);
  const pool = uniqueValues.filter((item) => item !== previous);
  const next = pool[Math.floor(Math.random() * pool.length)] || uniqueValues[0];
  lastRandomSelections.set(memoryKey, next);
  return next;
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const toneDir = path.resolve(__dirname, "../tone");
const lastRandomSelections = new Map();

function readToneFile(name) {
  const filePath = path.join(toneDir, `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const toneDictionaries = {
  default: readToneFile("default"),
  drunk: readToneFile("drunk")
};
const tonePacks = {
  drunk: readToneFile("drunk-pack")
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
      ? 0.18
      : 0.12;

  if (Math.random() > chance) {
    return "";
  }

  return tRandom(`random_quips.${context}`, resolvedMode, params, `quip:${resolvedMode}:${context}`);
}

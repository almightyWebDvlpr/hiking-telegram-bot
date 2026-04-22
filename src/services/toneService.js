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
const legacyDrunkPack = readToneFile("drunk-pack", { optional: true });
const theatreToneCatalog = readToneFile("generated/theatre-catalog", { optional: true });
const tonePacks = {
  drunk: legacyDrunkPack
};

const theatreToneEntries = Array.isArray(theatreToneCatalog?.entries)
  ? theatreToneCatalog.entries
  : [];
const theatreToneIndexByScreen = new Map();
const toneSelectionHistory = new Map();

for (const entry of theatreToneEntries) {
  for (const screen of Array.isArray(entry?.screens) ? entry.screens : []) {
    if (!theatreToneIndexByScreen.has(screen)) {
      theatreToneIndexByScreen.set(screen, []);
    }
    theatreToneIndexByScreen.get(screen).push(entry);
  }
}

const INTENSITY_RANK = {
  low: 0,
  medium: 1,
  high: 2
};

const LEGACY_CONTEXT_TO_SCREEN = {
  generic: "trip_settings",
  trip: "trip_hub",
  people: "trip_members_list",
  route: "route_menu",
  food: "food_menu",
  gear: "gear_menu",
  idle: "idle_prompt",
  edit_loop: "edit_loop"
};

const SCREEN_TONE_POLICIES = {
  default: {
    maxLines: 1,
    bannerProbability: 0.55,
    quipProbability: 0.1,
    maxIntensity: "low",
    preferredTags: ["generic", "trip"],
    secondaryTags: ["logistics"],
    blockedTags: ["fatalistic", "complaint", "command", "negative", "decision"]
  },
  trip_hub: {
    maxLines: 1,
    bannerProbability: 0.42,
    quipProbability: 0.05,
    maxIntensity: "low",
    preferredTags: ["trip", "generic", "logistics"],
    secondaryTags: ["optimistic", "reaction"],
    blockedTags: ["fatalistic", "complaint", "command", "negative", "decision", "people", "route"]
  },
  trip_details: {
    maxLines: 1,
    bannerProbability: 0.35,
    quipProbability: 0.05,
    maxIntensity: "low",
    preferredTags: ["trip", "generic", "logistics"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "command", "negative", "decision"]
  },
  trip_history: {
    maxLines: 1,
    bannerProbability: 0.45,
    quipProbability: 0.08,
    maxIntensity: "medium",
    preferredTags: ["trip", "generic", "logistics"],
    secondaryTags: ["optimistic", "observational"],
    blockedTags: ["command"]
  },
  trip_settings: {
    maxLines: 1,
    bannerProbability: 0.28,
    quipProbability: 0.05,
    maxIntensity: "low",
    preferredTags: ["generic", "trip", "logistics"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  trip_mode: {
    maxLines: 1,
    bannerProbability: 0.5,
    quipProbability: 0.08,
    maxIntensity: "medium",
    preferredTags: ["food", "alcohol", "trip"],
    secondaryTags: ["generic", "observational"],
    blockedTags: ["fatalistic", "command"]
  },
  trip_drunk_mode: {
    maxLines: 1,
    bannerProbability: 0.56,
    quipProbability: 0.12,
    maxIntensity: "medium",
    preferredTags: ["alcohol", "food", "trip"],
    secondaryTags: ["route", "optimistic"],
    blockedTags: ["fatalistic", "command"]
  },
  trip_photos: {
    maxLines: 1,
    bannerProbability: 0.18,
    quipProbability: 0.03,
    maxIntensity: "low",
    preferredTags: ["generic", "trip", "people"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  trip_photo_album: {
    maxLines: 1,
    bannerProbability: 0.24,
    quipProbability: 0.05,
    maxIntensity: "low",
    preferredTags: ["people", "trip", "generic"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  trip_members_menu: {
    maxLines: 1,
    bannerProbability: 0.3,
    quipProbability: 0.08,
    maxIntensity: "low",
    preferredTags: ["people"],
    secondaryTags: ["generic", "trip"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  trip_members_list: {
    maxLines: 1,
    bannerProbability: 0.26,
    quipProbability: 0.06,
    maxIntensity: "low",
    preferredTags: ["people"],
    secondaryTags: ["generic", "trip"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  trip_member_card: {
    maxLines: 1,
    bannerProbability: 0.22,
    quipProbability: 0.05,
    maxIntensity: "low",
    preferredTags: ["people"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "negative", "command"]
  },
  trip_member_tickets: {
    maxLines: 1,
    bannerProbability: 0.14,
    quipProbability: 0.03,
    maxIntensity: "low",
    preferredTags: ["people", "logistics"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "negative", "command"]
  },
  route_menu: {
    maxLines: 1,
    bannerProbability: 0.38,
    quipProbability: 0.1,
    maxIntensity: "medium",
    preferredTags: ["route", "weather"],
    secondaryTags: ["trip", "observational"],
    blockedTags: ["fatalistic", "complaint"]
  },
  route_weather_picker: {
    maxLines: 1,
    bannerProbability: 0.22,
    quipProbability: 0.04,
    maxIntensity: "low",
    preferredTags: ["route", "weather"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  route_weather: {
    maxLines: 1,
    bannerProbability: 0.28,
    quipProbability: 0.05,
    maxIntensity: "medium",
    preferredTags: ["route", "weather"],
    secondaryTags: ["observational"],
    blockedTags: ["complaint", "command"]
  },
  gear_menu: {
    maxLines: 1,
    bannerProbability: 0.34,
    quipProbability: 0.08,
    maxIntensity: "medium",
    preferredTags: ["gear"],
    secondaryTags: ["generic", "observational"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  gear_accounting: {
    maxLines: 1,
    bannerProbability: 0.3,
    quipProbability: 0.06,
    maxIntensity: "medium",
    preferredTags: ["gear"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  gear_borrowed: {
    maxLines: 1,
    bannerProbability: 0.2,
    quipProbability: 0.05,
    maxIntensity: "low",
    preferredTags: ["gear"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  gear_loaned: {
    maxLines: 1,
    bannerProbability: 0.2,
    quipProbability: 0.05,
    maxIntensity: "low",
    preferredTags: ["gear"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  gear_backpack: {
    maxLines: 1,
    bannerProbability: 0.24,
    quipProbability: 0.05,
    maxIntensity: "low",
    preferredTags: ["gear"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  food_menu: {
    maxLines: 1,
    bannerProbability: 0.4,
    quipProbability: 0.08,
    maxIntensity: "medium",
    preferredTags: ["food", "alcohol"],
    secondaryTags: ["generic", "optimistic"],
    blockedTags: ["fatalistic", "command"]
  },
  food_list: {
    maxLines: 1,
    bannerProbability: 0.34,
    quipProbability: 0.06,
    maxIntensity: "medium",
    preferredTags: ["food", "alcohol"],
    secondaryTags: ["generic", "observational"],
    blockedTags: ["fatalistic", "command"]
  },
  expenses_menu: {
    maxLines: 1,
    bannerProbability: 0.18,
    quipProbability: 0.04,
    maxIntensity: "low",
    preferredTags: ["money", "logistics", "generic"],
    secondaryTags: ["food", "trip"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  expenses_list: {
    maxLines: 1,
    bannerProbability: 0.16,
    quipProbability: 0.04,
    maxIntensity: "low",
    preferredTags: ["money", "food", "logistics"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  idle_prompt: {
    maxLines: 1,
    bannerProbability: 0,
    quipProbability: 1,
    maxIntensity: "medium",
    preferredTags: ["question", "complaint"],
    secondaryTags: ["generic"],
    blockedTags: []
  },
  edit_loop: {
    maxLines: 1,
    bannerProbability: 0,
    quipProbability: 1,
    maxIntensity: "medium",
    preferredTags: ["question", "complaint", "decision"],
    secondaryTags: ["generic"],
    blockedTags: []
  }
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

function normalizeToneText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function getIntensityRank(value = "low") {
  return INTENSITY_RANK[value] ?? INTENSITY_RANK.low;
}

function mergeScreenPolicy(screen = "default") {
  return {
    ...SCREEN_TONE_POLICIES.default,
    ...(SCREEN_TONE_POLICIES[screen] || {})
  };
}

function getHistory(key = "") {
  if (!toneSelectionHistory.has(key)) {
    toneSelectionHistory.set(key, []);
  }
  return toneSelectionHistory.get(key);
}

function pushHistory(key = "", value = "", limit = 8) {
  if (!key || !value) {
    return;
  }

  const history = getHistory(key);
  history.push(value);
  if (history.length > limit) {
    history.splice(0, history.length - limit);
  }
}

function isOnCooldown(entry, normalizedText, screen, scopeKey, state = {}) {
  const buckets = [
    scopeKey ? `scope:${scopeKey}` : "",
    screen ? `screen:${screen}` : "",
    state?.tripId ? `trip:${state.tripId}` : ""
  ].filter(Boolean);

  for (const bucket of buckets) {
    if (getHistory(bucket).includes(normalizedText)) {
      return true;
    }
  }

  if (entry?.cooldownScope === "trip" && state?.tripId) {
    return getHistory(`trip:${state.tripId}`).includes(normalizedText);
  }

  return false;
}

function rememberToneSelection(entry, normalizedText, screen, scopeKey, state = {}) {
  const buckets = [
    scopeKey ? `scope:${scopeKey}` : "",
    screen ? `screen:${screen}` : ""
  ].filter(Boolean);

  for (const bucket of buckets) {
    pushHistory(bucket, normalizedText, 6);
  }

  if (entry?.cooldownScope === "trip" && state?.tripId) {
    pushHistory(`trip:${state.tripId}`, normalizedText, 10);
  }
}

function scoreToneEntry(entry, screen, delivery, policy, state = {}) {
  if (!Array.isArray(entry?.screens) || !entry.screens.includes(screen)) {
    return -1;
  }

  if (!Array.isArray(entry?.deliveries) || !entry.deliveries.includes(delivery)) {
    return -1;
  }

  if (getIntensityRank(entry?.intensity) > getIntensityRank(policy.maxIntensity)) {
    return -1;
  }

  const tags = Array.isArray(entry?.tags) ? entry.tags : [];
  if (policy.blockedTags.some((tag) => tags.includes(tag))) {
    return -1;
  }

  let score = 10;

  score += policy.preferredTags.reduce((sum, tag) => sum + (tags.includes(tag) ? 4 : 0), 0);
  score += policy.secondaryTags.reduce((sum, tag) => sum + (tags.includes(tag) ? 2 : 0), 0);

  if (delivery === "banner" && ["reaction", "observational", "optimistic"].includes(entry?.toneShape)) {
    score += 3;
  }
  if (delivery === "quip" && ["reaction", "question", "complaint"].includes(entry?.toneShape)) {
    score += 2;
  }

  if (state?.alcoholEmpty && tags.includes("alcohol")) {
    score += 4;
  }
  if (state?.alcoholCount > 0 && tags.includes("alcohol")) {
    score += 2;
  }
  if (state?.routeDifficulty === "висока" && (tags.includes("route") || tags.includes("weather"))) {
    score += 3;
  }
  if (state?.routeDifficulty === "середня" && (tags.includes("route") || tags.includes("weather"))) {
    score += 2;
  }
  if (state?.photoEmpty && screen === "trip_photo_album") {
    score += tags.includes("people") ? 2 : 0;
  }
  if (state?.membersCount > 1 && tags.includes("people")) {
    score += 1;
  }
  if (state?.foodEmpty && tags.includes("food")) {
    score += 2;
  }
  if (state?.gearEmpty && tags.includes("gear")) {
    score += 2;
  }

  if (entry?.intensity === "low") {
    score += 1;
  }

  return score;
}

export function pickToneLine({
  screen = "default",
  mode = "default",
  scopeKey = "",
  state = {},
  delivery = "banner",
  usedTexts = null
} = {}) {
  const resolvedMode = resolveMode(mode);
  if (resolvedMode !== "drunk") {
    return "";
  }

  const policy = mergeScreenPolicy(screen);
  const candidates = theatreToneIndexByScreen.get(screen) || [];
  if (!candidates.length) {
    return "";
  }

  const scored = candidates
    .map((entry, index) => {
      const normalizedText = normalizeToneText(entry?.text || "");
      if (!normalizedText) {
        return null;
      }

      if (usedTexts?.has(normalizedText) || isOnCooldown(entry, normalizedText, screen, scopeKey, state)) {
        return null;
      }

      const score = scoreToneEntry(entry, screen, delivery, policy, state);
      if (score < 0) {
        return null;
      }

      return { entry, normalizedText, score, index };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  if (!scored.length) {
    return "";
  }

  const topSlice = scored.slice(0, Math.min(6, scored.length));
  const picked = topSlice[Math.floor(Math.random() * topSlice.length)];
  if (!picked) {
    return "";
  }

  usedTexts?.add(picked.normalizedText);
  rememberToneSelection(picked.entry, picked.normalizedText, screen, scopeKey, state);
  return picked.entry.text;
}

export function buildToneBlock({
  screen = "default",
  mode = "default",
  scopeKey = "",
  state = {},
  maxLines = null,
  usedTexts = null
} = {}) {
  const resolvedMode = resolveMode(mode);
  if (resolvedMode !== "drunk") {
    return [];
  }

  const policy = mergeScreenPolicy(screen);
  const targetMaxLines = Math.max(0, Math.min(maxLines ?? policy.maxLines ?? 1, 2));
  if (!targetMaxLines) {
    return [];
  }

  const localUsed = usedTexts || new Set();
  const lines = [];

  if (policy.bannerProbability > 0 && Math.random() <= policy.bannerProbability) {
    const bannerLine = pickToneLine({
      screen,
      mode: resolvedMode,
      scopeKey: `${scopeKey}:banner`,
      state,
      delivery: "banner",
      usedTexts: localUsed
    });
    if (bannerLine) {
      lines.push(bannerLine);
    }
  }

  while (lines.length < targetMaxLines && policy.quipProbability > 0 && Math.random() <= policy.quipProbability) {
    const quipLine = pickToneLine({
      screen,
      mode: resolvedMode,
      scopeKey: `${scopeKey}:quip:${lines.length}`,
      state,
      delivery: lines.length === 0 ? "banner" : "quip",
      usedTexts: localUsed
    });

    if (!quipLine) {
      break;
    }

    lines.push(quipLine);
  }

  if (!lines.length) {
    const fallbackLine = pickToneLine({
      screen,
      mode: resolvedMode,
      scopeKey: `${scopeKey}:fallback`,
      state,
      delivery: "banner",
      usedTexts: localUsed
    });
    if (fallbackLine) {
      lines.push(fallbackLine);
    }
  }

  return lines.slice(0, targetMaxLines);
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
      ? 0.24
      : 0.12;

  if (Math.random() > chance) {
    return "";
  }

  if (resolvedMode !== "drunk") {
    return tRandom(`random_quips.${context}`, resolvedMode, params, `quip:${resolvedMode}:${context}`);
  }

  const screen = LEGACY_CONTEXT_TO_SCREEN[context] || SCREEN_TONE_POLICIES.default.screen || "trip_settings";
  return pickToneLine({
    screen,
    mode: resolvedMode,
    scopeKey: `legacy:${context}`,
    state: params?.state || {},
    delivery: "quip"
  });
}

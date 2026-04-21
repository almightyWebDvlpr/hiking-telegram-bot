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

const FILTERED_THEATRE_TERMS = [
  "жид",
  "жидів",
  "жиды",
  "підорас",
  "підораси",
  "пидарас",
  "кацап",
  "кацапізм",
  "кацапізма"
];

const THEATRE_CONTEXT_KEYWORDS = {
  trip: ["іттіть", "вперьод", "вперед", "прийшли", "питання", "розруха", "піздєц", "піздець", "контра"],
  route: ["іттіть", "прийшли", "вперьод", "вперед", "пагодка", "купатись", "дорог", "йти", "шлях", "ліс", "болото", "пустин"],
  food: ["канхвет", "тузік", "випить", "барі", "шампаньйол", "їсти", "жрать", "бздить", "кусн", "горіл", "пиво", "пити"],
  people: ["падлюки", "хлопці", "народ", "контра", "мовчите", "сцикун", "покидьк", "панство", "довольні"],
  gear: ["дрючок", "роялі", "рояль", "сраку", "простирадл", "укол", "пістолет", "меч", "реквізит", "світить", "фонарь"],
  generic: ["піздєц", "піздець", "розруха", "пагодка", "жизнь", "мовчать", "довольні", "питання", "облом"]
};

function normalizeTheatreText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isAllowedTheatreText(value = "") {
  const normalized = normalizeTheatreText(value).toLowerCase();
  return Boolean(normalized) && !FILTERED_THEATRE_TERMS.some((term) => normalized.includes(term));
}

function uniqueStrings(values = []) {
  return [...new Set(
    values
      .map((value) => normalizeTheatreText(value))
      .filter((value) => typeof value === "string" && value && isAllowedTheatreText(value))
  )];
}

function includesAny(text = "", keywords = []) {
  const normalized = normalizeTheatreText(text).toLowerCase();
  return keywords.some((keyword) => normalized.includes(String(keyword).toLowerCase()));
}

function scoreByKeywords(text = "", keywords = []) {
  const normalized = normalizeTheatreText(text).toLowerCase();
  return keywords.reduce((score, keyword) => (normalized.includes(String(keyword).toLowerCase()) ? score + 1 : score), 0);
}

function quoteLabel(value = "") {
  return `«${normalizeTheatreText(value)}»`;
}

function clampTextList(values = [], limit = 12) {
  return uniqueStrings(values)
    .filter((value) => value.length <= 140)
    .slice(0, limit);
}

function collectEntryQuotes(entry = {}) {
  const all = [];
  const commands = [];
  const reactions = [];
  const battleCries = [];
  const questions = [];

  for (const phrase of Array.isArray(entry?.popular_funny_phrases) ? entry.popular_funny_phrases : []) {
    if (isAllowedTheatreText(phrase)) {
      all.push(phrase);
    }
  }

  for (const quote of Array.isArray(entry?.memes_quotes) ? entry.memes_quotes : []) {
    const text = normalizeTheatreText(quote?.text || "");
    const type = String(quote?.type || "").trim().toLowerCase();
    const tone = String(quote?.tone || "").trim().toLowerCase();
    if (!isAllowedTheatreText(text)) {
      continue;
    }

    all.push(text);

    if (type === "command" || type === "threat") {
      commands.push(text);
    }
    if (type === "reaction" || type === "statement" || type === "accusation" || tone.includes("сарказм")) {
      reactions.push(text);
    }
    if (type === "battle_cry") {
      battleCries.push(text);
    }
    if (type === "question") {
      questions.push(text);
    }
  }

  return {
    all: uniqueStrings(all),
    commands: uniqueStrings(commands),
    reactions: uniqueStrings(reactions),
    battleCries: uniqueStrings(battleCries),
    questions: uniqueStrings(questions)
  };
}

function pickTopContextTexts(values = [], context = "generic", limit = 4) {
  const keywords = THEATRE_CONTEXT_KEYWORDS[context] || [];
  return uniqueStrings(values)
    .map((value) => ({ value, score: scoreByKeywords(value, keywords) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.value.length - right.value.length)
    .slice(0, limit)
    .map((item) => item.value);
}

function formatCharacterList(names = []) {
  return uniqueStrings(names).slice(0, 3).join(" / ");
}

function formatWordMood(words = [], context = "generic") {
  const contextKeywords = THEATRE_CONTEXT_KEYWORDS[context] || [];
  const matched = uniqueStrings(words)
    .map((value) => ({ value, score: scoreByKeywords(value, contextKeywords) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value))
    .map((item) => item.value);
  const values = matched.slice(0, 2);
  if (!values.length) {
    return "";
  }
  return values.map((value) => quoteLabel(value)).join(" і ");
}

function buildContextualLinesForEntry(entry = {}, context = "generic") {
  const source = normalizeTheatreText(entry?.source || "вистава");
  const details = uniqueStrings(entry?.funny_images_and_absurd_details || []);
  const words = uniqueStrings(entry?.popular_funny_words || []);
  const characterLabel = formatCharacterList((entry?.cast_characters || []).map((character) => character?.name || ""));
  const wordMood = formatWordMood(words, context);
  const quotes = collectEntryQuotes(entry);
  const lines = [];

  const push = (value) => {
    const normalized = normalizeTheatreText(value);
    if (isAllowedTheatreText(normalized) && normalized.length <= 160) {
      lines.push(normalized);
    }
  };

  const routeDetail = pickTopContextTexts(details, "route", 1)[0];
  const foodDetail = pickTopContextTexts(details, "food", 1)[0];
  const gearDetail = pickTopContextTexts(details, "gear", 1)[0];
  const tripDetail = pickTopContextTexts(details, "trip", 1)[0];
  const genericDetail = details[0];

  if (context === "trip") {
    pickTopContextTexts([...quotes.commands, ...quotes.reactions, ...quotes.questions], "trip", 3).forEach(push);
    if (tripDetail) {
      push(`Походова рада сьогодні чистий ${quoteLabel(source)}: ${tripDetail}.`);
    }
    if (characterLabel) {
      push(`Без драм на ролі ${characterLabel}, панове.`);
    }
    if (wordMood) {
      push(`Настрій двіжу: ${wordMood}.`);
    }
  }

  if (context === "route") {
    pickTopContextTexts([...quotes.commands, ...quotes.battleCries, ...quotes.questions, ...quotes.all], "route", 3).forEach(push);
    if (routeDetail) {
      push(`Маршрут сьогодні як ${quoteLabel(source)}: ${routeDetail}.`);
    }
    if (characterLabel) {
      push(`На стежці без вистави на ролі ${characterLabel}.`);
    }
    if (wordMood) {
      push(`По дорозі вже пахне словами ${wordMood}.`);
    }
  }

  if (context === "food") {
    pickTopContextTexts([...quotes.reactions, ...quotes.all], "food", 3).forEach(push);
    if (foodDetail) {
      push(`По закусону сьогодні майже ${quoteLabel(source)}: ${foodDetail}.`);
    }
    if (wordMood) {
      push(`Приваловий вайб: ${wordMood}.`);
    }
    if (characterLabel) {
      push(`За харчі без сцен рівня ${characterLabel}.`);
    }
  }

  if (context === "gear") {
    pickTopContextTexts([...quotes.commands, ...quotes.reactions, ...quotes.all], "gear", 3).forEach(push);
    if (gearDetail) {
      push(`По барахлу сьогодні реквізит рівня ${quoteLabel(source)}: ${gearDetail}.`);
    }
    if (wordMood) {
      push(`По шмоту зараз вайб ${wordMood}.`);
    }
    if (characterLabel) {
      push(`Не перетворюйте спорядження на театр імені ${characterLabel}.`);
    }
  }

  if (context === "people") {
    pickTopContextTexts([...quotes.commands, ...quotes.reactions, ...quotes.questions, ...quotes.all], "people", 3).forEach(push);
    if (characterLabel) {
      push(`Панство зараз грає сцену на ролі ${characterLabel}.`);
    }
    if (wordMood) {
      push(`По людях сьогодні чистий настрій ${wordMood}.`);
    }
    if (tripDetail || genericDetail) {
      push(`По складу банди зараз чистий ${quoteLabel(source)}: ${tripDetail || genericDetail}.`);
    }
  }

  if (context === "generic") {
    pickTopContextTexts([...quotes.reactions, ...quotes.questions, ...quotes.all], "generic", 3).forEach(push);
    if (genericDetail) {
      push(`По табору зараз вайб ${quoteLabel(source)}: ${genericDetail}.`);
    }
    if (wordMood) {
      push(`Загальний настрій: ${wordMood}.`);
    }
    if (characterLabel) {
      push(`Без вистав на ролі ${characterLabel}.`);
    }
  }

  return clampTextList(lines, 6);
}

function fallbackSlice(primary = [], fallback = [], count = 12) {
  return clampTextList([...primary, ...fallback], count);
}

function buildTheatreTonePack(source = {}, fallbackPack = {}) {
  const entries = Array.isArray(source?.dataset) ? source.dataset : [];
  if (!entries.length) {
    return fallbackPack || {};
  }

  const generic = fallbackSlice(entries.flatMap((entry) => buildContextualLinesForEntry(entry, "generic")), fallbackPack?.random_quips?.generic, 28);
  const trip = fallbackSlice(entries.flatMap((entry) => buildContextualLinesForEntry(entry, "trip")), fallbackPack?.random_quips?.trip, 24);
  const people = fallbackSlice(entries.flatMap((entry) => buildContextualLinesForEntry(entry, "people")), fallbackPack?.random_quips?.people, 20);
  const route = fallbackSlice(entries.flatMap((entry) => buildContextualLinesForEntry(entry, "route")), fallbackPack?.random_quips?.route, 20);
  const food = fallbackSlice(entries.flatMap((entry) => buildContextualLinesForEntry(entry, "food")), fallbackPack?.random_quips?.food, 20);
  const gear = fallbackSlice(entries.flatMap((entry) => buildContextualLinesForEntry(entry, "gear")), fallbackPack?.random_quips?.gear, 20);

  const menuTitle = fallbackSlice(
    entries.flatMap((entry) => {
      const sourceLabel = normalizeTheatreText(entry?.source || "");
      const characters = formatCharacterList((entry?.cast_characters || []).map((character) => character?.name || ""));
      const phrases = collectEntryQuotes(entry);
      return [
        ...pickTopContextTexts([...phrases.commands, ...phrases.questions], "trip", 1),
        sourceLabel ? `Порядок денний рівня ${quoteLabel(sourceLabel)}` : "",
        characters ? `Панство на ролі ${characters}` : ""
      ];
    }),
    fallbackPack?.menu?.title,
    10
  );

  return {
    registers: {
      camp_truth: {
        generic,
        food,
        gear,
        route
      },
      absurd_high: {
        welcome: fallbackSlice([...trip, ...route], fallbackPack?.registers?.absurd_high?.welcome, 14)
      },
      fatalistic_soft: {
        generic,
        trip,
        people
      },
      street_burn: {
        soft_react: fallbackSlice(entries.flatMap((entry) => collectEntryQuotes(entry).reactions), fallbackPack?.registers?.street_burn?.soft_react, 14),
        idle: fallbackSlice(entries.flatMap((entry) => collectEntryQuotes(entry).questions), fallbackPack?.registers?.street_burn?.idle, 12),
        edit_loop: fallbackSlice(entries.flatMap((entry) => [...collectEntryQuotes(entry).questions, ...collectEntryQuotes(entry).reactions]), fallbackPack?.registers?.street_burn?.edit_loop, 12)
      }
    },
    menu: {
      title: menuTitle
    },
    random_quips: {
      generic,
      trip,
      people,
      food,
      gear,
      route
    }
  };
}

const toneDictionaries = {
  default: readToneFile("default"),
  drunk: readToneFile("drunk")
};
const legacyDrunkPack = readToneFile("drunk-pack", { optional: true });
const theatreToneDataset = readToneFile("sources/theatre_texts_dataset_merged", { optional: true });
const tonePacks = {
  drunk: buildTheatreTonePack(theatreToneDataset, legacyDrunkPack)
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
      ? 0.78
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

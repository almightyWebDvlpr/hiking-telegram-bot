import crypto from "node:crypto";

const FILTERED_TERMS = [
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

const DOMAIN_KEYWORDS = {
  route: ["іттіть", "вперьод", "вперед", "прийшли", "дорог", "йти", "шлях", "ліс", "болот", "пустин", "пагод"],
  weather: ["пагод", "дощ", "вітер", "бур", "холод", "сонце"],
  food: ["канхвет", "тузік", "їсти", "жрать", "кусн", "ковбас", "сало", "хліб", "закус", "бздить"],
  alcohol: ["випить", "барі", "шампань", "пиво", "горіл", "пити", "банка", "пляшка"],
  gear: ["роял", "дрюч", "меч", "пістолет", "простирадл", "фонар", "реквізит", "мішок", "рюкзак", "шкарп"],
  people: ["хлопц", "народ", "падлюк", "мовч", "контра", "панств", "пиздю", "друже"],
  logistics: ["питання", "жизн", "розруха", "облом", "довольн", "подвєд", "план"],
  money: ["карбован", "валют", "бабк", "гріш"]
};

const INTENSITY_PATTERNS = {
  high: [
    /я\s+їбав/ui,
    /всім?\s+піздє?ц/ui,
    /усь?ю?ди\s+смерть,\s*розруха/ui,
    /вб'ю/ui,
    /нахуй/ui,
    /зайоб/ui,
    /пішо?л[ао]?\s+по\s+пизд/ui
  ],
  medium: [
    /ні\s*хуя/ui,
    /хуйов/ui,
    /пизд/ui,
    /жизн/ui,
    /облом/ui,
    /контра/ui
  ]
};

const SCREEN_GROUPS = {
  trip_core: ["trip_hub", "trip_details", "trip_history", "trip_settings"],
  people: ["trip_members_menu", "trip_members_list", "trip_member_card", "trip_member_tickets"],
  route: ["route_menu", "route_weather_picker", "route_weather"],
  gear: ["gear_menu", "gear_accounting", "gear_borrowed", "gear_loaned", "gear_backpack"],
  food: ["food_menu", "food_list", "trip_mode", "trip_drunk_mode"],
  money: ["expenses_menu", "expenses_list"],
  photos: ["trip_photos", "trip_photo_album"]
};

function normalize(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isAllowed(text = "") {
  const normalized = normalize(text).toLowerCase();
  return Boolean(normalized) && !FILTERED_TERMS.some((term) => normalized.includes(term));
}

function slugify(value = "") {
  return normalize(value)
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ0-9]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function collectForbiddenTokens(entries = []) {
  const tokens = new Set();

  const pushParts = (value = "") => {
    const parts = normalize(value)
      .toLowerCase()
      .split(/[^a-zа-яіїєґ0-9'-]+/iu)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4);

    for (const part of parts) {
      tokens.add(part);
    }
  };

  for (const entry of entries) {
    pushParts(entry?.source || "");
    for (const character of Array.isArray(entry?.cast_characters) ? entry.cast_characters : []) {
      pushParts(character?.name || "");
    }
  }

  return tokens;
}

function inferIntensity(text = "", tone = "") {
  const source = `${normalize(text)} ${normalize(tone)}`;
  if (INTENSITY_PATTERNS.high.some((pattern) => pattern.test(source))) {
    return "high";
  }
  if (INTENSITY_PATTERNS.medium.some((pattern) => pattern.test(source))) {
    return "medium";
  }
  return "low";
}

function inferToneShape(type = "", tone = "", text = "") {
  const normalizedType = String(type || "").trim().toLowerCase();
  const source = `${normalize(text)} ${normalize(tone)}`.toLowerCase();

  if (normalizedType === "command" || normalizedType === "threat") {
    return "command";
  }
  if (normalizedType === "question" || text.includes("?")) {
    return "question";
  }
  if (/зайоб|хуйов|облом|доіграл|папаша|сцикун|настоїб/i.test(source)) {
    return "complaint";
  }
  if (/піздє?ц|смерть|розруха|жизн|здохл/i.test(source)) {
    return "fatalistic";
  }
  if (/ура|будєт заїбісь|всьо буде/i.test(source)) {
    return "optimistic";
  }
  if (normalizedType === "observation" || /пахне|видно|бачиш|диви/i.test(source)) {
    return "observational";
  }
  return "reaction";
}

function inferTags(text = "", type = "", tone = "") {
  const normalized = normalize(text).toLowerCase();
  const tags = new Set(["generic", "trip"]);

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      tags.add(domain);
    }
  }

  const shape = inferToneShape(type, tone, text);
  tags.add(shape);

  if (shape === "question") {
    tags.add("decision");
  }
  if (shape === "complaint") {
    tags.add("negative");
  }
  if (shape === "fatalistic") {
    tags.add("negative");
    tags.add("serious");
  }
  if (shape === "optimistic") {
    tags.add("positive");
  }

  return [...tags];
}

function inferContexts(tags = []) {
  const contexts = new Set(["generic"]);

  if (tags.includes("route") || tags.includes("weather")) {
    contexts.add("route");
  }
  if (tags.includes("food") || tags.includes("alcohol")) {
    contexts.add("food");
  }
  if (tags.includes("gear")) {
    contexts.add("gear");
  }
  if (tags.includes("people")) {
    contexts.add("people");
  }
  if (tags.includes("logistics") || tags.includes("money")) {
    contexts.add("trip");
  }

  return [...contexts];
}

function inferDeliveries(shape = "", intensity = "low", tags = []) {
  const deliveries = new Set(["quip"]);

  if (intensity === "low" && ["reaction", "observational", "optimistic"].includes(shape)) {
    deliveries.add("banner");
  }
  if (shape === "question") {
    deliveries.add("prompt");
  }
  if (shape === "optimistic") {
    deliveries.add("success");
  }
  if (intensity !== "low" || tags.includes("negative")) {
    deliveries.add("error");
  }
  if (intensity === "low" && tags.includes("generic")) {
    deliveries.add("footer");
  }

  return [...deliveries];
}

function inferScreens(tags = [], intensity = "low") {
  const screens = new Set();

  if (tags.includes("generic") || tags.includes("trip") || tags.includes("logistics")) {
    SCREEN_GROUPS.trip_core.forEach((screen) => screens.add(screen));
    SCREEN_GROUPS.money.forEach((screen) => screens.add(screen));
    SCREEN_GROUPS.photos.forEach((screen) => screens.add(screen));
  }

  if (tags.includes("people")) {
    SCREEN_GROUPS.people.forEach((screen) => screens.add(screen));
    screens.add("trip_photo_album");
  }

  if (tags.includes("route") || tags.includes("weather")) {
    SCREEN_GROUPS.route.forEach((screen) => screens.add(screen));
    screens.add("trip_details");
    screens.add("trip_hub");
  }

  if (tags.includes("food") || tags.includes("alcohol")) {
    SCREEN_GROUPS.food.forEach((screen) => screens.add(screen));
    screens.add("trip_hub");
  }

  if (tags.includes("gear")) {
    SCREEN_GROUPS.gear.forEach((screen) => screens.add(screen));
  }

  if (intensity === "high") {
    screens.delete("trip_hub");
    screens.delete("trip_details");
    screens.delete("trip_photos");
    screens.delete("trip_photo_album");
  }

  return [...screens];
}

function collectCandidates(entries = []) {
  const forbiddenTokens = collectForbiddenTokens(entries);
  const candidates = [];
  const seen = new Set();

  const push = (entry, rawText, type = "phrase", tone = "") => {
    const text = normalize(rawText);
    if (!isAllowed(text)) {
      return;
    }

    if (text.length < 6 || text.length > 96) {
      return;
    }

    const lowered = text.toLowerCase();
    for (const token of forbiddenTokens) {
      if (token && lowered.includes(token)) {
        return;
      }
    }

    if (/[«»]/u.test(text) || /\b(роль|ролі|сцена|персонаж|вайб|табір|сьогодні як)\b/iu.test(text)) {
      return;
    }

    const key = lowered;
    if (seen.has(key)) {
      return;
    }

    const tags = inferTags(text, type, tone);
    const intensity = inferIntensity(text, tone);
    const shape = inferToneShape(type, tone, text);
    const candidate = {
      id: `${slugify(text)}-${candidates.length + 1}`,
      text,
      sourceType: String(type || "phrase").trim().toLowerCase() || "phrase",
      toneShape: shape,
      intensity,
      tags,
      contexts: inferContexts(tags),
      screens: inferScreens(tags, intensity),
      deliveries: inferDeliveries(shape, intensity, tags),
      cooldownScope: intensity === "high" ? "trip" : "screen"
    };

    if (!candidate.screens.length) {
      return;
    }

    seen.add(key);
    candidates.push(candidate);
  };

  for (const entry of entries) {
    for (const quote of Array.isArray(entry?.memes_quotes) ? entry.memes_quotes : []) {
      push(entry, quote?.text || "", quote?.type || "phrase", quote?.tone || "");
    }

    for (const phrase of Array.isArray(entry?.popular_funny_phrases) ? entry.popular_funny_phrases : []) {
      push(entry, phrase, "phrase", "");
    }
  }

  return candidates;
}

export function buildTheatreToneCatalog(source = {}) {
  const entries = Array.isArray(source?.dataset) ? source.dataset : [];
  const candidates = collectCandidates(entries);
  const sourceHash = crypto
    .createHash("sha1")
    .update(JSON.stringify(source || {}))
    .digest("hex");

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceHash,
      entriesCount: candidates.length,
      version: 1
    },
    entries: candidates
  };
}

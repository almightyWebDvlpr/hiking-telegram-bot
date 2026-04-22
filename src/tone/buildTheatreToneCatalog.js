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
  route: ["ітті", "вперьод", "вперед", "прийшл", "дорог", "шлях", "болот", "стеж", "маршрут", "дєбр", "гір", "кроком"],
  weather: ["пагод", "дощ", "вітер", "холод", "сонц", "гроза", "сніг", "злива"],
  food: ["канхвет", "тузік", "їст", "жрат", "кусн", "ковбас", "сало", "хліб", "закус", "ням"],
  alcohol: ["вип", "бар", "шампань", "пив", "горіл", "пляш", "алко", "пивц"],
  gear: ["роял", "дрюч", "меч", "пістолет", "простирадл", "фонар", "реквізит", "мішок", "рюкзак", "шкарп", "валіз", "чемодан"],
  people: ["хлопц", "друж", "банд", "люд", "панов", "компан"],
  logistics: ["питан", "жизн", "розрух", "облом", "довольн", "подвєд", "план", "ітог", "спєшн", "треба"],
  money: ["карбован", "валют", "бабк", "гріш", "грош", "купував", "віддам"]
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

const RAW_SOURCE_BLOCKED_PATTERNS = [
  /\bact\s*[ivx]+\b/iu,
  /\b(входить|входять|виходить|виходять|вбігає|вбігають)\b/iu,
  /\b(сидить|сидять|сідає|сідають|лежить|лежать|біжить|біжать)\b/iu,
  /\b(кричить|реве|плямка|катує|харка|топиться|вимахує|вириває)\b/iu,
  /\b(зроблений|подекуди|обривки|напрямку|неохайні|неприємні|одягнуто|волочиться)\b/iu,
  /\b(кабінет|печера|ліс|болото|катівня|море)\b/iu
];

const SHAPE_TO_DELIVERY_CLASS = {
  question: "prompt",
  optimistic: "success",
  complaint: "warning",
  fatalistic: "error"
};

const TOPIC_TAGS = ["route", "weather", "food", "alcohol", "gear", "people", "logistics", "money"];

const KEYWORD_STOP_WORDS = new Set([
  "але",
  "аби",
  "без",
  "був",
  "була",
  "було",
  "буде",
  "вже",
  "він",
  "вона",
  "вони",
  "все",
  "всьо",
  "воно",
  "ви",
  "вам",
  "вас",
  "ваш",
  "ваша",
  "ваші",
  "десь",
  "для",
  "дуже",
  "його",
  "йому",
  "йти",
  "їм",
  "їх",
  "й",
  "ж",
  "за",
  "зараз",
  "знов",
  "знову",
  "із",
  "і",
  "й",
  "каже",
  "коли",
  "куди",
  "ми",
  "мене",
  "мені",
  "мене",
  "моя",
  "моє",
  "мої",
  "на",
  "надо",
  "не",
  "нема",
  "ні",
  "ну",
  "оце",
  "ота",
  "ото",
  "ось",
  "по",
  "поки",
  "при",
  "про",
  "сам",
  "самі",
  "себе",
  "сказав",
  "собі",
  "так",
  "там",
  "та",
  "те",
  "ти",
  "тобі",
  "того",
  "то",
  "тут",
  "уже",
  "хай",
  "це",
  "цей",
  "ця",
  "ці",
  "чи",
  "шо",
  "щоб",
  "як",
  "я",
  "мене",
  "от",
  "ще"
]);

function normalize(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function countWords(value = "") {
  return normalize(value)
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .length;
}

function tokenize(value = "") {
  return (normalize(value).toLowerCase().match(/[a-zа-яіїєґ0-9'-]{3,}/giu) || [])
    .map((token) => String(token || "").toLowerCase());
}

function hasKeywordRoot(tokens = [], roots = []) {
  return roots.some((root) => tokens.some((token) => token.startsWith(root)));
}

function splitSentences(value = "") {
  const normalized = normalize(value);
  if (!normalized) {
    return [];
  }

  const matches = normalized.match(/[^.!?…]+(?:[.!?…]+|$)/gu) || [];
  return matches.map((part) => normalize(part)).filter(Boolean);
}

function extractQuotedSnippets(value = "") {
  const snippets = [];
  const quotedPatterns = [/'([^']+)'/gu, /"([^"]+)"/gu, /“([^”]+)”/gu, /«([^»]+)»/gu];

  for (const pattern of quotedPatterns) {
    for (const match of value.matchAll(pattern)) {
      const snippet = normalize(match?.[1] || "");
      if (snippet) {
        snippets.push(snippet);
      }
    }
  }

  return snippets;
}

function looksLikeStageDirection(text = "") {
  const normalized = normalize(text);
  if (!normalized) {
    return true;
  }

  if (!/[.!?…]/u.test(normalized)) {
    return true;
  }

  if (RAW_SOURCE_BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (/^[A-ZА-ЯІЇЄҐ0-9'’\s-]{2,48}[.!?…]?$/u.test(normalized) && normalized === normalized.toUpperCase()) {
    return true;
  }

  if (countWords(normalized) >= 6 && /\b(можна почути|обривки фраз|голос з натовпу|подекуди|всі біжать|входить|виходить)\b/iu.test(normalized)) {
    return true;
  }

  return false;
}

function extractPhrasesFromCombinedContent(content = "") {
  const source = String(content || "")
    .replace(/\r/g, "\n")
    .replace(/\t+/g, "\n");
  const chunks = source
    .split(/\n+|\s{2,}/u)
    .map((chunk) => normalize(chunk))
    .filter(Boolean);
  const phrases = [];
  const seen = new Set();

  const push = (value = "") => {
    const text = normalize(value);
    if (!text || seen.has(text.toLowerCase())) {
      return;
    }
    if (text.length < 6 || text.length > 96) {
      return;
    }
    if (looksLikeStageDirection(text)) {
      return;
    }
    seen.add(text.toLowerCase());
    phrases.push(text);
  };

  for (const chunk of chunks) {
    if (/[.!?…]/u.test(chunk)) {
      push(chunk);
    }

    for (const quoted of extractQuotedSnippets(chunk)) {
      push(quoted);
      for (const sentence of splitSentences(quoted)) {
        push(sentence);
      }
    }

    for (const sentence of splitSentences(chunk)) {
      push(sentence);
    }
  }

  return phrases;
}

function normalizeSourceEntries(source = {}) {
  const entries = [];

  if (Array.isArray(source?.dataset)) {
    entries.push(...source.dataset);
  }

  if (Array.isArray(source?.files)) {
    for (const file of source.files) {
      const phrases = extractPhrasesFromCombinedContent(file?.content || "");
      if (!phrases.length) {
        continue;
      }

      entries.push({
        source: normalize(file?.title || file?.requested_title || file?.filename || "combined-source"),
        popular_funny_phrases: phrases
      });
    }
  }

  if (Array.isArray(source?.sources)) {
    for (const nestedSource of source.sources) {
      entries.push(...normalizeSourceEntries(nestedSource));
    }
  }

  return entries;
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
  const tokens = tokenize(normalized);
  const tags = new Set(["generic"]);

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (hasKeywordRoot(tokens, keywords)) {
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

  if (TOPIC_TAGS.some((tag) => tags.has(tag))) {
    tags.add("trip");
  }

  return [...tags];
}

function inferContexts(tags = []) {
  const contexts = new Set();

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
  if (tags.includes("trip") || tags.includes("logistics") || tags.includes("money")) {
    contexts.add("trip");
  }

  if (!contexts.size) {
    contexts.add("generic");
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

function inferRequires(text = "", tags = [], shape = "", intensity = "low", screens = []) {
  const normalized = normalize(text).toLowerCase();
  const requires = new Set();

  if (tags.includes("alcohol")) {
    if (/випить|барі|шампань|пиво|горіл|пляш/u.test(normalized)) {
      requires.add("alcohol_empty");
    } else {
      requires.add("alcohol_present");
    }
  }

  if (tags.includes("food")) {
    requires.add("food_present");
  }

  if (tags.includes("people")) {
    requires.add("members_plural");
  }

  if (tags.includes("gear")) {
    requires.add("gear_present");
  }

  if (tags.includes("money")) {
    requires.add("expenses_present");
  }

  if (tags.includes("route") || tags.includes("weather")) {
    requires.add("route_known");
  }

  if (screens.includes("trip_photo_album") || screens.includes("trip_photos")) {
    requires.add("photos_present");
  }

  if (shape === "question") {
    requires.add("ui_waiting");
  }

  if (shape === "complaint" && intensity !== "low") {
    requires.add("edit_repeated");
  }

  return [...requires];
}

function inferForbiddenWhen(tags = [], shape = "", intensity = "low", screens = []) {
  const forbiddenWhen = new Set();

  forbiddenWhen.add("screen:safety");

  if (shape === "fatalistic" || intensity === "high") {
    forbiddenWhen.add("screen:trip_hub");
    forbiddenWhen.add("screen:trip_details");
    forbiddenWhen.add("screen:trip_members_menu");
    forbiddenWhen.add("screen:trip_members_list");
    forbiddenWhen.add("screen:trip_member_card");
    forbiddenWhen.add("screen:route_weather");
    forbiddenWhen.add("screen:trip_photos");
    forbiddenWhen.add("screen:trip_photo_album");
  }

  if (shape === "question") {
    forbiddenWhen.add("delivery:banner");
  }

  if (screens.includes("trip_photos") || screens.includes("trip_photo_album")) {
    forbiddenWhen.add("photos_empty");
  }

  if (tags.includes("alcohol")) {
    forbiddenWhen.add("no_alco_mode");
  }

  return [...forbiddenWhen];
}

function inferDeliveryClass(shape = "", intensity = "low") {
  if (shape === "reaction" || shape === "observational") {
    return intensity === "low" ? "banner" : "quip";
  }

  return SHAPE_TO_DELIVERY_CLASS[shape] || "quip";
}

function inferScreens(tags = [], intensity = "low", shape = "reaction") {
  const screens = new Set();

  if (tags.includes("trip") || tags.includes("logistics") || tags.includes("money")) {
    SCREEN_GROUPS.trip_core.forEach((screen) => screens.add(screen));
  }

  if (tags.includes("people")) {
    SCREEN_GROUPS.people.forEach((screen) => screens.add(screen));
    if (shape === "observational" || shape === "optimistic") {
      SCREEN_GROUPS.photos.forEach((screen) => screens.add(screen));
    }
  }

  if (tags.includes("route") || tags.includes("weather")) {
    SCREEN_GROUPS.route.forEach((screen) => screens.add(screen));
    screens.add("trip_details");
    screens.add("trip_hub");
  }

  if (tags.includes("food") || tags.includes("alcohol")) {
    SCREEN_GROUPS.food.forEach((screen) => screens.add(screen));
    screens.add("trip_hub");
    screens.add("trip_details");
  }

  if (tags.includes("gear")) {
    SCREEN_GROUPS.gear.forEach((screen) => screens.add(screen));
  }

  if (tags.includes("money")) {
    SCREEN_GROUPS.money.forEach((screen) => screens.add(screen));
  }

  if (shape === "question" || shape === "complaint") {
    screens.add("idle_prompt");
    screens.add("edit_loop");
  }

  if (intensity === "high") {
    screens.delete("trip_hub");
    screens.delete("trip_details");
    screens.delete("trip_photos");
    screens.delete("trip_photo_album");
  }

  return [...screens];
}

function extractKeywords(text = "", tags = []) {
  const words = tokenize(text);
  const keywords = [];
  const seen = new Set();

  for (const word of words) {
    const token = String(word || "").toLowerCase();
    if (!token || KEYWORD_STOP_WORDS.has(token)) {
      continue;
    }
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    keywords.push(token);
  }

  for (const tag of tags) {
    if (TOPIC_TAGS.includes(tag) && !seen.has(tag)) {
      seen.add(tag);
      keywords.push(tag);
    }
  }

  return keywords.slice(0, 12);
}

function inferPersonaCue(text = "", tags = [], shape = "reaction", intensity = "low") {
  const normalized = normalize(text).toLowerCase();

  if (tags.includes("alcohol")) {
    return "boozy";
  }
  if (tags.includes("food") || tags.includes("gear")) {
    return "camp";
  }
  if (tags.includes("route") || tags.includes("weather")) {
    return "trail";
  }
  if (tags.includes("money") || tags.includes("logistics")) {
    return "manager";
  }
  if (tags.includes("people") && !tags.includes("negative")) {
    return "crew";
  }
  if (shape === "optimistic" || /всьо буде|ітоги подвєдьом|вірно хлопці|папаша/u.test(normalized)) {
    return "supportive";
  }
  if (intensity === "high" || /вб'ю|нахуй|параш|жоп|срак|топити|здох/u.test(normalized)) {
    return "hostile";
  }
  if (/бацил|гангрен|язв|гоноре|скелет|труп|кошенят/u.test(normalized)) {
    return "absurd";
  }
  if (tags.includes("negative") || shape === "complaint" || shape === "fatalistic") {
    return "chaotic";
  }

  return "banter";
}

function inferSpecificity(text = "", tags = [], keywords = [], shape = "reaction") {
  const topicalTagCount = tags.filter((tag) => TOPIC_TAGS.includes(tag)).length;
  const lexicalWeight = Math.min(keywords.length, 6);
  const lengthWeight = Math.min(Math.max(countWords(text) - 2, 0), 4);
  const shapeWeight = ["observational", "optimistic", "complaint", "question"].includes(shape) ? 1 : 0;

  return topicalTagCount * 3 + lexicalWeight + lengthWeight + shapeWeight;
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

    if (looksLikeStageDirection(text)) {
      return;
    }

    const key = lowered;
    if (seen.has(key)) {
      return;
    }

    const tags = inferTags(text, type, tone);
    const intensity = inferIntensity(text, tone);
    const shape = inferToneShape(type, tone, text);
    const screens = inferScreens(tags, intensity, shape);
    const deliveries = inferDeliveries(shape, intensity, tags);
    const keywords = extractKeywords(text, tags);
    const candidate = {
      id: `${slugify(text)}-${candidates.length + 1}`,
      text,
      sourceTitle: normalize(entry?.source || ""),
      sourceType: String(type || "phrase").trim().toLowerCase() || "phrase",
      personaCue: inferPersonaCue(text, tags, shape, intensity),
      toneShape: shape,
      intensity,
      tags,
      keywords,
      specificity: inferSpecificity(text, tags, keywords, shape),
      contexts: inferContexts(tags),
      screens,
      screenContexts: screens,
      deliveries,
      deliveryClass: inferDeliveryClass(shape, intensity),
      requires: inferRequires(text, tags, shape, intensity, screens),
      forbiddenWhen: inferForbiddenWhen(tags, shape, intensity, screens),
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
  const entries = normalizeSourceEntries(source);
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

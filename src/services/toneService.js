import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const toneDir = path.resolve(__dirname, "../tone");
const lastRandomSelections = new Map();
const CONFUSABLE_CYRILLIC_MAP = new Map([
  ["A", "А"], ["a", "а"], ["B", "В"], ["C", "С"], ["c", "с"], ["E", "Е"], ["e", "е"],
  ["H", "Н"], ["I", "І"], ["i", "і"], ["K", "К"], ["k", "к"], ["M", "М"], ["m", "м"],
  ["O", "О"], ["o", "о"], ["P", "Р"], ["p", "р"], ["T", "Т"], ["X", "Х"], ["x", "х"],
  ["Y", "У"], ["y", "у"]
]);

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
const theatreToneCatalog = readToneFile("generated/theatre-catalog", { optional: true });

const theatreToneEntries = Array.isArray(theatreToneCatalog?.entries)
  ? theatreToneCatalog.entries
  : [];
const theatreToneIndexByScreen = new Map();
const theatreToneEntriesById = new Map();
const theatreToneEntriesByText = new Map();
const theatreToneScreenPools = new Map();
const toneSelectionHistory = new Map();

for (const entry of theatreToneEntries) {
  if (entry?.id) {
    theatreToneEntriesById.set(entry.id, entry);
  }
  if (entry?.text) {
    theatreToneEntriesByText.set(normalizeToneText(entry.text), entry);
  }
  for (const screen of Array.isArray(entry?.screens) ? entry.screens : []) {
    if (!theatreToneIndexByScreen.has(screen)) {
      theatreToneIndexByScreen.set(screen, []);
    }
    theatreToneIndexByScreen.get(screen).push(entry);
  }
}

for (const [screen, pool] of Object.entries(theatreToneCatalog?.screenPools || {})) {
  const entries = Array.isArray(pool)
    ? pool
        .map((item) => {
          const entry = theatreToneEntriesById.get(item?.id);
          if (!entry) {
            return null;
          }
          return {
            id: item.id,
            score: Number(item?.score || 0),
            entry
          };
        })
        .filter(Boolean)
    : [];

  theatreToneScreenPools.set(screen, entries);
}

const INTENSITY_RANK = {
  low: 0,
  medium: 1,
  high: 2
};

const TOPICAL_TAGS = ["route", "weather", "food", "alcohol", "gear", "people", "logistics", "money"];
const TAG_TEXT_ROOT_HINTS = {
  route: ["вперьод", "вперед", "дорог", "шлях", "стеж", "маршрут", "дєбр", "гір", "крок", "руш", "болот"],
  weather: ["пагод", "дощ", "вітер", "холод", "сонц", "гроза", "сніг", "злива"],
  food: ["їст", "жрат", "ковбас", "сало", "хліб", "закус", "ням", "кусн"],
  alcohol: ["вип", "бар", "шампань", "пив", "горіл", "пляш", "алко"],
  people: ["хлопц", "друж", "банд", "люд", "пан", "компан"],
  money: ["карбован", "валют", "бабк", "гріш", "грош", "віддам"],
  logistics: ["поряд", "контрол", "план", "ітог", "подвєд", "спєшн"]
};

const SCREEN_CONTEXT_KEYWORDS = {
  trip_hub: ["trip", "summary", "status", "organizer", "members", "route", "logistics"],
  trip_details: ["trip", "details", "dates", "route", "region", "members", "status"],
  trip_history: ["history", "summary", "result", "archive", "trip"],
  trip_settings: ["settings", "manage", "trip", "organizer", "permissions", "reminders"],
  trip_members_menu: ["members", "team", "people", "group", "status"],
  trip_members_list: ["members", "team", "people", "status", "contacts"],
  trip_member_card: ["member", "person", "status", "profile", "tickets"],
  trip_member_tickets: ["tickets", "transport", "member", "train", "bus"],
  route_menu: ["route", "track", "path", "navigation", "mountain", "difficulty"],
  route_weather_picker: ["weather", "forecast", "settlement", "route"],
  route_weather: ["weather", "forecast", "wind", "rain", "route", "temperature"],
  food_menu: ["food", "meal", "alcohol", "snacks", "products"],
  food_list: ["food", "meal", "alcohol", "products", "list"],
  trip_mode: ["alcohol", "mode", "camp", "trip", "food"],
  trip_drunk_mode: ["alcohol", "mode", "camp", "trip", "food"],
  expenses_menu: ["money", "expenses", "cost", "budget", "payment"],
  expenses_list: ["money", "expenses", "food", "payment", "budget"],
  trip_photos: ["photos", "album", "people", "memory"],
  trip_photo_album: ["photos", "album", "people", "memory"],
  idle_prompt: ["prompt", "question", "decision", "waiting"],
  edit_loop: ["edit", "change", "repeat", "decision", "prompt"]
};

const SCREEN_PERSONA_RULES = {
  default: {
    preferred: ["supportive", "banter"],
    blocked: ["hostile", "absurd"]
  },
  trip_hub: {
    preferred: ["supportive", "manager", "trail", "boozy"],
    blocked: ["hostile", "absurd", "chaotic"]
  },
  trip_details: {
    preferred: ["supportive", "manager", "trail", "boozy"],
    blocked: ["hostile", "absurd", "chaotic"]
  },
  trip_history: {
    preferred: ["supportive", "manager", "banter"],
    blocked: ["hostile", "absurd"]
  },
  trip_settings: {
    preferred: ["manager", "supportive"],
    blocked: ["hostile", "absurd", "chaotic"]
  },
  trip_members_menu: {
    preferred: ["crew", "supportive", "banter"],
    blocked: ["hostile", "absurd"]
  },
  trip_members_list: {
    preferred: ["crew", "supportive", "banter"],
    blocked: ["hostile", "absurd"]
  },
  trip_member_card: {
    preferred: ["crew", "supportive"],
    blocked: ["hostile", "absurd", "chaotic"]
  },
  trip_member_tickets: {
    preferred: ["manager", "crew"],
    blocked: ["hostile", "absurd", "chaotic"]
  },
  route_menu: {
    preferred: ["trail", "supportive"],
    blocked: ["hostile", "absurd"]
  },
  route_weather_picker: {
    preferred: ["trail", "supportive"],
    blocked: ["hostile", "absurd", "chaotic"]
  },
  route_weather: {
    preferred: ["trail", "supportive"],
    blocked: ["hostile", "absurd"]
  },
  food_menu: {
    preferred: ["boozy", "camp", "supportive"],
    blocked: ["hostile", "absurd"]
  },
  food_list: {
    preferred: ["boozy", "camp", "supportive"],
    blocked: ["hostile", "absurd"]
  },
  trip_mode: {
    preferred: ["boozy", "supportive"],
    blocked: ["hostile", "absurd"]
  },
  trip_drunk_mode: {
    preferred: ["boozy", "supportive"],
    blocked: ["hostile", "absurd"]
  },
  expenses_menu: {
    preferred: ["manager", "supportive"],
    blocked: ["hostile", "absurd", "chaotic"]
  },
  expenses_list: {
    preferred: ["manager", "supportive"],
    blocked: ["hostile", "absurd", "chaotic"]
  },
  trip_photos: {
    preferred: ["crew", "banter"],
    blocked: ["hostile", "absurd"]
  },
  trip_photo_album: {
    preferred: ["crew", "banter"],
    blocked: ["hostile", "absurd"]
  },
  idle_prompt: {
    preferred: ["banter", "chaotic"],
    blocked: []
  },
  edit_loop: {
    preferred: ["banter", "chaotic"],
    blocked: []
  }
};

const CALM_SCREEN_BLOCK_PATTERNS = [
  /канхвет.{0,30}(встром|посмоктат)/iu,
  /(жоп\w*|срак\w*|залуп\w*|вб'ю|утоп\w*|топити|жертв\w*|параш\w*)/iu,
  /чмо\s+японськ/iu,
  /ворог\s+народного\s+господарства/iu,
  /бог\s+є/iu,
  /побачить\s+цю\s+падлюку/iu,
  /не\s+умивалися/iu,
  /наябувал/iu
];

const SOURCE_TEXT_BLACKLIST_PATTERNS = [
  /милом.{0,20}голову|голову.{0,20}вимить/iu,
  /ветеран\w*\s+сивочуб/iu,
  /віол|виол|violet/iu,
  /радійте,\s*бляді/iu,
  /побийте.{0,20}пляшк/iu,
  /замість\s+компота.{0,24}горілк/iu,
  /\b(срат|посц|піся|сця|мармиз|мудозвон|вонюч|жаху)\w*/iu
];

const SCREEN_STYLE_BLOCKS = {
  trip_hub: CALM_SCREEN_BLOCK_PATTERNS,
  trip_details: CALM_SCREEN_BLOCK_PATTERNS,
  trip_history: CALM_SCREEN_BLOCK_PATTERNS,
  trip_settings: CALM_SCREEN_BLOCK_PATTERNS,
  trip_members_menu: CALM_SCREEN_BLOCK_PATTERNS,
  trip_members_list: CALM_SCREEN_BLOCK_PATTERNS,
  trip_member_card: CALM_SCREEN_BLOCK_PATTERNS,
  trip_member_tickets: CALM_SCREEN_BLOCK_PATTERNS,
  route_menu: CALM_SCREEN_BLOCK_PATTERNS,
  route_weather_picker: CALM_SCREEN_BLOCK_PATTERNS,
  route_weather: CALM_SCREEN_BLOCK_PATTERNS,
  food_menu: CALM_SCREEN_BLOCK_PATTERNS,
  food_list: CALM_SCREEN_BLOCK_PATTERNS,
  trip_mode: CALM_SCREEN_BLOCK_PATTERNS,
  trip_drunk_mode: CALM_SCREEN_BLOCK_PATTERNS,
  expenses_menu: CALM_SCREEN_BLOCK_PATTERNS,
  expenses_list: CALM_SCREEN_BLOCK_PATTERNS,
  trip_photos: CALM_SCREEN_BLOCK_PATTERNS,
  trip_photo_album: CALM_SCREEN_BLOCK_PATTERNS
};

const SOURCE_SCREEN_TEXTS = {
  trip_hub: [
    "Ітоги подвєдьом.",
    "А вірно хлопці! А діло каже!",
    "П’ятьсот карбованців стоять.",
    "Дай три карбованці, завтра утром віддам.",
    "По команді вождя компанія випиває."
  ],
  trip_details: [
    "Ітоги подвєдьом.",
    "П’ятьсот карбованців стоять.",
    "Дай три карбованці, завтра утром віддам.",
    "Праве плече вперед, кроком руш!",
    "Я думаю, що, мабуть, буде дощ...",
    "Ви в страшні дєбрі забралісь."
  ],
  trip_history: [
    "Ітоги подвєдьом.",
    "А вірно хлопці! А діло каже!",
    "П’ятьсот карбованців стоять.",
    "Дай три карбованці, завтра утром віддам."
  ],
  trip_settings: [
    "Ітоги подвєдьом.",
    "П’ятьсот карбованців стоять.",
    "Дай три карбованці, завтра утром віддам."
  ],
  trip_members_menu: [
    "А вірно хлопці! А діло каже!",
    "Сідайте, хлопці, чаю поп’ємо.",
    "Люди славні.",
    "По команді вождя компанія випиває."
  ],
  trip_members_list: [
    "А вірно хлопці! А діло каже!",
    "Сідайте, хлопці, чаю поп’ємо.",
    "Люди славні.",
    "По команді вождя компанія випиває."
  ],
  trip_member_card: [
    "А вірно хлопці! А діло каже!",
    "Сідайте, хлопці, чаю поп’ємо.",
    "Люди славні."
  ],
  trip_member_tickets: [
    "П’ятьсот карбованців стоять.",
    "Дай три карбованці, завтра утром віддам.",
    "Дай мені три карбованці, я завтра утром віддам."
  ],
  route_menu: [
    "Праве плече вперед, кроком руш!",
    "Ви в страшні дєбрі забралісь.",
    "Я думаю, що, мабуть, буде дощ...",
    "Тут холодно, можно труби застудіть.",
    "Ви тут сідітє, а на дворє такая пагода стаїть."
  ],
  route_weather_picker: [
    "Я думаю, що, мабуть, буде дощ...",
    "Тут холодно, можно труби застудіть.",
    "Ви тут сідітє, а на дворє такая пагода стаїть."
  ],
  route_weather: [
    "Я думаю, що, мабуть, буде дощ...",
    "Тут холодно, можно труби застудіть.",
    "Ви тут сідітє, а на дворє такая пагода стаїть."
  ],
  food_menu: [
    "Піти би випить в барі шампаньйоли.",
    "Всі випивають і закусюють ковбасою.",
    "І випить могу, і поговоріть, і поспоріть.",
    "По команді вождя компанія випиває."
  ],
  food_list: [
    "Піти би випить в барі шампаньйоли.",
    "Всі випивають і закусюють ковбасою.",
    "І випить могу, і поговоріть, і поспоріть.",
    "По команді вождя компанія випиває."
  ],
  trip_mode: [
    "Піти би випить в барі шампаньйоли.",
    "Всі випивають і закусюють ковбасою.",
    "І випить могу, і поговоріть, і поспоріть."
  ],
  trip_drunk_mode: [
    "Піти би випить в барі шампаньйоли.",
    "Всі випивають і закусюють ковбасою.",
    "І випить могу, і поговоріть, і поспоріть.",
    "По команді вождя компанія випиває."
  ],
  expenses_menu: [
    "П’ятьсот карбованців стоять.",
    "Дай три карбованці, завтра утром віддам.",
    "Дай мені три карбованці, я завтра утром віддам.",
    "З усіх карманів стирчать пачки грошей.",
    "Всі виймай гроші і клади сюди!"
  ],
  expenses_list: [
    "П’ятьсот карбованців стоять.",
    "Дай три карбованці, завтра утром віддам.",
    "Дай мені три карбованці, я завтра утром віддам.",
    "З усіх карманів стирчать пачки грошей.",
    "Всі виймай гроші і клади сюди!"
  ],
  trip_photos: [
    "А вірно хлопці! А діло каже!",
    "Сідайте, хлопці, чаю поп’ємо.",
    "Люди славні."
  ],
  trip_photo_album: [
    "А вірно хлопці! А діло каже!",
    "Сідайте, хлопці, чаю поп’ємо.",
    "Люди славні."
  ]
};

const SOURCE_SCREEN_COMPOSITIONS = {
  trip_hub: [
    { name: "lead", requiredTagsAny: ["people", "route", "money"], preferredTags: ["people", "route", "money"], preferredPersonas: ["manager", "supportive", "crew"] },
    { name: "state", requiredTagsAny: ["route", "money", "food"], preferredTags: ["route", "money", "food"], preferredPersonas: ["trail", "manager", "camp"] }
  ],
  trip_details: [
    { name: "lead", requiredTagsAny: ["route", "people", "money"], preferredTags: ["route", "people", "money"], preferredPersonas: ["manager", "supportive", "trail"] },
    { name: "state", requiredTagsAny: ["route", "money", "people", "food"], preferredTags: ["route", "money", "people", "food"], preferredPersonas: ["trail", "manager", "crew", "camp"] }
  ],
  trip_history: [
    { name: "lead", requiredTagsAny: ["people", "money", "route"], preferredTags: ["people", "money", "route"], preferredPersonas: ["manager", "supportive", "crew"] },
    { name: "state", requiredTagsAny: ["money", "route", "people"], preferredTags: ["money", "route", "people"], preferredPersonas: ["manager", "trail", "crew"], optional: true }
  ],
  trip_settings: [
    { name: "lead", requiredTagsAny: ["money", "people"], preferredTags: ["money", "people"], preferredPersonas: ["manager", "supportive"] }
  ],
  trip_members_menu: [
    { name: "lead", requiredTagsAny: ["people"], preferredTags: ["people"], preferredPersonas: ["crew", "supportive", "banter"], blockedPatterns: [/ветеран/iu] },
    { name: "state", requiredTagsAny: ["people"], preferredTags: ["people", "logistics"], preferredPersonas: ["crew", "manager", "supportive"], blockedPatterns: [/ветеран/iu], when: (state) => Number(state?.membersCount || 0) > 1 }
  ],
  trip_members_list: [
    { name: "lead", requiredTagsAny: ["people"], preferredTags: ["people"], preferredPersonas: ["crew", "supportive", "banter"], blockedPatterns: [/ветеран/iu] },
    { name: "state", requiredTagsAny: ["people"], preferredTags: ["people", "logistics"], preferredPersonas: ["crew", "manager", "supportive"], blockedPatterns: [/ветеран/iu], when: (state) => Number(state?.membersCount || 0) > 1 }
  ],
  trip_member_card: [
    { name: "lead", requiredTagsAny: ["people"], preferredTags: ["people"], preferredPersonas: ["crew", "supportive"], blockedPatterns: [/ветеран/iu] }
  ],
  trip_member_tickets: [
    { name: "lead", requiredTagsAny: ["money", "logistics", "people"], preferredTags: ["money", "logistics", "people"], preferredPersonas: ["manager", "crew", "supportive"] }
  ],
  route_menu: [
    { name: "lead", requiredTagsAny: ["route", "weather"], preferredTags: ["route", "weather"], preferredPersonas: ["trail", "supportive"] },
    { name: "state", requiredTagsAny: ["route", "weather"], preferredTags: ["route", "weather", "logistics"], preferredPersonas: ["trail", "manager"], when: (state) => Boolean(state?.routeDifficulty) }
  ],
  route_weather_picker: [
    { name: "lead", requiredTagsAny: ["weather", "route"], preferredTags: ["weather", "route"], preferredPersonas: ["trail", "supportive"] }
  ],
  route_weather: [
    { name: "lead", requiredTagsAny: ["weather", "route"], preferredTags: ["weather", "route"], preferredPersonas: ["trail", "supportive"] },
    { name: "state", requiredTagsAny: ["weather", "route"], preferredTags: ["weather", "route"], preferredPersonas: ["trail", "manager"], when: (state) => Boolean(state?.routeDifficulty) }
  ],
  food_menu: [
    { name: "lead", requiredTagsAny: ["food", "alcohol"], preferredTags: ["food", "alcohol"], preferredPersonas: ["boozy", "camp", "supportive"], blockedPatterns: [/побийте/iu, /компота/iu] },
    { name: "state", requiredTagsAny: ["food", "alcohol"], preferredTags: ["food", "alcohol"], preferredPersonas: ["boozy", "camp"], blockedPatterns: [/побийте/iu, /компота/iu], when: (state) => state?.foodEmpty === true || state?.alcoholEmpty === true || Number(state?.foodCount || 0) > 0 }
  ],
  food_list: [
    { name: "lead", requiredTagsAny: ["food", "alcohol"], preferredTags: ["food", "alcohol"], preferredPersonas: ["boozy", "camp", "supportive"], blockedPatterns: [/побийте/iu, /компота/iu] },
    { name: "state", requiredTagsAny: ["food", "alcohol"], preferredTags: ["food", "alcohol"], preferredPersonas: ["boozy", "camp"], blockedPatterns: [/побийте/iu, /компота/iu], when: (state) => state?.foodEmpty === true || state?.alcoholEmpty === true || Number(state?.foodCount || 0) > 0 }
  ],
  trip_mode: [
    { name: "lead", requiredTagsAny: ["alcohol", "food"], preferredTags: ["alcohol", "food", "logistics"], preferredPersonas: ["boozy", "manager", "supportive"], blockedPatterns: [/побийте/iu, /компота/iu] }
  ],
  trip_drunk_mode: [
    { name: "lead", requiredTagsAny: ["alcohol", "food"], preferredTags: ["alcohol", "food", "logistics"], preferredPersonas: ["boozy", "manager", "supportive"], blockedPatterns: [/побийте/iu, /компота/iu] },
    { name: "state", requiredTagsAny: ["alcohol", "food"], preferredTags: ["alcohol", "food"], preferredPersonas: ["boozy", "camp"], blockedPatterns: [/побийте/iu, /компота/iu], when: (state) => state?.alcoholEmpty === true || Number(state?.alcoholCount || 0) > 0 }
  ],
  expenses_menu: [
    { name: "lead", requiredTagsAny: ["money"], preferredTags: ["money", "logistics"], preferredPersonas: ["manager", "supportive"] },
    { name: "state", requiredTagsAny: ["money", "food"], preferredTags: ["money", "food"], preferredPersonas: ["manager", "camp"], when: (state) => Number(state?.expenseCount || 0) > 0 || state?.expenseEmpty === true }
  ],
  expenses_list: [
    { name: "lead", requiredTagsAny: ["money"], preferredTags: ["money", "logistics"], preferredPersonas: ["manager", "supportive"] },
    { name: "state", requiredTagsAny: ["money", "food"], preferredTags: ["money", "food"], preferredPersonas: ["manager", "camp"], when: (state) => Number(state?.expenseCount || 0) > 0 || state?.expenseEmpty === true }
  ],
  trip_photos: [
    { name: "lead", requiredTagsAny: ["people"], preferredTags: ["people", "trip"], preferredPersonas: ["crew", "supportive", "banter"] },
    { name: "state", requiredTagsAny: ["people"], preferredTags: ["people"], preferredPersonas: ["crew", "banter"], when: (state) => Number(state?.photoCount || 0) > 0 }
  ],
  trip_photo_album: [
    { name: "lead", requiredTagsAny: ["people"], preferredTags: ["people", "trip"], preferredPersonas: ["crew", "supportive", "banter"] },
    { name: "state", requiredTagsAny: ["people"], preferredTags: ["people"], preferredPersonas: ["crew", "banter"], when: (state) => Number(state?.photoCount || 0) > 0 }
  ]
};

const CURATED_THEATRE_SCREEN_LINES = {
  trip_hub: [
    { text: "Ітоги подвєдьом.", cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Папаша, всьо буде в лучшем відє.", cooldownScope: "trip" },
    { text: "Та вже мабуть прийшли.", when: (state) => Boolean(state?.routeDifficulty), cooldownScope: "trip" },
    { text: "Порядок денний короткий: не розсипатись, панове.", cooldownScope: "screen" },
    { text: "Зграя на місці, двіж під контролем.", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "screen" },
    { text: "Маршрут є, банда є, лишилось не гусити.", when: (state) => Boolean(state?.routeDifficulty), cooldownScope: "screen" },
    { text: "Дивись сюди, друже: тут вся походна бухгалтерія.", cooldownScope: "screen" },
    { text: "Без паніки, вуйки. Бот тримає цей цирк за шкірку.", cooldownScope: "screen" },
    { text: "Якщо все зелене — живемо. Якщо ні — підкрутимо.", cooldownScope: "screen" },
    { text: "Похід дихає. Тепер головне не зробити з нього гуску.", cooldownScope: "screen" }
  ],
  trip_details: [
    { text: "Ітоги подвєдьом.", cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Папаша, всьо буде в лучшем відє.", cooldownScope: "trip" },
    { text: "Та вже мабуть прийшли.", when: (state) => Boolean(state?.routeDifficulty), cooldownScope: "trip" },
    { text: "Деталі без романів: хто, куди, коли і з чим.", cooldownScope: "screen" },
    { text: "Оце паспорт походу, панове. Не загубіть.", cooldownScope: "screen" },
    { text: "Тут видно, чи це план, чи вже художня самодіяльність.", cooldownScope: "screen" },
    { text: "Якщо дата крива — не ний, редагуй.", cooldownScope: "screen" },
    { text: "Похід виглядає живим. Це вже непогано.", cooldownScope: "screen" },
    { text: "Дані зібрані. Тепер би ще люди не тупили.", cooldownScope: "screen" }
  ],
  trip_history: [
    { text: "Ітоги подвєдьом.", cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Де нас носило — тут і записано.", cooldownScope: "screen" },
    { text: "Архів подвигів і дрібної клоунади.", cooldownScope: "screen" },
    { text: "Минулі двіжі мовчать, але статистика все памʼятає.", cooldownScope: "screen" },
    { text: "Історія без пафосу: сходили, вижили, записали.", cooldownScope: "screen" }
  ],
  trip_settings: [
    { text: "Ітоги подвєдьом.", cooldownScope: "trip" },
    { text: "Папаша, всьо буде в лучшем відє.", cooldownScope: "trip" },
    { text: "Крутилки походу. Не крути без потреби, гусь.", cooldownScope: "screen" },
    { text: "Тут підкручуємо бардак, але акуратно.", cooldownScope: "screen" },
    { text: "Організаторська кухня. Стороннім не лапати.", cooldownScope: "screen" },
    { text: "Налаштування — це не іграшка, панове.", cooldownScope: "screen" }
  ],
  trip_members_menu: [
    { text: "Ми народ широкий і гостинний.", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Хлопці, агов!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Сідайте, хлопці, чаю поп’ємо.", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Хто в темі, той у списку. Хто гусь — той мовчить.", cooldownScope: "screen" },
    { text: "Банда тут. Перевір, хто реально йде.", cooldownScope: "screen" },
    { text: "Песюни й панове, статуси самі себе не підтвердять.", cooldownScope: "screen" },
    { text: "Склад зграї. Без людей походу не буде, буде прогулянка.", cooldownScope: "screen" },
    { text: "Тут видно, хто в строю, а хто думає як обізяна.", cooldownScope: "screen" }
  ],
  trip_members_list: [
    { text: "Ми народ широкий і гостинний.", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Хлопці, агов!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Сідайте, хлопці, чаю поп’ємо.", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Список банди. Тут без художньої самодіяльності.", cooldownScope: "screen" },
    { text: "Дивись, хто йде, хто думає, а хто злиняв.", cooldownScope: "screen" },
    { text: "Панове, статус — це не філософія. Йду або ні.", cooldownScope: "screen" },
    { text: "Команда має бути ясна, а не туманна як ранок після привалу.", cooldownScope: "screen" }
  ],
  trip_member_card: [
    { text: "Ми народ широкий і гостинний.", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Картка учасника. Дивись уважно, друже.", cooldownScope: "screen" },
    { text: "Одна морда — один статус. Все чесно.", cooldownScope: "screen" },
    { text: "Тут видно, чи людина в темі, чи просто гуляє повз.", cooldownScope: "screen" }
  ],
  route_menu: [
    { text: "Смотрєть надо!", cooldownScope: "trip" },
    { text: "Та вже мабуть прийшли.", when: (state) => Boolean(state?.routeDifficulty), cooldownScope: "trip" },
    { text: "Та куди ж іттіть?", when: (state) => Boolean(state?.routeDifficulty), cooldownScope: "trip" },
    { text: "Ви в страшні дєбрі забралісь.", when: (state) => state?.routeDifficulty === "висока", cooldownScope: "trip" },
    { text: "Праве плече вперед, кроком руш!", when: (state) => Boolean(state?.routeDifficulty), cooldownScope: "trip" },
    { text: "Куди премо — дивись тут, не ворожи по моху.", cooldownScope: "screen" },
    { text: "Маршрут не пробачає клоунади, панове.", cooldownScope: "screen" },
    { text: "Стежка є. Мізки вмикати окремою кнопкою не вмію.", cooldownScope: "screen" },
    { text: "Якщо складність висока — не грай героя, гусь.", when: (state) => state?.routeDifficulty === "висока", cooldownScope: "screen" },
    { text: "Навігація тут. Загубитись — поганий стиль.", cooldownScope: "screen" },
    { text: "Дорога намальована. Ноги — ваші.", cooldownScope: "screen" }
  ],
  route_weather_picker: [
    { text: "Смотрєть надо!", cooldownScope: "trip" },
    { text: "Ви тут сідітє, а на дворє такая пагода стаїть.", cooldownScope: "trip" },
    { text: "Как пагодка в Маскве?", cooldownScope: "trip" },
    { text: "Погода по точках. Обирай, де вас накриє.", cooldownScope: "screen" },
    { text: "Дощ не питає дозволу, тому дивимось прогноз.", cooldownScope: "screen" },
    { text: "Обери населений пункт, не тикати як обізяна.", cooldownScope: "screen" }
  ],
  route_weather: [
    { text: "Смотрєть надо!", cooldownScope: "trip" },
    { text: "Ви тут сідітє, а на дворє такая пагода стаїть.", cooldownScope: "trip" },
    { text: "Как пагодка в Маскве?", cooldownScope: "trip" },
    { text: "Оце не просто погода, це вирок по шмотках.", cooldownScope: "screen" },
    { text: "Якщо ллє — пакуй дощовик, а не понти.", cooldownScope: "screen" },
    { text: "Прогноз глянув. Тепер думай головою, вуйку.", cooldownScope: "screen" }
  ],
  food_menu: [
    { text: "Піти би випить в барі шампаньйоли.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "А ми випить хочемо.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "Бистро вставай і ріж ковбасу!", when: (state) => state?.foodEmpty === false, cooldownScope: "trip" },
    { text: "Я їсти хочу!", when: (state) => state?.foodEmpty === true, cooldownScope: "trip" },
    { text: "Ми народ широкий і гостинний.", when: (state) => state?.foodEmpty === false && Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Закусон — це стратегія, а не прикраса.", cooldownScope: "screen" },
    { text: "Без хавки двіж швидко стане сумним, курва.", cooldownScope: "screen" },
    { text: "Якщо алкоголю нуль — бот тихо дивиться на пивце.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "screen" },
    { text: "Продукти є — вже не голодна експедиція песюнів.", when: (state) => state?.foodEmpty === false, cooldownScope: "screen" },
    { text: "Ковбаса, хліб, вода. Без цього не геройствуй.", cooldownScope: "screen" },
    { text: "Закусон перевір. Бо потім будеш філософом на голодний шлунок.", cooldownScope: "screen" }
  ],
  food_list: [
    { text: "Піти би випить в барі шампаньйоли.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "А ми випить хочемо.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "Бистро вставай і ріж ковбасу!", when: (state) => state?.foodEmpty === false, cooldownScope: "trip" },
    { text: "Я їсти хочу!", when: (state) => state?.foodEmpty === true, cooldownScope: "trip" },
    { text: "Ми народ широкий і гостинний.", when: (state) => state?.foodEmpty === false && Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Оце список виживання, а не меню ресторану.", cooldownScope: "screen" },
    { text: "Глянь, чи є що жерти й чим запити.", cooldownScope: "screen" },
    { text: "Без води і закусону не стартуємо, гусь.", cooldownScope: "screen" },
    { text: "Хавка записана. Тепер би ще не забути її вдома.", cooldownScope: "screen" }
  ],
  gear_menu: [],
  gear_accounting: [],
  gear_borrowed: [],
  gear_loaned: [],
  gear_backpack: [],
  trip_mode: [
    { text: "Піти би випить в барі шампаньйоли.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "А ми випить хочемо.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "Режим двіжу. Обирай, як бот має базарити.", cooldownScope: "screen" },
    { text: "Пʼяниця — це голос походу для своїх, не для протоколу.", cooldownScope: "screen" }
  ],
  trip_drunk_mode: [
    { text: "Піти би випить в барі шампаньйоли.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "А ми випить хочемо.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "Пʼяниця активна. Бот говорить коротко і без сюсюкання.", cooldownScope: "screen" },
    { text: "Тон увімкнено. Тепер без канцелярщини, панове.", cooldownScope: "screen" },
    { text: "Алкодвіж прийнято. Але воду теж не ігноруємо.", cooldownScope: "screen" }
  ],
  expenses_menu: [
    { text: "П’ятьсот карбованців стоять.", cooldownScope: "trip" },
    { text: "Дай мені три карбованці, я завтра утром віддам.", cooldownScope: "trip" },
    { text: "Бабки люблять порядок, а не героїчний бардак.", cooldownScope: "screen" },
    { text: "Тут видно, хто платив, а хто робив вигляд.", cooldownScope: "screen" },
    { text: "Гроші рахуємо тверезо, навіть якщо режим не про це.", cooldownScope: "screen" },
    { text: "Витрати без туману: хто кому і скільки.", cooldownScope: "screen" }
  ],
  expenses_list: [
    { text: "П’ятьсот карбованців стоять.", cooldownScope: "trip" },
    { text: "Дай мені три карбованці, я завтра утром віддам.", cooldownScope: "trip" },
    { text: "Список бабок. Без магії, тільки арифметика.", cooldownScope: "screen" },
    { text: "Кожна гривня має знати свого винного.", cooldownScope: "screen" },
    { text: "Якщо сума крива — не кричи, редагуй.", cooldownScope: "screen" }
  ],
  trip_photos: [
    { text: "Кадри походу. Щоб було що згадати й чого соромитись.", cooldownScope: "screen" },
    { text: "Фотки сюди. Без них легенда швидко вʼяне.", cooldownScope: "screen" },
    { text: "Кадри є — значить двіж був не в теорії.", cooldownScope: "screen" },
    { text: "Фотоальбом для зграї, не для випадкових гусів.", cooldownScope: "screen" }
  ],
  trip_photo_album: [
    { text: "Альбом походу. Лица, гори і трохи компромату.", cooldownScope: "screen" },
    { text: "Оце вже хроніка, панове.", cooldownScope: "screen" },
    { text: "Дивись кадри й не ний, що ракурс не той.", cooldownScope: "screen" },
    { text: "Фото живуть тут, якщо ти справді був у поході.", cooldownScope: "screen" }
  ],
  idle_prompt: [
    { text: "Блядські ці питання зайобують.", cooldownScope: "screen" },
    { text: "Купатись чи не купатись?", cooldownScope: "screen" },
    { text: "Чиї вони?", cooldownScope: "screen" },
    { text: "Чиї ви?", cooldownScope: "screen" },
    { text: "Она жива?", cooldownScope: "screen" },
    { text: "Шо в нас козир?", cooldownScope: "screen" },
    { text: "Хто там? Сюди не можна.", cooldownScope: "screen" }
  ],
  edit_loop: [
    { text: "Блядські ці питання зайобують.", cooldownScope: "screen" },
    { text: "Купатись чи не купатись?", cooldownScope: "screen" },
    { text: "Я їбав таку жизнь.", cooldownScope: "screen" },
    { text: "Чиї вони?", cooldownScope: "screen" },
    { text: "Чиї ви?", cooldownScope: "screen" },
    { text: "Она жива?", cooldownScope: "screen" },
    { text: "Шо в нас козир?", cooldownScope: "screen" }
  ]
};

const SCREEN_ENTRY_GATES = {
  trip_hub: {
    requiredTagsAny: ["trip", "logistics", "generic"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 17,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(данко|гамлєт|ізергіль|івасик|кардинал|язва|гангрена|маргарита|клавдій|фрейд)\b/iu,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|здохл|вб'ю|нахуй|облом)\b/iu,
      /\b(мовчать|іттіть|контра|не\s+розмишлять)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  trip_details: {
    requiredTagsAny: ["trip", "logistics", "generic"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 17,
    maxWords: 9,
    blockedPatterns: [
      /[?]/u,
      /\b(данко|гамлєт|ізергіль|івасик|кардинал|язва|гангрена|маргарита|клавдій|фрейд)\b/iu,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|здохл|вб'ю|нахуй|облом)\b/iu,
      /\b(мовчать|іттіть|контра|не\s+розмишлять)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  trip_history: {
    requiredTagsAny: ["trip", "logistics", "generic"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 16,
    maxWords: 9,
    blockedPatterns: [
      /[?]/u,
      /\b(данко|гамлєт|ізергіль|івасик|кардинал|язва|гангрена)\b/iu,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|здохл|вб'ю|нахуй)\b/iu,
      /\b(мовчать|іттіть|контра|не\s+розмишлять)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  trip_settings: {
    requiredTagsAny: ["trip", "logistics", "generic"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 16,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(данко|гамлєт|ізергіль|івасик|кардинал|язва|гангрена)\b/iu,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|здохл|вб'ю|нахуй)\b/iu,
      /\b(мовчать|іттіть|контра|не\s+розмишлять)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  trip_members_menu: {
    requiredTagsAny: ["people"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 15,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(данко|гамлєт|ізергіль|івасик|кардинал)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  trip_members_list: {
    requiredTagsAny: ["people"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 15,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(данко|гамлєт|ізергіль|івасик|кардинал)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  trip_member_card: {
    requiredTagsAny: ["people"],
    allowedShapes: ["reaction", "observational"],
    minScore: 15,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  trip_member_tickets: {
    requiredTagsAny: ["people", "logistics"],
    allowedShapes: ["reaction", "observational"],
    minScore: 15,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  route_menu: {
    requiredTagsAny: ["route", "weather"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 16,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(данко|гамлєт|ізергіль|кардинал|івасик)\b/iu,
      /\b(я\s+їбав|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(мовчать|не\s+розмишлять)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  route_weather_picker: {
    requiredTagsAny: ["route", "weather"],
    allowedShapes: ["reaction", "observational"],
    minScore: 16,
    maxWords: 7,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(мовчать|не\s+розмишлять|контра)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  route_weather: {
    requiredTagsAny: ["route", "weather"],
    allowedShapes: ["reaction", "observational"],
    minScore: 16,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(мовчать|не\s+розмишлять|контра)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  gear_menu: {
    requiredTagsAny: ["gear"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 15,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  gear_accounting: {
    requiredTagsAny: ["gear"],
    allowedShapes: ["reaction", "observational"],
    minScore: 15,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  gear_borrowed: {
    requiredTagsAny: ["gear"],
    allowedShapes: ["reaction", "observational"],
    minScore: 14,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  gear_loaned: {
    requiredTagsAny: ["gear"],
    allowedShapes: ["reaction", "observational"],
    minScore: 14,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  gear_backpack: {
    requiredTagsAny: ["gear"],
    allowedShapes: ["reaction", "observational"],
    minScore: 14,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu
    ]
  },
  food_menu: {
    requiredTagsAny: ["food", "alcohol"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 15,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(данко|гамлєт|ізергіль|кардинал|івасик)\b/iu,
      /\b(я\s+їбав|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  food_list: {
    requiredTagsAny: ["food", "alcohol"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 15,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(данко|гамлєт|ізергіль|кардинал|івасик)\b/iu,
      /\b(я\s+їбав|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  trip_mode: {
    requiredTagsAny: ["food", "alcohol", "trip"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 15,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  trip_drunk_mode: {
    requiredTagsAny: ["food", "alcohol"],
    allowedShapes: ["reaction", "observational", "optimistic"],
    minScore: 15,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  expenses_menu: {
    requiredTagsAny: ["money", "logistics", "trip"],
    allowedShapes: ["reaction", "observational"],
    minScore: 14,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  expenses_list: {
    requiredTagsAny: ["money", "food", "logistics"],
    allowedShapes: ["reaction", "observational"],
    minScore: 14,
    maxWords: 8,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  },
  trip_photos: {
    requiredTagsAny: ["people", "trip"],
    allowedShapes: ["reaction", "observational"],
    minScore: 14,
    maxWords: 7,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu
    ]
  },
  trip_photo_album: {
    requiredTagsAny: ["people", "trip"],
    allowedShapes: ["reaction", "observational"],
    minScore: 14,
    maxWords: 7,
    blockedPatterns: [
      /[?]/u,
      /\b(я\s+їбав|зайоб|піздє?ц|смерть|розруха|вб'ю|нахуй)\b/iu,
      /\b(їб|єб|еб|хуй|пизд|жоп|срак|гандон|параш|сру|бзд|негр|кошенят|посмокт)\b/iu,
      /\bя\b/iu
    ]
  }
};

const SCREEN_TONE_POLICIES = {
  default: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.35,
    quipProbability: 0.04,
    catalogFallbackProbability: 0.12,
    catalogMinScore: 28,
    maxIntensity: "low",
    allowedDeliveries: ["banner", "quip", "footer"],
    preferredTags: ["generic", "trip"],
    secondaryTags: ["logistics"],
    blockedTags: ["fatalistic", "complaint", "command", "negative", "decision"]
  },
  trip_hub: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.24,
    quipProbability: 0,
    catalogFallbackProbability: 0.08,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["trip", "generic", "logistics"],
    secondaryTags: ["optimistic", "reaction"],
    blockedTags: ["fatalistic", "complaint", "command", "negative", "decision", "people", "route"]
  },
  trip_details: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.2,
    quipProbability: 0,
    catalogFallbackProbability: 0.08,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["trip", "generic", "logistics"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "command", "negative", "decision"]
  },
  trip_history: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.22,
    quipProbability: 0,
    catalogFallbackProbability: 0.08,
    catalogMinScore: 32,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["trip", "generic", "logistics"],
    secondaryTags: ["optimistic", "observational"],
    blockedTags: ["command"]
  },
  trip_settings: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.18,
    quipProbability: 0,
    catalogFallbackProbability: 0.06,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["generic", "trip", "logistics"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  trip_mode: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.24,
    quipProbability: 0.04,
    catalogFallbackProbability: 0.12,
    catalogMinScore: 32,
    maxIntensity: "low",
    allowedDeliveries: ["banner", "quip"],
    preferredTags: ["food", "alcohol", "trip"],
    secondaryTags: ["generic", "observational"],
    blockedTags: ["fatalistic", "command"]
  },
  trip_drunk_mode: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.26,
    quipProbability: 0.05,
    catalogFallbackProbability: 0.12,
    catalogMinScore: 32,
    maxIntensity: "low",
    allowedDeliveries: ["banner", "quip"],
    preferredTags: ["alcohol", "food", "trip"],
    secondaryTags: ["route", "optimistic"],
    blockedTags: ["fatalistic", "command"]
  },
  trip_photos: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.08,
    quipProbability: 0,
    catalogFallbackProbability: 0.04,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["generic", "trip", "people"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  trip_photo_album: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.1,
    quipProbability: 0,
    catalogFallbackProbability: 0.04,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["people", "trip", "generic"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  trip_members_menu: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.16,
    quipProbability: 0,
    catalogFallbackProbability: 0.08,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["people"],
    secondaryTags: ["generic", "trip"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  trip_members_list: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.16,
    quipProbability: 0,
    catalogFallbackProbability: 0.08,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["people"],
    secondaryTags: ["generic", "trip"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  trip_member_card: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.14,
    quipProbability: 0,
    catalogFallbackProbability: 0.06,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["people"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "negative", "command"]
  },
  trip_member_tickets: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.1,
    quipProbability: 0,
    catalogFallbackProbability: 0.04,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["people", "logistics"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "negative", "command"]
  },
  route_menu: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.24,
    quipProbability: 0.04,
    catalogFallbackProbability: 0.1,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner", "quip"],
    preferredTags: ["route", "weather"],
    secondaryTags: ["trip", "observational"],
    blockedTags: ["fatalistic", "complaint"]
  },
  route_weather_picker: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.14,
    quipProbability: 0,
    catalogFallbackProbability: 0.06,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["route", "weather"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  route_weather: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.18,
    quipProbability: 0,
    catalogFallbackProbability: 0.08,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["route", "weather"],
    secondaryTags: ["observational"],
    blockedTags: ["complaint", "command"]
  },
  gear_menu: {
    allowTheatre: false,
    maxLines: 1,
    bannerProbability: 0.18,
    quipProbability: 0.03,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["gear"],
    secondaryTags: ["generic", "observational"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  gear_accounting: {
    allowTheatre: false,
    maxLines: 1,
    bannerProbability: 0.16,
    quipProbability: 0,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["gear"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  gear_borrowed: {
    allowTheatre: false,
    maxLines: 1,
    bannerProbability: 0.12,
    quipProbability: 0,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["gear"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  gear_loaned: {
    allowTheatre: false,
    maxLines: 1,
    bannerProbability: 0.12,
    quipProbability: 0,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["gear"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  gear_backpack: {
    allowTheatre: false,
    maxLines: 1,
    bannerProbability: 0.12,
    quipProbability: 0,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["gear"],
    secondaryTags: ["observational"],
    blockedTags: ["fatalistic", "complaint", "negative"]
  },
  food_menu: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.18,
    quipProbability: 0.04,
    catalogFallbackProbability: 0.1,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner", "quip"],
    preferredTags: ["food", "alcohol"],
    secondaryTags: ["generic", "optimistic"],
    blockedTags: ["fatalistic", "command"]
  },
  food_list: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.18,
    quipProbability: 0.04,
    catalogFallbackProbability: 0.1,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner", "quip"],
    preferredTags: ["food", "alcohol"],
    secondaryTags: ["generic", "observational"],
    blockedTags: ["fatalistic", "command"]
  },
  expenses_menu: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.1,
    quipProbability: 0,
    catalogFallbackProbability: 0.08,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["money", "logistics", "generic"],
    secondaryTags: ["food", "trip"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  expenses_list: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0.1,
    quipProbability: 0,
    catalogFallbackProbability: 0.08,
    catalogMinScore: 34,
    maxIntensity: "low",
    allowedDeliveries: ["banner"],
    preferredTags: ["money", "food", "logistics"],
    secondaryTags: ["generic"],
    blockedTags: ["fatalistic", "complaint", "command", "negative"]
  },
  idle_prompt: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0,
    quipProbability: 1,
    catalogFallbackProbability: 0.6,
    catalogMinScore: 20,
    maxIntensity: "medium",
    allowedDeliveries: ["prompt", "quip"],
    preferredTags: ["question", "complaint"],
    secondaryTags: ["generic"],
    blockedTags: []
  },
  edit_loop: {
    allowTheatre: true,
    maxLines: 1,
    bannerProbability: 0,
    quipProbability: 1,
    catalogFallbackProbability: 0.6,
    catalogMinScore: 20,
    maxIntensity: "medium",
    allowedDeliveries: ["prompt", "quip", "warning"],
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

function shouldUseDefaultDictionaryForDrunkKey(key = "") {
  const normalizedKey = String(key || "");
  if (!normalizedKey) {
    return false;
  }

  return normalizedKey.startsWith("trip.") || normalizedKey.startsWith("system.");
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

function normalizeConfusableCyrillic(value = "") {
  return Array.from(String(value || ""))
    .map((char) => CONFUSABLE_CYRILLIC_MAP.get(char) || char)
    .join("");
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

function normalizeToneText(value = "") {
  return normalizeConfusableCyrillic(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function countToneWords(value = "") {
  return normalizeConfusableCyrillic(value)
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .length;
}

function tokenizeToneText(value = "") {
  return normalizeConfusableCyrillic(value)
    .toLowerCase()
    .match(/[a-zа-яіїєґ0-9'-]{3,}/giu) || [];
}

function getStateFlags(state = {}) {
  const flags = new Set();

  if (state?.alcoholEmpty === true) {
    flags.add("alcohol_empty");
  }
  if (Number(state?.alcoholCount || 0) > 0) {
    flags.add("alcohol_present");
  }
  if (state?.foodEmpty === true) {
    flags.add("food_empty");
  } else if (Number(state?.foodCount || 0) > 0 || state?.foodEmpty === false) {
    flags.add("food_present");
  }
  if (state?.gearEmpty === true) {
    flags.add("gear_missing");
  } else if (Number(state?.gearCount || 0) > 0 || state?.gearEmpty === false) {
    flags.add("gear_present");
  }
  if (state?.photoEmpty === true) {
    flags.add("photos_empty");
  } else if (Number(state?.photoCount || 0) > 0) {
    flags.add("photos_present");
  }
  if (Number(state?.membersCount || 0) > 1) {
    flags.add("members_plural");
  }
  if (Number(state?.expenseCount || 0) > 0 || state?.expenseEmpty === false) {
    flags.add("expenses_present");
  }
  if (state?.expenseEmpty === true) {
    flags.add("expenses_empty");
  }
  if (state?.routeDifficulty) {
    flags.add("route_known");
    flags.add(`route_${state.routeDifficulty}`);
  }
  if (state?.backpackDataReady === true) {
    flags.add("backpack_ready");
  }
  if (state?.uiWaiting === true) {
    flags.add("ui_waiting");
  }
  if (state?.editRepeated === true) {
    flags.add("edit_repeated");
  }
  if (state?.toneMode !== "drunk") {
    flags.add("no_alco_mode");
  }

  return flags;
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

function getPolicyForbiddenFlags(screen = "default", delivery = "banner") {
  return new Set([
    `screen:${screen}`,
    `delivery:${delivery}`
  ]);
}

function buildContextKeywords(screen = "default", state = {}, delivery = "banner") {
  const keywords = new Set(SCREEN_CONTEXT_KEYWORDS[screen] || []);

  if (delivery === "prompt") {
    keywords.add("prompt");
    keywords.add("decision");
  }
  if (delivery === "quip") {
    keywords.add("reaction");
  }
  if (state?.alcoholEmpty === true) {
    keywords.add("alcohol");
    keywords.add("empty");
  }
  if (Number(state?.alcoholCount || 0) > 0) {
    keywords.add("alcohol");
    keywords.add("present");
  }
  if (state?.foodEmpty === true) {
    keywords.add("food");
    keywords.add("empty");
  }
  if (Number(state?.foodCount || 0) > 0) {
    keywords.add("food");
    keywords.add("present");
  }
  if (state?.gearEmpty === true) {
    keywords.add("gear");
    keywords.add("empty");
  }
  if (Number(state?.gearCount || 0) > 0) {
    keywords.add("gear");
    keywords.add("present");
  }
  if (state?.photoEmpty === true) {
    keywords.add("photos");
    keywords.add("empty");
  }
  if (Number(state?.photoCount || 0) > 0) {
    keywords.add("photos");
    keywords.add("album");
  }
  if (Number(state?.membersCount || 0) > 1) {
    keywords.add("members");
    keywords.add("people");
    keywords.add("group");
  }
  if (state?.routeDifficulty) {
    keywords.add("route");
    keywords.add("mountain");
    keywords.add("difficulty");
    keywords.add(String(state.routeDifficulty).toLowerCase());
  }
  if (Number(state?.expenseCount || 0) > 0 || state?.expenseEmpty === false) {
    keywords.add("expenses");
    keywords.add("money");
    keywords.add("budget");
  }
  if (state?.uiWaiting === true) {
    keywords.add("prompt");
    keywords.add("waiting");
  }
  if (state?.editRepeated === true) {
    keywords.add("edit");
    keywords.add("repeat");
  }

  return keywords;
}

function getScreenPersonaRule(screen = "default") {
  return SCREEN_PERSONA_RULES[screen] || SCREEN_PERSONA_RULES.default;
}

function countKeywordOverlap(entryKeywords = [], contextKeywords = new Set()) {
  if (!Array.isArray(entryKeywords) || !entryKeywords.length || !contextKeywords.size) {
    return 0;
  }

  let overlap = 0;
  for (const keyword of entryKeywords) {
    if (contextKeywords.has(String(keyword || "").toLowerCase())) {
      overlap += 1;
    }
  }
  return overlap;
}

function isBlockedByScreenStyle(screen = "default", text = "") {
  const normalizedText = normalizeConfusableCyrillic(text);
  if (SOURCE_TEXT_BLACKLIST_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    return true;
  }
  const patterns = SCREEN_STYLE_BLOCKS[screen] || [];
  return patterns.some((pattern) => pattern.test(normalizedText));
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
  const normalizedSource = normalizeToneText(entry?.sourceTitle || "");
  const sourceMarker = normalizedSource ? `source:${normalizedSource}` : "";

  for (const bucket of buckets) {
    const history = getHistory(bucket);
    if (history.includes(normalizedText)) {
      return true;
    }
    if (sourceMarker && history.includes(sourceMarker)) {
      return true;
    }
  }

  if (entry?.cooldownScope === "trip" && state?.tripId) {
    const tripHistory = getHistory(`trip:${state.tripId}`);
    return tripHistory.includes(normalizedText) || (sourceMarker ? tripHistory.includes(sourceMarker) : false);
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

  const normalizedSource = normalizeToneText(entry?.sourceTitle || "");
  const sourceMarker = normalizedSource ? `source:${normalizedSource}` : "";
  if (sourceMarker) {
    for (const bucket of [screen ? `screen:${screen}` : "", state?.tripId ? `trip:${state.tripId}` : ""].filter(Boolean)) {
      pushHistory(bucket, sourceMarker, 4);
    }
  }

  if (entry?.cooldownScope === "trip" && state?.tripId) {
    pushHistory(`trip:${state.tripId}`, normalizedText, 10);
    if (sourceMarker) {
      pushHistory(`trip:${state.tripId}`, sourceMarker, 6);
    }
  }
}

function getScreenPoolEntries(screen = "default") {
  return theatreToneScreenPools.get(screen) || [];
}

function scorePoolSlotEntry(poolItem, slot = {}, screen = "default", state = {}, delivery = "banner") {
  const entry = poolItem?.entry;
  if (!entry) {
    return -1;
  }

  const tags = Array.isArray(entry?.tags) ? entry.tags : [];
  const keywords = Array.isArray(entry?.keywords) ? entry.keywords : [];
  const contextKeywords = buildContextKeywords(screen, state, delivery);
  const overlap = countKeywordOverlap(keywords, contextKeywords);
  const slotTags = Array.isArray(slot?.preferredTags) ? slot.preferredTags : [];
  const slotPersonas = Array.isArray(slot?.preferredPersonas) ? slot.preferredPersonas : [];
  const requiredTagsAny = Array.isArray(slot?.requiredTagsAny) ? slot.requiredTagsAny : [];
  const poolScore = Number(poolItem?.score || 0);
  const textTokens = tokenizeToneText(entry?.text || "");

  if (requiredTagsAny.length && !requiredTagsAny.some((tag) => tags.includes(tag))) {
    return -1;
  }
  if (requiredTagsAny.length) {
    const requiredRoots = requiredTagsAny.flatMap((tag) => TAG_TEXT_ROOT_HINTS[tag] || []);
    if (requiredRoots.length && !requiredRoots.some((root) => textTokens.some((token) => token.startsWith(root)))) {
      return -1;
    }
  }

  let score = poolScore;
  score += slotTags.reduce((sum, tag) => sum + (tags.includes(tag) ? 7 : 0), 0);
  score += slotPersonas.includes(entry?.personaCue) ? 9 : 0;
  score += overlap * 3;
  score += Number(entry?.specificity || 0);

  if (state?.alcoholEmpty && tags.includes("alcohol")) {
    score += 4;
  }
  if (state?.foodEmpty && tags.includes("food")) {
    score += 3;
  }
  if (state?.photoEmpty === false && tags.includes("people") && (screen === "trip_photos" || screen === "trip_photo_album")) {
    score += 3;
  }
  if (state?.routeDifficulty && (tags.includes("route") || tags.includes("weather"))) {
    score += 4;
  }
  if (Number(state?.expenseCount || 0) > 0 && tags.includes("money")) {
    score += 3;
  }
  if (Number(state?.membersCount || 0) > 1 && tags.includes("people")) {
    score += 2;
  }

  return score;
}

function pickSourcePoolEntry(screen = "default", slot = {}, state = {}, usedTexts = null, scopeKey = "") {
  if (typeof slot?.when === "function" && !slot.when(state)) {
    return null;
  }

  const pool = getScreenPoolEntries(screen);
  if (!pool.length) {
    return null;
  }

  const scored = pool
    .map((poolItem, index) => {
      const entry = poolItem?.entry;
      const normalizedText = normalizeToneText(entry?.text || "");
      if (!entry || !normalizedText) {
        return null;
      }
      if (usedTexts?.has(normalizedText) || isOnCooldown(entry, normalizedText, screen, `${scopeKey}:${slot?.name || "slot"}`, state)) {
        return null;
      }
      if (!matchesEntryRequirements(entry, { ...state, toneMode: "drunk" }, screen, "banner")) {
        return null;
      }
      if (Array.isArray(slot?.blockedPatterns) && slot.blockedPatterns.some((pattern) => pattern.test(entry.text || ""))) {
        return null;
      }
      if (isBlockedByScreenStyle(screen, entry.text || "")) {
        return null;
      }
      if (!isToneEntryScreenSafe(entry, screen, "banner", Number(poolItem?.score || 0), state)) {
        return null;
      }
      const score = scorePoolSlotEntry(poolItem, slot, screen, state, "banner");
      if (score < 0) {
        return null;
      }
      return { entry, normalizedText, score, index };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  if (!scored.length) {
    return null;
  }

  const lastKey = `source:${screen}:${slot?.name || "slot"}:${scopeKey}`;
  const previous = lastRandomSelections.get(lastKey);
  const topSlice = scored.slice(0, Math.min(5, scored.length));
  const poolWithoutPrevious = topSlice.filter((item) => item.normalizedText !== previous);
  const picked = (poolWithoutPrevious.length ? poolWithoutPrevious : topSlice)[Math.floor(Math.random() * (poolWithoutPrevious.length ? poolWithoutPrevious.length : topSlice.length))];

  if (!picked) {
    return null;
  }

  usedTexts?.add(picked.normalizedText);
  rememberToneSelection(picked.entry, picked.normalizedText, screen, `${scopeKey}:${slot?.name || "slot"}`, state);
  lastRandomSelections.set(lastKey, picked.normalizedText);
  return picked.entry.text;
}

function pickSourceScreenText(screen = "default", state = {}, usedTexts = null, scopeKey = "", maxLines = 1) {
  const candidateTexts = SOURCE_SCREEN_TEXTS[screen];
  if (!Array.isArray(candidateTexts) || !candidateTexts.length) {
    return [];
  }

  const localUsed = usedTexts || new Set();
  const selected = [];
  const lastKey = `source-catalog:${screen}:${scopeKey}`;
  const previous = lastRandomSelections.get(lastKey);
  const orderedTexts = [...candidateTexts].sort(() => Math.random() - 0.5);
  if (previous) {
    orderedTexts.sort((left, right) => Number(normalizeToneText(left) === previous) - Number(normalizeToneText(right) === previous));
  }

  for (const rawText of orderedTexts) {
    if (selected.length >= maxLines) {
      break;
    }

    const entry = theatreToneEntriesByText.get(normalizeToneText(rawText));
    const normalizedText = normalizeToneText(rawText);
    if (!entry || !normalizedText) {
      continue;
    }
    if (localUsed.has(normalizedText) || isOnCooldown(entry, normalizedText, screen, `${scopeKey}:source-list`, state)) {
      continue;
    }
    if (!matchesEntryRequirements(entry, { ...state, toneMode: "drunk" }, screen, "banner")) {
      continue;
    }
    if (isBlockedByScreenStyle(screen, rawText)) {
      continue;
    }

    localUsed.add(normalizedText);
    rememberToneSelection(entry, normalizedText, screen, `${scopeKey}:source-list`, state);
    selected.push(entry.text);
    lastRandomSelections.set(lastKey, normalizedText);
  }

  return selected;
}

function buildSourceCompositionBlock(screen = "default", state = {}, scopeKey = "", usedTexts = null, maxLines = 1) {
  const curatedSourceLines = pickSourceScreenText(screen, state, usedTexts, scopeKey, maxLines);
  if (curatedSourceLines.length) {
    return curatedSourceLines.slice(0, maxLines);
  }

  const slots = SOURCE_SCREEN_COMPOSITIONS[screen];
  if (!Array.isArray(slots) || !slots.length) {
    return [];
  }

  const localUsed = usedTexts || new Set();
  const lines = [];

  for (const slot of slots) {
    if (lines.length >= maxLines) {
      break;
    }

    const line = pickSourcePoolEntry(screen, slot, state, localUsed, scopeKey);
    if (line) {
      lines.push(line);
    }
  }

  if (!lines.length) {
    const fallback = pickSourcePoolEntry(screen, { name: "fallback" }, state, localUsed, scopeKey);
    if (fallback) {
      lines.push(fallback);
    }
  }

  return lines.slice(0, maxLines);
}

function getScreenEntryGate(screen = "default") {
  return SCREEN_ENTRY_GATES[screen] || null;
}

function matchesBlockedPattern(text = "", patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function pickCuratedTheatreLine(screen = "default", state = {}, usedTexts = null, scopeKey = "") {
  return "";
}

function hasCuratedTheatreScreen(screen = "default") {
  return false;
}

function isToneEntryScreenSafe(entry, screen, delivery, score, state = {}) {
  const gate = getScreenEntryGate(screen);
  if (!gate) {
    return true;
  }

  const text = String(entry?.text || "").trim();
  const tags = Array.isArray(entry?.tags) ? entry.tags : [];

  if (Array.isArray(gate.allowedShapes) && gate.allowedShapes.length && !gate.allowedShapes.includes(entry?.toneShape)) {
    return false;
  }

  if (Array.isArray(gate.requiredTagsAny) && gate.requiredTagsAny.length && !gate.requiredTagsAny.some((tag) => tags.includes(tag))) {
    return false;
  }

  if (delivery === "banner" && entry?.toneShape === "question") {
    return false;
  }

  if (typeof gate.maxWords === "number" && countToneWords(text) > gate.maxWords) {
    return false;
  }

  if (typeof gate.minScore === "number" && score < gate.minScore) {
    return false;
  }

  if (matchesBlockedPattern(text, gate.blockedPatterns || [])) {
    return false;
  }

  if (isBlockedByScreenStyle(screen, text)) {
    return false;
  }

  if (screen === "trip_photo_album" && state?.photoEmpty && tags.includes("people") === false) {
    return false;
  }

  return true;
}

function matchesEntryRequirements(entry, state = {}, screen = "default", delivery = "banner") {
  const stateFlags = getStateFlags(state);
  const requiredFlags = Array.isArray(entry?.requires) ? entry.requires : [];
  const forbiddenFlags = Array.isArray(entry?.forbiddenWhen) ? entry.forbiddenWhen : [];
  const policyForbidden = getPolicyForbiddenFlags(screen, delivery);

  if (requiredFlags.length && !requiredFlags.every((flag) => stateFlags.has(flag))) {
    return false;
  }

  for (const flag of forbiddenFlags) {
    if (stateFlags.has(flag) || policyForbidden.has(flag)) {
      return false;
    }
  }

  return true;
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
  const keywords = Array.isArray(entry?.keywords) ? entry.keywords : [];
  const contextKeywords = buildContextKeywords(screen, state, delivery);
  const overlap = countKeywordOverlap(keywords, contextKeywords);
  const specificity = Number(entry?.specificity || 0);
  const topicalTagCount = tags.filter((tag) => TOPICAL_TAGS.includes(tag)).length;
  const genericOnly = topicalTagCount === 0 && !tags.includes("logistics") && !tags.includes("money");
  const personaCue = String(entry?.personaCue || "banter");
  const personaRule = getScreenPersonaRule(screen);

  if (policy.blockedTags.some((tag) => tags.includes(tag))) {
    return -1;
  }

  if (Array.isArray(personaRule?.blocked) && personaRule.blocked.includes(personaCue)) {
    return -1;
  }

  if (Array.isArray(policy.allowedDeliveries) && policy.allowedDeliveries.length && !policy.allowedDeliveries.includes(delivery)) {
    return -1;
  }

  if (!matchesEntryRequirements(entry, { ...state, toneMode: "drunk" }, screen, delivery)) {
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

  score += Math.min(specificity, 9);
  score += topicalTagCount * 3;
  score += overlap * 4;
  score += Array.isArray(personaRule?.preferred) && personaRule.preferred.includes(personaCue) ? 5 : 0;

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

  if (genericOnly) {
    score -= 8;
  }

  if (contextKeywords.size > 0 && overlap === 0 && (topicalTagCount > 0 || genericOnly)) {
    score -= 10;
  }

  if (screen === "trip_hub" || screen === "trip_details") {
    if (overlap === 0) {
      score -= 6;
    }
    if (tags.includes("question") || entry?.toneShape === "question") {
      score -= 8;
    }
  }

  if ((screen === "route_menu" || screen === "route_weather" || screen === "route_weather_picker") && !tags.includes("route") && !tags.includes("weather")) {
    score -= 8;
  }

  if ((screen === "food_menu" || screen === "food_list" || screen === "trip_mode" || screen === "trip_drunk_mode") && !tags.includes("food") && !tags.includes("alcohol")) {
    score -= 8;
  }

  if ((screen === "trip_members_menu" || screen === "trip_members_list" || screen === "trip_member_card" || screen === "trip_member_tickets") && !tags.includes("people")) {
    score -= 8;
  }

  if ((screen === "expenses_menu" || screen === "expenses_list") && !tags.includes("money") && !tags.includes("logistics") && !tags.includes("food")) {
    score -= 8;
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
  if (policy.allowTheatre === false) {
    return "";
  }
  const poolItems = getScreenPoolEntries(screen);
  const candidateEntries = poolItems.length
    ? poolItems.map((item) => item.entry).filter(Boolean)
    : (theatreToneIndexByScreen.get(screen) || []);

  if (!candidateEntries.length) {
    return "";
  }

  const scored = candidateEntries
    .map((entry, index) => {
      const normalizedText = normalizeToneText(entry?.text || "");
      if (!normalizedText) {
        return null;
      }

      if (usedTexts?.has(normalizedText) || isOnCooldown(entry, normalizedText, screen, scopeKey, state)) {
        return null;
      }

      const poolBoost = poolItems.find((item) => item?.entry?.id === entry?.id)?.score || 0;
      const score = scoreToneEntry(entry, screen, delivery, policy, state) + Math.floor(poolBoost / 4);
      if (score < 0) {
        return null;
      }

      if (typeof policy.catalogMinScore === "number" && score < policy.catalogMinScore) {
        return null;
      }

      if (!isToneEntryScreenSafe(entry, screen, delivery, score, state)) {
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
  const sourceCompositionLines = buildSourceCompositionBlock(screen, state, scopeKey, localUsed, targetMaxLines);
  if (sourceCompositionLines.length) {
    return sourceCompositionLines.slice(0, targetMaxLines);
  }
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

export function buildScreenToneBlock({
  screen = "default",
  event = "view",
  mode = "default",
  scopeKey = "",
  state = {},
  maxLines = null,
  usedTexts = null
} = {}) {
  const eventState = {
    ...state,
    uiWaiting: event === "prompt" || state?.uiWaiting === true,
    editRepeated: event === "edit_loop" || state?.editRepeated === true
  };

  return buildToneBlock({
    screen,
    mode,
    scopeKey,
    state: eventState,
    maxLines,
    usedTexts
  });
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
  const dictionaryMode = resolvedMode === "drunk" && shouldUseDefaultDictionaryForDrunkKey(key)
    ? "default"
    : resolvedMode;
  const value = getNestedValue(getDictionary(dictionaryMode), key);
  const fallbackValue = getNestedValue(toneDictionaries.default, key);
  const selected = value === undefined ? fallbackValue : value;
  return materialize(selected, params);
}

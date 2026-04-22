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
const theatreToneCatalog = readToneFile("generated/theatre-catalog", { optional: true });

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

const CURATED_THEATRE_SCREEN_LINES = {
  trip_hub: [
    { text: "Ітоги подвєдьом.", cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Папаша, всьо буде в лучшем відє.", cooldownScope: "trip" },
    { text: "Та вже мабуть прийшли.", when: (state) => Boolean(state?.routeDifficulty), cooldownScope: "trip" }
  ],
  trip_details: [
    { text: "Ітоги подвєдьом.", cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Папаша, всьо буде в лучшем відє.", cooldownScope: "trip" },
    { text: "Та вже мабуть прийшли.", when: (state) => Boolean(state?.routeDifficulty), cooldownScope: "trip" }
  ],
  trip_history: [
    { text: "Ітоги подвєдьом.", cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" }
  ],
  trip_settings: [
    { text: "Ітоги подвєдьом.", cooldownScope: "trip" },
    { text: "Папаша, всьо буде в лучшем відє.", cooldownScope: "trip" }
  ],
  trip_members_menu: [
    { text: "Ми народ широкий і гостинний.", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Хлопці, агов!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Сідайте, хлопці, чаю поп’ємо.", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" }
  ],
  trip_members_list: [
    { text: "Ми народ широкий і гостинний.", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Хлопці, агов!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "Сідайте, хлопці, чаю поп’ємо.", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" }
  ],
  trip_member_card: [
    { text: "Ми народ широкий і гостинний.", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" },
    { text: "А вірно хлопці! А діло каже!", when: (state) => Number(state?.membersCount || 0) > 1, cooldownScope: "trip" }
  ],
  route_menu: [
    { text: "Смотрєть надо!", cooldownScope: "trip" },
    { text: "Та вже мабуть прийшли.", when: (state) => Boolean(state?.routeDifficulty), cooldownScope: "trip" },
    { text: "Та куди ж іттіть?", when: (state) => Boolean(state?.routeDifficulty), cooldownScope: "trip" },
    { text: "Ви в страшні дєбрі забралісь.", when: (state) => state?.routeDifficulty === "висока", cooldownScope: "trip" },
    { text: "Праве плече вперед, кроком руш!", when: (state) => Boolean(state?.routeDifficulty), cooldownScope: "trip" }
  ],
  route_weather_picker: [
    { text: "Смотрєть надо!", cooldownScope: "trip" },
    { text: "Ви тут сідітє, а на дворє такая пагода стаїть.", cooldownScope: "trip" },
    { text: "Как пагодка в Маскве?", cooldownScope: "trip" }
  ],
  route_weather: [
    { text: "Смотрєть надо!", cooldownScope: "trip" },
    { text: "Ви тут сідітє, а на дворє такая пагода стаїть.", cooldownScope: "trip" },
    { text: "Как пагодка в Маскве?", cooldownScope: "trip" }
  ],
  food_menu: [
    { text: "Піти би випить в барі шампаньйоли.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "А ми випить хочемо.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "Бистро вставай і ріж ковбасу!", when: (state) => state?.foodEmpty === false, cooldownScope: "trip" },
    { text: "Я їсти хочу!", when: (state) => state?.foodEmpty === true, cooldownScope: "trip" },
    { text: "Ми народ широкий і гостинний.", when: (state) => state?.foodEmpty === false && Number(state?.membersCount || 0) > 1, cooldownScope: "trip" }
  ],
  food_list: [
    { text: "Піти би випить в барі шампаньйоли.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "А ми випить хочемо.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "Бистро вставай і ріж ковбасу!", when: (state) => state?.foodEmpty === false, cooldownScope: "trip" },
    { text: "Я їсти хочу!", when: (state) => state?.foodEmpty === true, cooldownScope: "trip" },
    { text: "Ми народ широкий і гостинний.", when: (state) => state?.foodEmpty === false && Number(state?.membersCount || 0) > 1, cooldownScope: "trip" }
  ],
  gear_menu: [],
  gear_accounting: [],
  gear_borrowed: [],
  gear_loaned: [],
  gear_backpack: [],
  trip_mode: [
    { text: "Піти би випить в барі шампаньйоли.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "А ми випить хочемо.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" }
  ],
  trip_drunk_mode: [
    { text: "Піти би випить в барі шампаньйоли.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" },
    { text: "А ми випить хочемо.", when: (state) => state?.alcoholEmpty === true, cooldownScope: "trip" }
  ],
  expenses_menu: [
    { text: "П’ятьсот карбованців стоять.", cooldownScope: "trip" },
    { text: "Дай мені три карбованці, я завтра утром віддам.", cooldownScope: "trip" }
  ],
  expenses_list: [
    { text: "П’ятьсот карбованців стоять.", cooldownScope: "trip" },
    { text: "Дай мені три карбованці, я завтра утром віддам.", cooldownScope: "trip" }
  ],
  trip_photos: [],
  trip_photo_album: [],
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

function normalizeToneText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function countToneWords(value = "") {
  return String(value || "")
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .length;
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

function getScreenEntryGate(screen = "default") {
  return SCREEN_ENTRY_GATES[screen] || null;
}

function matchesBlockedPattern(text = "", patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function pickCuratedTheatreLine(screen = "default", state = {}, usedTexts = null, scopeKey = "") {
  const entries = CURATED_THEATRE_SCREEN_LINES[screen];
  if (!Array.isArray(entries) || !entries.length) {
    return "";
  }

  const prepared = entries
    .filter((entry) => typeof entry?.text === "string" && entry.text.trim())
    .filter((entry) => (typeof entry?.when === "function" ? entry.when(state) : true))
    .map((entry) => ({
      text: entry.text.trim(),
      normalizedText: normalizeToneText(entry.text),
      priority: Number(entry?.priority || 0),
      cooldownScope: entry?.cooldownScope || "screen"
    }))
    .filter((entry) => entry.normalizedText && !usedTexts?.has(entry.normalizedText))
    .filter((entry) => !isOnCooldown({ cooldownScope: entry.cooldownScope }, entry.normalizedText, screen, scopeKey, state))
    .sort((left, right) => right.priority - left.priority || left.text.localeCompare(right.text, "uk"));

  if (!prepared.length) {
    return "";
  }

  const previous = lastRandomSelections.get(`curated:${screen}:${scopeKey}`);
  const pool = prepared.filter((entry) => entry.text !== previous);
  const picked = pool[Math.floor(Math.random() * pool.length)] || prepared[0];
  if (!picked) {
    return "";
  }

  usedTexts?.add(picked.normalizedText);
  rememberToneSelection({ cooldownScope: picked.cooldownScope }, picked.normalizedText, screen, scopeKey, state);
  lastRandomSelections.set(`curated:${screen}:${scopeKey}`, picked.text);
  return picked.text;
}

function hasCuratedTheatreScreen(screen = "default") {
  return Object.prototype.hasOwnProperty.call(CURATED_THEATRE_SCREEN_LINES, screen);
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
  if (policy.blockedTags.some((tag) => tags.includes(tag))) {
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
  if (policy.allowTheatre === false) {
    return "";
  }
  const candidates = theatreToneIndexByScreen.get(screen) || [];
  const curatedLine = pickCuratedTheatreLine(screen, state, usedTexts, scopeKey);
  if (curatedLine) {
    return curatedLine;
  }
  if (hasCuratedTheatreScreen(screen) && !candidates.length) {
    return "";
  }

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
  const value = getNestedValue(getDictionary(resolvedMode), key);
  const fallbackValue = getNestedValue(toneDictionaries.default, key);
  const selected = value === undefined ? fallbackValue : value;
  return materialize(selected, params);
}

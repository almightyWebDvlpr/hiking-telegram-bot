import Fuse from "fuse.js";

function normalizeExpenseSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("’", "'")
    .replaceAll("`", "'")
    .replaceAll("-", " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function capitalizeWord(word) {
  if (!word) {
    return "";
  }

  return word.charAt(0).toUpperCase() + word.slice(1);
}

function humanizeExpenseTitle(value) {
  const normalized = String(value || "").trim().replaceAll(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  return normalized
    .split(" ")
    .map((word) => capitalizeWord(word))
    .join(" ");
}

function scoreKeywordMatch(normalizedValue, keyword) {
  const normalizedKeyword = normalizeExpenseSearch(keyword);
  if (!normalizedKeyword) {
    return 0;
  }

  if (normalizedValue === normalizedKeyword) {
    return 2000 + normalizedKeyword.length;
  }

  if (normalizedValue.startsWith(`${normalizedKeyword} `) || normalizedValue.endsWith(` ${normalizedKeyword}`)) {
    return 1200 + normalizedKeyword.length;
  }

  if (normalizedValue.includes(normalizedKeyword)) {
    return 600 + normalizedKeyword.length;
  }

  return 0;
}

function hasRouteHint(normalizedValue = "") {
  const value = String(normalizedValue || "");
  return value.includes("→") || value.includes("->") || /\bз\b.+\bдо\b/.test(value);
}

export const EXPENSE_CATEGORIES = [
  { key: "transport", icon: "🚆", label: "Транспорт" },
  { key: "transfer", icon: "🚐", label: "Трансфер і довіз" },
  { key: "food", icon: "🍲", label: "Харчування" },
  { key: "lodging", icon: "🛏", label: "Ночівля" },
  { key: "fuel", icon: "🔥", label: "Газ і пальне" },
  { key: "tickets", icon: "🎟", label: "Квитки і збори" },
  { key: "rental", icon: "🎒", label: "Оренда спорядження" },
  { key: "medical", icon: "💊", label: "Аптека і медицина" },
  { key: "insurance", icon: "🛡", label: "Страхування" },
  { key: "parking", icon: "🅿️", label: "Паркування і камери схову" },
  { key: "communication", icon: "📶", label: "Зв'язок і сервіс" },
  { key: "equipment", icon: "🛠", label: "Ремонт і дрібне спорядження" },
  { key: "other", icon: "🧾", label: "Інше" }
];

const EXPENSE_NAME_ALIASES = [
  { canonical: "Квиток на потяг", categoryKey: "transport", keywords: ["квиток потяг", "залізничний квиток", "квиток на поїзд", "квиток на потяг", "поїзд", "потяг", "купе", "плацкарт", "інтерсіті", "укрзалізниця"] },
  { canonical: "Квиток на автобус", categoryKey: "transport", keywords: ["квиток автобус", "автобус", "маршрутка", "квиток на автобус", "міжміський автобус", "автобусний квиток"] },
  { canonical: "Квиток на електричку", categoryKey: "transport", keywords: ["електричка", "квиток на електричку", "приміський поїзд"] },
  { canonical: "Міський транспорт", categoryKey: "transport", keywords: ["метро", "трамвай", "тролейбус", "міський автобус", "проїзд по місту"] },
  { canonical: "Таксі", categoryKey: "transfer", keywords: ["таксі", "taxi", "uber", "bolt"] },
  { canonical: "Трансфер", categoryKey: "transfer", keywords: ["трансфер", "шатл", "shuttle", "довіз", "підвіз", "підкинути машиною"] },
  { canonical: "Закидання до старту", categoryKey: "transfer", keywords: ["закидання", "закидка", "закидання до старту", "довіз до старту", "під'їзд до старту"] },
  { canonical: "Оренда авто", categoryKey: "transfer", keywords: ["оренда авто", "прокат авто", "машина в оренду"] },
  { canonical: "Продукти", categoryKey: "food", keywords: ["продукти", "закупка", "харчі", "їжа", "супермаркет", "продуктовий магазин"] },
  { canonical: "Харчування в закладі", categoryKey: "food", keywords: ["кафе", "ресторан", "колиба", "обід", "вечеря", "сніданок", "харчування в закладі"] },
  { canonical: "Перекус / кава", categoryKey: "food", keywords: ["кава", "чай", "перекус", "смаколики в дорогу", "булочка", "шаверма"] },
  { canonical: "Ночівля", categoryKey: "lodging", keywords: ["ночівля", "готель", "садиба", "хостел", "проживання", "апартаменти"] },
  { canonical: "Кемпінг", categoryKey: "lodging", keywords: ["кемпінг", "місце в кемпінгу", "плата за кемпінг"] },
  { canonical: "База відпочинку", categoryKey: "lodging", keywords: ["база відпочинку", "котедж", "будиночок", "шале"] },
  { canonical: "Газовий балон", categoryKey: "fuel", keywords: ["газ", "газовий балон", "балон", "балончик", "газовий картридж"] },
  { canonical: "Спирт / рідке пальне", categoryKey: "fuel", keywords: ["спирт", "сухий спирт", "рідке пальне", "паливо для пальника"] },
  { canonical: "Бензин / мультитопливне пальне", categoryKey: "fuel", keywords: ["бензин", "паливо", "пальне", "мультитопливне пальне", "white gas"] },
  { canonical: "Дрова / розпалювання", categoryKey: "fuel", keywords: ["дрова", "розпалка", "розпалювання", "паливні брикети"] },
  { canonical: "Вхідний квиток", categoryKey: "tickets", keywords: ["вхідний квиток", "вхід", "вхід у музей", "вхід у парк", "вхід у заповідник"] },
  { canonical: "Екологічний збір", categoryKey: "tickets", keywords: ["екозбір", "екологічний збір", "рекреаційний збір", "плата за вхід у парк"] },
  { canonical: "Перепустка", categoryKey: "tickets", keywords: ["перепустка", "дозвіл", "permit", "пропуск"] },
  { canonical: "Послуги гіда / інструктора", categoryKey: "tickets", keywords: ["гід", "інструктор", "послуги гіда", "супровід"] },
  { canonical: "Оренда спорядження", categoryKey: "rental", keywords: ["оренда", "прокат", "оренда спорядження", "прокат спорядження"] },
  { canonical: "Оренда намету", categoryKey: "rental", keywords: ["оренда намету", "прокат намету"] },
  { canonical: "Оренда спальника", categoryKey: "rental", keywords: ["оренда спальника", "прокат спальника", "оренда спального мішка"] },
  { canonical: "Оренда зимового спорядження", categoryKey: "rental", keywords: ["оренда кішок", "оренда льодоруба", "оренда каски", "оренда бахіл"] },
  { canonical: "Аптека / ліки", categoryKey: "medical", keywords: ["аптека", "ліки", "таблетки", "бинт", "пластир", "знеболювальне", "антисептик"] },
  { canonical: "Страхування", categoryKey: "insurance", keywords: ["страхування", "страховка", "поліс", "медичне страхування"] },
  { canonical: "Паркування", categoryKey: "parking", keywords: ["паркування", "пракування", "парковка", "стоянка", "parking"] },
  { canonical: "Камера схову", categoryKey: "parking", keywords: ["камера схову", "сховок багажу", "зберігання речей"] },
  { canonical: "Зв'язок / інтернет", categoryKey: "communication", keywords: ["зв'язок", "інтернет", "мобільний інтернет", "поповнення рахунку", "esim", "роумінг"] },
  { canonical: "Зарядка / сервіс", categoryKey: "communication", keywords: ["зарядка телефону", "платна зарядка", "душ", "туалет", "сервісний збір"] },
  { canonical: "Ремонт спорядження", categoryKey: "equipment", keywords: ["ремонт спорядження", "ремонт намету", "ремонт пальника", "ремонт рюкзака"] },
  { canonical: "Дрібне спорядження", categoryKey: "equipment", keywords: ["батарейки", "скотч", "ремнабір", "мотузка", "карабін", "пакети", "гермомішок"] }
];

const EXPENSE_ALIAS_RECORDS = EXPENSE_NAME_ALIASES.flatMap((item) =>
  item.keywords.map((keyword) => ({
    keyword: normalizeExpenseSearch(keyword),
    canonical: item.canonical,
    categoryKey: item.categoryKey,
    alias: item
  }))
).filter((record) => record.keyword);

const EXPENSE_ALIAS_FUSE = new Fuse(EXPENSE_ALIAS_RECORDS, {
  includeScore: true,
  threshold: 0.34,
  ignoreLocation: true,
  minMatchCharLength: 3,
  keys: [
    { name: "keyword", weight: 0.8 },
    { name: "canonical", weight: 0.2 }
  ]
});

function resolveExpenseAlias(title) {
  const normalized = normalizeExpenseSearch(title);
  const routeHint = hasRouteHint(normalized);
  let bestAlias = null;
  let bestScore = 0;

  for (const item of EXPENSE_NAME_ALIASES) {
    if (routeHint && item.canonical === "Вхідний квиток") {
      continue;
    }
    for (const keyword of item.keywords) {
      const score = scoreKeywordMatch(normalized, keyword);
      if (score > bestScore) {
        bestAlias = item;
        bestScore = score;
      }
    }
  }

  if (bestAlias) {
    return bestAlias;
  }

  if (normalized.length < 3) {
    return null;
  }

  const [match] = EXPENSE_ALIAS_FUSE.search(normalized, { limit: 1 });
  if (match?.item?.alias && (match.score ?? 1) <= 0.34) {
    if (routeHint && match.item.alias.canonical === "Вхідний квиток") {
      return null;
    }
    return match.item.alias;
  }

  return null;
}

export function canonicalizeExpenseTitle(title) {
  const normalized = normalizeExpenseSearch(title);
  if (!normalized) {
    return "";
  }

  const alias = resolveExpenseAlias(title);
  if (alias) {
    return alias.canonical;
  }

  return humanizeExpenseTitle(title);
}

export function categorizeExpenseTitle(title) {
  const alias = resolveExpenseAlias(title);
  const category = EXPENSE_CATEGORIES.find((item) => item.key === alias?.categoryKey) || EXPENSE_CATEGORIES.find((item) => item.key === "other");
  return {
    key: category.key,
    icon: category.icon,
    label: category.label,
    title: `${category.icon} ${category.label}`
  };
}

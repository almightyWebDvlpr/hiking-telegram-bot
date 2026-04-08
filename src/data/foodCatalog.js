function normalizeFoodSearch(value) {
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

function humanizeFoodName(value) {
  const normalized = String(value || "")
    .trim()
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\s*-\s*/g, " - ");

  if (!normalized) {
    return "";
  }

  return normalized
    .split(" ")
    .map((word) => capitalizeWord(word))
    .join(" ");
}

function matchesKeyword(normalizedValue, keyword) {
  const normalizedKeyword = normalizeFoodSearch(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  if (normalizedValue === normalizedKeyword) {
    return true;
  }

  return normalizedValue.includes(normalizedKeyword);
}

export const FOOD_CATEGORIES = [
  { key: "water_drinks", icon: "🥤", label: "Напої і вода" },
  { key: "grains", icon: "🌾", label: "Крупи і гарніри" },
  { key: "protein", icon: "🥩", label: "Білкові продукти" },
  { key: "snacks", icon: "🍫", label: "Перекуси" },
  { key: "bread", icon: "🥖", label: "Хліб і випічка" },
  { key: "seasonings", icon: "🧂", label: "Додатки і приправи" },
  { key: "ready_meals", icon: "🍲", label: "Готові страви" },
  { key: "other", icon: "🍽", label: "Інше" }
];

const FOOD_NAME_ALIASES = [
  { canonical: "Вода", measureKind: "volume", categoryKey: "water_drinks", keywords: ["вода", "питна вода", "мінералка", "мінеральна вода"] },
  { canonical: "Чай", measureKind: "weight", categoryKey: "water_drinks", keywords: ["чай", "tea", "чай чорний", "чай зелений"] },
  { canonical: "Кава", measureKind: "weight", categoryKey: "water_drinks", keywords: ["кава", "coffee", "розчинна кава", "мелена кава"] },
  { canonical: "Ізотонік", measureKind: "volume", categoryKey: "water_drinks", keywords: ["ізотонік", "isotonic", "електроліти", "спортивний напій"] },
  { canonical: "Гречка", measureKind: "weight", categoryKey: "grains", keywords: ["гречка", "гречана крупа"] },
  { canonical: "Рис", measureKind: "weight", categoryKey: "grains", keywords: ["рис", "rice"] },
  { canonical: "Макарони", measureKind: "weight", categoryKey: "grains", keywords: ["макарони", "паста", "вермішель", "локшина"] },
  { canonical: "Вівсянка", measureKind: "weight", categoryKey: "grains", keywords: ["вівсянка", "вівсяні пластівці", "овсянка"] },
  { canonical: "Булгур", measureKind: "weight", categoryKey: "grains", keywords: ["булгур"] },
  { canonical: "Кускус", measureKind: "weight", categoryKey: "grains", keywords: ["кускус", "кус кус", "couscous"] },
  { canonical: "Пюре швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["пюре", "картопляне пюре", "сухе пюре"] },
  { canonical: "Суп швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["суп", "суп швидкого приготування", "сухий суп", "локшина швидкого приготування"] },
  { canonical: "Сублімати", measureKind: "weight", categoryKey: "ready_meals", keywords: ["сублімати", "сублімат", "ліофілізат", "сублімована їжа"] },
  { canonical: "Тушкованка", measureKind: "weight", categoryKey: "protein", keywords: ["тушкованка", "тушонка"] },
  { canonical: "Консерви м'ясні", measureKind: "weight", categoryKey: "protein", keywords: ["м'ясна консерва", "консерви м'ясні", "мясна консерва"] },
  { canonical: "Консерви рибні", measureKind: "weight", categoryKey: "protein", keywords: ["рибна консерва", "консерви рибні", "тунець", "сардина"] },
  { canonical: "Ковбаса", measureKind: "weight", categoryKey: "protein", keywords: ["ковбаса", "суха ковбаса", "салямі", "салями"] },
  { canonical: "Сир твердий", measureKind: "weight", categoryKey: "protein", keywords: ["сир", "сир твердий", "твердий сир"] },
  { canonical: "Сало", measureKind: "weight", categoryKey: "protein", keywords: ["сало"] },
  { canonical: "Горіхи", measureKind: "weight", categoryKey: "snacks", keywords: ["горіхи", "горіх", "мигдаль", "кеш'ю", "арахіс"] },
  { canonical: "Сухофрукти", measureKind: "weight", categoryKey: "snacks", keywords: ["сухофрукти", "родзинки", "курага", "фініки"] },
  { canonical: "Батончики", measureKind: "weight", categoryKey: "snacks", keywords: ["батончики", "батончик", "енергетичний батончик", "protein bar"] },
  { canonical: "Шоколад", measureKind: "weight", categoryKey: "snacks", keywords: ["шоколад", "chocolate"] },
  { canonical: "Печиво", measureKind: "weight", categoryKey: "snacks", keywords: ["печиво", "галети", "крекери", "крекер"] },
  { canonical: "Хліб", measureKind: "weight", categoryKey: "bread", keywords: ["хліб", "батон"] },
  { canonical: "Лаваш", measureKind: "weight", categoryKey: "bread", keywords: ["лаваш", "тортилья", "тортілья"] },
  { canonical: "Цукор", measureKind: "weight", categoryKey: "seasonings", keywords: ["цукор", "sugar"] },
  { canonical: "Сіль", measureKind: "weight", categoryKey: "seasonings", keywords: ["сіль", "salt"] },
  { canonical: "Олія", measureKind: "volume", categoryKey: "seasonings", keywords: ["олія", "масло", "соняшникова олія", "оливкова олія"] },
  { canonical: "Соус", measureKind: "volume", categoryKey: "seasonings", keywords: ["соус", "кетчуп", "майонез", "гірчиця"] }
];

function resolveFoodAlias(name) {
  const normalized = normalizeFoodSearch(name);
  return FOOD_NAME_ALIASES.find((item) => item.keywords.some((keyword) => matchesKeyword(normalized, keyword))) || null;
}

export function canonicalizeFoodName(name) {
  const normalized = normalizeFoodSearch(name);
  if (!normalized) {
    return "";
  }

  const alias = resolveFoodAlias(name);
  if (alias) {
    return alias.canonical;
  }

  return humanizeFoodName(name);
}

export function inferFoodMeasureKind(name) {
  return resolveFoodAlias(name)?.measureKind || "any";
}

export function categorizeFoodName(name) {
  const alias = resolveFoodAlias(name);
  const category = FOOD_CATEGORIES.find((item) => item.key === alias?.categoryKey) || FOOD_CATEGORIES.find((item) => item.key === "other");
  return {
    key: category.key,
    icon: category.icon,
    label: category.label,
    title: `${category.icon} ${category.label}`
  };
}

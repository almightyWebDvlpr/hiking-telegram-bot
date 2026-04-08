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

function matchesKeyword(normalizedValue, keyword) {
  const normalizedKeyword = normalizeExpenseSearch(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  if (normalizedValue === normalizedKeyword) {
    return true;
  }

  return normalizedValue.includes(normalizedKeyword);
}

export const EXPENSE_CATEGORIES = [
  { key: "transport", icon: "🚆", label: "Транспорт" },
  { key: "transfer", icon: "🚐", label: "Трансфер" },
  { key: "food", icon: "🍲", label: "Харчування" },
  { key: "lodging", icon: "🛏", label: "Ночівля" },
  { key: "fuel", icon: "🔥", label: "Газ і пальне" },
  { key: "tickets", icon: "🎟", label: "Квитки і збори" },
  { key: "rental", icon: "🎒", label: "Оренда спорядження" },
  { key: "other", icon: "🧾", label: "Інше" }
];

const EXPENSE_NAME_ALIASES = [
  { canonical: "Квиток на потяг", categoryKey: "transport", keywords: ["квиток потяг", "залізничний квиток", "квиток на поїзд", "поїзд", "потяг"] },
  { canonical: "Квиток на автобус", categoryKey: "transport", keywords: ["квиток автобус", "автобус", "маршрутка", "квиток на автобус"] },
  { canonical: "Таксі", categoryKey: "transfer", keywords: ["таксі", "taxi"] },
  { canonical: "Трансфер", categoryKey: "transfer", keywords: ["трансфер", "шатл", "shuttle", "довіз", "підвіз"] },
  { canonical: "Продукти", categoryKey: "food", keywords: ["продукти", "закупка", "харчі", "їжа"] },
  { canonical: "Ночівля", categoryKey: "lodging", keywords: ["ночівля", "готель", "садиба", "хостел", "проживання"] },
  { canonical: "Газ / пальне", categoryKey: "fuel", keywords: ["газ", "балон", "пальне", "паливо"] },
  { canonical: "Вхідний квиток", categoryKey: "tickets", keywords: ["вхідний квиток", "екозбір", "збір", "квиток", "перепустка"] },
  { canonical: "Оренда спорядження", categoryKey: "rental", keywords: ["оренда", "прокат", "оренда спорядження"] }
];

function resolveExpenseAlias(title) {
  const normalized = normalizeExpenseSearch(title);
  return EXPENSE_NAME_ALIASES.find((item) => item.keywords.some((keyword) => matchesKeyword(normalized, keyword))) || null;
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

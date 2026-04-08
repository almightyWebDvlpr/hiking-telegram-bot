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

function scoreKeywordMatch(normalizedValue, keyword) {
  const normalizedKeyword = normalizeFoodSearch(keyword);
  if (!normalizedKeyword) {
    return 0;
  }

  if (normalizedValue === normalizedKeyword) {
    return 1000 + normalizedKeyword.length;
  }

  if (normalizedValue.startsWith(`${normalizedKeyword} `) || normalizedValue.endsWith(` ${normalizedKeyword}`)) {
    return 700 + normalizedKeyword.length;
  }

  if (normalizedValue.includes(normalizedKeyword)) {
    return 300 + normalizedKeyword.length;
  }

  return 0;
}

export const FOOD_CATEGORIES = [
  { key: "water_drinks", icon: "🥤", label: "Напої і вода" },
  { key: "grains", icon: "🌾", label: "Крупи і гарніри" },
  { key: "protein", icon: "🥩", label: "Білкові продукти" },
  { key: "breakfast", icon: "🥣", label: "Сніданки" },
  { key: "spreads", icon: "🫙", label: "Намазки і пасти" },
  { key: "vegetables", icon: "🥕", label: "Овочі і зелень" },
  { key: "fruits", icon: "🍎", label: "Фрукти" },
  { key: "sweets", icon: "🍬", label: "Солодке" },
  { key: "snacks", icon: "🍫", label: "Перекуси" },
  { key: "bread", icon: "🥖", label: "Хліб і випічка" },
  { key: "seasonings", icon: "🧂", label: "Додатки і приправи" },
  { key: "ready_meals", icon: "🍲", label: "Готові страви" },
  { key: "other", icon: "🍽", label: "Інше" }
];

const FOOD_NAME_ALIASES = [
  { canonical: "Вода", measureKind: "volume", categoryKey: "water_drinks", keywords: ["вода", "питна вода", "мінералка", "мінеральна вода"] },
  { canonical: "Чай", measureKind: "weight", categoryKey: "water_drinks", keywords: ["чай", "tea", "чай чорний", "чай зелений", "травяний чай", "трав'яний чай", "карпатський чай", "пакетики чаю"] },
  { canonical: "Кава", measureKind: "weight", categoryKey: "water_drinks", keywords: ["кава", "coffee", "розчинна кава", "мелена кава", "кава 3в1", "кава 3 в 1"] },
  { canonical: "Какао", measureKind: "weight", categoryKey: "water_drinks", keywords: ["какао", "гарячий шоколад", "hot chocolate"] },
  { canonical: "Ізотонік", measureKind: "volume", categoryKey: "water_drinks", keywords: ["ізотонік", "isotonic", "електроліти", "спортивний напій", "порошок електролітів"] },
  { canonical: "Сік", measureKind: "volume", categoryKey: "water_drinks", keywords: ["сік", "juice", "пакетований сік"] },
  { canonical: "Компот", measureKind: "volume", categoryKey: "water_drinks", keywords: ["компот", "узвар"] },
  { canonical: "Гречка", measureKind: "weight", categoryKey: "grains", keywords: ["гречка", "гречана крупа"] },
  { canonical: "Рис", measureKind: "weight", categoryKey: "grains", keywords: ["рис", "rice"] },
  { canonical: "Макарони", measureKind: "weight", categoryKey: "grains", keywords: ["макарони", "паста", "вермішель", "локшина"] },
  { canonical: "Вівсянка", measureKind: "weight", categoryKey: "grains", keywords: ["вівсянка", "вівсяні пластівці", "овсянка"] },
  { canonical: "Булгур", measureKind: "weight", categoryKey: "grains", keywords: ["булгур"] },
  { canonical: "Кускус", measureKind: "weight", categoryKey: "grains", keywords: ["кускус", "кус кус", "couscous"] },
  { canonical: "Пшоно", measureKind: "weight", categoryKey: "grains", keywords: ["пшоно", "пшоняна крупа"] },
  { canonical: "Перловка", measureKind: "weight", categoryKey: "grains", keywords: ["перловка", "перлова крупа"] },
  { canonical: "Сочевиця", measureKind: "weight", categoryKey: "grains", keywords: ["сочевиця", "червона сочевиця", "зелена сочевиця", "lentils"] },
  { canonical: "Нут", measureKind: "weight", categoryKey: "grains", keywords: ["нут", "chickpeas"] },
  { canonical: "Бурий рис", measureKind: "weight", categoryKey: "grains", keywords: ["бурий рис", "коричневий рис"] },
  { canonical: "Кіноа", measureKind: "weight", categoryKey: "grains", keywords: ["кіноа", "quinoa"] },
  { canonical: "Пластівці швидкого приготування", measureKind: "weight", categoryKey: "breakfast", keywords: ["пластівці", "пластівці швидкого приготування", "сніданок швидкого приготування", "мюслі", "гранола"] },
  { canonical: "Манка", measureKind: "weight", categoryKey: "breakfast", keywords: ["манка", "манна крупа"] },
  { canonical: "Сухе молоко", measureKind: "weight", categoryKey: "breakfast", keywords: ["сухе молоко", "молоко сухе"] },
  { canonical: "Пюре швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["пюре", "картопляне пюре", "сухе пюре"] },
  { canonical: "Суп швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["суп", "суп швидкого приготування", "сухий суп", "локшина швидкого приготування", "суп пакет", "суп в пакеті"] },
  { canonical: "Борщ швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["борщ", "борщ швидкого приготування", "сухий борщ"] },
  { canonical: "Сублімати", measureKind: "weight", categoryKey: "ready_meals", keywords: ["сублімати", "сублімат", "ліофілізат", "сублімована їжа", "сублімована вечеря", "сублімований обід"] },
  { canonical: "Тушкованка", measureKind: "weight", categoryKey: "protein", keywords: ["тушкованка", "тушонка", "тушонка яловича", "тушонка свиняча", "тушенка"] },
  { canonical: "Паштет", measureKind: "weight", categoryKey: "spreads", keywords: ["паштет", "печінковий паштет", "мясний паштет", "м'ясний паштет"] },
  { canonical: "Намазка", measureKind: "weight", categoryKey: "spreads", keywords: ["намазка", "намазки", "спред", "ready spread"] },
  { canonical: "Арахісова паста", measureKind: "weight", categoryKey: "spreads", keywords: ["арахісова паста", "арахісова паста", "peanut butter"] },
  { canonical: "Шоколадна паста", measureKind: "weight", categoryKey: "spreads", keywords: ["шоколадна паста", "нутелла", "nutella"] },
  { canonical: "Хумус", measureKind: "weight", categoryKey: "spreads", keywords: ["хумус", "hummus"] },
  { canonical: "Джем", measureKind: "weight", categoryKey: "spreads", keywords: ["джем", "повидло", "варення", "конфітюр"] },
  { canonical: "Мед", measureKind: "weight", categoryKey: "spreads", keywords: ["мед", "мьод", "honey"] },
  { canonical: "Консерви м'ясні", measureKind: "weight", categoryKey: "protein", keywords: ["м'ясна консерва", "консерви м'ясні", "мясна консерва", "консервоване м'ясо", "консерва м'ясо"] },
  { canonical: "Консерви рибні", measureKind: "weight", categoryKey: "protein", keywords: ["рибна консерва", "консерви рибні", "тунець", "сардина", "шпроти", "скумбрія консервована"] },
  { canonical: "Ковбаса", measureKind: "weight", categoryKey: "protein", keywords: ["ковбаса", "суха ковбаса", "салямі", "салями", "мисливські ковбаски"] },
  { canonical: "Сир твердий", measureKind: "weight", categoryKey: "protein", keywords: ["сир", "сир твердий", "твердий сир", "пармезан", "гауда", "чедер"] },
  { canonical: "Сир плавлений", measureKind: "weight", categoryKey: "protein", keywords: ["плавлений сир", "сирок плавлений", "плавлений сирок"] },
  { canonical: "Бринза", measureKind: "weight", categoryKey: "protein", keywords: ["бринза", "овечий сир"] },
  { canonical: "Сало", measureKind: "weight", categoryKey: "protein", keywords: ["сало"] },
  { canonical: "В'ялене м'ясо", measureKind: "weight", categoryKey: "protein", keywords: ["в'ялене м'ясо", "джерки", "jerky", "сушене м'ясо"] },
  { canonical: "Яйця", measureKind: "count", categoryKey: "protein", keywords: ["яйця", "яйце", "варені яйця"] },
  { canonical: "Квасоля консервована", measureKind: "weight", categoryKey: "protein", keywords: ["квасоля консервована", "консервована квасоля", "фасоля консервована"] },
  { canonical: "Горіхи", measureKind: "weight", categoryKey: "snacks", keywords: ["горіхи", "горіх", "мигдаль", "кеш'ю", "арахіс", "волоські горіхи", "фісташки"] },
  { canonical: "Сухофрукти", measureKind: "weight", categoryKey: "snacks", keywords: ["сухофрукти", "родзинки", "курага", "фініки", "чорнослив", "інжир сушений"] },
  { canonical: "Батончики", measureKind: "weight", categoryKey: "snacks", keywords: ["батончики", "батончик", "енергетичний батончик", "protein bar", "мюслі батончик", "снікерс"] },
  { canonical: "Шоколад", measureKind: "weight", categoryKey: "sweets", keywords: ["шоколад", "chocolate", "молочний шоколад", "чорний шоколад"] },
  { canonical: "Цукерки", measureKind: "weight", categoryKey: "sweets", keywords: ["цукерки", "льодяники", "карамельки", "желейки"] },
  { canonical: "Печиво", measureKind: "weight", categoryKey: "snacks", keywords: ["печиво", "галети", "крекери", "крекер", "сухе печиво"] },
  { canonical: "Хлібці", measureKind: "weight", categoryKey: "bread", keywords: ["хлібці", "сухарики хлібці", "crispbread"] },
  { canonical: "Сухарі", measureKind: "weight", categoryKey: "bread", keywords: ["сухарі", "сухарики", "грінки сухі"] },
  { canonical: "Хліб", measureKind: "weight", categoryKey: "bread", keywords: ["хліб", "батон"] },
  { canonical: "Лаваш", measureKind: "weight", categoryKey: "bread", keywords: ["лаваш", "тортилья", "тортілья", "піта"] },
  { canonical: "Булочки", measureKind: "weight", categoryKey: "bread", keywords: ["булочки", "булка", "булочка"] },
  { canonical: "Картопля", measureKind: "weight", categoryKey: "vegetables", keywords: ["картопля", "картошка"] },
  { canonical: "Цибуля", measureKind: "weight", categoryKey: "vegetables", keywords: ["цибуля", "лук"] },
  { canonical: "Часник", measureKind: "weight", categoryKey: "vegetables", keywords: ["часник", "чеснок"] },
  { canonical: "Морква", measureKind: "weight", categoryKey: "vegetables", keywords: ["морква", "морковка"] },
  { canonical: "Огірки", measureKind: "weight", categoryKey: "vegetables", keywords: ["огірки", "огірок", "огурцы", "огірочки"] },
  { canonical: "Помідори", measureKind: "weight", categoryKey: "vegetables", keywords: ["помідори", "помідор", "томати", "томат"] },
  { canonical: "Перець", measureKind: "weight", categoryKey: "vegetables", keywords: ["перець болгарський", "солодкий перець", "болгарський перець"] },
  { canonical: "Зелень", measureKind: "weight", categoryKey: "vegetables", keywords: ["зелень", "кріп", "петрушка", "зелена цибуля"] },
  { canonical: "Яблука", measureKind: "weight", categoryKey: "fruits", keywords: ["яблука", "яблуко"] },
  { canonical: "Банани", measureKind: "weight", categoryKey: "fruits", keywords: ["банани", "банан"] },
  { canonical: "Лимон", measureKind: "weight", categoryKey: "fruits", keywords: ["лимон", "лимони"] },
  { canonical: "Апельсини", measureKind: "weight", categoryKey: "fruits", keywords: ["апельсини", "апельсин"] },
  { canonical: "Цукор", measureKind: "weight", categoryKey: "seasonings", keywords: ["цукор", "sugar"] },
  { canonical: "Сіль", measureKind: "weight", categoryKey: "seasonings", keywords: ["сіль", "salt"] },
  { canonical: "Олія", measureKind: "volume", categoryKey: "seasonings", keywords: ["олія", "масло", "соняшникова олія", "оливкова олія"] },
  { canonical: "Соус", measureKind: "volume", categoryKey: "seasonings", keywords: ["соус", "кетчуп", "майонез", "гірчиця", "соєвий соус", "чилі соус"] },
  { canonical: "Спеції", measureKind: "weight", categoryKey: "seasonings", keywords: ["спеції", "приправи", "суміш спецій", "приправа"] },
  { canonical: "Бульйон", measureKind: "weight", categoryKey: "seasonings", keywords: ["бульйон", "бульйонний кубик", "кубик бульйонний"] },
  { canonical: "Сухий часник", measureKind: "weight", categoryKey: "seasonings", keywords: ["сухий часник", "гранульований часник"] },
  { canonical: "Перець чорний", measureKind: "weight", categoryKey: "seasonings", keywords: ["чорний перець", "перець чорний", "мелений перець"] },
  { canonical: "Пюре швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["пюре", "картопляне пюре", "сухе пюре"] },
  { canonical: "Локшина швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["локшина швидкого приготування", "мівіна", "мівіна локшина", "рамен", "noodles"] },
  { canonical: "Готова каша", measureKind: "weight", categoryKey: "ready_meals", keywords: ["готова каша", "каша швидкого приготування", "рисова каша", "гречана каша"] }
];

function resolveFoodAlias(name) {
  const normalized = normalizeFoodSearch(name);
  let bestAlias = null;
  let bestScore = 0;

  for (const item of FOOD_NAME_ALIASES) {
    for (const keyword of item.keywords) {
      const score = scoreKeywordMatch(normalized, keyword);
      if (score > bestScore) {
        bestAlias = item;
        bestScore = score;
      }
    }
  }

  return bestAlias;
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

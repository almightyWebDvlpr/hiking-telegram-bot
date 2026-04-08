import Fuse from "fuse.js";

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

function scoreKeywordMatch(normalizedValue, keyword) {
  const normalizedKeyword = normalizeFoodSearch(keyword);
  if (!normalizedKeyword) {
    return 0;
  }

  if (normalizedValue === normalizedKeyword) {
    return 2000 + normalizedKeyword.length;
  }

  if (normalizedValue.startsWith(`${normalizedKeyword} `) || normalizedValue.endsWith(` ${normalizedKeyword}`)) {
    return 1300 + normalizedKeyword.length;
  }

  if (normalizedValue.includes(normalizedKeyword)) {
    return 700 + normalizedKeyword.length;
  }

  return 0;
}

export const FOOD_CATEGORIES = [
  { key: "water_drinks", icon: "🥤", label: "Напої і вода" },
  { key: "alcohol", icon: "🍷", label: "Алкоголь" },
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
  { canonical: "Вода", measureKind: "volume", categoryKey: "water_drinks", keywords: ["вода", "питна вода", "мінералка", "мінеральна вода", "негазована вода", "газована вода"] },
  { canonical: "Чай", measureKind: "weight", categoryKey: "water_drinks", keywords: ["чай", "tea", "чай чорний", "чай зелений", "травяний чай", "трав'яний чай", "карпатський чай", "пакетики чаю", "листовий чай"] },
  { canonical: "Кава", measureKind: "weight", categoryKey: "water_drinks", keywords: ["кава", "coffee", "розчинна кава", "мелена кава", "кава 3в1", "кава 3 в 1", "drip coffee"] },
  { canonical: "Какао", measureKind: "weight", categoryKey: "water_drinks", keywords: ["какао", "гарячий шоколад", "hot chocolate", "какао напій"] },
  { canonical: "Ізотонік", measureKind: "volume", categoryKey: "water_drinks", keywords: ["ізотонік", "isotonic", "електроліти", "спортивний напій", "порошок електролітів", "electrolytes"] },
  { canonical: "Сік", measureKind: "volume", categoryKey: "water_drinks", keywords: ["сік", "juice", "пакетований сік", "мультивітамінний сік"] },
  { canonical: "Компот", measureKind: "volume", categoryKey: "water_drinks", keywords: ["компот", "узвар", "морс"] },
  { canonical: "Газований напій", measureKind: "volume", categoryKey: "water_drinks", keywords: ["солодка вода", "газований напій", "cola", "кола", "спрайт", "фанта"] },
  { canonical: "Пиво", measureKind: "volume", categoryKey: "alcohol", keywords: ["пиво", "beer", "світле пиво", "темне пиво", "крафтове пиво"] },
  { canonical: "Вино", measureKind: "volume", categoryKey: "alcohol", keywords: ["вино", "wine", "червоне вино", "біле вино", "рожеве вино", "ігристе вино", "шампанське"] },
  { canonical: "Віскі", measureKind: "volume", categoryKey: "alcohol", keywords: ["віскі", "whiskey", "whisky"] },
  { canonical: "Ром", measureKind: "volume", categoryKey: "alcohol", keywords: ["ром", "rum"] },
  { canonical: "Горілка", measureKind: "volume", categoryKey: "alcohol", keywords: ["горілка", "водка", "vodka"] },
  { canonical: "Самогон", measureKind: "volume", categoryKey: "alcohol", keywords: ["самогон", "домашній самогон"] },
  { canonical: "Спирт", measureKind: "volume", categoryKey: "alcohol", keywords: ["спирт", "етиловий спирт", "харчовий спирт"] },
  { canonical: "Коньяк", measureKind: "volume", categoryKey: "alcohol", keywords: ["коньяк", "brandy", "бренді"] },
  { canonical: "Джин", measureKind: "volume", categoryKey: "alcohol", keywords: ["джин", "gin"] },
  { canonical: "Лікер", measureKind: "volume", categoryKey: "alcohol", keywords: ["лікер", "лікерний напій"] },
  { canonical: "Настоянка", measureKind: "volume", categoryKey: "alcohol", keywords: ["настоянка", "наливка", "биттер"] },
  { canonical: "Сидр", measureKind: "volume", categoryKey: "alcohol", keywords: ["сидр", "cider", "яблучний сидр"] },
  { canonical: "Гречка", measureKind: "weight", categoryKey: "grains", keywords: ["гречка", "гречана крупа"] },
  { canonical: "Рис", measureKind: "weight", categoryKey: "grains", keywords: ["рис", "rice", "білий рис"] },
  { canonical: "Бурий рис", measureKind: "weight", categoryKey: "grains", keywords: ["бурий рис", "коричневий рис"] },
  { canonical: "Макарони", measureKind: "weight", categoryKey: "grains", keywords: ["макарони", "паста", "вермішель", "спагеті", "рожки", "пір'я"] },
  { canonical: "Локшина", measureKind: "weight", categoryKey: "grains", keywords: ["локшина", "noodles", "egg noodles"] },
  { canonical: "Вівсянка", measureKind: "weight", categoryKey: "grains", keywords: ["вівсянка", "вівсяні пластівці", "овсянка", "oatmeal"] },
  { canonical: "Булгур", measureKind: "weight", categoryKey: "grains", keywords: ["булгур"] },
  { canonical: "Кускус", measureKind: "weight", categoryKey: "grains", keywords: ["кускус", "кус кус", "couscous"] },
  { canonical: "Пшоно", measureKind: "weight", categoryKey: "grains", keywords: ["пшоно", "пшоняна крупа"] },
  { canonical: "Перловка", measureKind: "weight", categoryKey: "grains", keywords: ["перловка", "перлова крупа"] },
  { canonical: "Сочевиця", measureKind: "weight", categoryKey: "grains", keywords: ["сочевиця", "червона сочевиця", "зелена сочевиця", "lentils"] },
  { canonical: "Нут", measureKind: "weight", categoryKey: "grains", keywords: ["нут", "chickpeas"] },
  { canonical: "Кіноа", measureKind: "weight", categoryKey: "grains", keywords: ["кіноа", "quinoa"] },
  { canonical: "Ячна крупа", measureKind: "weight", categoryKey: "grains", keywords: ["ячна крупа", "ячка"] },
  { canonical: "Кукурудзяна крупа", measureKind: "weight", categoryKey: "grains", keywords: ["кукурудзяна крупа", "полента"] },
  { canonical: "Горох", measureKind: "weight", categoryKey: "grains", keywords: ["горох", "колотий горох", "горохова крупа"] },
  { canonical: "Пластівці швидкого приготування", measureKind: "weight", categoryKey: "breakfast", keywords: ["пластівці", "пластівці швидкого приготування", "сніданок швидкого приготування", "мюслі", "гранола", "сухий сніданок"] },
  { canonical: "Кукурудзяні пластівці", measureKind: "weight", categoryKey: "breakfast", keywords: ["кукурудзяні пластівці", "corn flakes"] },
  { canonical: "Манка", measureKind: "weight", categoryKey: "breakfast", keywords: ["манка", "манна крупа"] },
  { canonical: "Сухе молоко", measureKind: "weight", categoryKey: "breakfast", keywords: ["сухе молоко", "молоко сухе"] },
  { canonical: "Готова каша", measureKind: "weight", categoryKey: "breakfast", keywords: ["готова каша", "каша швидкого приготування", "рисова каша", "гречана каша", "вівсяна каша"] },
  { canonical: "Пюре швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["пюре", "картопляне пюре", "сухе пюре"] },
  { canonical: "Суп швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["суп", "суп швидкого приготування", "сухий суп", "суп пакет", "суп в пакеті"] },
  { canonical: "Локшина швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["локшина швидкого приготування", "мівіна", "мівіна локшина", "рамен", "instant noodles"] },
  { canonical: "Борщ швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["борщ", "борщ швидкого приготування", "сухий борщ"] },
  { canonical: "Сублімати", measureKind: "weight", categoryKey: "ready_meals", keywords: ["сублімати", "сублімат", "ліофілізат", "сублімована їжа", "сублімована вечеря", "сублімований обід"] },
  { canonical: "Різото швидкого приготування", measureKind: "weight", categoryKey: "ready_meals", keywords: ["різото", "різотто", "готове різото"] },
  { canonical: "Тушкованка", measureKind: "weight", categoryKey: "protein", keywords: ["тушкованка", "тушонка", "тушонка яловича", "тушонка свиняча", "тушенка"] },
  { canonical: "Консерви м'ясні", measureKind: "weight", categoryKey: "protein", keywords: ["м'ясна консерва", "консерви м'ясні", "мясна консерва", "консервоване м'ясо", "консерва м'ясо"] },
  { canonical: "Консерви рибні", measureKind: "weight", categoryKey: "protein", keywords: ["рибна консерва", "консерви рибні", "тунець", "сардина", "шпроти", "скумбрія консервована", "лосось консервований"] },
  { canonical: "Паштет", measureKind: "weight", categoryKey: "spreads", keywords: ["паштет", "печінковий паштет", "мясний паштет", "м'ясний паштет", "рибний паштет"] },
  { canonical: "Намазка", measureKind: "weight", categoryKey: "spreads", keywords: ["намазка", "намазки", "спред", "ready spread", "сирна намазка"] },
  { canonical: "Арахісова паста", measureKind: "weight", categoryKey: "spreads", keywords: ["арахісова паста", "peanut butter"] },
  { canonical: "Шоколадна паста", measureKind: "weight", categoryKey: "spreads", keywords: ["шоколадна паста", "нутелла", "nutella"] },
  { canonical: "Хумус", measureKind: "weight", categoryKey: "spreads", keywords: ["хумус", "hummus"] },
  { canonical: "Джем", measureKind: "weight", categoryKey: "spreads", keywords: ["джем", "повидло", "варення", "конфітюр"] },
  { canonical: "Мед", measureKind: "weight", categoryKey: "spreads", keywords: ["мед", "мьод", "honey"] },
  { canonical: "Ковбаса", measureKind: "weight", categoryKey: "protein", keywords: ["ковбаса", "суха ковбаса", "салямі", "салями", "мисливські ковбаски", "сиров'ялена ковбаса"] },
  { canonical: "Сир твердий", measureKind: "weight", categoryKey: "protein", keywords: ["сир", "сир твердий", "твердий сир", "пармезан", "гауда", "чедер"] },
  { canonical: "Сир плавлений", measureKind: "weight", categoryKey: "protein", keywords: ["плавлений сир", "сирок плавлений", "плавлений сирок"] },
  { canonical: "Бринза", measureKind: "weight", categoryKey: "protein", keywords: ["бринза", "овечий сир"] },
  { canonical: "Тофу", measureKind: "weight", categoryKey: "protein", keywords: ["тофу", "tofu"] },
  { canonical: "Соєве м'ясо", measureKind: "weight", categoryKey: "protein", keywords: ["соєве м'ясо", "соєві шматочки", "текстурат", "soy chunks"] },
  { canonical: "Протеїн", measureKind: "weight", categoryKey: "protein", keywords: ["протеїн", "protein powder", "протеїновий порошок"] },
  { canonical: "Сало", measureKind: "weight", categoryKey: "protein", keywords: ["сало"] },
  { canonical: "В'ялене м'ясо", measureKind: "weight", categoryKey: "protein", keywords: ["в'ялене м'ясо", "джерки", "jerky", "сушене м'ясо"] },
  { canonical: "Яйця", measureKind: "count", categoryKey: "protein", keywords: ["яйця", "яйце", "варені яйця"] },
  { canonical: "Квасоля консервована", measureKind: "weight", categoryKey: "protein", keywords: ["квасоля консервована", "консервована квасоля", "фасоля консервована"] },
  { canonical: "Горіхи", measureKind: "weight", categoryKey: "snacks", keywords: ["горіхи", "горіх", "мигдаль", "кеш'ю", "арахіс", "волоські горіхи", "фісташки", "насіння гарбузове"] },
  { canonical: "Сухофрукти", measureKind: "weight", categoryKey: "snacks", keywords: ["сухофрукти", "родзинки", "курага", "фініки", "чорнослив", "інжир сушений"] },
  { canonical: "Батончики", measureKind: "weight", categoryKey: "snacks", keywords: ["батончики", "батончик", "енергетичний батончик", "protein bar", "мюслі батончик", "снікерс"] },
  { canonical: "Печиво", measureKind: "weight", categoryKey: "snacks", keywords: ["печиво", "галети", "крекери", "крекер", "сухе печиво"] },
  { canonical: "Чіпси", measureKind: "weight", categoryKey: "snacks", keywords: ["чіпси", "chips", "начос"] },
  { canonical: "Шоколад", measureKind: "weight", categoryKey: "sweets", keywords: ["шоколад", "chocolate", "молочний шоколад", "чорний шоколад"] },
  { canonical: "Цукерки", measureKind: "weight", categoryKey: "sweets", keywords: ["цукерки", "льодяники", "карамельки", "желейки"] },
  { canonical: "Халва", measureKind: "weight", categoryKey: "sweets", keywords: ["халва"] },
  { canonical: "Козинаки", measureKind: "weight", categoryKey: "sweets", keywords: ["козинаки", "gozinaki"] },
  { canonical: "Маршмелоу", measureKind: "weight", categoryKey: "sweets", keywords: ["маршмелоу", "marshmallow"] },
  { canonical: "Хлібці", measureKind: "weight", categoryKey: "bread", keywords: ["хлібці", "сухарики хлібці", "crispbread"] },
  { canonical: "Сухарі", measureKind: "weight", categoryKey: "bread", keywords: ["сухарі", "сухарики", "грінки сухі"] },
  { canonical: "Хліб", measureKind: "weight", categoryKey: "bread", keywords: ["хліб", "батон"] },
  { canonical: "Лаваш", measureKind: "weight", categoryKey: "bread", keywords: ["лаваш", "тортилья", "тортілья", "піта", "wrap"] },
  { canonical: "Булочки", measureKind: "weight", categoryKey: "bread", keywords: ["булочки", "булка", "булочка"] },
  { canonical: "Картопля", measureKind: "weight", categoryKey: "vegetables", keywords: ["картопля", "картошка"] },
  { canonical: "Цибуля", measureKind: "weight", categoryKey: "vegetables", keywords: ["цибуля", "лук"] },
  { canonical: "Часник", measureKind: "weight", categoryKey: "vegetables", keywords: ["часник", "чеснок"] },
  { canonical: "Морква", measureKind: "weight", categoryKey: "vegetables", keywords: ["морква", "морковка"] },
  { canonical: "Огірки", measureKind: "weight", categoryKey: "vegetables", keywords: ["огірки", "огірок", "огурцы", "огірочки"] },
  { canonical: "Помідори", measureKind: "weight", categoryKey: "vegetables", keywords: ["помідори", "помідор", "томати", "томат"] },
  { canonical: "Перець", measureKind: "weight", categoryKey: "vegetables", keywords: ["перець болгарський", "солодкий перець", "болгарський перець"] },
  { canonical: "Капуста", measureKind: "weight", categoryKey: "vegetables", keywords: ["капуста", "білокачанна капуста"] },
  { canonical: "Зелень", measureKind: "weight", categoryKey: "vegetables", keywords: ["зелень", "кріп", "петрушка", "зелена цибуля", "базилік"] },
  { canonical: "Яблука", measureKind: "weight", categoryKey: "fruits", keywords: ["яблука", "яблуко"] },
  { canonical: "Банани", measureKind: "weight", categoryKey: "fruits", keywords: ["банани", "банан"] },
  { canonical: "Лимон", measureKind: "weight", categoryKey: "fruits", keywords: ["лимон", "лимони"] },
  { canonical: "Апельсини", measureKind: "weight", categoryKey: "fruits", keywords: ["апельсини", "апельсин"] },
  { canonical: "Мандарини", measureKind: "weight", categoryKey: "fruits", keywords: ["мандарини", "мандарин"] },
  { canonical: "Груші", measureKind: "weight", categoryKey: "fruits", keywords: ["груші", "груша"] },
  { canonical: "Цукор", measureKind: "weight", categoryKey: "seasonings", keywords: ["цукор", "sugar"] },
  { canonical: "Сіль", measureKind: "weight", categoryKey: "seasonings", keywords: ["сіль", "salt"] },
  { canonical: "Олія", measureKind: "volume", categoryKey: "seasonings", keywords: ["олія", "масло", "соняшникова олія", "оливкова олія"] },
  { canonical: "Соус", measureKind: "volume", categoryKey: "seasonings", keywords: ["соус", "кетчуп", "майонез", "гірчиця", "соєвий соус", "чилі соус"] },
  { canonical: "Томатна паста", measureKind: "weight", categoryKey: "seasonings", keywords: ["томатна паста", "томатний соус", "паста томатна"] },
  { canonical: "Спеції", measureKind: "weight", categoryKey: "seasonings", keywords: ["спеції", "приправи", "суміш спецій", "приправа"] },
  { canonical: "Бульйон", measureKind: "weight", categoryKey: "seasonings", keywords: ["бульйон", "бульйонний кубик", "кубик бульйонний"] },
  { canonical: "Сухий часник", measureKind: "weight", categoryKey: "seasonings", keywords: ["сухий часник", "гранульований часник"] },
  { canonical: "Перець чорний", measureKind: "weight", categoryKey: "seasonings", keywords: ["чорний перець", "перець чорний", "мелений перець"] }
];

const FOOD_ALIAS_RECORDS = FOOD_NAME_ALIASES.flatMap((item) =>
  item.keywords.map((keyword) => ({
    keyword: normalizeFoodSearch(keyword),
    canonical: item.canonical,
    categoryKey: item.categoryKey,
    measureKind: item.measureKind,
    alias: item
  }))
).filter((record) => record.keyword);

const FOOD_ALIAS_FUSE = new Fuse(FOOD_ALIAS_RECORDS, {
  includeScore: true,
  threshold: 0.34,
  ignoreLocation: true,
  minMatchCharLength: 3,
  keys: [
    { name: "keyword", weight: 0.8 },
    { name: "canonical", weight: 0.2 }
  ]
});

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

  if (bestAlias) {
    return bestAlias;
  }

  if (normalized.length < 3) {
    return null;
  }

  const [match] = FOOD_ALIAS_FUSE.search(normalized, { limit: 1 });
  if (match?.item?.alias && (match.score ?? 1) <= 0.34) {
    return match.item.alias;
  }

  return null;
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

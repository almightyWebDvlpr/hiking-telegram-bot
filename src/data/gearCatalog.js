function normalizeSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("’", "'")
    .replaceAll("`", "'")
    .replaceAll("-", " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function formatWeightGrams(value) {
  const grams = Number(value) || 0;
  if (!grams) {
    return "";
  }
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")} кг`;
  }
  return `${grams} г`;
}

function capitalizeWord(word) {
  if (!word) {
    return "";
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function humanizeGearName(value) {
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

function buildSearchTokens(value) {
  return normalizeSearch(value)
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchesKeyword(normalizedValue, tokens, keyword) {
  const normalizedKeyword = normalizeSearch(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  if (normalizedValue === normalizedKeyword) {
    return true;
  }

  if (normalizedKeyword.includes(" ")) {
    return normalizedValue.includes(normalizedKeyword);
  }

  return tokens.some((token) => token === normalizedKeyword || token.startsWith(normalizedKeyword));
}

const GEAR_NAME_ALIASES = [
  { canonical: "Намет", keywords: ["намет", "палатка", "палатка туристична", "палатка трекінгова"] },
  { canonical: "Тент", keywords: ["тент", "тарп", "укриття", "навіс"] },
  { canonical: "Спальний мішок", keywords: ["спальник", "спальний мішок", "мішок для сну", "sleeping bag"] },
  { canonical: "Квілт", keywords: ["квілт", "quilt"] },
  { canonical: "Спальний килимок", keywords: ["килимок", "каремат", "карімат", "каримат", "пінка", "пенка", "спальний килимок"] },
  { canonical: "Подушка", keywords: ["подушка", "camp pillow"] },
  { canonical: "Рюкзак", keywords: ["рюкзак", "наплічник"] },
  { canonical: "Гермомішок", keywords: ["гермомішок", "герма", "гермосумка", "гермоміш"] },
  { canonical: "Чохол на рюкзак", keywords: ["чохол на рюкзак", "накидка на рюкзак", "рейнкавер", "rain cover"] },
  { canonical: "Бананка", keywords: ["бананка", "поясна сумка"] },
  { canonical: "Трекінгові палиці", keywords: ["трекінгові палиці", "палиці", "трекинговые палки", "trekking poles"] },
  { canonical: "Ліхтар", keywords: ["ліхтар", "ліхтарик", "фонарик"] },
  { canonical: "Налобний ліхтар", keywords: ["налобник", "налобний ліхтар", "налобний"] },
  { canonical: "Компас", keywords: ["компас"] },
  { canonical: "GPS-навігатор", keywords: ["gps", "джіпіес", "навігатор", "garmin", "etrex", "gpsmap"] },
  { canonical: "Карта в телефоні", keywords: ["карта в телефоні", "карта в смартфоні", "карта в мобільному", "карта в мобільному телефоні", "смартфон з картою", "телефон з картою", "офлайн карта в телефоні", "офлайн карта на телефоні", "офлайн мапа в телефоні", "мапа в телефоні", "мапа в смартфоні"] },
  { canonical: "Пальник", keywords: ["пальник", "газовий пальник", "бензиновий пальник"] },
  { canonical: "Система приготування", keywords: ["система приготування", "jetboil", "reactor", "windburner"] },
  { canonical: "Пальне / газ", keywords: ["газовий балон", "газовий балончик", "газ", "балон", "пальне"] },
  { canonical: "Казанок", keywords: ["казанок", "котелок", "котелок туристичний"] },
  { canonical: "Горнятко", keywords: ["горнятко", "горнятко туристичне", "кружка", "чашка"] },
  { canonical: "Термос", keywords: ["термос"] },
  { canonical: "Фляга", keywords: ["фляга", "фляжка"] },
  { canonical: "Пляшка для води", keywords: ["пляшка", "бутилка", "бутылка"] },
  { canonical: "Гідратор", keywords: ["гідратор", "питна система"] },
  { canonical: "Фільтр для води", keywords: ["фільтр для води", "sawyer", "katadyn", "lifestraw", "befree"] },
  { canonical: "Аптечка", keywords: ["аптечка", "аптечка групова", "first aid"] },
  { canonical: "Турнікет", keywords: ["турнікет", "джгут", "жгут"] },
  { canonical: "Свисток", keywords: ["свисток", "сигнальний свисток"] },
  { canonical: "Рація", keywords: ["рація", "рации", "walkie talkie"] },
  { canonical: "Супутниковий маяк", keywords: ["супутниковий маяк", "inreach", "zoleo", "маяк безпеки"] },
  { canonical: "Павербанк", keywords: ["павербанк", "повербанк", "powerbank"] },
  { canonical: "Сонячна панель", keywords: ["сонячна панель", "solar panel"] },
  { canonical: "Ремнабір", keywords: ["ремнабір", "ремкомплект"] },
  { canonical: "Ніж", keywords: ["ніж", "нож", "ножик", "туристичний ніж", "складний ніж"] },
  { canonical: "Мультитул", keywords: ["мультитул", "мультиінструмент", "multitool", "leatherman"] },
  { canonical: "Ножиці", keywords: ["ножиці", "ножиц", "ножнички"] },
  { canonical: "Сокира", keywords: ["сокира", "топір"] },
  { canonical: "Пилка", keywords: ["пилка", "пила"] },
  { canonical: "Запальничка", keywords: ["запальничка", "зажигалка", "lighter"] },
  { canonical: "Кресало", keywords: ["кресало", "ferro rod", "firesteel"] },
  { canonical: "Сірники", keywords: ["сірники", "спички", "storm matches"] },
  { canonical: "Черевики", keywords: ["черевики", "черевик", "ботинки"] },
  { canonical: "Кросівки", keywords: ["кросівки", "кросівок", "кроси"] },
  { canonical: "Сандалі", keywords: ["сандалі", "сандалії", "camp sandals"] },
  { canonical: "Дощовик", keywords: ["дощовик", "пончо"] },
  { canonical: "Гамаші", keywords: ["гамаші", "бахіли", "gaiters"] },
  { canonical: "Фліска", keywords: ["фліска", "фліс"] },
  { canonical: "Термобілизна", keywords: ["термобілизна", "термо білизна", "термо"] },
  { canonical: "Баф", keywords: ["баф", "buff", "горловик"] },
  { canonical: "Рукавиці", keywords: ["рукавиці", "рукавички", "перчатки", "mittens"] },
  { canonical: "Шапка", keywords: ["шапка", "баф шапка", "beanie"] },
  { canonical: "Панама", keywords: ["панама", "капелюх", "sun hat"] },
  { canonical: "Окуляри", keywords: ["окуляри", "сонцезахисні окуляри", "glasses", "sunglasses"] },
  { canonical: "Карта", keywords: ["карта", "мапа", "топокарта", "paper map"] },
  { canonical: "Паракорд", keywords: ["паракорд", "шнур", "корд", "репшнур"] },
  { canonical: "Сидушка", keywords: ["сидушка", "сидушка-пінка", "сітпад", "sit pad"] }
];

export const GEAR_CATEGORIES = [
  {
    key: "bivouac",
    icon: "🛖",
    label: "Бівак",
    keywords: [
      "намет", "наметик", "палатк", "палаточ", "шатер",
      "тент", "тарп", "укритт", "навіс", "накритт",
      "біві", "биві", "бівак", "бивак", "бівакзак", "бівішка",
      "спальник", "спальн", "спальнич", "мішок для сну", "спальний міш", "спаль меш",
      "квілт", "ковдр", "одіял", "одеял", "вкладиш", "лайнер", "внутрішній мішок",
      "килим", "килимок", "каремат", "каримат", "карімат", "пенк", "пінк", "пенопка",
      "мат", "матик", "матрац", "матрас", "матрасик", "підстилк", "підкладк",
      "самонадув", "надув", "самонадувай", "самонадувайк",
      "подуш", "підуш", "подушк", "підушк", "подушечк", "підушечк",
      "підстилка під намет", "дно під намет", "підлога під намет", "футпринт",
      "сітк", "сітк", "москит", "москіт", "антимоскіт", "протимоскіт", "сітка від комах",
      "гамак", "гамач", "підвіс", "підвісна система"
    ]
  },
  {
    key: "carry",
    icon: "🎒",
    label: "Рюкзаки і сумки",
    keywords: [
      "рюкзак", "рюкзач", "наплічник", "наплечник", "ранец", "торба",
      "сумк", "сумоч", "торбин", "торбинк", "баул", "баульчик",
      "поясн сум", "поясна сум", "бананк", "бананка", "барсет",
      "гермоміш", "герма", "гермосум", "гермобаул", "гермочох",
      "мішок", "мішеч", "чохол", "чехол", "накидк", "дощовик на рюкзак",
      "органайзер", "органайз", "вкладиш для рюкзака", "внутрішня сумка",
      "пакувальн", "компресійний міш", "компресійник", "компресорний мішок",
      "несесер", "косметичк", "тревел сум", "дорожня сум",
      "підсумок", "підсумоч", "підсум", "сухарка",
      "тубус", "контейнерний чохол", "сумка для спорядження"
    ]
  },
  {
    key: "kitchen",
    icon: "🍳",
    label: "Кухня",
    keywords: [
      "пальник", "пальнич", "горелк", "горілка туристична", "горілка для газу",
      "газ", "газовий", "газова система", "газ балон", "балон", "балончик",
      "джетбойл", "jetboil", "reactor", "windburner", "cook system", "система приготування",
      "мультитул для кухні", "екран від вітру", "вітрозахист для пальника", "підставка під балон",
      "палив", "пальне", "топлив", "мультитоплив", "бензин пальник", "бензиновий пальник",
      "казан", "казанок", "казанч", "котел", "котелок", "котелоч",
      "каструл", "каструль", "кастрюл", "сковор", "сковорід", "сковород",
      "чайник", "чайнич", "заварник",
      "горнят", "горня", "горнятк", "горнятко",
      "круж", "кружк", "кружеч", "чаш", "чашк", "чашеч", "чашул",
      "склян", "стакан", "стаканчик", "кухоль", "кубок",
      "термокруж", "термочаш", "термостакан", "термогорнят",
      "миск", "мисоч", "таріл", "тарел", "посуд", "посудин", "набір посуду",
      "ложк", "ложеч", "вилк", "виделк", "спорк", "столовий ніж", "прибор", "столові прибори",
      "контейнер", "контейнер для їжі", "ланчбокс", "судок",
      "дошк", "обробна дошк", "дощечка",
      "запальнич", "зажигалк", "кресал", "сірник", "спичк",
      "їжа", "харч", "їдл", "пайок", "сублімат", "сублім", "сухпай", "перекус",
      "кава", "чай", "цукор", "сіль", "спеції", "приправ",
      "термос", "термосик", "фляго-термос"
    ]
  },
  {
    key: "water",
    icon: "💧",
    label: "Вода",
    keywords: [
      "фляг", "фляжк", "пляш", "пляшк", "бутилк", "бутылк", "пляшка для води",
      "баклажк", "баклага", "каністр", "канистра", "ємність для води", "резервуар",
      "гідратор", "гидратор", "питна система", "питтєва система", "бурдюк", "бурдючок",
      "мяка фляг", "м'яка фляг", "складна фляг", "складна пляшка",
      "фільтр", "филтр", "очистк", "очищувач води", "очиститель", "знезараж",
      "sawyer", "katadyn", "lifestraw", "be free", "befree", "гравітаційний фільтр", "насосний фільтр",
      "таблетк", "таблетки для води", "таблетки для очищення", "акватабс",
      "краник для води", "ємність під воду", "бак для води"
    ]
  },
  {
    key: "light",
    icon: "🔦",
    label: "Освітлення",
    keywords: [
      "налобн", "налобний", "налобник", "налобнич", "налобний ліхтар",
      "ліхтар", "ліхтарик", "фонар", "фонарик", "світляк",
      "ламп", "лампоч", "світильн", "світильник", "кемпінгове світло",
      "світл", "освітл", "підсвітк", "свічен",
      "батарей", "батарейк", "акумулятор", "акум", "батар", "елемент живлення"
    ]
  },
  {
    key: "tools",
    icon: "🧰",
    label: "Інструменти",
    keywords: [
      "ніж", "нож", "ножик", "ножич", "лезо",
      "мультитул", "мультік", "мультиінструмент",
      "мотуз", "веревк", "шнур", "репшнур", "паракорд", "корд",
      "ремкомплект", "ремнабір", "набір для ремонту", "латк", "латочка", "клей",
      "палиц", "палк", "трекінгові палки", "трекінг палки", "палки для ходьби",
      "скотч", "ізолент", "ізострічк", "стрічка",
      "голк", "иголк", "нитк", "ниточ", "швейний набір",
      "карабін", "карабінч", "карабин", "бинер",
      "сокир", "топір", "топірець", "топор",
      "пилк", "пила", "пилочка",
      "лопат", "лопатк", "совок", "саперка",
      "ножиц", "ножнич",
      "плоскогубц", "пассатиж", "кусачк",
      "викрут", "отвертк",
      "стяжк", "хомут", "хомутик", "затяжк",
      "гачок", "крюк", "крючок",
      "стілець", "крісло", "табурет", "сидушка", "сидушка-пінка", "сидушка пінка"
    ]
  },
  {
    key: "safety",
    icon: "🩹",
    label: "Безпека",
    keywords: [
      "аптеч", "аптечк", "медичк", "медпак", "набір першої допомоги",
      "свисток", "свисточ",
      "репелент", "репел", "антикомарин", "засіб від комах", "спрей від комах",
      "термоковдр", "термоодіял", "аварійн ковдр", "рятувальн ковдр",
      "сонцезахист", "сонцезахисний крем", "крем від сонця", "спф", "spf",
      "кліщ", "кліщедер", "витягач кліщів",
      "антисептик", "санітайзер", "дезінфект", "дезинфект",
      "бинт", "бинтик", "пластир", "пластирь", "лейкопластир",
      "жгут", "турнікет", "турникет",
      "сигнальн", "сигнальне дзеркало", "ракетниц", "фальшфеєр", "сигналка",
      "балончик", "газовий балончик", "перцевий балончик",
      "шолом", "шлем", "каск", "каска",
      "лавин", "лавинний датчик", "маяк безпеки", "аварійний маяк",
      "дощовик аварійний", "аварійне пончо", "екстрене пончо",
      "рація", "рації", "walkie talkie", "радіостанція", "супутниковий маяк", "inreach", "zoleo"
    ]
  },
  {
    key: "navigation",
    icon: "🧭",
    label: "Навігація",
    keywords: [
      "карт", "мапа", "карточка маршруту", "топокарта",
      "компас", "компасик",
      "навігатор", "навигатор", "джіпіес", "гпс",
      "телефон", "смартфон", "мобіл", "мобільник", "смарт", "мобільний телефон",
      "карта в телефоні", "карта в смартфоні", "карта в мобільному", "карта в мобільному телефоні",
      "офлайн карта", "офлайн мапа", "смартфон з картою", "телефон з картою",
      "трекер", "трекінг маяк", "маяк", "маячок", "garmin", "gpsmap", "etrex", "fenix",
      "висотомір", "альтиметр",
      "маршрутник", "путівник", "путевод",
      "powerbank для навігації", "карта паперова", "мапа паперова", "гермочохол для телефону"
    ]
  },
  {
    key: "clothing",
    icon: "👕",
    label: "Одяг",
    keywords: [
      "футбол", "футба", "майк", "маєчк",
      "термо", "термобілиз", "термуха", "термокомплект",
      "кофт", "кофточ", "худі", "світшот", "лонгслів", "реглан",
      "фліс", "флиск", "фліск", "фліска",
      "пухов", "пуховик", "утеплювач", "утеплена куртка",
      "куртк", "курточ", "штормівк", "штормовк",
      "вітрівк", "ветровк",
      "дощовик", "пончо", "плащ", "плащовк",
      "штани", "штан", "брюки", "портки",
      "шорт", "шортик",
      "черев", "черевик", "ботинк", "берц", "берци",
      "кросів", "кросовк", "кед", "кеди", "кроси",
      "сандал", "сандалі", "тапк", "тапки", "сланц", "в'єтнамк",
      "шкарп", "носк", "носки",
      "рукавич", "перчатк", "варежк",
      "шапк", "кепк", "панам", "капелюх", "капюшон",
      "баф", "бафф", "горловик",
      "гамаш", "бахіли",
      "білизн", "трус", "трусик", "спіднє", "нижня білизна",
      "бра", "топ спортивний"
    ]
  },
  {
    key: "energy",
    icon: "⚡",
    label: "Енергія",
    keywords: [
      "павербанк", "повербанк", "пауербанк",
      "кабель", "кабел", "шнур зарядки", "провід зарядки",
      "зарядк", "зарядне", "зарядний", "блок живлення", "адаптер",
      "соняч", "сонячна панель", "сонячна батарея",
      "станц", "зарядна станція", "електростанція",
      "інвертор", "інвентор",
      "генератор", "генераторик",
      "подовжувач", "трійник",
      "18650", "акумуляторний блок", "акум для ліхтаря", "usb c", "type c", "micro usb", "lightning"
    ]
  },
  {
    key: "other",
    icon: "📦",
    label: "Інше",
    keywords: []
  }
];

const COMMON_FIELDS = [
  {
    key: "weightGrams",
    label: "Вага",
    prompt: "Вкажи вагу в грамах.\nПриклад: `950` або `2000`.\nЯкщо не знаєш — введи `0`.",
    type: "number",
    format: (value) => formatWeightGrams(value)
  },
  {
    key: "note",
    label: "Нотатка",
    prompt: "Додай нотатку для себе.\nПриклад: `не брати в короткі походи`.\nАбо введи `-`.",
    type: "text_optional"
  }
];

export const GEAR_PROFILES = [
  {
    key: "tent",
    label: "Намет",
    keywords: [
      "намет", "наметик", "палатк", "палаточ", "шатер",
      "тент", "тарп", "навіс", "укритт",
      "bivy", "біві", "биві", "бівак", "бивак",
      "футпринт", "підстилка під намет", "дно під намет"
    ],
    fields: [
      {
        key: "season",
        label: "Сезонність",
        prompt: "Вкажи сезонність.\nПриклад: `3-сезонний`, `зима`, `літо`.",
        type: "text_optional"
      },
      {
        key: "capacity",
        label: "Місткість",
        prompt: "На скільки місць цей намет?\nПриклад: `2-місний`, `3-місний`, `4-місний`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "tarp",
    label: "Тент / укриття",
    keywords: [
      "тент", "тарп", "укритт", "навіс", "fly", "rain fly", "біві", "биві"
    ],
    fields: [
      {
        key: "tarpType",
        label: "Тип",
        prompt: "Вкажи тип укриття.\nПриклад: `тарп 3x3`, `тент`, `біві`.",
        type: "text_optional"
      },
      {
        key: "capacity",
        label: "Для кого",
        prompt: "На скільки людей розраховано?\nПриклад: `1-2`, `2-3`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "sleeping_bag",
    label: "Спальний мішок",
    keywords: [
      "спальник", "спальн", "спальнич", "спальний міш", "мішок для сну",
      "квілт", "quilt", "лайнер", "вкладиш", "внутрішній мішок"
    ],
    fields: [
      {
        key: "season",
        label: "Сезонність",
        prompt: "Вкажи сезонність.\nПриклад: `весна-літо`, `3-сезонний`, `зима`.",
        type: "text_optional"
      },
      {
        key: "comfortTempC",
        label: "Температура комфорту",
        prompt: "Вкажи температуру комфорту.\nПриклад: `+10`, `0`, `-5`.",
        type: "text_optional",
        format: (value) => value ? `${value}°C` : ""
      },
      {
        key: "insulation",
        label: "Утеплювач",
        prompt: "Який утеплювач?\nПриклад: `пух`, `синтетика`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "pillow",
    label: "Подушка",
    keywords: [
      "подуш", "підуш", "подушк", "підушк", "подушка", "camp pillow"
    ],
    fields: [
      {
        key: "pillowType",
        label: "Тип",
        prompt: "Вкажи тип.\nПриклад: `надувна`, `синтетична`, `компактна`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "pad",
    label: "Спальний килимок",
    keywords: [
      "килим", "килимок", "каремат", "каримат", "карімат",
      "мат", "матик", "матрац", "матрас", "пенк", "пінк", "пенопка",
      "самонадув", "надув", "самонадувай", "самонадувний"
    ],
    fields: [
      {
        key: "padType",
        label: "Тип",
        prompt: "Який тип?\nПриклад: `надувний`, `пінка`, `самонадувний`.",
        type: "text_optional"
      },
      {
        key: "season",
        label: "Сезонність",
        prompt: "Вкажи сезон або придатність.\nПриклад: `3-сезонний`, `зима`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "backpack",
    label: "Рюкзак",
    keywords: [
      "рюкзак", "рюкзач", "наплічник", "наплечник", "ранец",
      "баул", "гермоміш", "гермосум", "органайзер", "чохол", "чехол",
      "компресійний міш", "компресійник", "поясна сумка", "бананка"
    ],
    fields: [
      {
        key: "volumeLiters",
        label: "Обʼєм",
        prompt: "Вкажи обʼєм у літрах.\nПриклад: `50`, `65`.",
        type: "text_optional",
        format: (value) => value ? `${value} л` : ""
      },
      {
        key: "rainCover",
        label: "Чохол від дощу",
        prompt: "Чи є чохол від дощу?\nПриклад: `так`, `ні`, `окремо`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "dry_storage",
    label: "Гермозахист / чохли",
    keywords: [
      "гермомішок", "герма", "гермосумка", "гермоміш", "drybag", "dry bag",
      "чохол на рюкзак", "накидка на рюкзак", "рейнкавер", "rain cover",
      "гермочохол", "водонепроникний чохол", "чохол для телефону", "чохол для документів"
    ],
    fields: [
      {
        key: "storageType",
        label: "Тип",
        prompt: "Вкажи тип.\nПриклад: `гермомішок`, `чохол на рюкзак`, `гермочохол для телефону`.",
        type: "text_optional"
      },
      {
        key: "capacityMl",
        label: "Обʼєм / розмір",
        prompt: "Вкажи обʼєм або розмір.\nПриклад: `10 л`, `20 л`, `для 60-літрового рюкзака`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "trekking_poles",
    label: "Трекінгові палиці",
    keywords: [
      "палиц", "палк", "палиця", "трекінгові палки", "трекінг палки", "trekking pole", "trekking poles"
    ],
    fields: [
      {
        key: "poleType",
        label: "Тип",
        prompt: "Вкажи тип.\nПриклад: `телескопічні`, `складні`, `карбон`.",
        type: "text_optional"
      },
      {
        key: "pairCount",
        label: "Комплект",
        prompt: "Вкажи, це одна чи пара.\nПриклад: `1`, `2`, `пара`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "headlamp",
    label: "Ліхтар / налобник",
    keywords: [
      "налобн", "налобник", "налобний", "ліхтар", "ліхтарик",
      "фонар", "фонарик", "лампа", "лампочка", "світильник"
    ],
    fields: [
      {
        key: "lumens",
        label: "Яскравість",
        prompt: "Вкажи яскравість у люменах.\nПриклад: `300`, `500`.",
        type: "text_optional",
        format: (value) => value ? `${value} лм` : ""
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "fire_starter",
    label: "Розпалювання",
    keywords: [
      "запальничка", "зажигалка", "lighter", "кресало", "firesteel", "ferro rod",
      "сірники", "спички", "storm matches", "розпалювач", "розпалювання"
    ],
    fields: [
      {
        key: "starterType",
        label: "Тип",
        prompt: "Вкажи тип.\nПриклад: `запальничка`, `кресало`, `штормові сірники`.",
        type: "text_optional"
      },
      {
        key: "waterResistance",
        label: "Захист",
        prompt: "Чи захищене від води?\nПриклад: `водостійке`, `в гермочохлі`, `звичайне`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "navigation_device",
    label: "Навігація",
    keywords: [
      "компас", "навігатор", "навигатор", "джіпіес", "gps", "gpsmap", "etrex", "garmin",
      "карта", "мапа", "топокарта", "висотомір", "альтиметр", "трекер",
      "телефон", "смартфон", "мобільний телефон", "карта в телефоні", "карта в смартфоні",
      "карта в мобільному", "карта в мобільному телефоні", "офлайн карта", "офлайн мапа",
      "смартфон з картою", "телефон з картою", "офлайн карта в телефоні", "офлайн карта на телефоні"
    ],
    fields: [
      {
        key: "navType",
        label: "Тип",
        prompt: "Вкажи тип навігації.\nПриклад: `компас`, `GPS`, `карта`, `супутниковий трекер`.",
        type: "text_optional"
      },
      {
        key: "powerSource",
        label: "Живлення",
        prompt: "Вкажи джерело живлення.\nПриклад: `AA`, `вбудований акумулятор`, `не потребує`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "communication",
    label: "Зв'язок / маяк",
    keywords: [
      "рація", "рації", "walkie talkie", "радіостанція",
      "супутниковий маяк", "маяк безпеки", "inreach", "zoleo", "sat messenger"
    ],
    fields: [
      {
        key: "communicationType",
        label: "Тип",
        prompt: "Вкажи тип.\nПриклад: `рація`, `супутниковий маяк`, `sat messenger`.",
        type: "text_optional"
      },
      {
        key: "powerSource",
        label: "Живлення",
        prompt: "Вкажи джерело живлення.\nПриклад: `USB-C`, `вбудований акумулятор`, `AAA`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "knife",
    label: "Ніж / мультитул",
    keywords: [
      "ніж", "нож", "ножик", "туристичний ніж", "складний ніж", "фіксований ніж",
      "мультитул", "мультиінструмент", "multitool", "leatherman",
      "ножиці", "ножиц", "ножнич", "лезо"
    ],
    fields: [
      {
        key: "toolType",
        label: "Тип",
        prompt: "Вкажи тип.\nПриклад: `складний ніж`, `мультитул`, `ножиці`, `фіксований ніж`.",
        type: "text_optional"
      },
      {
        key: "bladeLengthCm",
        label: "Розмір",
        prompt: "Вкажи довжину леза або розмір.\nПриклад: `8 см`, `10 см`, `компактний`.",
        type: "text_optional"
      },
      {
        key: "purpose",
        label: "Призначення",
        prompt: "Для чого використовуєш?\nПриклад: `кухня`, `табір`, `ремонт`, `EDC`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "axe",
    label: "Сокира",
    keywords: ["сокира", "сокир", "топір", "топірець", "топор"],
    fields: [COMMON_FIELDS[0], COMMON_FIELDS[1]]
  },
  {
    key: "saw",
    label: "Пилка",
    keywords: ["пилка", "пилк", "пила", "пилочка"],
    fields: [COMMON_FIELDS[0], COMMON_FIELDS[1]]
  },
  {
    key: "stove",
    label: "Пальник",
    keywords: [
      "пальник", "пальнич", "горелк", "газовий пальник", "бензиновий пальник",
      "мультитоплив", "мультитопливний", "горілка туристична"
    ],
    fields: [
      {
        key: "stoveType",
        label: "Тип",
        prompt: "Вкажи тип або паливо.\nПриклад: `газовий`, `мультитопливний`, `система приготування`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "stove_fuel",
    label: "Пальне / газ",
    keywords: [
      "газ", "газовий балон", "газ балон", "балон", "балончик", "палив", "пальне", "бензин", "спирт", "тверде паливо"
    ],
    fields: [
      {
        key: "fuelType",
        label: "Тип пального",
        prompt: "Вкажи тип пального.\nПриклад: `газ`, `бензин`, `спирт`.",
        type: "text_optional"
      },
      {
        key: "capacity",
        label: "Обʼєм / розмір",
        prompt: "Вкажи розмір або місткість.\nПриклад: `230 г`, `450 г`, `1 л`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "cook_system",
    label: "Система приготування",
    keywords: [
      "система приготування", "кухонна система", "cook system", "jetboil", "reactor", "windburner", "інтегрована система"
    ],
    fields: [
      {
        key: "systemType",
        label: "Тип",
        prompt: "Вкажи тип.\nПриклад: `інтегрована`, `газова`, `титанова`, `алюмінієва`.",
        type: "text_optional"
      },
      {
        key: "capacityMl",
        label: "Обʼєм посудини",
        prompt: "Вкажи обʼєм.\nПриклад: `1000 мл`, `1 л`, `1.5 л`.",
        type: "text_optional"
      },
      {
        key: "peopleCapacity",
        label: "Для кого",
        prompt: "На скільки людей розраховано?\nПриклад: `1`, `2`, `2-3`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "cookware",
    label: "Казанок / посуд",
    keywords: [
      "котелок", "котелоч", "казан", "казанок", "каструля", "каструл", "сковорідка", "сковорода",
      "чайник", "заварник", "набір посуду", "посуд", "кружка", "горнятко", "миска", "тарілка", "спорк"
    ],
    fields: [
      {
        key: "cookwareType",
        label: "Тип",
        prompt: "Вкажи тип посуду.\nПриклад: `казанок`, `горнятко`, `миска`, `спорк`.",
        type: "text_optional"
      },
      {
        key: "material",
        label: "Матеріал",
        prompt: "Вкажи матеріал.\nПриклад: `титан`, `алюміній`, `нержавійка`, `пластик`.",
        type: "text_optional"
      },
      {
        key: "capacityMl",
        label: "Обʼєм",
        prompt: "Вкажи обʼєм.\nПриклад: `450 мл`, `900 мл`, `1.3 л`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "water_container",
    label: "Фляга / гідратор",
    keywords: [
      "фляга", "фляг", "фляжка", "пляшка", "пляшк", "бутилка", "бутылка",
      "гідратор", "гидратор", "питна система", "бурдюк",
      "резервуар", "ємність для води"
    ],
    fields: [
      {
        key: "capacityMl",
        label: "Обʼєм",
        prompt: "Вкажи обʼєм.\nПриклад: `500 мл`, `1 л`, `2 л`.",
        type: "text_optional"
      },
      {
        key: "waterType",
        label: "Тип",
        prompt: "Вкажи тип.\nПриклад: `фляга`, `пляшка`, `гідратор`, `складна пляшка`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "water_filter",
    label: "Фільтр для води",
    keywords: [
      "фільтр", "филтр", "очистк", "очищувач води", "акватабс", "таблетки для води",
      "lifestraw", "sawyer", "katadyn", "befree", "гравітаційний фільтр", "насосний фільтр"
    ],
    fields: [
      {
        key: "filterType",
        label: "Тип",
        prompt: "Вкажи тип.\nПриклад: `фільтр`, `таблетки`, `гравітаційний`, `насосний`.",
        type: "text_optional"
      },
      {
        key: "capacityMl",
        label: "Продуктивність / обʼєм",
        prompt: "Вкажи обʼєм або продуктивність.\nПриклад: `1 л`, `2 л`, `500 мл`.\nАбо введи `-`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "first_aid",
    label: "Аптечка / безпека",
    keywords: [
      "аптеч", "аптечк", "медичк", "first aid", "tourniquet", "жгут", "турнікет", "свисток", "термоковдра", "рація"
    ],
    fields: [
      {
        key: "safetyType",
        label: "Тип",
        prompt: "Вкажи тип.\nПриклад: `аптечка`, `турнікет`, `термоковдра`, `рація`, `свисток`.",
        type: "text_optional"
      },
      {
        key: "scope",
        label: "Призначення",
        prompt: "Для кого або для чого?\nПриклад: `на групу`, `особиста`, `екстрена`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "powerbank",
    label: "Павербанк / зарядка",
    keywords: [
      "павербанк", "повербанк", "пауербанк", "powerbank",
      "кабель", "зарядка", "зарядне", "адаптер", "блок живлення", "usb", "type c", "lightning"
    ],
    fields: [
      {
        key: "capacityMah",
        label: "Ємність",
        prompt: "Вкажи ємність.\nПриклад: `10000`, `20000`.",
        type: "text_optional",
        format: (value) => value ? `${value} mAh` : ""
      },
      {
        key: "ports",
        label: "Порти / кабелі",
        prompt: "Вкажи порти або сумісність.\nПриклад: `USB-C`, `USB-A + USB-C`, `Lightning кабель`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "solar_panel",
    label: "Сонячна панель / станція",
    keywords: [
      "соняч", "solar", "сонячна панель", "сонячна батарея", "зарядна станція", "станція", "інвертор"
    ],
    fields: [
      {
        key: "powerOutput",
        label: "Потужність",
        prompt: "Вкажи потужність.\nПриклад: `10 W`, `28 W`, `300 W`.",
        type: "text_optional"
      },
      {
        key: "ports",
        label: "Виходи",
        prompt: "Вкажи порти або виходи.\nПриклад: `USB-C`, `USB-A`, `220V`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "repair_kit",
    label: "Ремнабір",
    keywords: [
      "ремкомплект", "ремнабір", "ремонтний набір", "латки", "клей", "скотч", "ізолента", "швейний набір"
    ],
    fields: [
      {
        key: "repairType",
        label: "Для чого",
        prompt: "Вкажи призначення.\nПриклад: `намет`, `килимок`, `загальний`, `одяг`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "clothing",
    label: "Одяг",
    keywords: [
      "футбол", "майк", "термо", "термобілиз", "кофта", "фліс", "фліска",
      "пухов", "пуховик", "куртк", "штани", "шорти", "дощовик", "пончо",
      "вітрівк", "черев", "черевик", "ботинк", "берц", "кросів", "кроси",
      "сандалі", "шкарп", "носки", "рукавич", "шапк", "кепк", "панам",
      "баф", "гамаш", "бахіли", "білизна", "трус", "бра"
    ],
    fields: [
      {
        key: "clothingType",
        label: "Тип",
        prompt: "Вкажи тип одягу.\nПриклад: `базовий шар`, `утеплення`, `захист`, `взуття`, `аксесуар`.",
        type: "text_optional"
      },
      {
        key: "season",
        label: "Сезонність",
        prompt: "Вкажи сезон.\nПриклад: `літо`, `демісезон`, `зима`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  },
  {
    key: "generic",
    label: "Спорядження",
    keywords: [],
    fields: [
      {
        key: "season",
        label: "Сезонність",
        prompt: "Вкажи сезон або сезонність.\nПриклад: `літо`, `3-сезонний`, `зима`.\nАбо введи `-`.",
        type: "text_optional"
      },
      {
        key: "details",
        label: "Характеристики",
        prompt: "Вкажи важливі характеристики для походу.\nПриклад: `комфорт +3`, `2-місний`, `надувний`.\nАбо введи `-`.",
        type: "text_optional"
      },
      COMMON_FIELDS[0],
      COMMON_FIELDS[1]
    ]
  }
];

function findByKeywords(source, name) {
  const normalized = normalizeSearch(name);
  const tokens = buildSearchTokens(name);
  return source.find((item) =>
    item.keywords.some((keyword) => matchesKeyword(normalized, tokens, keyword))
  );
}

export function canonicalizeGearName(name) {
  const normalized = normalizeSearch(name);
  if (!normalized) {
    return "";
  }

  const alias = GEAR_NAME_ALIASES.find((item) => item.keywords.some((keyword) => matchesKeyword(normalized, buildSearchTokens(name), keyword)));
  if (alias) {
    return alias.canonical;
  }

  return humanizeGearName(name);
}

export function categorizeGearName(name) {
  const category = findByKeywords(GEAR_CATEGORIES.filter((item) => item.key !== "other"), name)
    || GEAR_CATEGORIES.find((item) => item.key === "other");

  return {
    key: category.key,
    icon: category.icon,
    label: category.label,
    title: `${category.icon} ${category.label}`
  };
}

export function resolveGearProfile(name) {
  const profile = findByKeywords(GEAR_PROFILES.filter((item) => item.key !== "generic"), name)
    || GEAR_PROFILES.find((item) => item.key === "generic");
  return {
    key: profile.key,
    label: profile.label,
    fields: profile.fields
  };
}

export function formatGearAttribute(profile, field, value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const fieldDef = (profile?.fields || []).find((item) => item.key === field);
  if (!fieldDef) {
    return String(value);
  }
  if (typeof fieldDef.format === "function") {
    return fieldDef.format(value);
  }
  return String(value);
}

export function summarizeGearAttributes(item) {
  const profile = resolveGearProfile(item?.name);
  const attributes = item?.attributes || {};
  const lines = [];

  for (const field of profile.fields) {
    const value = attributes[field.key];
    const formatted = formatGearAttribute(profile, field.key, value);
    if (!formatted) {
      continue;
    }
    lines.push(`${field.label}: ${formatted}`);
  }

  if (!lines.length && item?.details) {
    lines.push(item.details);
  }

  return lines;
}

export function enrichGearItem(item) {
  const canonicalName = canonicalizeGearName(item?.name);
  const category = categorizeGearName(item?.name);
  const profile = resolveGearProfile(item?.name);
  const sourceAttributes = item?.attributes && typeof item.attributes === "object" ? item.attributes : {};
  const attributes = {};

  for (const field of profile.fields) {
    if (field.key === "note") {
      attributes[field.key] = String(sourceAttributes[field.key] ?? item?.note ?? "").trim();
      continue;
    }
    if (field.key === "weightGrams") {
      attributes[field.key] = Number(sourceAttributes[field.key] ?? item?.weightGrams) || 0;
      continue;
    }
    if (field.key === "season") {
      attributes[field.key] = String(sourceAttributes[field.key] ?? item?.season ?? "").trim();
      continue;
    }
    if (field.key === "details") {
      attributes[field.key] = String(sourceAttributes[field.key] ?? item?.details ?? "").trim();
      continue;
    }
    attributes[field.key] = String(sourceAttributes[field.key] ?? "").trim();
  }

  return {
    ...item,
    name: canonicalName || String(item?.name || "").trim(),
    categoryKey: item?.categoryKey || category.key,
    categoryIcon: item?.categoryIcon || category.icon,
    categoryLabel: item?.categoryLabel || category.label,
    profileKey: item?.profileKey || profile.key,
    profileLabel: item?.profileLabel || profile.label,
    attributes,
    weightGrams: Number(attributes.weightGrams) || 0,
    season: String(attributes.season || "").trim(),
    details: String(attributes.details || "").trim(),
    note: String(attributes.note || item?.note || "").trim()
  };
}

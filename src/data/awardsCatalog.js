export const PROFILE_AWARDS_LABEL = "🏅 Мої досягнення";
export const XP_LEVELS = [
  { level: 1, minXp: 0 },
  { level: 2, minXp: 350 },
  { level: 3, minXp: 550 },
  { level: 4, minXp: 800 },
  { level: 5, minXp: 1100 },
  { level: 6, minXp: 1450 },
  { level: 7, minXp: 1850 },
  { level: 8, minXp: 2300 },
  { level: 9, minXp: 2800 },
  { level: 10, minXp: 3350 },
  { level: 11, minXp: 3950 },
  { level: 12, minXp: 4600 },
  { level: 13, minXp: 5300 },
  { level: 14, minXp: 6050 },
  { level: 15, minXp: 6850 },
  { level: 16, minXp: 7700 },
  { level: 17, minXp: 8600 },
  { level: 18, minXp: 9550 },
  { level: 19, minXp: 10550 },
  { level: 20, minXp: 11600 }
];

export const XP_TIER_BONUSES = {
  bronze: 20,
  silver: 40,
  gold: 70,
  crystal: 120,
  diamond: 200,
  trophy: 350
};

export const XP_COMBO_BONUSES = {
  real_tourist: 50,
  lives_by_nature: 100,
  full_cycle: 75
};

export const AWARD_TIERS = [
  { key: "bronze", icon: "🥉", label: "Бронза" },
  { key: "silver", icon: "🥈", label: "Срібло" },
  { key: "gold", icon: "🥇", label: "Золото" },
  { key: "crystal", icon: "💠", label: "Кришталь" },
  { key: "diamond", icon: "💎", label: "Діамант" },
  { key: "trophy", icon: "🏆", label: "Трофей" }
];

export const TITLE_RULES = [
  { minHikes: 250, title: "Жива легенда" },
  { minHikes: 150, title: "Легенда" },
  { minHikes: 100, title: "Старший" },
  { minHikes: 60, title: "Провідник" },
  { minHikes: 30, title: "Досвідчений" },
  { minHikes: 15, title: "Дослідник" },
  { minHikes: 5, title: "Мандрівник" },
  { minHikes: 1, title: "Новачок" }
];

export const BADGE_SERIES = [
  {
    key: "hikes",
    icon: "🎒",
    title: "Учасник походів",
    milestones: [
      { tier: "bronze", threshold: 1, description: "1 завершений похід" },
      { tier: "silver", threshold: 15, description: "15 завершених походів" },
      { tier: "gold", threshold: 30, description: "30 завершених походів" },
      { tier: "crystal", threshold: 50, description: "50 завершених походів" },
      { tier: "diamond", threshold: 80, description: "80 завершених походів" },
      { tier: "trophy", threshold: 200, description: "200 завершених походів" }
    ]
  },
  {
    key: "distance",
    icon: "🥾",
    title: "Далекобійник",
    milestones: [
      { tier: "bronze", threshold: 30, description: "Перші кілометри — 30 км" },
      { tier: "silver", threshold: 200, description: "Ходок — 200 км" },
      { tier: "gold", threshold: 1000, description: "Далекобійник — 1000 км" },
      { tier: "crystal", threshold: 2500, description: "Залізні ноги — 2500 км" },
      { tier: "diamond", threshold: 5000, description: "Машина — 5000 км" }
    ]
  },
  {
    key: "nights",
    icon: "🌙",
    title: "Нічний турист",
    milestones: [
      { tier: "bronze", threshold: 1, description: "Перша ніч" },
      { tier: "silver", threshold: 20, description: "Нічний турист — 20 ночівель" },
      { tier: "gold", threshold: 50, description: "Житель намету — 50 ночівель" },
      { tier: "crystal", threshold: 100, description: "Дитя лісу — 100 ночівель" },
      { tier: "diamond", threshold: 200, description: "Живе під небом — 200 ночівель" }
    ]
  },
  {
    key: "ascent",
    icon: "⛰️",
    title: "Підкорювач висот",
    milestones: [
      { tier: "bronze", threshold: 2100, description: "Сумарний набір висоти 2100 м" },
      { tier: "silver", threshold: 5000, description: "Сумарний набір висоти 5000 м" },
      { tier: "gold", threshold: 10000, description: "Сумарний набір висоти 10 000 м" },
      { tier: "crystal", threshold: 30000, description: "Сумарний набір висоти 30 000 м" },
      { tier: "diamond", threshold: 100000, description: "Сумарний набір висоти 100 000 м" }
    ]
  },
  {
    key: "weatheredTrips",
    icon: "🥵",
    title: "Випробуваний погодою",
    milestones: [
      { tier: "bronze", threshold: 1, description: "1 похід із погодними попередженнями" },
      { tier: "silver", threshold: 3, description: "3 походи із погодними попередженнями" },
      { tier: "gold", threshold: 7, description: "7 походів із погодними попередженнями" },
      { tier: "crystal", threshold: 15, description: "15 походів із погодними попередженнями" },
      { tier: "diamond", threshold: 30, description: "30 походів із погодними попередженнями" }
    ]
  },
  {
    key: "stormTrips",
    icon: "🌪️",
    title: "Штормовий турист",
    milestones: [
      { tier: "bronze", threshold: 1, description: "1 похід із грозою, дощем або сильним вітром" },
      { tier: "silver", threshold: 3, description: "3 походи із грозою, дощем або сильним вітром" },
      { tier: "gold", threshold: 7, description: "7 походів із грозою, дощем або сильним вітром" },
      { tier: "crystal", threshold: 15, description: "15 походів із грозою, дощем або сильним вітром" },
      { tier: "diamond", threshold: 30, description: "30 походів із грозою, дощем або сильним вітром" }
    ]
  },
  {
    key: "freezeTrips",
    icon: "🧊",
    title: "Льодовий воїн",
    milestones: [
      { tier: "bronze", threshold: 1, description: "1 похід із ризиком морозу або заморозку" },
      { tier: "silver", threshold: 3, description: "3 походи із ризиком морозу або заморозку" },
      { tier: "gold", threshold: 7, description: "7 походів із ризиком морозу або заморозку" },
      { tier: "crystal", threshold: 15, description: "15 походів із ризиком морозу або заморозку" },
      { tier: "diamond", threshold: 30, description: "30 походів із ризиком морозу або заморозку" }
    ]
  },
  {
    key: "longestDistance",
    icon: "🏃",
    title: "Витривалий",
    milestones: [
      { tier: "bronze", threshold: 10, description: "Маршрут довжиною 10 км" },
      { tier: "silver", threshold: 20, description: "Маршрут довжиною 20 км" },
      { tier: "gold", threshold: 30, description: "Маршрут довжиною 30 км" },
      { tier: "crystal", threshold: 40, description: "Маршрут довжиною 40 км" },
      { tier: "diamond", threshold: 50, description: "Маршрут довжиною 50+ км" }
    ]
  },
  {
    key: "longestOneDayDistance",
    icon: "🔁",
    title: "Без зупинок",
    milestones: [
      { tier: "bronze", threshold: 12, description: "Одноденний маршрут 12 км без ночівлі" },
      { tier: "silver", threshold: 20, description: "Одноденний маршрут 20 км без ночівлі" },
      { tier: "gold", threshold: 30, description: "Одноденний маршрут 30 км без ночівлі" },
      { tier: "crystal", threshold: 40, description: "Одноденний маршрут 40 км без ночівлі" },
      { tier: "diamond", threshold: 50, description: "Одноденний маршрут 50 км без ночівлі" }
    ]
  },
  {
    key: "openSkyNights",
    icon: "🏕",
    title: "Ночі під відкритим небом",
    milestones: [
      { tier: "bronze", threshold: 10, description: "10 ночей у польових умовах" },
      { tier: "silver", threshold: 30, description: "30 ночей у польових умовах" },
      { tier: "gold", threshold: 70, description: "70 ночей у польових умовах" },
      { tier: "crystal", threshold: 150, description: "150 ночей у польових умовах" },
      { tier: "diamond", threshold: 300, description: "300 ночей у польових умовах" }
    ]
  },
  {
    key: "organizer",
    icon: "🧭",
    title: "Навігатор",
    milestones: [
      { tier: "bronze", threshold: 1, description: "1 похід як організатор або провідник" },
      { tier: "silver", threshold: 5, description: "5 походів як організатор або провідник" },
      { tier: "gold", threshold: 15, description: "15 походів як організатор або провідник" },
      { tier: "crystal", threshold: 30, description: "30 походів як організатор або провідник" },
      { tier: "diamond", threshold: 60, description: "60 походів як організатор або провідник" }
    ]
  },
  {
    key: "preparedLevel",
    icon: "🎒",
    title: "Підготовлений турист",
    milestones: [
      { tier: "bronze", threshold: 1, description: "Заповнений базовий профіль" },
      { tier: "silver", threshold: 2, description: "Додано особисте спорядження (мін. 5 одиниць)" },
      { tier: "gold", threshold: 3, description: "Заповнено медичні дані та екстрені контакти" },
      { tier: "crystal", threshold: 4, description: "Профіль оновлювався протягом останніх 6 місяців" },
      { tier: "diamond", threshold: 5, description: "Повністю укомплектований профіль" }
    ]
  },
  {
    key: "foodTrips",
    icon: "🔥",
    title: "Шеф кухні",
    milestones: [
      { tier: "bronze", threshold: 1, description: "1 похід із закритим харчуванням" },
      { tier: "silver", threshold: 3, description: "3 походи із закритим харчуванням" },
      { tier: "gold", threshold: 7, description: "7 походів із закритим харчуванням" },
      { tier: "crystal", threshold: 15, description: "15 походів із закритим харчуванням" },
      { tier: "diamond", threshold: 30, description: "30 походів із закритим харчуванням" }
    ]
  },
  {
    key: "sharedGearTrips",
    icon: "🛠",
    title: "Майстер виживання",
    milestones: [
      { tier: "bronze", threshold: 1, description: "1 похід зі спільним або запасним спорядженням" },
      { tier: "silver", threshold: 3, description: "3 походи зі спільним або запасним спорядженням" },
      { tier: "gold", threshold: 7, description: "7 походів зі спільним або запасним спорядженням" },
      { tier: "crystal", threshold: 15, description: "15 походів зі спільним або запасним спорядженням" },
      { tier: "diamond", threshold: 30, description: "30 походів зі спільним або запасним спорядженням" }
    ]
  },
  {
    key: "safetyTrips",
    icon: "🩹",
    title: "Рятівник",
    milestones: [
      { tier: "bronze", threshold: 1, description: "1 похід із закритою аптечкою або безпекою" },
      { tier: "silver", threshold: 3, description: "3 походи із закритою аптечкою або безпекою" },
      { tier: "gold", threshold: 7, description: "7 походів із закритою аптечкою або безпекою" },
      { tier: "crystal", threshold: 15, description: "15 походів із закритою аптечкою або безпекою" },
      { tier: "diamond", threshold: 30, description: "30 походів із закритою аптечкою або безпекою" }
    ]
  },
  {
    key: "expenseTrips",
    icon: "💸",
    title: "Відповідальний",
    milestones: [
      { tier: "bronze", threshold: 1, description: "1 похід із веденням витрат" },
      { tier: "silver", threshold: 3, description: "3 походи із веденням витрат" },
      { tier: "gold", threshold: 7, description: "7 походів із веденням витрат" },
      { tier: "crystal", threshold: 15, description: "15 походів із веденням витрат" },
      { tier: "diamond", threshold: 30, description: "30 походів із веденням витрат" }
    ]
  }
];

export const ONE_TIME_AWARDS = {
  trip_participant: {
    icon: "🎒",
    title: "Учасник походу",
    description: "Завершений похід зараховано в особисту історію"
  },
  first_hike: {
    icon: "🥾",
    title: "Перший крок",
    description: "Перший завершений похід"
  },
  explorer: {
    icon: "🗺️",
    title: "Дослідник",
    description: "Три завершені походи"
  },
  real_tourist: {
    icon: "🔥",
    title: "Справжній турист",
    description: "5 походів, 50 км сумарно і 5 ночівель"
  },
  lives_by_nature: {
    icon: "🏕",
    title: "Живе природою",
    description: "15 походів і 20 ночівель"
  },
  full_cycle: {
    icon: "🧭",
    title: "Повний цикл",
    description: "Участь, навігація і хоча б одна роль у забезпеченні походу"
  }
};

export const AWARD_RULES_OVERVIEW = [
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 / 🏆 `Учасник походів` — 1 / 15 / 30 / 50 / 80 / 200 завершених походів",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Далекобійник` — 30 / 200 / 1000 / 2500 / 5000 км",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Нічний турист` — 1 / 20 / 50 / 100 / 200 ночівель",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Підкорювач висот` — 2100 / 5000 / 10 000 / 30 000 / 100 000 м набору",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Випробуваний погодою` — 1 / 3 / 7 / 15 / 30 погодних походів",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Штормовий турист` — 1 / 3 / 7 / 15 / 30 штормових походів",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Льодовий воїн` — 1 / 3 / 7 / 15 / 30 холодних походів",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Витривалий` — 10 / 20 / 30 / 40 / 50+ км в одному поході",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Без зупинок` — 12 / 20 / 30 / 40 / 50 км в одному одноденному поході",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Ночі під відкритим небом` — 10 / 30 / 70 / 150 / 300 ночей",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Навігатор` — 1 / 5 / 15 / 30 / 60 походів як організатор",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Підготовлений турист` — від базового профілю до повністю укомплектованого профілю",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Шеф кухні` — 1 / 3 / 7 / 15 / 30 походів із закритим харчуванням",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Майстер виживання` — 1 / 3 / 7 / 15 / 30 походів із закритим спорядженням",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Рятівник` — 1 / 3 / 7 / 15 / 30 походів із закритою безпекою",
  "• 🥉 / 🥈 / 🥇 / 💠 / 💎 `Відповідальний` — 1 / 3 / 7 / 15 / 30 походів із веденням витрат",
  "• 🎒 `Учасник походу` — кожен завершений похід додається в історію участі",
  "• 🥾 `Перший крок` — за перший завершений похід",
  "• 🗺️ `Дослідник` — коли назбиралось 3 завершені походи",
  "• 🔥 `Справжній турист` — 5 походів + 50 км + 5 ночівель",
  "• 🏕 `Живе природою` — 15 походів + 20 ночівель",
  "• 🧭 `Повний цикл` — участь + хоча б один похід як навігатор + хоча б одна роль у забезпеченні"
];

export const TITLE_RULES_OVERVIEW = [
  "• `Новачок` — від першого завершеного походу з реальним маршрутом",
  "• `Мандрівник` — від 5 завершених походів",
  "• `Дослідник` — від 15 завершених походів",
  "• `Досвідчений` — від 30 завершених походів",
  "• `Провідник` — від 60 завершених походів",
  "• `Старший` — від 100 завершених походів",
  "• `Легенда` — від 150 завершених походів",
  "• `Жива легенда` — від 250 завершених походів"
];

export const MANUAL_AWARDS_OVERVIEW = [
  "• ☕ `Кавоман` — ручна відзнака від організатора",
  "• 🐌 `Повільно, але впевнено` — ручна відзнака від організатора",
  "• 😂 `Душа компанії` — ручна відзнака від організатора",
  "• 📸 `Хранитель спогадів` — ручна відзнака від організатора",
  "• 🫶 `Надійне плече` — за допомогу команді та підтримку на маршруті",
  "• 🧯 `Спокій і безпека` — за уважність до ризиків, аптечки й дисципліни",
  "• 🍲 `Майстер табору` — за порядок у таборі, кухню і побут",
  "• 🧰 `Людина-ремнабір` — за готовність виручити спорядженням і дрібним ремонтом",
  "• 🌦 `Стійкий до погоди` — за спокій і надійність у складну погоду",
  "• 🤝 `Опора команди` — за командну роботу та допомогу іншим учасникам",
  "• 🧭 `Навігатор дня` — за влучні рішення по маршруту в потрібний момент",
  "• 💧 `Хранитель води` — за грамотне планування води і джерел на маршруті",
  "• 🌄 `Людина світанку` — за ранні старти і дисципліну на виході",
  "• 🔥 `Тепло табору` — за атмосферу, кухню і командний настрій на стоянці",
  "• 🥾 `Залізні ноги` — за витримку на довгих переходах і важких наборах",
  "• 📍 `Завжди в точку` — за уважність до деталей, логістики і таймінгу походу"
];

export function getTierMeta(key) {
  return AWARD_TIERS.find((item) => item.key === key) || AWARD_TIERS[0];
}

export function getCurrentTitle(stats = {}) {
  const hikesCount = Number(stats.hikesCount) || 0;
  return TITLE_RULES.find((rule) => hikesCount >= rule.minHikes)?.title || "";
}

export function getXpLevel(totalXp = 0) {
  const xp = Number(totalXp) || 0;
  return XP_LEVELS.findLast((item) => xp >= item.minXp) || XP_LEVELS[0];
}

export function getNextXpLevel(totalXp = 0) {
  const xp = Number(totalXp) || 0;
  return XP_LEVELS.find((item) => xp < item.minXp) || null;
}

export function getXpProgress(totalXp = 0) {
  const current = getXpLevel(totalXp);
  const next = getNextXpLevel(totalXp);
  return {
    current,
    next,
    currentXp: Number(totalXp) || 0,
    nextTargetXp: next?.minXp || current.minXp,
    remainingXp: next ? Math.max(0, next.minXp - (Number(totalXp) || 0)) : 0
  };
}

export function formatAwardName(award) {
  if (!award) {
    return "";
  }
  const tier = award.tier ? getTierMeta(award.tier) : null;
  if (tier) {
    return `${tier.icon} ${award.title}`;
  }
  return `${award.icon} ${award.title}`;
}

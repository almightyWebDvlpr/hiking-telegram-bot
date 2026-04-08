import { FAQ_ITEMS } from "../data/faqCatalog.js";

function normalizeFaqSearchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9а-яіїєґ\s-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSeasonFaqIdByDate(dateString = "") {
  const month = Number(String(dateString || "").slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return "";
  }

  if ([12, 1, 2].includes(month)) {
    return "packing-winter";
  }
  if ([3, 4, 5].includes(month)) {
    return "packing-spring";
  }
  if ([6, 7, 8].includes(month)) {
    return "packing-summer";
  }
  return "packing-autumn";
}
function getRegionFaqIds(context = {}) {
  const trip = context.trip || {};
  const tripCard = trip.tripCard || {};
  const routeMeta = context.routeMeta || trip.routePlan?.meta || {};
  const candidates = [
    tripCard.region,
    trip.region,
    routeMeta.region,
    routeMeta.routeRegion,
    routeMeta.startRegion,
    context.location,
    context.region
  ]
    .map((value) => normalizeFaqSearchValue(value))
    .filter(Boolean);

  const ids = [];
  for (const value of candidates) {
    if (value.includes("чорногор")) {
      ids.push("region-chornohora");
    }
    if (value.includes("горган")) {
      ids.push("region-gorgany");
    }
    if (value.includes("свидов")) {
      ids.push("region-svidovets");
    }
    if (value.includes("боржав")) {
      ids.push("region-borzhava");
    }
    if (value.includes("мармар")) {
      ids.push("region-marmarosy");
    }
    if (value.includes("сколів") || value.includes("бескид")) {
      ids.push("region-skolivski");
    }
    if (value.includes("руна")) {
      ids.push("region-runa");
    }
    if (value.includes("синевир") || value.includes("негров")) {
      ids.push("region-synevyr");
    }
  }

  return [...new Set(ids)];
}
export class AdvisorService {
  getPreparationAdvice({ season, days, difficulty }) {
    const normalizedDifficulty = difficulty.toLowerCase();
    const isHard = ["важка", "складна", "hard", "high"].includes(normalizedDifficulty);

    const recommendations = [
      `План походу: сезон "${season}", тривалість ${days} дн., складність "${difficulty}".`,
      "База: вода, аптечка, ліхтарик, павербанк, дощовик, карта або офлайн-навігація."
    ];

    if (isHard) {
      recommendations.push(
        "Для складного маршруту перевір фізичну підготовку групи, резерв часу та план аварійного спуску."
      );
    } else {
      recommendations.push(
        "Для маршруту середньої або легкої складності все одно варто мати запасний шар одягу і трек офлайн."
      );
    }

    if (Number(days) >= 2) {
      recommendations.push("Для багатоденного походу окремо розподіли пальник, намет, газ, їжу та ремнабір.");
    } else {
      recommendations.push("Для одноденного виходу зроби акцент на темпі, воді та погодному вікні.");
    }

    return recommendations.join("\n");
  }

  getRandomFaqQuestions({ count = 10, excludeIds = [] } = {}) {
    const excluded = new Set(excludeIds);
    const preferredPool = FAQ_ITEMS.filter((item) => !excluded.has(item.id));
    const pool = preferredPool.length >= count ? preferredPool : FAQ_ITEMS.slice();
    const byCategory = new Map();

    for (const item of pool) {
      const group = byCategory.get(item.category) || [];
      group.push(item);
      byCategory.set(item.category, group);
    }

    const pick = [];
    const categories = this.#shuffle(Array.from(byCategory.keys()));

    for (const category of categories) {
      const items = this.#shuffle(byCategory.get(category) || []);
      if (items[0]) {
        pick.push(items[0]);
      }
      if (pick.length >= count) {
        break;
      }
    }

    if (pick.length < count) {
      const pickedIds = new Set(pick.map((item) => item.id));
      const rest = this.#shuffle(pool.filter((item) => !pickedIds.has(item.id)));
      pick.push(...rest.slice(0, count - pick.length));
    }

    return this.#shuffle(pick).slice(0, count).map((item) => ({
      id: item.id,
      category: item.category,
      question: item.question
    }));
  }

  getFaqQuestionsPage({ page = 0, pageSize = 10 } = {}) {
    const normalizedPageSize = Math.max(1, Number(pageSize) || 10);
    const ordered = FAQ_ITEMS.slice().sort(
      (left, right) => left.category.localeCompare(right.category, "uk") || left.question.localeCompare(right.question, "uk")
    );
    const totalCount = ordered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / normalizedPageSize));
    const safePage = Math.min(Math.max(0, Number(page) || 0), totalPages - 1);
    const start = safePage * normalizedPageSize;

    return {
      items: ordered.slice(start, start + normalizedPageSize).map((item) => ({
        id: item.id,
        category: item.category,
        question: item.question
      })),
      page: safePage,
      pageSize: normalizedPageSize,
      totalCount,
      totalPages
    };
  }

  getFaqAnswer(questionId) {
    const item = FAQ_ITEMS.find((entry) => entry.id === questionId);
    if (!item) {
      return "Не знайшов відповідь на це питання. Спробуй обрати інше з меню нижче.";
    }

    return [
      `❓ ${item.question}`,
      "",
      ...item.answer.map((line) => `• ${line}`)
    ].join("\n");
  }

  getFaqQuestionById(questionId) {
    const item = FAQ_ITEMS.find((entry) => entry.id === questionId);
    if (!item) {
      return null;
    }

    return {
      id: item.id,
      category: item.category,
      question: item.question
    };
  }
  searchFaqQuestions(query, { page = 0, pageSize = 10 } = {}) {
    const normalizedQuery = normalizeFaqSearchValue(query);
    if (!normalizedQuery || normalizedQuery.length < 2) {
      return {
        items: [],
        page: 0,
        pageSize: Math.max(1, Number(pageSize) || 10),
        totalCount: 0,
        totalPages: 1
      };
    }

    const queryTokens = normalizedQuery.split(" ").filter(Boolean);
    const ranked = FAQ_ITEMS.map((item) => {
      const question = normalizeFaqSearchValue(item.question);
      const category = normalizeFaqSearchValue(item.category);
      const answer = normalizeFaqSearchValue(item.answer.join(" "));
      const haystack = `${question} ${category} ${answer}`;
      let score = 0;

      if (question.includes(normalizedQuery)) {
        score += 8;
      }
      if (category.includes(normalizedQuery)) {
        score += 4;
      }
      if (answer.includes(normalizedQuery)) {
        score += 2;
      }

      for (const token of queryTokens) {
        if (question.includes(token)) {
          score += 3;
        } else if (haystack.includes(token)) {
          score += 1;
        }
      }

      return score > 0
        ? {
            id: item.id,
            category: item.category,
            question: item.question,
            score
          }
        : null;
    })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || left.question.localeCompare(right.question, "uk"));

    const normalizedPageSize = Math.max(1, Number(pageSize) || 10);
    const totalCount = ranked.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / normalizedPageSize));
    const safePage = Math.min(Math.max(0, Number(page) || 0), totalPages - 1);
    const start = safePage * normalizedPageSize;

    return {
      items: ranked.slice(start, start + normalizedPageSize).map(({ id, category, question }) => ({ id, category, question })),
      page: safePage,
      pageSize: normalizedPageSize,
      totalCount,
      totalPages
    };
  }

  getContextualFaqSuggestions(context = {}, { limit = 3 } = {}) {
    const trip = context.trip || {};
    const tripCard = trip.tripCard || {};
    const seasonFaqId = getSeasonFaqIdByDate(tripCard.startDate || context.startDate || "");
    const screen = context.screen || "";
    const weatherSummary = normalizeFaqSearchValue(context.weatherSummary || "");
    const routeMeta = context.routeMeta || trip.routePlan?.meta || {};
    const ids = [];
    const regionFaqIds = getRegionFaqIds(context);

    if (screen === "trip_details") {
      if (seasonFaqId) {
        ids.push(seasonFaqId);
      }
      ids.push(...regionFaqIds);
      ids.push("gear-must-have", "packing-first-hike");
      if (Number(tripCard.nights) > 0) {
        ids.push("clothes-night");
      }
      if (trip.routePlan) {
        ids.push("route-start-time");
      }
    }

    if (screen === "trip_gear") {
      if (seasonFaqId) {
        ids.push(seasonFaqId);
      }
      ids.push(...regionFaqIds);
      ids.push("gear-must-have", "packing-first-hike");
      if (Number(tripCard.nights) > 0) {
        ids.push("camp-shared", "clothes-night");
      }
    }

    if (screen === "route") {
      ids.push(...regionFaqIds);
      ids.push("route-fit", "route-start-time", "nav-offline");
      if (Number(tripCard.nights) > 0) {
        ids.push("water-none");
      } else {
        ids.push("water-day");
      }
      if (String(routeMeta?.difficulty || routeMeta?.difficultyLabel || "").toLowerCase().includes("вис")) {
        ids.push("route-cancel");
      }
    }

    if (screen === "weather") {
      if (seasonFaqId) {
        ids.push(seasonFaqId);
      }
      ids.push(...regionFaqIds);
      if (weatherSummary.includes("дощ") || weatherSummary.includes("опад")) {
        ids.push("clothes-rain");
      }
      if (weatherSummary.includes("гроза")) {
        ids.push("safety-thunder");
      }
      if (weatherSummary.includes("вітер") || weatherSummary.includes("порив")) {
        ids.push("nav-weather");
      }
      if (weatherSummary.includes("сніг") || weatherSummary.includes("мороз") || weatherSummary.includes("мінус")) {
        ids.unshift("packing-winter");
      }
      ids.push("water-day", "route-cancel");
    }

    if (!ids.length) {
      if (seasonFaqId) {
        ids.push(seasonFaqId);
      }
      ids.push(...regionFaqIds);
    }

    const uniqueIds = [...new Set(ids)].slice(0, Math.max(1, Number(limit) || 3));
    return uniqueIds
      .map((id) => this.getFaqQuestionById(id))
      .filter(Boolean);
  }
  #shuffle(items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }
}

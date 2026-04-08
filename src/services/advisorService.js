import { FAQ_ITEMS } from "../data/faqCatalog.js";

function normalizeFaqSearchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9а-яіїєґ\s-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  #shuffle(items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }
}

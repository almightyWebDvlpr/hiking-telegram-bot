import { FAQ_ITEMS } from "../data/faqCatalog.js";

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

  #shuffle(items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }
}

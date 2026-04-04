import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Markup, Telegraf } from "telegraf";
import { config } from "./config.js";
import { GroupService } from "./services/groupService.js";
import { UserService } from "./services/userService.js";
import { WeatherService } from "./services/weatherService.js";
import { RouteService } from "./services/routeService.js";
import { AdvisorService } from "./services/advisorService.js";
import { resolveSafetyProfile } from "./data/safetyContacts.js";
import { VpohidLiveService } from "./services/vpohidLiveService.js";
import {
  PROFILE_AWARDS_LABEL,
  AWARD_RULES_OVERVIEW,
  MANUAL_AWARDS_OVERVIEW,
  TITLE_RULES_OVERVIEW,
  formatAwardName
} from "./data/awardsCatalog.js";
import {
  categorizeGearName,
  formatGearAttribute,
  resolveGearProfile,
  summarizeGearAttributes
} from "./data/gearCatalog.js";



const flows = new Map();
const vpohidSelections = new Map();
const menuContexts = new Map();
const vpohidCatalogLoads = new Set();
const FAQ_LABEL = "❓ Часті питання";
const FAQ_REFRESH_LABEL = "🔄 Інші питання";
const HELP_BACK_LABEL = "⬅️ До допомоги";
const PROFILE_LABEL = "🙍 Мій профіль";
const PROFILE_DASHBOARD_LABEL = "📊 Дашборд";
const PROFILE_ABOUT_LABEL = "👤 Про мене";
const PROFILE_MEDICAL_LABEL = "🩺 Медична картка";
const PROFILE_EDIT_LABEL = "✏️ Редагувати профіль";
const PROFILE_BACK_LABEL = "⬅️ До профілю";
const PROFILE_SKIP_LABEL = "⏭ Пропустити";
const TRIP_MEMBERS_BACK_LABEL = "⬅️ До учасників";
const TRIP_HISTORY_BACK_LABEL = "⬅️ До історії";
const HELP_SECTIONS = [
  "🚀 Як почати і створити похід",
  "📍 Як додати маршрут",
  "📚 Як знайти маршрут",
  "🌦 Як працює погода",
  "🎒 Як працює спорядження",
  "🏅 Як працюють нагороди",
  "✅ Як завершити похід",
  "🆘 Безпека в поході",
  "❓ Як працюють часті питання"
];

const MAIN_KEYBOARD = Markup.keyboard([
  ["👥 Похід", PROFILE_LABEL],
  ["🔑 Приєднатися до походу", "🗺 Маршрути"],
  ["🕓 Історія походів", "🌦 Погода"],
  [FAQ_LABEL, "ℹ️ Допомога"]
]).resize().persistent();

const ROUTES_BACK_LABEL = "⬅️ До маршрутів";
const ROUTES_GENERATE_LABEL = "🧭 Згенерувати маршрут";
const ROUTES_EXISTING_LABEL = "📚 Знайти в каталозі маршрутів";
const ROUTES_DETAILS_LABEL = "📍 Деталі знайденого маршруту";
const TRIP_WEATHER_BACK_LABEL = "⬅️ До походу";
const GEAR_DELETE_CONFIRM_LABEL = "✅ Так, видалити";
const GEAR_DELETE_CANCEL_LABEL = "⬅️ Не видаляти";
const GEAR_EDIT_ACTION_LABEL = "✏️ Редагувати";
const GEAR_EDIT_DELETE_LABEL = "🗑 Видалити";
const GEAR_EDIT_BACK_LABEL = "⬅️ Назад";
const GEAR_SCOPE_SHARED_LABEL = "🫕 Спільне";
const GEAR_SCOPE_PERSONAL_LABEL = "🎒 Особисте";
const GEAR_SCOPE_SPARE_LABEL = "🧰 Запасне / позичу";
const GEAR_SCOPE_KEEP_LABEL = "⏭ Без змін";
const TRIP_GEAR_ADD_LABEL = "➕ Додати спорядження";
const TRIP_GEAR_ADD_BACK_LABEL = "⬅️ До спорядження походу";

const MY_GEAR_KEYBOARD = Markup.keyboard([
  ["➕ Додати моє спорядження", "✏️ Редагувати моє спорядження"],
  ["📦 Моє спорядження"],
  [PROFILE_BACK_LABEL, "⬅️ Головне меню"]
]).resize().persistent();

const KEYBOARD_PLACEHOLDER = "⠀";

const FLOW_CANCEL_KEYBOARD = Markup.keyboard([["❌ Скасувати", "⬅️ Головне меню"]]).resize().persistent();
const FLOW_CONFIRM_ROUTE_KEYBOARD = Markup.keyboard([["✅ Підтвердити маршрут", "❌ Скасувати"]]).resize().persistent();
const FLOW_CONFIRM_CARD_KEYBOARD = Markup.keyboard([["✅ Зберегти дані походу", "❌ Скасувати"]]).resize().persistent();
const FLOW_OPTIONAL_STOPS_KEYBOARD = Markup.keyboard([["⏭ Без зупинок", "❌ Скасувати"], ["⬅️ Головне меню"]]).resize().persistent();
const FLOW_STOPS_DONE_LABEL = "✅ Готово зі зупинками";
const FLOW_STOPS_CLEAR_LABEL = "🗑 Очистити зупинки";
const VPOHID_BACK_TO_TRIP_ROUTE_LABEL = "⬅️ До маршруту походу";
const VPOHID_BACK_TO_ROUTES_LABEL = "⬅️ До маршрутів";
const VPOHID_SAVE_TO_TRIP_LABEL = "✅ Обрати маршрут для походу";
const VPOHID_PICK_LABEL = "✅ Обрати маршрут";
const VPOHID_SEARCH_LABEL = "🔎 Пошук";
const VPOHID_RESULTS_LIMIT = 10;
const VPOHID_BROWSE_ALL_LABEL = "📚 Переглянути всі маршрути";
const VPOHID_PREV_PAGE_LABEL = "⬅️ Попередні 10";
const VPOHID_NEXT_PAGE_LABEL = "➡️ Наступні 10";
const ROUTE_CHANGE_LABEL = "🔁 Змінити маршрут походу";
const FINISH_TRIP_YES_LABEL = "✅ Так";
const FINISH_TRIP_NO_LABEL = "❌ Ні";
const FLOW_GEAR_STATUS_KEYBOARD = Markup.keyboard([
  ["🟢 Готово", "🟡 Частково готово"],
  ["🔴 Збираємо", "❌ Скасувати"]
]).resize().persistent();
const FINISH_TRIP_CONFIRM_KEYBOARD = Markup.keyboard([
  [FINISH_TRIP_YES_LABEL, FINISH_TRIP_NO_LABEL]
]).resize().persistent();

const WELCOME_TEXT = [
  "🏔 Мандрівник +",
  "",
  "Загальний простір: погода, пошук маршрутів, часті питання і твій профіль.",
  "Простір походу: маршрут, дані походу, спорядження і погода в регіоні походу.",
  "Якщо тебе запросили в похід, натисни `🔑 Приєднатися до походу` або використай `/start join_КОД`.",
  "",
  "Навігація працює через нижнє меню."
].join("\n");

const HELP_TEXT = [
  "Загальні команди:",
  "/weather Місце",
  "/route Звідки -> Куди",
  "/addmygear назва;кількість;нотатка",
  "/mygear",
  "",
  "Команди походу:",
  "/newgroup",
  "/join КодПоходу",
  "/invite",
  "/grantaccess КодУчасника",
  "/mygroup",
  "/setgrouproute Звідки -> Куди",
  "/editgrouproute Звідки -> Куди",
  "/grouproute",
  "/setgroupregion Місце",
  "/groupweather",
  "/finishtrip",
  "/grouphistory",
  "/addgear назва;кількість;shared|personal|spare;так|ні",
  "/needgear назва;кількість;коментар",
  "/gear",
  "/requestgear назва",
  "/myneeds",
  "/addfood назва;вага/об'єм;кількість;ціна",
  "/food",
  "/addexpense назва;кількість;ціна",
  "/expenses",
  "/passport",
  "/tripreminders"
].join("\n");

const HELP_CONTENT = {
  "🚀 Як почати і створити похід": [
    "Найпростіший сценарій такий:",
    "• відкрий `👥 Похід` і натисни `➕ Створити похід`",
    "• задай назву, дати і статус готовності спорядження",
    "• додай маршрут: власний або з каталогу",
    "• перевір погоду, спорядження і безпеку",
    "• перед стартом згенеруй GPX або KML"
  ].join("\n"),
  "📍 Як додати маршрут": [
    "Маршрут можна додати двома способами:",
    "• `🧭 Згенерувати власний маршрут` — якщо хочеш сам задати точки",
    "• `📚 Знайти в каталозі маршрутів` — якщо хочеш взяти готовий маршрут",
    "Після вибору маршруту бот покаже картку, прев’ю треку і дасть GPX/KML."
  ].join("\n"),
  "📚 Як знайти маршрут": [
    "У каталозі можна:",
    "• шукати за назвою маршруту",
    "• шукати за частиною слова",
    "• шукати за хребтом, озером, вершиною або населеним пунктом",
    "• переглядати весь каталог по 10 маршрутів на сторінку"
  ].join("\n"),
  "🌦 Як працює погода": [
    "Погоду можна дивитися окремо або в контексті походу.",
    "Для походу бот бере населений пункт із району маршруту і показує не тільки прогноз, а й погодні попередження:",
    "• сильний вітер",
    "• гроза",
    "• заморозок",
    "• дощовий ризик на хребті"
  ].join("\n"),
  "🎒 Як працює спорядження": [
    "У боті є два рівні спорядження:",
    "• `🙍 Мій профіль -> 🎒 Моє спорядження` — твоє особисте",
    "• `🎒 Спорядження походу` — те, що прив’язане до конкретного походу",
    "У поході можна додавати спільне, особисте, запасне і запити на спорядження."
  ].join("\n"),
  "🏅 Як працюють нагороди": [
    "Нагороди видаються лише за похід, у якому був реальний маршрут.",
    "Якщо похід закрили без маршруту, нагороди не нараховуються.",
    "XP працює окремо від титулів і нагород: за кожен реальний завершений похід ти отримуєш досвід, а рівень росте поступово.",
    "",
    "Основні правила:",
    ...AWARD_RULES_OVERVIEW,
    "",
    "Титули ростуть так:",
    ...TITLE_RULES_OVERVIEW,
    "",
    "XP дається за:",
    "• завершений похід",
    "• кілометри",
    "• набір висоти",
    "• ночівлі",
    "• складні погодні умови",
    "• ролі в поході",
    "• нові рівні нагород і комбо",
    "",
    "Фанові відзнаки:",
    ...MANUAL_AWARDS_OVERVIEW
  ].join("\n"),
  "✅ Як завершити похід": [
    "Завершити похід може організатор у розділі `👥 Похід`.",
    "Після підтвердження похід переходить у стан `завершений`, зберігається фінальний підсумок і він зникає з активних.",
    "Через деякий час завершені походи автоматично переходять в архів."
  ].join("\n"),
  "🆘 Безпека в поході": [
    "Перед виходом обов’язково перевір:",
    "• прогноз по вітру, опадах і грозі",
    "• офлайн-трек",
    "• заряд телефону і павербанк",
    "• запасний варіант сходу",
    "• контакти рятувальників у регіоні"
  ].join("\n"),
  "❓ Як працюють часті питання": [
    "У головному меню є окремий розділ `❓ Часті питання`.",
    "Там бот щоразу показує 10 випадкових питань по походах, одягу, спорядженню, воді, табору і безпеці.",
    "Якщо список не підійшов, натисни `🔄 Інші питання`."
  ].join("\n")
};

function buildKeyboard(rows) {
  return Markup.keyboard(rows).resize().persistent();
}

function getMainKeyboard(ctxOrUser = null) {
  return MAIN_KEYBOARD;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function preserveInlineMarkup(value) {
  return escapeHtml(value)
    .replaceAll("&lt;b&gt;", "<b>")
    .replaceAll("&lt;/b&gt;", "</b>")
    .replaceAll("&lt;i&gt;", "<i>")
    .replaceAll("&lt;/i&gt;", "</i>")
    .replaceAll("&lt;code&gt;", "<code>")
    .replaceAll("&lt;/code&gt;", "</code>");
}

function formatCardHeader(icon, title) {
  return [`<b>${escapeHtml(icon)} ${escapeHtml(title)}</b>`];
}

function formatSectionHeader(icon, title) {
  return `<b>${escapeHtml(icon)} ${escapeHtml(title)}</b>`;
}

function formatRichLine(line) {
  const raw = String(line ?? "");
  const trimmed = raw.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("<b>") || trimmed.startsWith("<blockquote>")) {
    return raw;
  }

  if (trimmed === "⚠️ Зверни увагу:" || trimmed === "⚠️ Зверни увагу") {
    return "<b>⚠️ Зверни увагу</b>";
  }

  const iconLabelMatch = raw.match(/^(\p{Extended_Pictographic}\uFE0F?(?:\s+\S+)*?):\s*(.+)$/u);
  if (iconLabelMatch) {
    return `<b>${escapeHtml(iconLabelMatch[1])}:</b> ${preserveInlineMarkup(iconLabelMatch[2])}`;
  }

  const labelMatch = raw.match(/^([^•\d<][^:]{1,80}):\s*(.+)$/);
  if (labelMatch) {
    return `<b>${escapeHtml(labelMatch[1])}:</b> ${preserveInlineMarkup(labelMatch[2])}`;
  }

  return preserveInlineMarkup(raw);
}

function joinRichLines(lines) {
  const prepared = [];

  for (const line of lines) {
    if (line === null || line === undefined) {
      continue;
    }

    const formatted = formatRichLine(line);
    if (!formatted) {
      if (prepared[prepared.length - 1] !== "") {
        prepared.push("");
      }
      continue;
    }

    prepared.push(formatted);
  }

  while (prepared[prepared.length - 1] === "") {
    prepared.pop();
  }

  return prepared.join("\n");
}

function getHelpMenuKeyboard() {
  const rows = [];
  for (let index = 0; index < HELP_SECTIONS.length; index += 2) {
    rows.push(HELP_SECTIONS.slice(index, index + 2));
  }
  rows.push(["⬅️ Головне меню"]);
  return buildKeyboard(rows);
}

function getHelpSectionKeyboard() {
  return buildKeyboard([[HELP_BACK_LABEL, "⬅️ Головне меню"]]);
}

function getProfileKeyboard() {
  return buildKeyboard([
    [PROFILE_DASHBOARD_LABEL, PROFILE_AWARDS_LABEL],
    [PROFILE_ABOUT_LABEL, PROFILE_MEDICAL_LABEL],
    [PROFILE_EDIT_LABEL, "🎒 Моє спорядження"],
    ["⬅️ Головне меню"]
  ]);
}

function getProfileEditKeyboard() {
  return buildKeyboard([
    [PROFILE_SKIP_LABEL, "❌ Скасувати"],
    [PROFILE_BACK_LABEL]
  ]);
}

function getTripMember(trip, userId) {
  return trip?.members?.find((member) => member.id === userId) || null;
}

function canManageTrip(trip, userId) {
  return Boolean(getTripMember(trip, userId)?.canManage);
}

function isTripOwner(trip, userId) {
  return getTripMember(trip, userId)?.role === "owner";
}

function getUserLabel(ctx) {
  return ctx.from.first_name || ctx.from.username || "Мандрівник";
}

function getMemberDisplayName(userService, member) {
  return userService.getDisplayName(member.id, member.name);
}

function isValidTelegramUsername(value) {
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(String(value || ""));
}

function extractJoinInviteCode(payload) {
  const normalized = String(payload || "").trim();

  if (normalized.startsWith("join_")) {
    return normalized.slice(5).trim().toUpperCase();
  }

  if (normalized.startsWith("join")) {
    return normalized.slice(4).trim().toUpperCase();
  }

  return "";
}

function getTripKeyboard(trip, userId = "") {
  if (!trip) {
    return buildKeyboard([
      ["➕ Створити похід"],
      ["⬅️ Головне меню"]
    ]);
  }

  const rows = [
    ["🪪 Паспорт походу", "👤 Учасники походу", "🔔 Нагадування"],
    isTripOwner(trip, userId)
      ? ["📍 Маршрут походу", "🎒 Спорядження походу", "🎒 Вага рюкзака"]
      : ["📍 Маршрут походу", "🎒 Спорядження походу", KEYBOARD_PLACEHOLDER],
    ["🆘 Безпека походу", "🍲 Харчування походу", KEYBOARD_PLACEHOLDER],
    ["🌦 Погода походу", "💸 Витрати походу", isTripOwner(trip, userId) ? "✅ Завершити похід" : KEYBOARD_PLACEHOLDER],
    ["⬅️ Головне меню"]
  ];

  if (canManageTrip(trip, userId)) {
    rows.splice(rows.length - 1, 0, ["✏️ Редагувати дані походу", KEYBOARD_PLACEHOLDER, KEYBOARD_PLACEHOLDER]);
  }

  return buildKeyboard(rows);
}

function formatVpohidSearchResults(query, matches) {
  if (!matches.length) {
    return joinRichLines([
      "🔎 Готові маршрути",
      `Пошук: ${query}`,
      "",
      "Нічого не знайдено.",
      "",
      "Спробуй назву маршруту або фрагмент точки:",
      "• Перехід через хребет Кукул",
      "• Заросляк",
      "• Кваси",
      "• Сивуля"
    ]);
  }

  const lines = [
    "🔎 Готові маршрути",
    `Пошук: ${query}`,
    "",
    `Знайдено маршрутів: ${matches.length}`,
    `Показано: ${Math.min(matches.length, VPOHID_RESULTS_LIMIT)}`,
    ""
  ];

  matches.slice(0, VPOHID_RESULTS_LIMIT).forEach((route, index) => {
    const direction = [route.start, route.finish].filter(Boolean).join(" → ");

    lines.push(`${index + 1}. ${route.title}`);
    if (direction) {
      lines.push(`   Напрямок: ${direction}`);
    }
    if (route.duration) {
      lines.push(`   Тривалість: ${route.duration}`);
    }
    if (route.level) {
      lines.push(`   Рівень: ${route.level}`);
    }
    lines.push(`   Посилання: ${route.url}`);
    lines.push("");
  });

  return joinRichLines(lines);
}

function formatVpohidCatalogResults(matches, page = 0) {
  const totalPages = Math.max(1, Math.ceil(matches.length / VPOHID_RESULTS_LIMIT));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const startIndex = safePage * VPOHID_RESULTS_LIMIT;
  const pageMatches = matches.slice(startIndex, startIndex + VPOHID_RESULTS_LIMIT);
  const lines = [
    "📚 Каталог маршрутів",
    "Усі готові маршрути з каталогу",
    "",
    `Усього маршрутів: ${matches.length}`,
    `Сторінка: ${safePage + 1}/${totalPages}`,
    ""
  ];

  pageMatches.forEach((route, index) => {
    const direction = [route.start, route.finish].filter(Boolean).join(" → ");
    lines.push(`${startIndex + index + 1}. ${route.title}`);
    if (direction) {
      lines.push(`   Напрямок: ${direction}`);
    }
    if (route.duration) {
      lines.push(`   Тривалість: ${route.duration}`);
    }
    if (route.level) {
      lines.push(`   Рівень: ${route.level}`);
    }
    lines.push(`   Посилання: ${route.url}`);
    lines.push("");
  });

  return joinRichLines(lines);
}

function getVpohidSelection(userId) {
  return vpohidSelections.get(String(userId)) || null;
}

function setMenuContext(userId, context) {
  if (!userId) {
    return;
  }
  menuContexts.set(String(userId), context);
}

function getMenuContext(userId) {
  return menuContexts.get(String(userId)) || "home";
}

function isTripRouteContext(context) {
  return context === "trip-route" || context === "trip-route-change" || context === "trip-route-catalog";
}

function getFlowParentContext(flow) {
  return flow?.data?.parentContext || "";
}

function showParentMenuByContext(ctx, groupService, context) {
  if (context === "trip-route-change") {
    return showTripRouteChangeMenu(ctx, groupService);
  }
  if (context === "trip-route" || context === "trip-route-catalog") {
    return showRouteMenu(ctx, groupService);
  }
  if (context === "routes-catalog" || context === "routes") {
    return showRoutesMenu(ctx);
  }
  return null;
}

function getVpohidFlowMode(flow) {
  return flow?.data?.mode || "routes";
}

function getVpohidBackLabel(mode = "routes") {
  if (mode === "trip") {
    return VPOHID_BACK_TO_TRIP_ROUTE_LABEL;
  }

  return VPOHID_BACK_TO_ROUTES_LABEL;
}

function getVpohidPreviewKeyboard(mode = "routes") {
  if (mode !== "trip") {
    return buildKeyboard([
      ["📄 GPX vpohid", "📄 KML vpohid"],
      [getVpohidBackLabel(mode)]
    ]);
  }

  return buildKeyboard([
    [VPOHID_SAVE_TO_TRIP_LABEL, "🔎 Повернутися до пошуку"],
    [getVpohidBackLabel(mode)]
  ]);
}

function getVpohidSearchKeyboard(mode = "routes") {
  return buildKeyboard([["❌ Скасувати", getVpohidBackLabel(mode)]]);
}

function getVpohidCatalogMenuKeyboard(mode = "routes") {
  if (mode === "trip") {
    return buildKeyboard([
      [VPOHID_SEARCH_LABEL, VPOHID_BROWSE_ALL_LABEL],
      ["❌ Скасувати", getVpohidBackLabel(mode)]
    ]);
  }

  return buildKeyboard([
    [VPOHID_SEARCH_LABEL, VPOHID_BROWSE_ALL_LABEL],
    ["❌ Скасувати", "⬅️ Головне меню"]
  ]);
}

function getVpohidDetailsKeyboard(mode = "routes") {
  if (mode === "trip") {
    return buildKeyboard([
      ["🗺 Переглянути маршрут vpohid", "📄 GPX vpohid"],
      ["📄 KML vpohid", getVpohidBackLabel(mode)],
    ]);
  }

  return buildKeyboard([
    ["📄 GPX vpohid", "📄 KML vpohid"],
    [getVpohidBackLabel(mode)]
  ]);
}

function getRoutesMenuKeyboard(userId) {
  const rows = [[ROUTES_GENERATE_LABEL, ROUTES_EXISTING_LABEL]];
  rows.push(["⬅️ Головне меню"]);
  return buildKeyboard(rows);
}

function truncateButtonLabel(value, maxLength = 34) {
  if (String(value).length <= maxLength) {
    return String(value);
  }

  return `${String(value).slice(0, maxLength - 1).trim()}…`;
}

function buildVpohidResultButton(route, index) {
  return `${index + 1}. ${truncateButtonLabel(route.title, 34)}`;
}

function getVpohidResultsKeyboard(matches, mode = "routes") {
  const rows = [];
  const pageMatches = matches.slice(0, VPOHID_RESULTS_LIMIT);

  for (let index = 0; index < pageMatches.length; index += 2) {
    const pair = pageMatches.slice(index, index + 2).map((route, offset) => buildVpohidResultButton(route, index + offset));
    rows.push(pair);
  }

  rows.push(["🔎 Повернутися до пошуку", getVpohidBackLabel(mode)]);
  return buildKeyboard(rows);
}

function getVpohidCatalogKeyboard(matches, mode = "routes", page = 0) {
  const totalPages = Math.max(1, Math.ceil(matches.length / VPOHID_RESULTS_LIMIT));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const startIndex = safePage * VPOHID_RESULTS_LIMIT;
  const pageMatches = matches.slice(startIndex, startIndex + VPOHID_RESULTS_LIMIT);
  const rows = [];

  for (let index = 0; index < pageMatches.length; index += 2) {
    const pair = pageMatches
      .slice(index, index + 2)
      .map((route, offset) => buildVpohidResultButton(route, startIndex + index + offset));
    rows.push(pair);
  }

  const navRow = [];

  if (safePage > 0) {
    navRow.push(VPOHID_PREV_PAGE_LABEL);
  }
  if (safePage < totalPages - 1) {
    navRow.push(VPOHID_NEXT_PAGE_LABEL);
  }
  if (navRow.length) {
    rows.push(navRow);
  }

  rows.push(["🔎 Повернутися до пошуку", getVpohidBackLabel(mode)]);
  return buildKeyboard(rows);
}

function formatVpohidRoutePreview(detail, report = null) {
  const lines = [
    "🗺 Готовий маршрут",
    detail.title
  ];

  if (detail.subtitle) {
    lines.push("", detail.subtitle);
  }

  lines.push("", "📋 Загальна інформація");
  if (detail.start || detail.finish) {
    lines.push(`Старт / фініш: ${detail.start || "—"}${detail.finish ? ` -> ${detail.finish}` : ""}`);
  }
  if (detail.distance) {
    lines.push(`Відстань: ${detail.distance}`);
  }
  if (detail.duration) {
    lines.push(`Тривалість: ${detail.duration}`);
  }
  if (detail.level) {
    lines.push(`Рівень: ${detail.level}`);
  }
  if (detail.peaks?.length) {
    lines.push(`Вершини: ${detail.peaks.join(" • ")}`);
  }
  if (detail.interesting?.length) {
    lines.push(`Цікаве: ${detail.interesting.slice(0, 5).join(" • ")}`);
  }
  if (detail.weatherSettlements?.length) {
    lines.push(`Погода в районі маршруту: ${detail.weatherSettlements.join(" • ")}`);
  }
  if (detail.description) {
    lines.push("", "📝 Короткий опис", detail.description);
  }

  lines.push("", "🔗 Джерело", detail.url);

  if (detail.points?.length) {
    lines.push("", "🧭 Точки для генерації треку", detail.points.join(" -> "));
  }

  if (report) {
    lines.push(
      "",
      "🗺 Статус генерації",
      report.ok
        ? `Трек згенеровано: ${report.reliable ? "надійний" : "чернетка"}`
        : "Не вдалося згенерувати точний трек для цього маршруту."
    );
  }

  return joinRichLines(lines);
}

function getTripWeatherLocation(trip) {
  const weatherSettlements = trip?.routePlan?.meta?.vpohidDetail?.weatherSettlements;
  if (Array.isArray(weatherSettlements) && weatherSettlements.length) {
    return weatherSettlements[0];
  }

  return trip?.region || trip?.routePlan?.from || "";
}

function getTripWeatherSettlements(trip) {
  const weatherSettlements = trip?.routePlan?.meta?.vpohidDetail?.weatherSettlements;
  if (Array.isArray(weatherSettlements) && weatherSettlements.length) {
    return [...new Set(weatherSettlements.map((item) => String(item || "").trim()).filter(Boolean))];
  }

  const fallback = getTripWeatherLocation(trip);
  return fallback ? [fallback] : [];
}

function getTripWeatherSelectionKeyboard(settlements) {
  const rows = [];
  for (let index = 0; index < settlements.length; index += 2) {
    rows.push(settlements.slice(index, index + 2));
  }
  rows.push([TRIP_WEATHER_BACK_LABEL]);
  return buildKeyboard(rows);
}

function formatVpohidChosenRoute(selection) {
  const { detail, report } = selection;
  const lines = [
    "📍 Деталі маршруту",
    detail.title
  ];

  if (detail.subtitle) {
    lines.push("", detail.subtitle);
  }

  if (detail.start || detail.finish) {
    lines.push(`Старт / фініш: ${detail.start || "—"}${detail.finish ? ` -> ${detail.finish}` : ""}`);
  }

  if (detail.points?.length) {
    lines.push(`Точки маршруту: ${detail.points.join(" -> ")}`);
  }

  if (selection.points?.length) {
    lines.push(`Точки для генерації треку: ${selection.points.join(" -> ")}`);
  }

  if (report?.meta?.trackQuality && ["verified", "router-generated"].includes(report.meta.trackQuality)) {
    lines.push("GPX/KML доступні для цього маршруту.");
  } else {
    lines.push("GPX/KML поки недоступні: спершу треба отримати придатну геометрію треку.");
  }

  lines.push("", "Що далі:", "• Завантажити GPX або KML", `• ${selection.mode === "trip" ? "Повернутися до маршруту походу" : "Повернутися до маршрутів"}`);
  return joinRichLines(lines);
}

function canonicalizeVpohidPoint(value) {
  const normalized = String(value || "")
    .replace(/^оз\.\s*/i, "озеро ")
    .replace(/^о\.\s*/i, "озеро ")
    .replace(/^пол\.\s*/i, "полонина ")
    .replace(/^г\.\s*/i, "гора ")
    .replace(/\s+/g, " ")
    .trim();

  const aliases = new Map([
    ["озеро несамовите", "озеро Несамовите"],
    ["оз несамовите", "озеро Несамовите"],
    ["озеро бребенескул", "озеро Бребенескул"],
    ["оз бребенескул", "озеро Бребенескул"],
    ["гора говерла", "гора Говерла"],
    ["гора петрос", "гора Петрос"],
    ["гора кукул", "гора Кукул"],
    ["кпп заросляк", "КПП Заросляк"],
    ["заросляк", "Заросляк"]
  ]);

  return aliases.get(normalized.toLowerCase()) || normalized;
}

function startVpohidSearchWizard(ctx, groupService = null, mode = "routes") {
  let trip = null;
  const parentContext = getMenuContext(ctx.from?.id);

  if (mode === "trip") {
    trip = requireManageTrip(ctx, groupService);
    if (!trip) {
      return null;
    }
  }

  setFlow(String(ctx.from.id), {
    type: "vpohid_search",
    tripId: trip?.id || null,
    step: "query",
    data: {
      mode,
      parentContext
    }
  });

  const intro = mode === "trip"
    ? "Введи назву готового маршруту або фрагмент для пошуку на vpohid.com.ua.\nПриклад: `Перехід через хребет Кукул` або `Заросляк`."
    : "Введи назву готового маршруту або фрагмент для пошуку на vpohid.com.ua.\nПриклад: `Перехід через хребет Кукул` або `Заросляк`.";

  return ctx.reply(intro, {
    parse_mode: "Markdown",
    ...getVpohidSearchKeyboard(mode)
  });
}

function showVpohidCatalogMenu(ctx, groupService = null, mode = "routes") {
  if (mode === "trip") {
    const trip = requireManageTrip(ctx, groupService);
    if (!trip) {
      return null;
    }
  }

  setMenuContext(ctx.from?.id, mode === "trip" ? "trip-route-catalog" : "routes-catalog");

  const text = [
    "📚 Каталог маршрутів",
    "",
    "Тут можна:",
    "• шукати маршрут за назвою або фрагментом",
    "• переглянути всі маршрути каталогу"
  ].join("\n");

  return ctx.reply(text, getVpohidCatalogMenuKeyboard(mode));
}

async function startVpohidCatalogBrowse(ctx, vpohidLiveService, groupService = null, mode = "routes") {
  const userId = String(ctx.from.id);
  if (vpohidCatalogLoads.has(userId)) {
    return null;
  }

  let trip = null;
  const parentContext = getMenuContext(ctx.from?.id);

  if (mode === "trip") {
    trip = requireManageTrip(ctx, groupService);
    if (!trip) {
      return null;
    }
  }

  vpohidCatalogLoads.add(userId);
  setFlow(userId, {
    type: "vpohid_search",
    tripId: trip?.id || null,
    step: "catalog_loading",
    data: {
      mode,
      parentContext
    }
  });

  await ctx.reply("Завантажую каталог маршрутів...");

  let matches = [];
  try {
    matches = await vpohidLiveService.buildIndex();
  } catch {
    vpohidCatalogLoads.delete(userId);
    clearFlow(userId);
    return ctx.reply(
      "Не вдалося завантажити каталог маршрутів. Спробуй ще раз трохи пізніше.",
      getVpohidSearchKeyboard(mode)
    );
  }
  vpohidCatalogLoads.delete(userId);

  const orderedMatches = [...matches].sort((a, b) => a.title.localeCompare(b.title, "uk"));
  setFlow(userId, {
    type: "vpohid_search",
    tripId: trip?.id || null,
    step: "catalog_results",
    data: {
      mode,
      parentContext,
      page: 0,
      matches: orderedMatches.map((route, index) => ({
        id: route.id,
        title: route.title,
        start: route.start,
        finish: route.finish,
        duration: route.duration,
        level: route.level,
        url: route.url,
        buttonLabel: buildVpohidResultButton(route, index)
      }))
    }
  });

  return ctx.reply(
    formatVpohidCatalogResults(orderedMatches, 0),
    getVpohidCatalogKeyboard(orderedMatches, mode, 0)
  );
}

function getTripMembersKeyboard(trip, userId = "") {
  const rows = [];
  const firstRow = ["📋 Список учасників"];

  if (canManageTrip(trip, userId)) {
    firstRow.push("➕ Запросити учасників");
  }
  rows.push(firstRow);

  if (isTripOwner(trip, userId)) {
    rows.push(["🛡 Права редагування", "⬅️ До походу"]);
  } else {
    rows.push(["⬅️ До походу"]);
  }

  return buildKeyboard(rows);
}

function getTripMembersListKeyboard(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2).map((item) => item.label));
  }
  rows.push([TRIP_MEMBERS_BACK_LABEL, "⬅️ До походу"]);
  return buildKeyboard(rows);
}

function getTripMemberDetailsKeyboard(items) {
  return getTripMembersListKeyboard(items);
}

function getTripRouteKeyboard(trip, canManage = false) {
  const rows = [];

  if (!trip?.routePlan) {
    if (canManage) {
      rows.push(["🧭 Згенерувати власний маршрут", ROUTES_EXISTING_LABEL]);
    }
    rows.push(["⬅️ До походу"]);
    return buildKeyboard(rows);
  }

  const firstRow = ["🧭 Переглянути маршрут походу"];

  if (canManage) {
    firstRow.push(ROUTE_CHANGE_LABEL);
  }
  rows.push(firstRow);
  const hasExportTrack = ["verified", "router-generated"].includes(trip?.routePlan?.meta?.trackQuality);

  if (hasExportTrack) {
    rows.push(["📄 GPX трек", "📄 KML трек"]);
    rows.push(["🧭 HTML карта треку", "⬅️ До походу"]);
  } else {
    rows.push(["⬅️ До походу"]);
  }

  return buildKeyboard(rows);
}

function getTripRouteChangeKeyboard() {
  return buildKeyboard([
    ["🧭 Згенерувати власний маршрут", ROUTES_EXISTING_LABEL],
    [VPOHID_BACK_TO_TRIP_ROUTE_LABEL]
  ]);
}

function getTripGearKeyboard() {
  return buildKeyboard([
    [TRIP_GEAR_ADD_LABEL, "🆘 Мені бракує спорядження"],
    ["📦 Переглянути все", "📋 Мої запити"],
    ["✏️ Редагувати спорядження", "⬅️ До походу"],
  ]);
}

function getGearDeleteConfirmKeyboard() {
  return buildKeyboard([
    [GEAR_DELETE_CONFIRM_LABEL, "❌ Скасувати"]
  ]);
}

function getTripGearEditItemsKeyboard(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2).map((item) => item.actionLabel));
  }
  rows.push(["❌ Скасувати"]);
  return buildKeyboard(rows);
}

function getTripGearEditActionKeyboard() {
  return buildKeyboard([
    [GEAR_EDIT_ACTION_LABEL, GEAR_EDIT_DELETE_LABEL],
    [GEAR_EDIT_BACK_LABEL],
    ["❌ Скасувати"]
  ]);
}

function getTripGearScopeKeyboard(allowKeep = false) {
  const rows = [
    [GEAR_SCOPE_SHARED_LABEL, GEAR_SCOPE_PERSONAL_LABEL],
    [GEAR_SCOPE_SPARE_LABEL]
  ];

  if (allowKeep) {
    rows[1].push(GEAR_SCOPE_KEEP_LABEL);
  }

  rows.push(["❌ Скасувати"]);
  return buildKeyboard(rows);
}

function getTripGearAddTypeKeyboard() {
  return buildKeyboard([
    ["🫕 Додати спільне", "🎒 Додати особисте"],
    ["🧰 Додати запасне / позичу", TRIP_GEAR_ADD_BACK_LABEL],
    ["❌ Скасувати"]
  ]);
}

function getTripFoodKeyboard() {
  return buildKeyboard([
    ["🥘 Додати продукт", "🗑 Видалити продукт"],
    ["🧾 Переглянути все харчування"],
    ["⬅️ До походу"]
  ]);
}

function getTripExpensesKeyboard() {
  return buildKeyboard([
    ["💸 Додати витрату", "🧾 Переглянути всі витрати"],
    ["⬅️ До походу"]
  ]);
}

function formatSafetySection(trip) {
  const safety = resolveSafetyProfile(trip);
  const lines = [
    ...formatCardHeader("🆘 БЕЗПЕКА", trip.name),
    "",
    `Регіон безпеки: ${safety.title}${safety.subtitle ? ` | ${safety.subtitle}` : ""}`,
    "",
    formatSectionHeader("🚨", "Екстрено"),
    ...safety.general.map((item) => `• ${item.label}: ${item.phones.join(" / ")}`)
  ];

  if (safety.contacts.length) {
    lines.push("", formatSectionHeader("⛰", "Гірські Рятувальники"));
    lines.push(...safety.contacts.map((item) => `• ${item.label}: ${item.phones.join(" / ")}`));
  } else {
    lines.push("", formatSectionHeader("⛰", "Гірські Рятувальники"), "• Локальний підрозділ не визначено автоматично. У разі загрози життю телефонуй 101 або 112.");
  }

  lines.push(
    "",
    formatSectionHeader("⚠️", "Зверни Увагу"),
    "• надішли маршрут і час повернення близьким",
    "• тримай офлайн GPX/KML і заряджений телефон",
    "• при погіршенні погоди або травмі не затягуй зі зверненням до рятувальників"
  );

  return joinRichLines(lines);
}

function setFlow(userId, flow) {
  flows.set(userId, flow);
}

function getFlow(userId) {
  return flows.get(userId) || null;
}

function clearFlow(userId) {
  flows.delete(userId);
}

function calculateNights(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diff = Math.round((end - start) / (24 * 60 * 60 * 1000));

  return Math.max(diff, 0);
}

function formatDateShort(value) {
  if (!value) {
    return "не задано";
  }

  return value;
}

function requireTrip(ctx, groupService, keyboard = getTripKeyboard(null)) {
  const trip = groupService.findGroupByMember(String(ctx.from.id));

  if (!trip) {
    ctx.reply("Спочатку створи похід або приєднайся до активного походу.", keyboard);
    return null;
  }

  return trip;
}

function requireManageTrip(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (!canManageTrip(trip, String(ctx.from.id))) {
    ctx.reply("Редагувати похід можуть лише організатор і учасники з правами редагування.", getTripKeyboard(trip, String(ctx.from.id)));
    return null;
  }

  return trip;
}

function requireOwnerTrip(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (!isTripOwner(trip, String(ctx.from.id))) {
    ctx.reply("Керувати правами доступу може лише організатор походу.", getTripKeyboard(trip, String(ctx.from.id)));
    return null;
  }

  return trip;
}

function formatRouteStatus(routePlan) {
  if (!routePlan) {
    return "не задано";
  }

  if (routePlan.source === "vpohid" && routePlan.sourceTitle) {
    const suffix = routePlan.status === "draft" ? " (чернетка)" : "";
    return `${routePlan.sourceTitle}${suffix}`;
  }

  const routePoints = Array.isArray(routePlan.points) && routePlan.points.length
    ? routePlan.points
    : [routePlan.meta?.vpohidDetail?.start || routePlan.from, routePlan.meta?.vpohidDetail?.finish || routePlan.to].filter(Boolean);
  const suffix = routePlan.status === "draft" ? " (чернетка)" : "";
  return `${routePoints.join(" → ")}${suffix}`;
}

function formatTripDatesRange(tripCard) {
  if (!tripCard?.startDate && !tripCard?.endDate) {
    return "ще не задано";
  }

  return [tripCard?.startDate || "?", tripCard?.endDate || "?"].join(" → ");
}

function buildMemberJoinedNotification(trip, memberName) {
  return joinRichLines([
    ...formatCardHeader("👥", "НОВИЙ УЧАСНИК У ПОХОДІ"),
    "",
    `До походу <b>${escapeHtml(trip.name)}</b> приєднався <b>${escapeHtml(memberName)}</b>.`,
    `Учасників у поході: <b>${trip.members?.length || 0}</b>.`
  ]);
}

function buildTripDatesChangedNotification(trip, actorName, previousTripCard) {
  return joinRichLines([
    ...formatCardHeader("📅", "ЗМІНЕНО ДАТИ ПОХОДУ"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> оновлено дати.`,
    `Було: <b>${escapeHtml(formatTripDatesRange(previousTripCard))}</b>`,
    `Стало: <b>${escapeHtml(formatTripDatesRange(trip.tripCard))}</b>`,
    `Змінив: <b>${escapeHtml(actorName)}</b>`
  ]);
}

function buildTripRouteChangedNotification(trip, actorName, previousRoutePlan = null) {
  const hadRouteBefore = Boolean(previousRoutePlan);
  return joinRichLines([
    ...formatCardHeader("🗺", hadRouteBefore ? "ОНОВЛЕНО МАРШРУТ ПОХОДУ" : "ДОДАНО МАРШРУТ ПОХОДУ"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> ${hadRouteBefore ? "змінено" : "додано"} маршрут.`,
    hadRouteBefore ? `Було: <b>${escapeHtml(formatRouteStatus(previousRoutePlan))}</b>` : null,
    `Стало: <b>${escapeHtml(formatRouteStatus(trip.routePlan))}</b>`,
    `Змінив: <b>${escapeHtml(actorName)}</b>`
  ].filter(Boolean));
}

function hasTripRouteChanged(previousRoutePlan, nextRoutePlan) {
  if (!previousRoutePlan && nextRoutePlan) {
    return true;
  }

  if (previousRoutePlan && !nextRoutePlan) {
    return true;
  }

  if (!previousRoutePlan && !nextRoutePlan) {
    return false;
  }

  const previousSignature = JSON.stringify({
    from: previousRoutePlan?.from || "",
    to: previousRoutePlan?.to || "",
    points: Array.isArray(previousRoutePlan?.points) ? previousRoutePlan.points : [],
    source: previousRoutePlan?.source || "",
    sourceRouteId: previousRoutePlan?.sourceRouteId || "",
    sourceTitle: previousRoutePlan?.sourceTitle || "",
    status: previousRoutePlan?.status || ""
  });
  const nextSignature = JSON.stringify({
    from: nextRoutePlan?.from || "",
    to: nextRoutePlan?.to || "",
    points: Array.isArray(nextRoutePlan?.points) ? nextRoutePlan.points : [],
    source: nextRoutePlan?.source || "",
    sourceRouteId: nextRoutePlan?.sourceRouteId || "",
    sourceTitle: nextRoutePlan?.sourceTitle || "",
    status: nextRoutePlan?.status || ""
  });

  return previousSignature !== nextSignature;
}

async function notifyTripMembers(telegram, trip, text, { excludeMemberId = "" } = {}) {
  if (!telegram || !trip?.members?.length || !text) {
    return;
  }

  for (const member of trip.members) {
    if (!member?.id || (excludeMemberId && member.id === excludeMemberId)) {
      continue;
    }

    try {
      await telegram.sendMessage(member.id, text, {
        parse_mode: "HTML",
        ...getTripKeyboard(trip, member.id)
      });
    } catch {
      // Ignore users who blocked the bot or haven't started it yet.
    }
  }
}

function getRouteEndpoints(routePlan) {
  if (!routePlan) {
    return { from: "", to: "" };
  }

  const points = Array.isArray(routePlan.points) ? routePlan.points.filter(Boolean) : [];
  const fallbackFrom = routePlan.meta?.vpohidDetail?.start || routePlan.from || points[0] || "";
  const fallbackTo = routePlan.meta?.vpohidDetail?.finish || routePlan.to || points[points.length - 1] || "";
  const from = fallbackFrom === "Старт" && points[0] ? points[0] : fallbackFrom;
  const to = fallbackTo === "Фініш" && points.length ? points[points.length - 1] : fallbackTo;

  return { from, to };
}

function parseRoutePointsInput(input) {
  return String(input || "")
    .split("->")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseStopsInput(input) {
  return String(input || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getRouteFlowBackLabel(mode = "search") {
  if (mode === "search") {
    return ROUTES_BACK_LABEL;
  }

  if (mode === "edit" || mode === "create") {
    return VPOHID_BACK_TO_TRIP_ROUTE_LABEL;
  }

  return ROUTES_BACK_LABEL;
}

function getRouteFlowKeyboard(mode = "search") {
  return buildKeyboard([["❌ Скасувати", getRouteFlowBackLabel(mode)]]);
}

function getRouteStopsKeyboard(suggestions = [], selectedStops = [], mode = "search") {
  const available = suggestions.filter((item) => !selectedStops.includes(item));
  const rows = [];

  for (let index = 0; index < available.length; index += 2) {
    rows.push(available.slice(index, index + 2));
  }

  if (selectedStops.length) {
    rows.push([FLOW_STOPS_DONE_LABEL, FLOW_STOPS_CLEAR_LABEL]);
  } else {
    rows.push(["⏭ Без зупинок"]);
  }

  rows.push(["❌ Скасувати", getRouteFlowBackLabel(mode)]);
  return buildKeyboard(rows);
}

function formatTripCard(trip, gearSnapshot) {
  const tripCard = trip.tripCard;

  if (!tripCard) {
    return "Дані походу ще не заповнені.";
  }

  const readiness = tripCard.gearReadinessStatus || gearSnapshot.readiness;
  const missingCount = gearSnapshot.gearNeeds.length;
  const totalGear = gearSnapshot.sharedGear.length + gearSnapshot.personalGear.length;
  return joinRichLines([
      ...formatCardHeader("🗂 ДАНІ ПОХОДУ", trip.name),
    "",
    `Дати: ${tripCard.startDate} -> ${tripCard.endDate}`,
    `Ночівлі: ${tripCard.nights}`,
    `Статус готовності спорядження: ${readiness}`,
    `Додано спорядження: ${totalGear}`,
    `Активних запитів: ${missingCount}`
  ]);
}

function buildReminderPlan(trip) {
  const tripCard = trip?.tripCard;
  if (!tripCard?.startDate) {
    return [];
  }

  return [
    {
      key: "d3",
      title: "За 3 дні до старту",
      date: tripCard.startDate,
      text: "Перевір погоду, спорядження і закрий відкриті запити по речах."
    },
    {
      key: "d1",
      title: "За 1 день до старту",
      date: tripCard.startDate,
      text: "Завантаж GPX/KML, перевір офлайн-карту і логістику до старту."
    },
    {
      key: "d0",
      title: "У день старту",
      date: tripCard.startDate,
      text: "Перевір контакти рятувальників, маршрут, воду і фінальний статус готовності."
    }
  ];
}

function formatReminderPlan(trip) {
  const plan = buildReminderPlan(trip);
  if (!plan.length) {
    return "Для автоповідомлень спочатку заповни дати походу.";
  }

  const reminderState = trip.reminderState || {};
  const lines = [...formatCardHeader("🔔 НАГАДУВАННЯ", trip.name), ""];

  for (const item of plan) {
    const sentAt = reminderState[item.key];
    lines.push(`${item.title}`);
    lines.push(`• Дата походу: ${formatDateShort(item.date)}`);
    lines.push(`• Що нагадає бот: ${item.text}`);
    lines.push(`• Статус: ${sentAt ? `вже надіслано (${String(sentAt).slice(0, 16).replace("T", " ")})` : "очікує"}`);
    lines.push("");
  }

  lines.push("⚠️ Нагадування бот надсилає учасникам автоматично.");
  return joinRichLines(lines);
}

function formatTripPassport(trip, groupService, userService, userId = "") {
  const gearSnapshot = groupService.getGearSnapshot(trip.id);
  const foodSnapshot = groupService.getFoodSnapshot(trip.id);
  const expenseSnapshot = groupService.getExpenseSnapshot(trip.id);
  const safety = resolveSafetyProfile(trip);
  const routeStatus = getRouteStatusLabel(trip.routePlan?.meta);
  const reminderPlan = buildReminderPlan(trip);
  const reminderState = trip.reminderState || {};
  const reminderLines = reminderPlan.length
    ? reminderPlan.map((item) => `• ${item.title}: ${reminderState[item.key] ? "надіслано" : "очікує"}`)
    : ["• дати походу ще не заповнені"];
  const members = trip.members.map((member) => {
    const name = getMemberDisplayName(userService, member);
    return `• ${name} — ${member.role === "owner" ? "організатор" : member.canManage ? "редактор" : "учасник"}`;
  });
  const totalTripExpenses = (expenseSnapshot.totalCost || 0) + (foodSnapshot.totalCost || 0);
  const endpoints = getRouteEndpoints(trip.routePlan);
  const routeLine = trip.routePlan
    ? (trip.routePlan.source === "vpohid" && trip.routePlan.sourceTitle
      ? trip.routePlan.sourceTitle
      : `${endpoints.from || "Старт"} -> ${endpoints.to || "Фініш"}`)
    : "не задано";

  return joinRichLines([
    ...formatCardHeader("🪪 ПАСПОРТ ПОХОДУ", trip.name),
    "",
    `Код походу: ${trip.inviteCode}`,
    `Твоя роль: ${isTripOwner(trip, userId) ? "організатор" : canManageTrip(trip, userId) ? "редактор" : "учасник"}`,
    `Статус походу: ${getTripLifecycleLabel(trip.status)}`,
    `Маршрут: ${routeLine}`,
    trip.routePlan?.stops?.length ? `Проміжні точки: ${trip.routePlan.stops.join(" • ")}` : null,
    `Статус маршруту: ${routeStatus}`,
    `Регіон: ${trip.region || "не задано"}`,
    trip.tripCard
      ? `Дати: ${trip.tripCard.startDate} -> ${trip.tripCard.endDate} | Ночівлі: ${trip.tripCard.nights}`
      : "Дати: не задано",
    trip.tripCard
      ? `Готовність спорядження: ${trip.tripCard.gearReadinessStatus}`
      : `Готовність спорядження: ${gearSnapshot.readiness}`,
    "",
    formatSectionHeader("👥", "Учасники"),
    ...members,
    "",
    formatSectionHeader("📦", "Поточний Стан"),
    `Учасники всього: ${trip.members.length}`,
    `Спорядження: ${gearSnapshot.sharedGear.length + gearSnapshot.personalGear.length + gearSnapshot.spareGear.length} позицій`,
    `Запити на спорядження: ${gearSnapshot.gearNeeds.length}`,
    `Харчування: ${foodSnapshot.items.length} позицій | ${formatMoney(foodSnapshot.totalCost)}`,
    `Витрати: ${formatMoney(totalTripExpenses)}`,
    "",
    formatSectionHeader("🔔", "Нагадування"),
    ...reminderLines,
    "",
    formatSectionHeader("🆘", "Безпека"),
    `• Регіон рятувальників: ${safety.title}`,
    `• Екстрені номери: ${safety.general.flatMap((item) => item.phones).join(" / ")}`
  ]);
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(0)} грн`;
}

function getTripLifecycleLabel(status) {
  if (status === "archived") {
    return "архівний";
  }
  if (status === "completed") {
    return "завершений";
  }
  return "активний";
}

function getTripHistoryButtonLabel(trip, index) {
  const title = String(trip?.name || trip?.finalSummary?.routeName || formatRouteStatus(trip?.routePlan) || "Похід").trim();
  return `${index + 1}. ${truncateButtonLabel(title, 30)}`;
}

function getTripHistoryKeyboard(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2).map((item) => item.label));
  }
  rows.push(["⬅️ Головне меню"]);
  return buildKeyboard(rows);
}

function getTripHistoryDetailsKeyboard(items) {
  return buildKeyboard([[TRIP_HISTORY_BACK_LABEL, "⬅️ Головне меню"]]);
}

function formatTripCompletionSummary(trip, userService = null) {
  const finalSummary = trip.finalSummary || {};
  const completedAt = trip.completedAt ? String(trip.completedAt).slice(0, 16).replace("T", " ") : "щойно";
  const period = trip.tripCard
    ? `${trip.tripCard.startDate} -> ${trip.tripCard.endDate} | Ночівлі: ${trip.tripCard.nights}`
    : "не задано";
  const routeName = finalSummary.routeName || formatRouteStatus(trip.routePlan) || "маршрут не задано";
  const members = Array.isArray(finalSummary.members) && finalSummary.members.length
    ? finalSummary.members.map((member) => userService ? getMemberDisplayName(userService, member) : member.name).join(" • ")
    : trip.members.map((member) => userService ? getMemberDisplayName(userService, member) : member.name).join(" • ");

  return joinRichLines([
    `✅ Похід "${trip.name}" завершено.`,
    `Статус: ${getTripLifecycleLabel(trip.status)}`,
    `Завершено: ${completedAt}`,
    "",
    `Маршрут: ${routeName}`,
    `Дати: ${period}`,
    `Учасники: ${members || "не вказано"}`,
    `Готовність спорядження: ${finalSummary.gearReadinessStatus || "не вказано"}`,
    `Спорядження: ${finalSummary.gearCount || 0} позицій | Запити: ${finalSummary.gearNeedsCount || 0}`,
    `Харчування: ${finalSummary.foodCount || 0} позицій | ${formatMoney(finalSummary.foodTotal || 0)}`,
    `Інші витрати: ${formatMoney(finalSummary.expensesTotal || 0)}`,
    `Разом витрат: ${formatMoney(finalSummary.totalCost || 0)}`,
    "",
    "Похід більше не активний. Через 30 днів завершені походи автоматично переходять в архів."
  ]);
}

function formatTripHistoryDetails(trip, userService = null) {
  const finalSummary = trip.finalSummary || {};
  const status = getTripLifecycleLabel(trip.status);
  const completedAt = trip.completedAt ? String(trip.completedAt).slice(0, 16).replace("T", " ") : "не вказано";
  const archivedAt = trip.archivedAt ? String(trip.archivedAt).slice(0, 16).replace("T", " ") : "";
  const period = trip.tripCard
    ? `${trip.tripCard.startDate} -> ${trip.tripCard.endDate} | Ночівлі: ${trip.tripCard.nights}`
    : "не задано";
  const routeName = finalSummary.routeName || formatRouteStatus(trip.routePlan) || "маршрут не задано";
  const members = Array.isArray(finalSummary.members) && finalSummary.members.length
    ? finalSummary.members.map((member) => userService ? getMemberDisplayName(userService, member) : member.name).join(" • ")
    : trip.members.map((member) => userService ? getMemberDisplayName(userService, member) : member.name).join(" • ");

  const lines = [
    ...formatCardHeader("🕓 ІСТОРІЯ ПОХОДУ", trip.name || routeName),
    "",
    `Статус: ${status}`,
    `Завершено: ${completedAt}`
  ];

  if (archivedAt) {
    lines.push(`Архівовано: ${archivedAt}`);
  }

  lines.push(
    "",
    formatSectionHeader("📋", "Підсумок"),
    `Маршрут: ${routeName}`,
    `Дати: ${period}`,
    `Учасники: ${members || "не вказано"}`,
    `Готовність спорядження: ${finalSummary.gearReadinessStatus || "не вказано"}`,
    `Спорядження: ${finalSummary.gearCount || 0} позицій | Запити: ${finalSummary.gearNeedsCount || 0}`,
    `Харчування: ${finalSummary.foodCount || 0} позицій | ${formatMoney(finalSummary.foodTotal || 0)}`,
    `Інші витрати: ${formatMoney(finalSummary.expensesTotal || 0)}`,
    `Разом витрат: ${formatMoney(finalSummary.totalCost || 0)}`
  );

  return joinRichLines(lines);
}

function getVpohidLevelDifficulty(level, fallback = "середня") {
  const normalized = String(level || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized.includes("початків")) {
    return "низька";
  }

  if (normalized.includes("любитель")) {
    return "середня";
  }

  if (
    normalized.includes("досвід") ||
    normalized.includes("склад") ||
    normalized.includes("експерт") ||
    normalized.includes("спорт")
  ) {
    return "висока";
  }

  return fallback;
}

function getTripContextDifficulty(routeMeta, tripCard) {
  if (!routeMeta) {
    return null;
  }

  const hasVpohidLevel = Boolean(routeMeta.vpohidDetail?.level);
  const tripDays = Math.max(1, (Number(tripCard?.nights) || 0) + 1);
  const distancePerDay = (routeMeta.distance || 0) / tripDays;
  const timePerDay = (routeMeta.estimatedHikingTime || routeMeta.duration || 0) / tripDays;
  const ascentPerDay = hasVpohidLevel ? 0 : (routeMeta.ascentGain || 0) / tripDays;

  let difficulty = "низька";
  if (distancePerDay >= 16000 || timePerDay >= 6.5 * 3600 || ascentPerDay >= 900) {
    difficulty = "висока";
  } else if (distancePerDay >= 9000 || timePerDay >= 4 * 3600 || ascentPerDay >= 450) {
    difficulty = "середня";
  }

  if (hasVpohidLevel) {
    difficulty = getVpohidLevelDifficulty(routeMeta.vpohidDetail.level, difficulty);
  }

  const emoji = difficulty === "висока" ? "🔴" : difficulty === "середня" ? "🟡" : "🟢";
  const notes = [];

  if (difficulty === "висока") {
    notes.push("Навантаження на день відчутне, тож маршрут варто проходити в хорошому темпі без затяжних пауз.");
  } else if (difficulty === "середня") {
    notes.push("Навантаження на день помірне і виглядає реалістично для спокійного проходження з ночівлями.");
  } else {
    notes.push("Навантаження на день невелике, тому маршрут виглядає легким або помірно легким.");
  }

  if (distancePerDay >= 12000) {
    notes.push("Основне навантаження тут дає саме денний кілометраж.");
  } else if (distancePerDay <= 8000) {
    notes.push("Денні переходи короткі, тому є запас часу на табір, відпочинок і запасний сценарій.");
  }

  if (!hasVpohidLevel && ascentPerDay >= 700) {
    notes.push("Підйом на день уже відчутний, тому сили краще розподіляти рівно від старту.");
  } else if (!hasVpohidLevel && ascentPerDay <= 350) {
    notes.push("Набір висоти на день невеликий, без різкого перевантаження на підйомах.");
  }

  if ((routeMeta.stops || []).length) {
    notes.push(`Маршрут проходить через проміжні точки: ${(routeMeta.stops || []).join(" • ")}.`);
  }

  if (tripDays >= 3) {
    notes.push(`Розклад у ${tripDays} дні дає можливість проходити маршрут без поспіху.`);
  } else if (tripDays === 1) {
    notes.push("Для одноденного проходження потрібно оцінювати сили суворіше.");
  }

  const brief = notes.join(" ");

  return {
    difficulty,
    emoji,
    brief,
    tripDays,
    distancePerDay,
    timePerDay,
    ascentPerDay
  };
}

function formatDurationShort(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (!hours) {
    return `${minutes} хв`;
  }

  if (!minutes) {
    return `${hours} год`;
  }

  return `${hours} год ${minutes} хв`;
}

function getRouteStatusLabel(routeMeta) {
  if (!routeMeta) {
    return "не визначено";
  }

  if (routeMeta.trackQuality === "draft" || routeMeta.confidence === "низька") {
    return "ненадійний";
  }

  return "надійний";
}

function buildVpohidExtraLines(routeMeta) {
  const vpohidDetail = routeMeta?.vpohidDetail;
  if (!vpohidDetail) {
    return {
      overview: [],
      generalInfo: [],
      routeHighlights: []
    };
  }

  const overview = [];
  const generalInfo = [];
  const routeHighlights = [];

  if (vpohidDetail.subtitle) {
    overview.push(vpohidDetail.subtitle);
  }

  if (vpohidDetail.start || vpohidDetail.finish) {
    overview.push(`Старт / фініш: ${vpohidDetail.start || "—"}${vpohidDetail.finish ? ` -> ${vpohidDetail.finish}` : ""}`);
  }

  if (Array.isArray(vpohidDetail.points) && vpohidDetail.points.length) {
    const routePoints = vpohidDetail.points.slice(0, 5);
    overview.push(`Точки маршруту: ${routePoints.join(" -> ")}`);
  }

  if (vpohidDetail.duration) {
    generalInfo.push(`🗓 Тривалість походу: ${vpohidDetail.duration}`);
  }

  if (Array.isArray(vpohidDetail.peaks) && vpohidDetail.peaks.length) {
    routeHighlights.push(`⛰ Вершини на маршруті: ${vpohidDetail.peaks.join(" • ")}`);
  }

  if (Array.isArray(vpohidDetail.interesting) && vpohidDetail.interesting.length) {
    routeHighlights.push(`✨ Цікаве на маршруті: ${vpohidDetail.interesting.join(" • ")}`);
  }

  if (Array.isArray(vpohidDetail.weatherSettlements) && vpohidDetail.weatherSettlements.length) {
    routeHighlights.push(`🌦 Погода в районі маршруту: ${vpohidDetail.weatherSettlements.join(" • ")}`);
  }

  return {
    overview,
    generalInfo,
    routeHighlights
  };
}

function formatTripRouteSummary(routePlan, tripCard) {
  if (!routePlan?.summary) {
    return "";
  }

  const lines = routePlan.summary.split("\n");
  const cleanedLines = [];
  let skipTechBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      trimmed === "Трек і карта:" ||
      trimmed === "Індикатори маршруту:" ||
      trimmed === "Орієнтири:"
    ) {
      skipTechBlock = true;
      continue;
    }

    if (skipTechBlock) {
      if (
        !trimmed ||
        trimmed === "Маршрутний бриф:" ||
        trimmed === "Перші ключові маневри:" ||
        trimmed === "Технічні деталі:"
      ) {
        skipTechBlock = false;
      } else {
        continue;
      }
    }

    if (
      trimmed.startsWith("• GPX і KML") ||
      trimmed.startsWith("• Для перегляду точного треку") ||
      trimmed.startsWith("• Перегляд:") ||
      trimmed.startsWith("• Трек:") ||
      trimmed.startsWith("• Побудова:") ||
      trimmed.startsWith("• Статус маршруту:") ||
      trimmed.startsWith("📌 Статус маршруту:") ||
      trimmed.startsWith("Що варто врахувати: маршрут побудовано hiking-профілем.") ||
      trimmed.startsWith("Довіра до маршруту:") ||
      trimmed.startsWith("Контрольні точки:") ||
      trimmed.startsWith("🗓 Навантаження на день:") ||
      trimmed === "• проміжна ділянка без чіткої назви"
    ) {
      continue;
    }

    cleanedLines.push(line);
  }

  const nextLines = [];
  let skipNextBriefLine = false;
  const tripContext = tripCard && routePlan.meta
    ? getTripContextDifficulty(routePlan.meta, tripCard)
    : null;
  const hasVpohidLevel = Boolean(routePlan.meta?.vpohidDetail?.level);

  for (const line of cleanedLines) {
    if (skipNextBriefLine) {
      skipNextBriefLine = false;
      continue;
    }

    if (
      line.trim() === "Дані маршруту з сайту:" ||
      line.trim().startsWith("• Протяжність на сайті:") ||
      line.trim().startsWith("• Тривалість на сайті:") ||
      line.trim().startsWith("• Рівень походу:") ||
      line.trim().startsWith("• Вершини на маршруті:") ||
      line.trim().startsWith("• Цікаве на маршруті:") ||
      line.trim().startsWith("• Погода по населених пунктах:")
    ) {
      continue;
    }

    if (
      line.trim().startsWith("Тривалість зі сторінки маршруту:") ||
      line.trim().startsWith("Тривалість оцінена за довжиною треку") ||
      line.trim().startsWith("Рівень на сайті:")
    ) {
      continue;
    }

    if (line.includes("📈") && routePlan.meta?.vpohidDetail) {
      if (Number.isFinite(routePlan.meta?.ascentGain) && routePlan.meta.ascentGain > 0) {
        nextLines.push(`📈 Орієнтовний набір висоти: +${Math.round(routePlan.meta.ascentGain)} м`);
      } else {
        nextLines.push("📈 Набір висоти: даних поки недостатньо");
      }
      continue;
    }

    if (line.includes("📏 Відстань:") && routePlan.meta?.vpohidDetail?.distance) {
      nextLines.push(`📏 Відстань: ${routePlan.meta.vpohidDetail.distance}`);
      continue;
    }

    if (line.includes("Складність:")) {
      if (tripContext) {
        nextLines.push(`${tripContext.emoji} Складність: ${tripContext.difficulty}`);
      } else {
        nextLines.push(line);
      }

      if (routePlan.meta) {
        nextLines.push(`📌 Статус маршруту: ${getRouteStatusLabel(routePlan.meta)}`);
      }

      if (tripContext) {
        nextLines.push(
          hasVpohidLevel
            ? `🗓 Навантаження на день: ${Math.round(tripContext.distancePerDay / 1000)} км | ${formatDurationShort(tripContext.timePerDay)}`
            : `🗓 Навантаження на день: ${Math.round(tripContext.distancePerDay / 1000)} км | ${formatDurationShort(tripContext.timePerDay)} | +${Math.round(tripContext.ascentPerDay)} м`
        );
      }

      const vpohidExtra = buildVpohidExtraLines(routePlan.meta);
      if (vpohidExtra.generalInfo.length) {
        nextLines.push(...vpohidExtra.generalInfo);
      }
      continue;
    }

    if (line.trim() === "Маршрутний бриф:" || line.trim() === "Оцінка маршруту:") {
      nextLines.push("Оцінка маршруту:");
      if (tripContext) {
        nextLines.push(tripContext.brief);
        skipNextBriefLine = true;
      }
      continue;
    }

    nextLines.push(line);
  }

  const vpohidExtraLines = buildVpohidExtraLines(routePlan.meta);
  if (vpohidExtraLines.overview.length) {
    const headerIndex = nextLines.findIndex((line) => String(line).trim() === "Загальна інформація:");
    if (headerIndex >= 0) {
      nextLines.splice(headerIndex, 0, ...vpohidExtraLines.overview, "");
    } else {
      nextLines.push(...vpohidExtraLines.overview, "");
    }
  }

  if (vpohidExtraLines.routeHighlights.length) {
    const routeSectionIndex = nextLines.findIndex((line) => String(line).trim() === "На маршруті:");
    if (routeSectionIndex >= 0) {
      nextLines.splice(routeSectionIndex, 0, ...vpohidExtraLines.routeHighlights, "");
    } else {
      nextLines.push(...vpohidExtraLines.routeHighlights);
    }
  }

  return nextLines.join("\n");
}

function formatRouteCardText(summary) {
  const lines = String(summary || "")
    .split("\n")
    .map((line) => line.trimEnd());

  const formatted = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (formatted[formatted.length - 1] !== "") {
        formatted.push("");
      }
      continue;
    }

    if (trimmed.startsWith("🗺 Маршрут:") || trimmed.startsWith("Маршрут:")) {
      formatted.push("🗺 Маршрут");
      formatted.push(trimmed.replace(/^🗺\s*Маршрут:\s*/, "").replace(/^Маршрут:\s*/, ""));
      formatted.push("");
      continue;
    }

    if (trimmed === "Загальна інформація:") {
      formatted.push("📋 Загальна інформація");
      continue;
    }

    if (trimmed === "Оцінка маршруту:" || trimmed === "Маршрутний бриф:") {
      formatted.push("");
      formatted.push("🧭 Оцінка маршруту");
      continue;
    }

    if (trimmed === "На маршруті:") {
      formatted.push("");
      formatted.push("📍 На маршруті");
      continue;
    }

    if (trimmed === "Безпека:") {
      formatted.push("");
      formatted.push("🆘 Безпека");
      continue;
    }

    if (trimmed === "Перші ключові маневри:") {
      formatted.push("");
      formatted.push("👣 Перші ключові маневри");
      continue;
    }

    if (trimmed === "Технічні деталі:") {
      formatted.push("");
      formatted.push("ℹ️ Додатково");
      continue;
    }

    if (trimmed.startsWith("Координати:")) {
      formatted.push("");
      formatted.push("📌 Координати");
      formatted.push(trimmed.replace(/^Координати:\s*/, ""));
      continue;
    }

    formatted.push(line);
  }

  while (formatted[formatted.length - 1] === "") {
    formatted.pop();
  }

  return joinRichLines(formatted);
}

function formatUnifiedRouteMessage(routePlanOrSummary, tripCard = null) {
  const summary = typeof routePlanOrSummary === "string"
    ? routePlanOrSummary
    : formatTripRouteSummary(routePlanOrSummary, tripCard);

  return formatRouteCardText(summary);
}

function calculateSettlements(members, paidByMember, totalCost) {
  if (!members.length) {
    return { perPerson: 0, balances: [], transfers: [] };
  }

  const perPerson = totalCost / members.length;
  const balances = members.map((member) => {
    const paid = paidByMember.get(member.name) || 0;
    return {
      memberName: member.name,
      paid,
      balance: paid - perPerson
    };
  });

  const creditors = balances
    .filter((item) => item.balance > 0.5)
    .map((item) => ({ ...item, remaining: item.balance }))
    .sort((a, b) => b.remaining - a.remaining);
  const debtors = balances
    .filter((item) => item.balance < -0.5)
    .map((item) => ({ ...item, remaining: Math.abs(item.balance) }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.remaining, debtor.remaining);

    if (amount > 0.5) {
      transfers.push({
        from: debtor.memberName,
        to: creditor.memberName,
        amount
      });
    }

    creditor.remaining -= amount;
    debtor.remaining -= amount;

    if (creditor.remaining <= 0.5) {
      creditorIndex += 1;
    }

    if (debtor.remaining <= 0.5) {
      debtorIndex += 1;
    }
  }

  return { perPerson, balances, transfers };
}

function sendHome(ctx) {
  setMenuContext(ctx.from?.id, "home");
  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🏔 ГОЛОВНЕ МЕНЮ", "Мандрівник +"),
      "",
      formatSectionHeader("🧭", "Що Тут Є"),
      "• загальний простір: погода, маршрути, FAQ і твій профіль",
      "• простір походу: маршрут, учасники, спорядження, витрати, безпека",
      "",
      formatSectionHeader("⚡", "Важливо"),
      "• якщо тебе запросили в похід, натисни `🔑 Приєднатися до походу`",
      "• або використай `/start join_КОД`",
      "• навігація працює через нижнє меню"
    ]),
    {
      parse_mode: "HTML",
      ...getMainKeyboard(ctx)
    }
  );
}

function sendHelp(ctx) {
  setFlow(String(ctx.from.id), {
    type: "help_menu",
    step: "menu",
    data: {}
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("ℹ️ ДОПОМОГА", "Навігація по боту"),
      "",
      "Тут краще шукати не команди, а готові пояснення по роботі з ботом.",
      "",
      "⚠️ Зверни увагу:",
      "• обери розділ нижче",
      "• кожен пункт пояснює окремий сценарій без зайвих технічних деталей"
    ]),
    {
      parse_mode: "HTML",
      ...getHelpMenuKeyboard()
    }
  );
}

function showTripHistory(ctx, groupService, userService) {
  setMenuContext(ctx.from?.id, "trip-history");
  const history = groupService.getGroupHistoryByMember(String(ctx.from.id));

  if (!history.length) {
    return ctx.reply("Історія походів порожня.", getMainKeyboard(ctx));
  }

  const items = history.map((trip, index) => ({
    id: trip.id,
    label: getTripHistoryButtonLabel(trip, index),
    trip
  }));

  setFlow(String(ctx.from.id), {
    type: "trip_history",
    step: "list",
    data: {
      items
    }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🕓 ІСТОРІЯ ПОХОДІВ", "Завершені та архівні"),
      "",
      "Обери похід кнопкою нижче, щоб відкрити його підсумок.",
      "",
      "⚠️ Зверни увагу:",
      "• тут показані завершені й архівні походи",
      "• у картці походу будуть маршрут, учасники і фінальний підсумок"
    ]),
    { parse_mode: "HTML", ...getTripHistoryKeyboard(items) }
  );
}

async function handleTripHistoryFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (message === TRIP_HISTORY_BACK_LABEL) {
    return showTripHistory(ctx, groupService, userService);
  }

  if (message === "⬅️ Головне меню") {
    clearFlow(String(ctx.from.id));
    return ctx.reply(WELCOME_TEXT, { parse_mode: "Markdown", ...getMainKeyboard(ctx) });
  }

  const items = flow.data?.items || [];
  const selected = items.find((item) => item.label === message);
  if (!selected) {
    return ctx.reply("Обери похід кнопкою нижче.", getTripHistoryKeyboard(items));
  }

  flow.step = "detail";
  flow.data = {
    ...flow.data,
    selectedId: selected.id
  };
  setFlow(String(ctx.from.id), flow);

  return ctx.reply(
    formatTripHistoryDetails(selected.trip, userService),
    { parse_mode: "HTML", ...getTripHistoryDetailsKeyboard(items) }
  );
}

function showTripMenu(ctx, groupService) {
  setMenuContext(ctx.from?.id, "trip");
  const trip = groupService.findGroupByMember(String(ctx.from.id));

  if (!trip) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("👥 ПОХІД", "Активного походу немає"),
        "",
        "Натисни `➕ Створити похід`, щоб задати назву, дату початку, дату завершення і статус готовності спорядження."
      ]),
      {
        parse_mode: "HTML",
        ...getTripKeyboard(null, String(ctx.from.id))
      }
    );
  }

  const snapshot = groupService.getGearSnapshot(trip.id);
  const role = isTripOwner(trip, String(ctx.from.id)) ? "організатор" : canManageTrip(trip, String(ctx.from.id)) ? "редактор" : "учасник";
  const route = formatRouteStatus(trip.routePlan);
  const period = trip.tripCard
    ? `${trip.tripCard.startDate} -> ${trip.tripCard.endDate} | Ночівлі: ${trip.tripCard.nights}`
    : "ще не заповнено";
  const readiness = trip.tripCard
    ? trip.tripCard.gearReadinessStatus
    : snapshot.readiness;
  const hintLines = [
    "Що де шукати:",
    "• Паспорт походу — головна зведена картка",
    "• Маршрут походу — трек, GPX/KML і перегляд карти",
    "• Учасники походу — список, запрошення і права доступу",
    "• Спорядження / Харчування / Витрати — робочі списки походу"
  ];

  if (canManageTrip(trip, String(ctx.from.id))) {
    hintLines.push("• Редагувати дані походу — назва, дати, готовність");
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("👥 ПОХІД", trip.name),
      "",
      `Твоя роль: ${role}`,
      `Статус походу: ${getTripLifecycleLabel(trip.status)}`,
      `Маршрут: ${route}`,
      `Регіон погоди: ${trip.region || "ще не задано"}`,
      `Дати походу: ${period}`,
      `Готовність спорядження: ${readiness}`,
      "",
      ...hintLines
    ]),
    { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from.id)) }
  );
}

function showTripSafety(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  return ctx.reply(formatSafetySection(trip), { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from.id)) });
}

function showTripReminders(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  return ctx.reply(formatReminderPlan(trip), { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from.id)) });
}

function showTripPassport(ctx, groupService, userService) {
  setMenuContext(ctx.from?.id, "trip");
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  return ctx.reply(formatTripPassport(trip, groupService, userService, String(ctx.from.id)), { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from.id)) });
}

function showTripMembersMenu(ctx, groupService, userService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const body = [];
  const canSeeFull = canManageTrip(trip, String(ctx.from.id));

  if (canSeeFull) {
    body.push("• у цьому розділі доступне запрошення нових учасників");
    body.push("• тобі також доступна повна анкета кожного учасника");
  } else {
    body.push("• тут видно ПІБ і телефон усіх учасників");
    body.push("• повна анкета доступна організатору або редактору походу");
  }

  if (isTripOwner(trip, String(ctx.from.id))) {
    body.push("• організатор також може керувати правами редагування");
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("👤 УЧАСНИКИ", trip.name),
      "",
      ...body
    ]),
    { parse_mode: "HTML", ...getTripMembersKeyboard(trip, String(ctx.from.id)) }
  );
}

function showTripMembers(ctx, groupService, userService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const items = [];
  const labelCounts = new Map();

  for (const member of trip.members) {
    const baseLabel = getMemberDisplayName(userService, member);
    const count = (labelCounts.get(baseLabel) || 0) + 1;
    labelCounts.set(baseLabel, count);
    items.push({
      id: member.id,
      label: count > 1 ? `${baseLabel} (${count})` : baseLabel
    });
  }

  setFlow(String(ctx.from.id), {
    type: "trip_member_list",
    tripId: trip.id,
    step: "pick",
    data: { items }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("👤 СПИСОК УЧАСНИКІВ", trip.name),
      "",
      "Обери учасника кнопкою нижче.",
      "",
      "⚠️ Зверни увагу:",
      "• усім доступні ПІБ, телефон і роль",
      "• повна анкета доступна організатору та редактору походу"
    ]),
    { parse_mode: "HTML", ...getTripMembersListKeyboard(items) }
  );
}

function showTripMemberDetails(ctx, groupService, userService, trip, memberId, items = []) {
  const member = trip.members.find((item) => item.id === memberId);
  if (!member) {
    return ctx.reply("Учасника не знайдено в цьому поході.", getTripMembersKeyboard(trip, String(ctx.from.id)));
  }

  const viewerId = String(ctx.from.id);
  const canSeeFull = canManageTrip(trip, viewerId) || member.id === viewerId;
  const role = member.role === "owner" ? "організатор" : member.canManage ? "редактор" : "учасник";
  const memberView = userService.getTripMemberView(member, canSeeFull);

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("👤 УЧАСНИК ПОХОДУ", getMemberDisplayName(userService, member)),
      "",
      memberView.title,
      `Роль: ${role}`,
      "",
      ...memberView.details
    ]),
    { parse_mode: "HTML", ...getTripMemberDetailsKeyboard(items) }
  );
}

function showInviteInfo(ctx, groupService) {
  const trip = requireManageTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  const configuredUsername = isValidTelegramUsername(config.botUsername) ? config.botUsername : "";

  const runtimeUsername = isValidTelegramUsername(ctx.botInfo?.username) ? ctx.botInfo.username : "";
  const botUsername = configuredUsername || runtimeUsername;

  const inviteInfo = groupService.getInviteInfo(trip.id, botUsername);
  const botLink = botUsername ? `https://t.me/${botUsername}` : null;

  const shareText = [
    `Запрошення в похід "${trip.name}"`,
    `Код: ${inviteInfo.inviteCode}`,
    "Як приєднатися:",
    botLink ? `1. Відкрий бота: ${botLink}` : "1. Відкрий бота",
    "2. Натисни `🔑 Приєднатися до походу`",
    `3. Введи код: \`${inviteInfo.inviteCode}\``
  ];

  if (inviteInfo.deepLink) {
    shareText.push("", `Швидке посилання: ${inviteInfo.deepLink}`);
  }

  return ctx.reply(shareText.join("\n"), getTripMembersKeyboard(trip, String(ctx.from.id)));
}

function startJoinTripWizard(ctx) {
  setFlow(String(ctx.from.id), {
    type: "join_trip",
    step: "inviteCode",
    data: {}
  });

  return ctx.reply("Введи код запрошення в похід.\nПриклад: `A1F951`", {
    parse_mode: "Markdown",
    ...FLOW_CANCEL_KEYBOARD
  });
}

function startGrantAccessWizard(ctx, groupService, userService) {
  const trip = requireOwnerTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  const candidates = trip.members.filter((member) => !member.canManage && member.role !== "owner");
  if (!candidates.length) {
    return ctx.reply("Усі учасники вже мають права редагування або в поході ще немає кого призначати.", getTripMembersKeyboard(trip, String(ctx.from.id)));
  }

  setFlow(String(ctx.from.id), {
    type: "grant_access",
    tripId: trip.id,
    step: "memberIndex",
    data: {
      candidates: candidates.map((member) => ({ id: member.id, name: getMemberDisplayName(userService, member) }))
    }
  });

  const lines = candidates.map((member, index) => `${index + 1}. ${getMemberDisplayName(userService, member)}`).join("\n");
  return ctx.reply(
    `Кому надати права редагування?\n\n${lines}\n\nВведи номер учасника зі списку.`,
    FLOW_CANCEL_KEYBOARD
  );
}

function startGearAddWizard(ctx, groupService, mode) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const labels = {
    shared: "спільне спорядження",
    personal: "особисте спорядження",
    spare: "запасне спорядження, яким можна поділитися"
  };

  setFlow(String(ctx.from.id), {
    type: "gear_add",
    tripId: trip.id,
    step: "name",
    data: { mode }
  });

  return ctx.reply(`Що додати в ${labels[mode]}?\nПриклад: \`намет\``, {
    parse_mode: "Markdown",
    ...FLOW_CANCEL_KEYBOARD
  });
}

function showTripGearAddMenu(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("➕ ДОДАТИ СПОРЯДЖЕННЯ", trip.name),
      "",
      "Обери тип спорядження, яке хочеш додати:",
      "• спільне — для всієї групи",
      "• особисте — твоя індивідуальна річ у межах походу",
      "• запасне / позичу — те, чим ти можеш поділитися",
      "",
      "Після вибору типу бот продовжить звичний сценарій додавання."
    ]),
    { parse_mode: "HTML", ...getTripGearAddTypeKeyboard() }
  );
}

function startGearNeedWizard(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  setFlow(String(ctx.from.id), {
    type: "gear_need",
    tripId: trip.id,
    step: "name",
    data: {}
  });

  return ctx.reply("Якого спорядження тобі бракує?\nПриклад: `спальник`", {
    parse_mode: "Markdown",
    ...FLOW_CANCEL_KEYBOARD
  });
}

function getEditableTripGearItems(trip, groupService, memberId) {
  const snapshot = groupService.getGearSnapshot(trip.id);
  const canManage = canManageTrip(trip, memberId);
  const combined = [...snapshot.sharedGear, ...snapshot.personalGear, ...snapshot.spareGear];
  const seen = new Set();

  return combined.filter((item) => {
    if (!item?.id || seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return canManage || String(item.memberId) === String(memberId);
  });
}

function getTripGearScopeLabel(item) {
  if (item.scope === "shared") {
    return "спільне";
  }
  if (item.scope === "spare" || item.shareable) {
    return "запасне / позичу";
  }
  return "особисте";
}

function parseTripGearScopeChoice(message, currentScope = "personal") {
  if (message === GEAR_SCOPE_KEEP_LABEL) {
    return {
      ok: true,
      scope: currentScope,
      shareable: currentScope === "spare",
      kept: true
    };
  }

  if (message === GEAR_SCOPE_SHARED_LABEL) {
    return { ok: true, scope: "shared", shareable: false, kept: false };
  }

  if (message === GEAR_SCOPE_PERSONAL_LABEL) {
    return { ok: true, scope: "personal", shareable: false, kept: false };
  }

  if (message === GEAR_SCOPE_SPARE_LABEL) {
    return { ok: true, scope: "spare", shareable: true, kept: false };
  }

  return {
    ok: false,
    error: "Обери тип спорядження кнопкою під повідомленням."
  };
}

function formatTripGearSelectionLines(items) {
  return items.map((item, index) => {
    const owner = item.memberName ? ` | ${item.memberName}` : "";
    return `${index + 1}. ${item.name} | ${getTripGearScopeLabel(item)} | ${item.quantity} шт.${owner}`;
  });
}

function startGearEditWizard(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const items = getEditableTripGearItems(trip, groupService, String(ctx.from.id));
  if (!items.length) {
    return ctx.reply(
      "Немає позицій спорядження, які ти можеш редагувати.",
      getTripGearKeyboard()
    );
  }

  const preparedItems = items.map((item, index) => ({
    ...item,
    actionLabel: `${index + 1}. ${item.name}`
  }));

  setFlow(String(ctx.from.id), {
    type: "gear_edit",
    tripId: trip.id,
    step: "pick",
    data: { items: preparedItems }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", trip.name),
      "",
      "Обери спорядження, яке хочеш змінити.",
      "",
      "⚠️ Зверни увагу:",
      "• після вибору відкриється окреме меню дій",
      "• кнопка <b>❌ Скасувати</b> поверне до розділу спорядження"
    ]),
    { parse_mode: "HTML", ...getTripGearEditItemsKeyboard(preparedItems) }
  );
}

function startGearDeleteWizard(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const items = getEditableTripGearItems(trip, groupService, String(ctx.from.id));
  if (!items.length) {
    return ctx.reply(
      "Немає позицій спорядження, які ти можеш видалити.",
      getTripGearKeyboard()
    );
  }

  setFlow(String(ctx.from.id), {
    type: "gear_delete",
    tripId: trip.id,
    step: "pick",
    data: { items }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🗑 ВИДАЛИТИ СПОРЯДЖЕННЯ", trip.name),
      "",
      "Введи номер позиції, яку хочеш видалити:",
      "",
      ...formatTripGearSelectionLines(items)
    ]),
    { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
  );
}

function startFoodAddWizard(ctx, groupService, mode) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  setFlow(String(ctx.from.id), {
    type: "food_add",
    tripId: trip.id,
    step: "name",
    data: {}
  });

  return ctx.reply("Що додати в список продуктів походу?\nПриклад: `гречка`", {
    parse_mode: "Markdown",
    ...FLOW_CANCEL_KEYBOARD
  });
}

function startFoodDeleteWizard(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const snapshot = groupService.getFoodSnapshot(trip.id);
  if (!snapshot?.items?.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🗑 ВИДАЛЕННЯ ПРОДУКТУ", trip.name),
        "",
        "У поході поки немає позицій харчування для видалення."
      ]),
      { parse_mode: "HTML", ...getTripFoodKeyboard() }
    );
  }

  const items = snapshot.items.map((item, index) =>
    `${index + 1}. ${item.name} — ${item.amountLabel || formatWeightGrams(item.weightGrams)} | ${item.quantity}`
  );

  setFlow(String(ctx.from.id), {
    type: "food_delete",
    tripId: trip.id,
    step: "pick",
    data: {
      items: snapshot.items.map((item) => ({
        id: item.id,
        name: item.name,
        amountLabel: item.amountLabel || "",
        quantity: item.quantity || ""
      }))
    }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🗑 ВИДАЛЕННЯ ПРОДУКТУ", trip.name),
      "",
      "Введи номер позиції, яку потрібно видалити.",
      "",
      ...items,
      "",
      "⚠️ Зверни увагу:",
      "• видалення одразу прибере позицію зі списку харчування",
      "• якщо передумав, натисни <b>❌ Скасувати</b>"
    ]),
    { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
  );
}

function startExpenseAddWizard(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  setFlow(String(ctx.from.id), {
    type: "expense_add",
    tripId: trip.id,
    step: "title",
    data: {}
  });

  return ctx.reply("Введи назву витрати.\nПриклад: `Квиток Київ → Ворохта`", {
    parse_mode: "Markdown",
    ...FLOW_CANCEL_KEYBOARD
  });
}

function handleTripDataAction(ctx, groupService) {
  const trip = requireManageTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  if (!trip.tripCard) {
    return startTripCardWizardForTrip(ctx, trip.id);
  }

  const snapshot = groupService.getGearSnapshot(trip.id);
  setFlow(String(ctx.from.id), {
    type: "trip_card",
    tripId: trip.id,
    step: "startDate",
    data: { ...trip.tripCard }
  });

  return ctx.reply(
    `${formatTripCard(trip, snapshot)}\n\n<b>✏️ Оновлення даних походу</b>\nВведи дату початку у форматі YYYY-MM-DD.\nПриклад: 2026-07-14`,
    {
      parse_mode: "HTML",
      ...FLOW_CANCEL_KEYBOARD
    }
  );
}

function showRouteMenu(ctx, groupService) {
  setMenuContext(ctx.from?.id, "trip-route");
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("📍 МАРШРУТ ПОХОДУ", trip.name),
      "",
      `Поточний маршрут: ${formatRouteStatus(trip.routePlan)}`,
      "",
      !trip.routePlan && canManageTrip(trip, String(ctx.from.id))
        ? "Тут можна згенерувати власний маршрут або знайти готовий у каталозі маршрутів."
        : trip.routePlan && canManageTrip(trip, String(ctx.from.id))
          ? "Тут можна переглянути поточний маршрут, завантажити трек або замінити маршрут іншим."
          : "Тут можна переглянути поточний маршрут походу і завантажити трек.",
      "",
      "⚠️ Зверни увагу:",
      ["verified", "router-generated"].includes(trip.routePlan?.meta?.trackQuality)
        ? "• для навігації в горах краще використовувати GPX або KML, а HTML-карту лишати для перегляду"
        : "• для цього маршруту поки немає придатного GPX/KML, тому перегляд карти лишається допоміжним"
    ]),
    { parse_mode: "HTML", ...getTripRouteKeyboard(trip, canManageTrip(trip, String(ctx.from.id))) }
  );
}

function startTripWeatherSelection(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const settlements = getTripWeatherSettlements(trip);
  if (!settlements.length) {
    return ctx.reply("Для походу ще не задано регіон або маршрут.", getTripKeyboard(trip, String(ctx.from.id)));
  }

  if (settlements.length === 1) {
    return null;
  }

  setFlow(String(ctx.from.id), {
    type: "trip_weather_pick",
    tripId: trip.id,
    step: "choose",
    data: {
      settlements
    }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🌦 ПОГОДА ПОХОДУ", "Вибір населеного пункту"),
      "",
      "Обери населений пункт для погоди в районі маршруту.",
      `Доступні варіанти: ${settlements.join(" • ")}`,
      "",
      "⚠️ Краще дивитися той пункт, який ближчий до старту або ключової ділянки маршруту."
    ]),
    { parse_mode: "HTML", ...getTripWeatherSelectionKeyboard(settlements) }
  );
}

function showTripRouteChangeMenu(ctx, groupService) {
  setMenuContext(ctx.from?.id, "trip-route-change");
  const trip = requireManageTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🔁 ЗМІНА МАРШРУТУ", trip.name),
      "",
      "Оберіть, як хочете оновити маршрут:",
      "• згенерувати власний",
      "• знайти готовий у каталозі маршрутів"
    ]),
    { parse_mode: "HTML", ...getTripRouteChangeKeyboard() }
  );
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function cleanupPreviewArtifacts(...pathsToRemove) {
  await Promise.all(pathsToRemove.map((entry) => fs.rm(entry, { recursive: true, force: true }).catch(() => null)));
}

async function renderTrackPreviewWithQuickLook(svgPath, outputDir) {
  await execFileAsync("/usr/bin/qlmanage", ["-t", "-s", "1600", "-o", outputDir, svgPath]);
  return path.join(outputDir, `${path.basename(svgPath)}.png`);
}

async function renderTrackPreviewWithHeadlessBrowser(svgContent, outputDir) {
  const htmlPath = path.join(outputDir, "preview.html");
  const pngPath = path.join(outputDir, "preview.png");
  const htmlContent = `<!DOCTYPE html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
      }
      body {
        display: flex;
        justify-content: center;
        align-items: flex-start;
      }
      svg {
        display: block;
        width: 1600px;
        height: auto;
      }
    </style>
  </head>
  <body>${svgContent}</body>
</html>`;

  await fs.writeFile(htmlPath, htmlContent, "utf8");

  const browserCandidates = process.platform === "win32"
    ? [
        "msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "chrome.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
      ]
    : process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        ]
      : [
          "google-chrome",
          "google-chrome-stable",
          "chromium",
          "chromium-browser",
          "microsoft-edge",
          "msedge"
        ];

  let lastError = null;
  for (const browser of browserCandidates) {
    try {
      await execFileAsync(browser, [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--window-size=1600,1000",
        `--screenshot=${pngPath}`,
        pathToFileURL(htmlPath).href
      ]);
      return pngPath;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("No supported headless browser was found to render route preview.");
}

async function renderTrackPreviewPng(svgContent) {
  const id = crypto.randomUUID();
  const tmpDir = os.tmpdir();
  const svgPath = path.join(tmpDir, `${id}.svg`);
  const outputDir = path.join(tmpDir, `${id}-thumb`);

  await fs.writeFile(svgPath, svgContent, "utf8");
  await fs.mkdir(outputDir, { recursive: true });

  try {
    const pngPath = process.platform === "darwin"
      ? await renderTrackPreviewWithQuickLook(svgPath, outputDir)
      : await renderTrackPreviewWithHeadlessBrowser(svgContent, outputDir);
    return await fs.readFile(pngPath);
  } finally {
    await cleanupPreviewArtifacts(svgPath, outputDir);
  }
}

async function sendInlineTrackPreviewImage(ctx, routeService, routeMeta, caption) {
  if (!routeMeta?.geometry?.coordinates?.length) {
    return null;
  }

  if (!["verified", "router-generated"].includes(routeMeta.trackQuality)) {
    return null;
  }

  try {
    const artifacts = await routeService.buildRouteArtifacts(routeMeta);
    const previewSvg = artifacts.svg;
    const pngBuffer = await renderTrackPreviewPng(previewSvg);
    return ctx.replyWithPhoto(
      {
        source: pngBuffer,
        filename: `${artifacts.fileBaseName}.png`
      },
      {
        caption
      }
    );
  } catch {
    return null;
  }
}

async function sendInlineHtmlTrack(ctx, routeService, routeMeta, caption) {
  if (!routeMeta?.geometry?.coordinates?.length) {
    return null;
  }

  if (!["verified", "router-generated"].includes(routeMeta.trackQuality)) {
    return null;
  }

  try {
    const artifacts = await routeService.buildRouteArtifacts(routeMeta);
    return ctx.replyWithDocument(
      {
        source: Buffer.from(artifacts.html, "utf8"),
        filename: `${artifacts.fileBaseName}.html`
      },
      {
        caption
      }
    );
  } catch {
    return null;
  }
}

async function showRouteReport(ctx, groupService, routeService, vpohidLiveService = null) {
  let trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (!trip.routePlan) {
    return ctx.reply("У походу ще немає маршруту. Натисни `📌 Задати маршрут походу`.", {
      parse_mode: "Markdown",
      ...getTripRouteKeyboard(trip, canManageTrip(trip, String(ctx.from.id)))
    });
  }

  if (
    vpohidLiveService &&
    trip.routePlan?.source === "vpohid" &&
    trip.routePlan?.sourceRouteId &&
    (
      !Array.isArray(trip.routePlan?.meta?.vpohidDetail?.peaks) ||
      !trip.routePlan.meta.vpohidDetail.peaks.length ||
      !Array.isArray(trip.routePlan?.meta?.vpohidDetail?.interesting) ||
      !trip.routePlan.meta.vpohidDetail.interesting.length ||
      !Array.isArray(trip.routePlan?.meta?.vpohidDetail?.weatherSettlements) ||
      !trip.routePlan.meta.vpohidDetail.weatherSettlements.length
    )
  ) {
    try {
      const detail = await vpohidLiveService.getRouteDetail(trip.routePlan.sourceRouteId, { forceRefresh: true });
      trip = groupService.updateRoutePlan({
        groupId: trip.id,
        routePlan: {
          ...trip.routePlan,
          sourceTitle: trip.routePlan.sourceTitle || detail.title || null,
          meta: {
            ...(trip.routePlan.meta || {}),
            vpohidDetail: {
              ...(trip.routePlan.meta?.vpohidDetail || {}),
              title: detail.title || trip.routePlan.meta?.vpohidDetail?.title || "",
              subtitle: detail.subtitle || trip.routePlan.meta?.vpohidDetail?.subtitle || "",
              distance: detail.distance || trip.routePlan.meta?.vpohidDetail?.distance || "",
              duration: detail.duration || trip.routePlan.meta?.vpohidDetail?.duration || "",
              level: detail.level || trip.routePlan.meta?.vpohidDetail?.level || "",
              start: detail.start || trip.routePlan.meta?.vpohidDetail?.start || trip.routePlan.from || "",
              finish: detail.finish || trip.routePlan.meta?.vpohidDetail?.finish || trip.routePlan.to || "",
              peaks: Array.isArray(detail.peaks) && detail.peaks.length ? detail.peaks : (trip.routePlan.meta?.vpohidDetail?.peaks || []),
              interesting: Array.isArray(detail.interesting) && detail.interesting.length ? detail.interesting : (trip.routePlan.meta?.vpohidDetail?.interesting || []),
              weatherSettlements: Array.isArray(detail.weatherSettlements) && detail.weatherSettlements.length
                ? detail.weatherSettlements
                : (trip.routePlan.meta?.vpohidDetail?.weatherSettlements || []),
              description: detail.description || trip.routePlan.meta?.vpohidDetail?.description || "",
              url: detail.url || trip.routePlan.meta?.vpohidDetail?.url || ""
            }
          }
        },
        region: Array.isArray(detail.weatherSettlements) && detail.weatherSettlements.length
          ? detail.weatherSettlements[0]
          : trip.region
      });
    } catch {
      // keep existing trip if refresh fails
    }
  }

  const snapshot = groupService.getGearSnapshot(trip.id);
  await ctx.reply(
    `${formatUnifiedRouteMessage(trip.routePlan, trip.tripCard)}\n\n${formatTripCard(trip, snapshot)}\n\n<b>🆘 Безпека:</b> відкрий розділ «Безпека походу» для контактів рятувальників у регіоні.`,
    { parse_mode: "HTML", ...getTripRouteKeyboard(trip, canManageTrip(trip, String(ctx.from.id))) }
  );

  return sendInlineTrackPreviewImage(ctx, routeService, trip.routePlan.meta, `Прев’ю треку маршруту походу "${trip.name}".`);
}

function sendRouteMapLink(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🧭 КАРТА МАРШРУТУ", trip.name),
      "",
      "Зовнішні Google/OSM directions-перегляди вимкнені, бо вони спотворюють hiking-трек.",
      "",
      "⚠️ Зверни увагу:",
      "• для точного перегляду краще використовувати HTML-карту треку",
      "• для навігації — GPX або KML"
    ]),
    { parse_mode: "HTML", ...getTripRouteKeyboard(trip, canManageTrip(trip, String(ctx.from.id))) }
  );
}

async function sendRouteExport(ctx, groupService, routeService, format) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const routeMeta = trip.routePlan?.meta;
  if (!routeMeta?.geometry?.coordinates?.length) {
    return ctx.reply("Для цього маршруту поки немає треку. Спочатку збережи маршрут походу.", getTripRouteKeyboard(trip, canManageTrip(trip, String(ctx.from.id))));
  }

  if (!["verified", "router-generated"].includes(routeMeta.trackQuality)) {
    return ctx.reply("Для цього маршруту поки немає придатного GPX/KML. Поточна геометрія надто неточна для надійної навігації в горах.", getTripRouteKeyboard(trip, canManageTrip(trip, String(ctx.from.id))));
  }

  try {
    const artifacts = await routeService.buildRouteArtifacts(routeMeta);
    const extension = format === "gpx" ? "gpx" : format === "kml" ? "kml" : "html";
    const content = format === "gpx" ? artifacts.gpx : format === "kml" ? artifacts.kml : artifacts.html;
    const fileName = `${artifacts.fileBaseName}.${extension}`;

    return ctx.replyWithDocument(
      {
        source: Buffer.from(content, "utf8"),
        filename: fileName
      },
      {
        caption: extension === "html"
          ? `HTML-карта точного треку для маршруту походу "${trip.name}".`
          : `Маршрут походу "${trip.name}" у форматі ${extension.toUpperCase()}.`
      }
    );
  } catch (error) {
    return ctx.reply(`Не вдалося підготувати ${format.toUpperCase()}-трек: ${error.message}`, getTripRouteKeyboard(trip, canManageTrip(trip, String(ctx.from.id))));
  }
}

async function buildVpohidRouteSelection(detail, routeService, vpohidLiveService = null) {
  let points = (detail.points || []).map(canonicalizeVpohidPoint);
  let resolvedPlaces = [];
  let report = null;
  let importedRouteFeatures = [];

  if (Array.isArray(detail.geometryCoordinates) && detail.geometryCoordinates.length >= 2) {
    try {
      if (vpohidLiveService) {
        importedRouteFeatures = await vpohidLiveService.getRouteFeatures(detail, detail.geometryCoordinates);
      }
      report = await routeService.buildImportedGeometryReport({
        title: detail.title,
        points,
        detail,
        coordinates: detail.geometryCoordinates,
        provider: "vpohid",
        routeFeatures: importedRouteFeatures
      });
    } catch {
      report = null;
    }
  }

  if (!report && vpohidLiveService && points.length >= 2) {
    try {
      const resolved = await vpohidLiveService.resolveRoutePoints({
        ...detail,
        points
      });
      if (Array.isArray(resolved?.points) && resolved.points.length >= 2) {
        points = resolved.points.map(canonicalizeVpohidPoint);
      }
      if (Array.isArray(resolved?.places)) {
        resolvedPlaces = resolved.places;
      }
    } catch {
      resolvedPlaces = [];
    }
  }

  if (!report && points.length >= 2) {
    try {
      report = await routeService.getRouteReport({
        points,
        places: Array.isArray(resolvedPlaces) && resolvedPlaces.length === points.length ? resolvedPlaces : undefined
      });
    } catch {
      report = null;
    }
  }

  return {
    detail,
    points,
    resolvedPlaces,
    importedRouteFeatures,
    report
  };
}

async function ensureVpohidSelectionReport(userId, routeService, vpohidLiveService = null) {
  const selection = getVpohidSelection(userId);
  if (!selection) {
    return null;
  }

  if (
    vpohidLiveService &&
    selection.detail?.id &&
    (
      !Array.isArray(selection.detail.geometryCoordinates) ||
      selection.detail.geometryCoordinates.length < 2 ||
      !selection.detail.start ||
      !selection.detail.finish ||
      !Array.isArray(selection.detail.peaks) ||
      !selection.detail.peaks.length ||
      !Array.isArray(selection.detail.interesting) ||
      !selection.detail.interesting.length
    )
  ) {
    try {
      selection.detail = await vpohidLiveService.getRouteDetail(selection.detail.id, { forceRefresh: true });
    } catch {
      // keep the cached detail if live refresh fails
    }
  }

  if (Array.isArray(selection.detail?.points)) {
    selection.detail.points = selection.detail.points.map(canonicalizeVpohidPoint);
  }

  if (selection.report?.meta?.geometry?.coordinates?.length) {
    return selection;
  }

  if (!selection.detail?.points?.length || selection.detail.points.length < 2) {
    return selection;
  }

  const rebuilt = await buildVpohidRouteSelection(selection.detail, routeService, vpohidLiveService);
  const nextSelection = {
    ...selection,
    report: rebuilt.report || selection.report || null,
    points: rebuilt.points || selection.points || selection.detail.points,
    resolvedPlaces: rebuilt.resolvedPlaces || selection.resolvedPlaces || [],
    importedRouteFeatures: rebuilt.importedRouteFeatures || selection.importedRouteFeatures || []
  };
  vpohidSelections.set(String(userId), nextSelection);
  return nextSelection;
}

async function showVpohidChosenRoute(ctx, routeService, vpohidLiveService = null) {
  const selection = await ensureVpohidSelectionReport(ctx.from.id, routeService, vpohidLiveService);
  if (!selection) {
    return ctx.reply("Спочатку обери маршрут серед існуючих.", getRoutesMenuKeyboard(ctx.from.id));
  }

  const mode = selection.mode || "routes";
  const activeTrip = getMenuContext(ctx.from.id) === "routes" || mode === "routes"
    ? groupService.findGroupByMember(String(ctx.from.id))
    : null;

  if (selection.report?.ok) {
    await ctx.reply(
      formatUnifiedRouteMessage({
        summary: selection.report.summary,
        meta: selection.report.meta
      }, activeTrip?.tripCard || null),
      { parse_mode: "HTML", ...getVpohidDetailsKeyboard(mode) }
    );
    return sendInlineTrackPreviewImage(ctx, routeService, selection.report.meta, `Прев’ю треку для "${selection.detail.title}".`);
  }

  return ctx.reply(formatVpohidChosenRoute(selection), { parse_mode: "HTML", ...getVpohidDetailsKeyboard(mode) });
}

async function sendVpohidRouteExport(ctx, routeService, vpohidLiveService, format) {
  const selection = await ensureVpohidSelectionReport(ctx.from.id, routeService, vpohidLiveService);
  if (!selection) {
    return ctx.reply("Спочатку обери маршрут серед існуючих.", getRoutesMenuKeyboard(ctx.from.id));
  }
  const mode = selection.mode || "routes";

  const routeMeta = selection.report?.meta;
  if (!routeMeta?.geometry?.coordinates?.length) {
    return ctx.reply("Для цього маршруту поки немає придатного треку. Спробуй інший маршрут або перевибери точки.", getVpohidDetailsKeyboard(mode));
  }

  if (!["verified", "router-generated"].includes(routeMeta.trackQuality)) {
    return ctx.reply("Для цього маршруту поки немає придатного GPX/KML. Поточна геометрія надто неточна для надійної навігації в горах.", getVpohidDetailsKeyboard(mode));
  }

  try {
    const artifacts = await routeService.buildRouteArtifacts(routeMeta);
    const extension = format === "gpx" ? "gpx" : "kml";
    const content = format === "gpx" ? artifacts.gpx : artifacts.kml;
    return ctx.replyWithDocument(
      {
        source: Buffer.from(content, "utf8"),
        filename: `${artifacts.fileBaseName}.${extension}`
      },
      {
        caption: `Маршрут "${selection.detail.title}" у форматі ${extension.toUpperCase()}.`
      }
    );
  } catch (error) {
    return ctx.reply(`Не вдалося підготувати ${format.toUpperCase()}-трек: ${error.message}`, getVpohidDetailsKeyboard(mode));
  }
}

function showRoutesMenu(ctx) {
  setMenuContext(ctx.from?.id, "routes");
  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🗺 МАРШРУТИ", "Пошук і генерація"),
      "",
      formatSectionHeader("🧭", "Що Тут Можна"),
      "• згенерувати власний маршрут між точками",
      "• знайти готовий маршрут у каталозі",
      "• переглянути весь каталог маршрутів",
      "• одразу побачити оформлену картку маршруту",
      "• отримати прев’ю треку, якщо для маршруту є геометрія",
      "",
      "⚠️ Зверни увагу:",
      "• для навігації в горах краще користуватися GPX або KML"
    ]),
    { parse_mode: "HTML", ...getRoutesMenuKeyboard(ctx.from.id) }
  );
}

function showMyGearMenu(ctx) {
  setMenuContext(ctx.from?.id, "my-gear");
  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🎒 МОЄ СПОРЯДЖЕННЯ", "Особистий список"),
      "",
      "Тут зберігається твоє спорядження поза контекстом конкретного походу.",
      "",
      "⚠️ Зверни увагу:",
      "• категорія для речі визначається автоматично",
      "• для кожної речі краще заповнювати вагу, сезон і важливі характеристики",
      "• це окремо від спорядження конкретного походу"
    ]),
    { parse_mode: "HTML", ...MY_GEAR_KEYBOARD }
  );
}

function formatWeightGrams(value) {
  const grams = Number(value) || 0;
  if (!grams) {
    return "не вказано";
  }
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")} кг`;
  }
  return `${grams} г`;
}

function inferFoodMeasureKind(name) {
  const normalized = String(name || "").trim().toLowerCase();

  const volumeKeywords = [
    "вода",
    "сік",
    "сок",
    "пепсі",
    "pepsi",
    "кола",
    "cola",
    "фанта",
    "спрайт",
    "міринда",
    "молоко",
    "кефір",
    "ряжанка",
    "йогурт питний",
    "айран",
    "чай",
    "кава",
    "компот",
    "морс",
    "узвар",
    "суп",
    "бульйон",
    "ізотонік",
    "енергетик",
    "напій",
    "сироп",
    "олія",
    "масло",
    "соус",
    "кетчуп",
    "майонез",
    "гірчиця",
    "горілка",
    "водка",
    "віскі",
    "коньяк",
    "коньячок",
    "вино",
    "пиво",
    "ром",
    "джин"
  ];

  const weightKeywords = [
    "гречка",
    "рис",
    "макарон",
    "круп",
    "вівсян",
    "пшоно",
    "булгур",
    "кус кус",
    "кускус",
    "сочевиц",
    "нут",
    "квасол",
    "борошно",
    "цукор",
    "сіль",
    "чай сухий",
    "кава мелена",
    "кава зернова",
    "сухар",
    "печиво",
    "батончик",
    "сублім",
    "сушене м'ясо",
    "м'ясо",
    "ковбас",
    "сало",
    "сир",
    "тушонк",
    "тушкован",
    "консерва",
    "рибна консерва",
    "м'ясна консерва",
    "овочева консерва",
    "горіх",
    "сухофрукт",
    "шоколад",
    "цукерк",
    "хліб",
    "лаваш"
  ];

  if (volumeKeywords.some((keyword) => normalized.includes(keyword))) {
    return "volume";
  }

  if (weightKeywords.some((keyword) => normalized.includes(keyword))) {
    return "weight";
  }

  return "any";
}

function parseFoodAmountInput(input, expectedKind = "any") {
  const raw = String(input || "").trim().toLowerCase().replace(",", ".");
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(кг|г|л|мл)$/u);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  const actualKind = unit === "кг" || unit === "г" ? "weight" : "volume";
  if (expectedKind !== "any" && actualKind !== expectedKind) {
    return null;
  }

  let weightGrams = 0;
  if (unit === "кг") {
    weightGrams = Math.round(value * 1000);
  } else if (unit === "г") {
    weightGrams = Math.round(value);
  } else if (unit === "л") {
    weightGrams = Math.round(value * 1000);
  } else if (unit === "мл") {
    weightGrams = Math.round(value);
  }

  const displayValue = Number.isInteger(value) ? String(value) : String(value).replace(/\.0$/, "");

  return {
    weightGrams,
    amountLabel: `${displayValue} ${unit}`,
    unit
  };
}

function groupGearItemsByCategory(items) {
  const groups = new Map();

  for (const item of items) {
    const category = item.categoryLabel
      ? {
          icon: item.categoryIcon || "📦",
          label: item.categoryLabel,
          title: `${item.categoryIcon || "📦"} ${item.categoryLabel}`
        }
      : categorizeGearName(item.name);

    if (!groups.has(category.title)) {
      groups.set(category.title, []);
    }
    groups.get(category.title).push(item);
  }

  return [...groups.entries()].map(([title, groupedItems]) => ({ title, items: groupedItems }));
}

function formatGearList(items, { includeOwner = false } = {}) {
  if (!items.length) {
    return ["• немає"];
  }

  const sections = [];
  for (const group of groupGearItemsByCategory(items)) {
    sections.push(`<b>${group.title}</b>`);
    sections.push("────────");
    for (const [index, item] of group.items.entries()) {
      const tail = [];
      if (includeOwner && item.memberName) {
        tail.push(item.memberName);
      }
      sections.push(`${index + 1}. ${item.name}: ${item.quantity} шт.${tail.length ? ` | ${tail.join(" | ")}` : ""}`);

      const attributes = summarizeGearAttributes(item);
      for (const line of attributes) {
        sections.push(`◦ ${line}`);
      }
    }
    sections.push("");
  }

  while (sections[sections.length - 1] === "") {
    sections.pop();
  }

  return sections;
}

function getGearFlowField(flow) {
  const profile = resolveGearProfile(flow?.data?.name || "");
  const fieldIndex = Number(flow?.data?.fieldIndex) || 0;
  return {
    profile,
    fieldIndex,
    field: profile.fields[fieldIndex] || null
  };
}

function formatGearFieldCurrentValue(name, field, attributes = {}) {
  if (!field) {
    return "";
  }

  const profile = resolveGearProfile(name);
  return formatGearAttribute(profile, field.key, attributes[field.key]);
}

function buildGearFieldPromptMessage(title, itemName, field, attributes = {}) {
  const currentValue = formatGearFieldCurrentValue(itemName, field, attributes);
  const hint =
    field.type === "number"
      ? "• введи число; якщо не знаєш точне значення, можна вказати <b>0</b>"
      : "• якщо хочеш пропустити або очистити поле, введи <b>-</b>";

  return joinRichLines([
    ...formatCardHeader(title, itemName),
    "",
    currentValue ? `Поточне значення: ${currentValue}` : null,
    ...String(field.prompt || "").split("\n"),
    "",
    "⚠️ Зверни увагу:",
    hint
  ]);
}

function parseGearFieldInput(field, message) {
  if (field?.type === "number") {
    const value = Number(String(message || "").replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      return {
        ok: false,
        error: `Вкажи поле "${field.label}" числом.`
      };
    }

    return { ok: true, value };
  }

  if (field?.type === "text_optional") {
    return { ok: true, value: message === "-" ? "" : message };
  }

  return { ok: true, value: message };
}

function buildGearAttributesSummaryLines(name, quantity, attributes = {}, extraLines = []) {
  const lines = [
    `Категорія: ${categorizeGearName(name).title}`,
    ...extraLines,
    `Кількість: ${quantity}`
  ];
  const attributesSummary = summarizeGearAttributes({ name, attributes });

  if (attributesSummary.length) {
    lines.push(...attributesSummary.map((line) => `• ${line}`));
  } else {
    lines.push("• Характеристики: не вказано");
  }

  return lines;
}

function buildGearRecognitionSummaryLines(name) {
  const category = categorizeGearName(name);
  const profile = resolveGearProfile(name);
  const lines = [
    `Категорія: ${category.title}`,
    `Профіль характеристик: ${profile.label}`
  ];

  if (profile.key === "generic") {
    lines.push("• точний тип не впізнано, тому бот застосує загальний набір полів");
  } else {
    lines.push("• далі бот поставить питання саме для цього типу спорядження");
  }

  return lines;
}

function startMyGearAddWizard(ctx) {
  setMenuContext(ctx.from?.id, "my-gear");
  setFlow(String(ctx.from.id), {
    type: "my_gear_add",
    step: "name",
    data: {}
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("➕ ДОДАТИ МОЄ СПОРЯДЖЕННЯ", "Особиста річ"),
      "",
      "Введи назву речі.",
      "",
      "Приклад: <b>спальник</b>",
      "",
      "⚠️ Зверни увагу:",
      "• категорія визначиться автоматично за назвою і ключовими словами"
    ]),
    { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
  );
}

function startMyGearEditWizard(ctx, userService) {
  setMenuContext(ctx.from?.id, "my-gear");
  const items = userService.getPersonalGear(String(ctx.from.id), getUserLabel(ctx));

  if (!items.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ", "Особистий список"),
        "",
        "Поки що немає жодної речі для редагування."
      ]),
      { parse_mode: "HTML", ...MY_GEAR_KEYBOARD }
    );
  }

  const preparedItems = items.map((item, index) => ({
    ...item,
    actionLabel: `${index + 1}. ${item.name}`
  }));

  setFlow(String(ctx.from.id), {
    type: "my_gear_edit",
    step: "pick",
    data: { items: preparedItems }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ", "Обери річ"),
      "",
      "Обери річ, яку хочеш змінити.",
      "",
      "⚠️ Зверни увагу:",
      "• після вибору відкриється окреме меню дій",
      "• кнопка <b>❌ Скасувати</b> поверне до розділу мого спорядження"
    ]),
    { parse_mode: "HTML", ...getTripGearEditItemsKeyboard(preparedItems) }
  );
}

const PROFILE_EDIT_FIELDS = [
  {
    key: "fullName",
    prompt: "Введи ПІБ.\nПриклад: Сергій Куриленко"
  },
  {
    key: "birthDate",
    prompt: "Введи дату народження у форматі YYYY-MM-DD.\nПриклад: 1988-11-25"
  },
  {
    key: "gender",
    prompt: "Вкажи стать.\nПриклад: чоловік / жінка / інше"
  },
  {
    key: "bloodType",
    prompt: "Вкажи групу крові у звичному форматі.\nПриклад: 4+ або 2-"
  },
  {
    key: "allergies",
    prompt: "Вкажи алергії або натисни «Пропустити»."
  },
  {
    key: "medications",
    prompt: "Вкажи постійні ліки або важливі препарати.\nПриклад: інгалятор, антигістамінні"
  },
  {
    key: "healthNotes",
    prompt: "Вкажи інші важливі для походу медичні особливості.\nПриклад: астма, проблеми з тиском, чутливість до холоду"
  },
  {
    key: "phone",
    prompt: "Вкажи свій номер телефону.\nПриклад: +380671234567"
  },
  {
    key: "emergencyContactName",
    prompt: "Вкажи ПІБ екстреного контакту."
  },
  {
    key: "emergencyContactPhone",
    prompt: "Вкажи телефон екстреного контакту."
  },
  {
    key: "emergencyContactRelation",
    prompt: "Ким тобі є екстрений контакт?\nПриклад: мама / дружина / брат"
  },
  {
    key: "experienceLevel",
    prompt: "Вкажи свій досвід походів.\nПриклад: початківець / любитель / досвідчений"
  },
  {
    key: "city",
    prompt: "Вкажи місто проживання."
  }
];

function formatProfileDashboard(userService, groupService, userId, userName) {
  const dashboard = userService.getDashboard(userId, userName);
  const latestAwards = dashboard.latestAwards.length
    ? dashboard.latestAwards.map((award) => `• ${formatAwardName(award)}`).join("\n")
    : "• Поки що нагород немає";
  return joinRichLines([
    ...formatCardHeader("📊 ДАШБОРД", dashboard.fullName),
    "",
    formatSectionHeader("🥾", "Підсумок По Походах"),
    `Пройдених походів: ${dashboard.hikesCount}`,
    `Активних походів: ${dashboard.activeTrips}`,
    `Архівних походів: ${dashboard.archivedTrips}`,
    "",
    formatSectionHeader("📍", "Пройдений Обсяг"),
    `Кілометри: ${dashboard.totalKm.toFixed(1)} км`,
    `Набір висоти: ${Math.round(dashboard.totalAscent || 0)} м`,
    `Днів у походах: ${dashboard.totalDays}`,
    `Ночівель: ${dashboard.totalNights}`,
    "",
    formatSectionHeader("💸", "Витрати І Спорядження"),
    `Сумарні витрати: ${formatMoney(dashboard.totalCost)}`,
    `Позицій у моєму спорядженні: ${dashboard.personalGearCount}`,
    `Організованих походів: ${dashboard.organizedTrips}`,
    "",
    formatSectionHeader("⭐", "Рівень І XP"),
    `Рівень: ${dashboard.xp.level}`,
    `Загальний XP: ${dashboard.xp.totalXp}`,
    dashboard.xp.progress.next
      ? `До наступного рівня: ${dashboard.xp.progress.currentXp} / ${dashboard.xp.progress.nextTargetXp} XP`
      : `Максимальний відкритий рівень: ${dashboard.xp.progress.currentXp} XP`,
    "",
    formatSectionHeader("🏅", "Нагороди І Титул"),
    `Поточний титул: ${dashboard.currentTitle || "ще не відкрито"}`,
    `Усього нагород: ${dashboard.awardsCount}`,
    latestAwards,
    "",
    "⚠️ Зверни увагу:",
    "• дашборд рахується по завершених та архівних походах",
    "• активний похід окремо не додається в пройдену статистику"
  ]);
}

function formatProfileAwards(userService, userId, userName) {
  const data = userService.getAwards(userId, userName);
  const awardLines = data.awards.length
    ? data.awards.map((award) => `• ${formatAwardName(award)}${award.description ? ` — ${award.description}` : ""}`)
    : ["• Поки що нагород немає. Заверши перший похід, і вони з’являться тут."];
  const historyLines = data.history.length
    ? data.history.flatMap((item) => {
      const lines = [
        `• <b>${escapeHtml(item.tripName || "Похід")}</b>`,
        `  Маршрут: ${escapeHtml(item.routeName || "маршрут не задано")}`,
        `  XP: +${item.gainedXp} (база ${item.baseXp}${item.awardBonusXp > 0 ? `, бонус ${item.awardBonusXp}` : ""})`,
        `  Рівень: ${item.levelBefore} → ${item.levelAfter}`,
        `  Разом XP: ${item.totalXpAfter}`
      ];

      if (Array.isArray(item.components) && item.components.length) {
        lines.push(`  Складові: ${item.components.map((part) => `${part.label} +${part.xp}`).join(" • ")}`);
      }

      return [...lines, ""];
    }).slice(0, -1)
    : ["• Історія XP поки порожня. Заверши перший реальний похід, і тут з’являться нарахування."];

  return joinRichLines([
    ...formatCardHeader("🏅 МОЇ ДОСЯГНЕННЯ", data.fullName),
    "",
    formatSectionHeader("🎯", "Титул І Рівень"),
    `• Титул: ${data.title || "ще не відкрито"}`,
    `• Рівень: ${data.xp.level}`,
    `• Загальний XP: ${data.xp.totalXp}`,
    data.xp.progress.next
      ? `• До наступного рівня: ${data.xp.progress.currentXp} / ${data.xp.progress.nextTargetXp} XP`
      : `• Максимальний відкритий рівень: ${data.xp.progress.currentXp} XP`,
    "",
    formatSectionHeader("📈", "Прогрес"),
    `• Походів: ${data.stats.hikesCount}`,
    `• Кілометрів: ${data.stats.totalKm.toFixed(1)} км`,
    `• Набір висоти: ${Math.round(data.stats.totalAscent || 0)} м`,
    `• Ночівель: ${data.stats.totalNights}`,
    "",
    formatSectionHeader("🧾", "Останні Нарахування XP"),
    ...historyLines,
    "",
    formatSectionHeader("🏆", "Усі Нагороди"),
    ...awardLines
  ]);
}

function formatProfileAbout(userService, userId, userName) {
  const profile = userService.getProfile(userId, userName).profile;
  return joinRichLines([
    ...formatCardHeader("👤 ПРО МЕНЕ", profile.fullName || userName),
    "",
    formatSectionHeader("🪪", "Основне"),
    `ПІБ: ${profile.fullName || "не вказано"}`,
    `Дата народження: ${profile.birthDate || "не вказано"}`,
    `Вік: ${Number.isFinite(profile.age) ? profile.age : "не вказано"}`,
    `Стать: ${profile.gender || "не вказано"}`,
    `Місто: ${profile.city || "не вказано"}`,
    "",
    formatSectionHeader("📞", "Контакти"),
    `Мій телефон: ${profile.phone || "не вказано"}`,
    `Екстрений контакт: ${profile.emergencyContactName || "не вказано"}`,
    `Телефон контакту: ${profile.emergencyContactPhone || "не вказано"}`,
    `Хто це: ${profile.emergencyContactRelation || "не вказано"}`,
    "",
    formatSectionHeader("⛰", "Досвід"),
    `Рівень досвіду: ${profile.experienceLevel || "не вказано"}`,
    "",
    "⚠️ Зверни увагу:",
    "• критичні дані для походу винесені в окремий підрозділ `🩺 Медична картка`",
    "• цю інформацію бачиш ти",
    "• у поході ПІБ і телефон доступні всім учасникам",
    "• повна анкета доступна організатору і тим, кому він дав права редагування"
  ]);
}

function formatProfileMedicalCard(userService, userId, userName) {
  const profile = userService.getProfile(userId, userName).profile;
  return joinRichLines([
    ...formatCardHeader("🩺 МЕДИЧНА КАРТКА", profile.fullName || userName),
    "",
    formatSectionHeader("🚑", "Критично Важливе"),
    `Група крові: ${profile.bloodType || "не вказано"}`,
    `Алергії: ${profile.allergies || "не вказано"}`,
    `Ліки: ${profile.medications || "не вказано"}`,
    `Інші важливі особливості: ${profile.healthNotes || "не вказано"}`,
    "",
    formatSectionHeader("📞", "Екстрений Звʼязок"),
    `Мій телефон: ${profile.phone || "не вказано"}`,
    `Екстрений контакт: ${profile.emergencyContactName || "не вказано"}`,
    `Телефон контакту: ${profile.emergencyContactPhone || "не вказано"}`,
    `Хто це: ${profile.emergencyContactRelation || "не вказано"}`,
    "",
    "⚠️ Зверни увагу:",
    "• ці дані краще тримати актуальними перед кожним походом",
    "• їх бачить організатор і ті, кому він дав права редагування"
  ]);
}

function showProfileMenu(ctx, userService) {
  setMenuContext(ctx.from?.id, "profile");
  const profile = userService.getProfile(String(ctx.from.id), getUserLabel(ctx));
  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🙍 МІЙ ПРОФІЛЬ", profile.profile.fullName || profile.name || getUserLabel(ctx)),
      "",
      "Тут зібрані твої особисті дані, статистика і спорядження.",
      "",
      "⚠️ Зверни увагу:",
      "• профіль прив’язаний до твого акаунта окремо від конкретного походу",
      "• анкету краще заповнити до старту, щоб організатор бачив важливі дані"
    ]),
    { parse_mode: "HTML", ...getProfileKeyboard() }
  );
}

function showProfileDashboard(ctx, userService, groupService) {
  setMenuContext(ctx.from?.id, "profile");
  return ctx.reply(
    formatProfileDashboard(userService, groupService, String(ctx.from.id), getUserLabel(ctx)),
    { parse_mode: "HTML", ...getProfileKeyboard() }
  );
}

function showProfileAbout(ctx, userService) {
  setMenuContext(ctx.from?.id, "profile");
  return ctx.reply(
    formatProfileAbout(userService, String(ctx.from.id), getUserLabel(ctx)),
    { parse_mode: "HTML", ...getProfileKeyboard() }
  );
}

function showProfileMedicalCard(ctx, userService) {
  setMenuContext(ctx.from?.id, "profile");
  return ctx.reply(
    formatProfileMedicalCard(userService, String(ctx.from.id), getUserLabel(ctx)),
    { parse_mode: "HTML", ...getProfileKeyboard() }
  );
}

function showProfileAwards(ctx, userService) {
  setMenuContext(ctx.from?.id, "profile");
  return ctx.reply(
    formatProfileAwards(userService, String(ctx.from.id), getUserLabel(ctx)),
    { parse_mode: "HTML", ...getProfileKeyboard() }
  );
}

function startProfileEditWizard(ctx, userService) {
  const current = userService.getProfile(String(ctx.from.id), getUserLabel(ctx)).profile;
  setFlow(String(ctx.from.id), {
    type: "profile_edit",
    step: PROFILE_EDIT_FIELDS[0].key,
    data: { ...current }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("✏️ РЕДАГУВАННЯ ПРОФІЛЮ", "Анкета користувача"),
      "",
      PROFILE_EDIT_FIELDS[0].prompt,
      "",
      "⚠️ Зверни увагу:",
      "• можна пропустити будь-яке поле і повернутися до нього пізніше"
    ]),
    { parse_mode: "HTML", ...getProfileEditKeyboard() }
  );
}

function getFaqKeyboard(questions) {
  const rows = [];

  for (let index = 0; index < questions.length; index += 2) {
    const pair = questions.slice(index, index + 2).map((item) => item.question);
    rows.push(pair);
  }

  rows.push([FAQ_REFRESH_LABEL], ["⬅️ Головне меню"]);
  return buildKeyboard(rows);
}

function formatFaqMenuMessage(questions) {
  return [
    ...formatCardHeader("❓ ЧАСТІ ПИТАННЯ", "Швидкі відповіді"),
    "",
    "Обери будь-яке питання нижче.",
    "",
    "⚠️ Зверни увагу:",
    "• теми змішуються випадково",
    "• питання охоплюють маршрут, одяг, спорядження, воду, безпеку, табір і навігацію",
    `Зараз у меню: ${questions.length} питань`
  ].join("\n");
}

function showFaqMenu(ctx, advisorService, previousIds = []) {
  const questions = advisorService.getRandomFaqQuestions({
    count: 10,
    excludeIds: previousIds
  });

  setFlow(String(ctx.from.id), {
    type: "faq_menu",
    step: "pick",
    data: {
      questions,
      previousIds: questions.map((item) => item.id)
    }
  });

  return ctx.reply(formatFaqMenuMessage(questions), { parse_mode: "HTML", ...getFaqKeyboard(questions) });
}

function showAdvicePrompt(ctx, advisorService) {
  return showFaqMenu(ctx, advisorService);
}

async function showWeather(ctx, weatherService, location, keyboard = null) {
  const targetKeyboard = keyboard || getMainKeyboard(ctx);
  if (!location) {
    return ctx.reply("Введи локацію: `/weather Яремче`", {
      parse_mode: "Markdown",
      ...targetKeyboard
    });
  }

  const summary = await weatherService.getWeatherSummary(location);
  return ctx.reply(summary, { parse_mode: "HTML", ...targetKeyboard });
}

async function showRouteSearch(ctx, groupService, routeService, input) {
  const points = parseRoutePointsInput(input);
  if (points.length < 2) {
    return ctx.reply("Введи маршрут: `/route Яремче -> полонина -> Говерла`", {
      parse_mode: "Markdown",
      ...getRoutesMenuKeyboard(ctx.from.id)
    });
  }

  const report = await routeService.getRouteReport({ points });
  const activeTrip = groupService.findGroupByMember(String(ctx.from.id));
  await ctx.reply(
    formatUnifiedRouteMessage({
      summary: report.summary,
      meta: report.meta
    }, activeTrip?.tripCard || null),
    getRoutesMenuKeyboard(ctx.from.id)
  );
  return sendInlineTrackPreviewImage(ctx, routeService, report.meta, "Прев’ю згенерованого треку.");
}

function showJoinPrompt(ctx, groupService) {
  const trip = groupService.findGroupByMember(String(ctx.from.id));

  if (trip) {
      return ctx.reply(
        `Ти вже в активному поході "${trip.name}".\nКод походу: ${trip.inviteCode}\nСпочатку заверш поточний похід, якщо хочеш перейти в інший.`,
        getTripKeyboard(trip, String(ctx.from.id))
      );
  }

  return startJoinTripWizard(ctx);
}

function startRouteWizard(ctx, groupService, mode) {
  let trip = null;
  const parentContext = mode === "search" ? "routes" : getMenuContext(ctx.from?.id);

  if (mode !== "search") {
    trip = requireManageTrip(ctx, groupService);
    if (!trip) {
      return null;
    }

    if (mode === "create" && trip.routePlan) {
      return ctx.reply("У походу вже є маршрут. Можна лише редагувати його.", getTripRouteKeyboard(trip, true));
    }

    if (mode === "edit" && !trip.routePlan) {
      return ctx.reply("У походу ще немає маршруту. Спочатку створи його.", getTripRouteKeyboard(trip, true));
    }
  }

  setFlow(String(ctx.from.id), {
    type: "route",
    mode,
    tripId: trip?.id || null,
    step: "from",
    data: { parentContext }
  });

  return ctx.reply(
    mode === "search"
      ? "Введи точку старту маршруту.\nПриклад: `Яремче` або `Заросляк`."
      : "Введи точку старту походу.\nПриклад: `Заросляк` або `Ворохта`.",
    {
      parse_mode: "Markdown",
      ...getRouteFlowKeyboard(mode)
    }
  );
}

function startTripCardWizardForTrip(ctx, tripId) {
  setFlow(String(ctx.from.id), {
    type: "trip_card",
    tripId,
    step: "startDate",
    data: {}
  });

  return ctx.reply("Введи дату початку у форматі YYYY-MM-DD.\nПриклад: `2026-07-14`", {
    parse_mode: "Markdown",
    ...FLOW_CANCEL_KEYBOARD
  });
}

function startCreateTripWizard(ctx, tripName = "") {
  setFlow(String(ctx.from.id), {
    type: "trip_create",
    step: tripName ? "startDate" : "name",
    data: tripName ? { name: tripName } : {}
  });

  if (tripName) {
    return ctx.reply("Введи дату початку у форматі YYYY-MM-DD.\nПриклад: `2026-07-14`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  return ctx.reply("Введи назву походу.\nПриклад: `Карпати серпень`", {
    parse_mode: "Markdown",
    ...FLOW_CANCEL_KEYBOARD
  });
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeGearStatus(value) {
  const map = {
    "🟢 Готово": "готово",
    "🟡 Частково готово": "частково готово",
    "🔴 Збираємо": "збираємо"
  };

  return map[value] || value.toLowerCase();
}

async function handleRouteFlow(ctx, flow, groupService, routeService, userService, telegram = null) {
  const message = ctx.message.text.trim();
  const parentContext = getFlowParentContext(flow);

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return showParentMenuByContext(ctx, groupService, parentContext)
      || (flow.mode === "search" ? showRoutesMenu(ctx) : showRouteMenu(ctx, groupService));
  }

  if (message === getRouteFlowBackLabel(flow.mode)) {
    clearFlow(String(ctx.from.id));
    return showParentMenuByContext(ctx, groupService, parentContext)
      || (flow.mode === "search" ? showRoutesMenu(ctx) : showRouteMenu(ctx, groupService));
  }

  if (flow.step === "from") {
    flow.data.from = message;
    flow.step = "to";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      flow.mode === "search"
        ? "Введи точку фінішу маршруту.\nПриклад: `Говерла` або `Кукул`."
        : "Введи точку фінішу або цілі походу.\nПриклад: `Кукул` або `Говерла`.",
      {
        parse_mode: "Markdown",
        ...getRouteFlowKeyboard(flow.mode)
      }
    );
  }

  if (flow.step === "to") {
    flow.data.to = message;
    flow.data.stops = [];
    flow.data.stopSuggestions = routeService.getSuggestedWaypoints({
      from: flow.data.from,
      to: flow.data.to
    });

    flow.step = "stops";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      flow.data.stopSuggestions.length
        ? `Обери проміжні точки з перевіреного списку.\nМожна натиснути кілька точок по черзі, а потім \`${FLOW_STOPS_DONE_LABEL}\`.`
        : "Для цього маршруту немає перевірених проміжних точок у бібліотеці.\nЯкщо зупинок немає, натисни `⏭ Без зупинок`.",
      {
        parse_mode: "Markdown",
        ...getRouteStopsKeyboard(flow.data.stopSuggestions, flow.data.stops, flow.mode)
      }
    );
  }

  if (flow.step === "stops") {
    if (message === FLOW_STOPS_CLEAR_LABEL) {
      flow.data.stops = [];
      setFlow(String(ctx.from.id), flow);
      return ctx.reply("Список проміжних точок очищено. Обери точки заново або натисни `⏭ Без зупинок`.", {
        parse_mode: "Markdown",
        ...getRouteStopsKeyboard(flow.data.stopSuggestions || [], flow.data.stops, flow.mode)
      });
    }

    if (message === "⏭ Без зупинок") {
      flow.data.stops = [];
    } else if (message === FLOW_STOPS_DONE_LABEL) {
      if (!flow.data.stops?.length) {
        return ctx.reply("Спочатку обери хоча б одну проміжну точку або натисни `⏭ Без зупинок`.", {
          parse_mode: "Markdown",
          ...getRouteStopsKeyboard(flow.data.stopSuggestions || [], flow.data.stops || [], flow.mode)
        });
      }
    } else if ((flow.data.stopSuggestions || []).includes(message)) {
      flow.data.stops = [...new Set([...(flow.data.stops || []), message])];
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        `Проміжні точки: ${flow.data.stops.join(" • ")}\n\nМожеш додати ще одну або натисни \`${FLOW_STOPS_DONE_LABEL}\`.`,
        {
          parse_mode: "Markdown",
          ...getRouteStopsKeyboard(flow.data.stopSuggestions || [], flow.data.stops, flow.mode)
        }
      );
    } else {
      return ctx.reply("Обери проміжну точку кнопкою з перевіреного списку.", getRouteStopsKeyboard(flow.data.stopSuggestions || [], flow.data.stops || [], flow.mode));
    }

    if (flow.mode === "search") {
      const report = await routeService.getRouteReport({
        points: [flow.data.from, ...flow.data.stops, flow.data.to]
      });
      clearFlow(String(ctx.from.id));
      const activeTrip = groupService.findGroupByMember(String(ctx.from.id));
      const tripCard = activeTrip?.tripCard || null;
      const normalizedSummary = formatTripRouteSummary({ summary: report.summary, meta: report.meta }, tripCard);
      await ctx.reply(formatUnifiedRouteMessage(normalizedSummary), { parse_mode: "HTML", ...getRoutesMenuKeyboard(ctx.from.id) });
      return sendInlineTrackPreviewImage(ctx, routeService, report.meta, "Прев’ю згенерованого треку.");
    }

    flow.step = "region";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply("Введи регіон або населений пункт для погоди походу.\nПриклад: `Ворохта`", {
      parse_mode: "Markdown",
      ...getRouteFlowKeyboard(flow.mode)
    });
  }

  if (flow.step === "region") {
    flow.data.region = message;
    const report = await routeService.getRouteReport({
      points: [flow.data.from, ...(flow.data.stops || []), flow.data.to]
    });
    const activeTrip = flow.tripId ? groupService.findGroupByMember(String(ctx.from.id)) : null;
    const tripCard = activeTrip?.id === flow.tripId ? activeTrip.tripCard : null;
    const reportSummary = formatTripRouteSummary({ summary: report.summary, meta: report.meta }, tripCard);
    const formattedRouteCard = formatUnifiedRouteMessage(reportSummary);

    if (!report.ok) {
      flow.step = "stops";
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        `${formattedRouteCard}\n\n<b>⚠️ Що робити далі</b>\nЗміни проміжні точки або натисни «⏭ Без зупинок», якщо хочеш маршрут без них.`,
        {
          parse_mode: "HTML",
          ...getRouteStopsKeyboard(flow.data.stopSuggestions || [], flow.data.stops || [], flow.mode)
        }
      );
    }

    flow.step = "confirm";
    flow.data.report = {
      ...report
    };
    setFlow(String(ctx.from.id), flow);

    const confirmText = report.reliable
      ? `${formattedRouteCard}\n\n✅ Підтвердити цей маршрут для походу?`
      : `${formattedRouteCard}\n\n⚠️ Цей маршрут виглядає як чернетка. Зберегти його в похід попри попередження?`;

    await ctx.reply(confirmText, { parse_mode: "HTML", ...FLOW_CONFIRM_ROUTE_KEYBOARD });
    return sendInlineTrackPreviewImage(ctx, routeService, report.meta, "Прев’ю згенерованого треку перед підтвердженням маршруту.");
  }

  if (flow.step === "confirm") {
    if (message !== "✅ Підтвердити маршрут") {
      return ctx.reply("Натисни `✅ Підтвердити маршрут` або `❌ Скасувати`.", {
        parse_mode: "Markdown",
        ...FLOW_CONFIRM_ROUTE_KEYBOARD
      });
    }

    const report = flow.data.report;
    const previousTrip = groupService.findGroupByMember(String(ctx.from.id));
    const updatedTrip = groupService.updateRoutePlan({
      groupId: flow.tripId,
      routePlan: {
        from: flow.data.from,
        to: flow.data.to,
        stops: flow.data.stops || [],
        points: [flow.data.from, ...(flow.data.stops || []), flow.data.to],
        summary: report.summary,
        status: report.reliable ? "confirmed" : "draft",
        meta: report.meta || null
      },
      region: flow.data.region
    });
    const actorName = userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx));

    clearFlow(String(ctx.from.id));
    if (hasTripRouteChanged(previousTrip?.routePlan || null, updatedTrip.routePlan)) {
      void notifyTripMembers(
        telegram,
        updatedTrip,
        buildTripRouteChangedNotification(updatedTrip, actorName, previousTrip?.routePlan || null),
        { excludeMemberId: String(ctx.from.id) }
      );
    }
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ МАРШРУТ ЗБЕРЕЖЕНО", updatedTrip.name),
        "",
        `Статус: ${report.reliable ? "підтверджений" : "чернетка"}`,
        `Регіон погоди: ${flow.data.region}`
      ]),
      { parse_mode: "HTML", ...getTripRouteKeyboard(updatedTrip, true) }
    );
    return sendInlineTrackPreviewImage(
      ctx,
      routeService,
      updatedTrip.routePlan?.meta,
      `Прев’ю треку маршруту походу "${updatedTrip.name}".`
    );
  }

  return null;
}

async function handleTripCardFlow(ctx, flow, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Заповнення даних походу скасовано.", getTripKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id)));
  }

  if (flow.step === "startDate") {
    if (!isValidDate(message)) {
      return ctx.reply("Дата має бути у форматі YYYY-MM-DD.\nПриклад: `2026-07-14`", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.startDate = message;
    flow.step = "endDate";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply("Введи дату завершення у форматі YYYY-MM-DD.\nПриклад: `2026-07-16`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  if (flow.step === "endDate") {
    if (!isValidDate(message)) {
      return ctx.reply("Дата має бути у форматі YYYY-MM-DD.\nПриклад: `2026-07-16`", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.endDate = message;
    flow.data.nights = calculateNights(flow.data.startDate, flow.data.endDate);
    flow.step = "gearStatus";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      `Ночівель розраховано автоматично: ${flow.data.nights}\n\nОбери статус готовності спорядження.`,
      FLOW_GEAR_STATUS_KEYBOARD
    );
  }

  if (flow.step === "gearStatus") {
    const normalized = normalizeGearStatus(message);
    if (!["готово", "частково готово", "збираємо"].includes(normalized)) {
      return ctx.reply("Обери один зі статусів кнопками нижче.", FLOW_GEAR_STATUS_KEYBOARD);
    }

    flow.data.gearReadinessStatus = normalized;
    flow.step = "confirm";
    setFlow(String(ctx.from.id), flow);

    return ctx.reply(
      [
        "Перевір дані походу:",
        `• Дати: ${flow.data.startDate} -> ${flow.data.endDate}`,
        `• Ночівлі: ${flow.data.nights}`,
        `• Готовність спорядження: ${flow.data.gearReadinessStatus}`
      ].join("\n"),
      FLOW_CONFIRM_CARD_KEYBOARD
    );
  }

  if (flow.step === "confirm") {
    if (message !== "✅ Зберегти дані походу") {
      return ctx.reply("Натисни `✅ Зберегти дані походу` або `❌ Скасувати`.", {
        parse_mode: "Markdown",
        ...FLOW_CONFIRM_CARD_KEYBOARD
      });
    }

    const previousTrip = groupService.findGroupByMember(String(ctx.from.id));
    const updatedTrip = groupService.setTripCard({
      groupId: flow.tripId,
      tripCard: flow.data
    });
    const snapshot = groupService.getGearSnapshot(updatedTrip.id);
    const actorName = userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx));
    const datesChanged = Boolean(
      previousTrip?.tripCard &&
      (
        previousTrip.tripCard.startDate !== updatedTrip.tripCard?.startDate ||
        previousTrip.tripCard.endDate !== updatedTrip.tripCard?.endDate
      )
    );

    clearFlow(String(ctx.from.id));
    if (datesChanged) {
      void notifyTripMembers(
        telegram,
        updatedTrip,
        buildTripDatesChangedNotification(updatedTrip, actorName, previousTrip.tripCard),
        { excludeMemberId: String(ctx.from.id) }
      );
    }
    return ctx.reply(formatTripCard(updatedTrip, snapshot), { parse_mode: "HTML", ...getTripKeyboard(updatedTrip, String(ctx.from.id)) });
  }

  return null;
}

async function handleTripCreateFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Створення походу скасовано.", getMainKeyboard(ctx));
  }

  if (flow.step === "name") {
    flow.data.name = message;
    flow.step = "startDate";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply("Введи дату початку у форматі YYYY-MM-DD.\nПриклад: `2026-07-14`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  if (flow.step === "startDate") {
    if (!isValidDate(message)) {
      return ctx.reply("Дата має бути у форматі YYYY-MM-DD.\nПриклад: `2026-07-14`", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.startDate = message;
    flow.step = "endDate";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply("Введи дату завершення у форматі YYYY-MM-DD.\nПриклад: `2026-07-16`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  if (flow.step === "endDate") {
    if (!isValidDate(message)) {
      return ctx.reply("Дата має бути у форматі YYYY-MM-DD.\nПриклад: `2026-07-16`", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.endDate = message;
    flow.data.nights = calculateNights(flow.data.startDate, flow.data.endDate);
    flow.step = "gearStatus";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      `Ночівель розраховано автоматично: ${flow.data.nights}\n\nОбери статус готовності спорядження.`,
      FLOW_GEAR_STATUS_KEYBOARD
    );
  }

  if (flow.step === "gearStatus") {
    const normalized = normalizeGearStatus(message);
    if (!["готово", "частково готово", "збираємо"].includes(normalized)) {
      return ctx.reply("Обери один зі статусів кнопками нижче.", FLOW_GEAR_STATUS_KEYBOARD);
    }

    flow.data.gearReadinessStatus = normalized;
    flow.step = "confirm";
    setFlow(String(ctx.from.id), flow);

    return ctx.reply(
      [
        "Перевір дані нового походу:",
        `• Назва: ${flow.data.name}`,
        `• Дати: ${flow.data.startDate} -> ${flow.data.endDate}`,
        `• Ночівлі: ${flow.data.nights}`,
        `• Готовність спорядження: ${flow.data.gearReadinessStatus}`
      ].join("\n"),
      FLOW_CONFIRM_CARD_KEYBOARD
    );
  }

  if (flow.step === "confirm") {
    if (message !== "✅ Зберегти дані походу") {
      return ctx.reply("Натисни `✅ Зберегти дані походу` або `❌ Скасувати`.", {
        parse_mode: "Markdown",
        ...FLOW_CONFIRM_CARD_KEYBOARD
      });
    }

    const creation = groupService.createGroup({
      name: flow.data.name,
      ownerId: String(ctx.from.id),
      ownerName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx))
    });

    if (!creation.ok) {
      clearFlow(String(ctx.from.id));
      return ctx.reply(creation.message, getMainKeyboard(ctx));
    }

    const updatedTrip = groupService.setTripCard({
      groupId: creation.group.id,
      tripCard: {
        startDate: flow.data.startDate,
        endDate: flow.data.endDate,
        nights: flow.data.nights,
        gearReadinessStatus: flow.data.gearReadinessStatus
      }
    });
    const snapshot = groupService.getGearSnapshot(updatedTrip.id);

    clearFlow(String(ctx.from.id));
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ ПОХІД СТВОРЕНО", updatedTrip.name),
        "",
        `Код походу: ${updatedTrip.inviteCode}`,
        "",
        formatTripCard(updatedTrip, snapshot)
      ]),
      { parse_mode: "HTML", ...getTripKeyboard(updatedTrip, String(ctx.from.id)) }
    );
  }

  return null;
}

async function saveDirectTripRoute(ctx, groupService, routeService, userService, telegram, input, mode) {
  const trip = requireManageTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  if (mode === "create" && trip.routePlan) {
    return ctx.reply("У походу вже є маршрут. Можна лише редагувати його.", getTripRouteKeyboard(trip, true));
  }

  if (mode === "edit" && !trip.routePlan) {
    return ctx.reply("У походу ще немає маршруту. Спочатку створи його.", getTripRouteKeyboard(trip, true));
  }

  const points = parseRoutePointsInput(input);
  if (points.length < 2) {
    return startRouteWizard(ctx, groupService, mode);
  }

  const from = points[0];
  const to = points[points.length - 1];
  const stops = points.slice(1, -1);
  const report = await routeService.getRouteReport({ points });

  if (!report.ok) {
    return ctx.reply(
      formatUnifiedRouteMessage({
        summary: report.summary,
        meta: report.meta
      }),
      getTripRouteKeyboard(trip, true)
    );
  }

  const formattedSummary = formatUnifiedRouteMessage({
    summary: report.summary,
    meta: report.meta
  }, trip.tripCard);

  const previousRoutePlan = trip.routePlan || null;
  const updatedTrip = groupService.updateRoutePlan({
    groupId: trip.id,
    routePlan: {
      from,
      to,
      stops,
      points,
      summary: report.summary,
      status: report.reliable ? "confirmed" : "draft",
      meta: report.meta || null
    },
    region: trip.region || from
  });
  const actorName = userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx));

  if (hasTripRouteChanged(previousRoutePlan, updatedTrip.routePlan)) {
    void notifyTripMembers(
      telegram,
      updatedTrip,
      buildTripRouteChangedNotification(updatedTrip, actorName, previousRoutePlan),
      { excludeMemberId: String(ctx.from.id) }
    );
  }
  await ctx.reply(
    report.reliable ? `✅ Маршрут походу збережено.\n\n${formattedSummary}` : `${formattedSummary}\n\n⚠️ Маршрут збережено як чернетку.`,
    getTripRouteKeyboard(updatedTrip, true)
  );
  return sendInlineTrackPreviewImage(
    ctx,
    routeService,
    updatedTrip.routePlan?.meta,
    `Прев’ю треку маршруту походу "${updatedTrip.name}".`
  );
}

async function handleJoinTripFlow(ctx, flow, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim().toUpperCase();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Приєднання до походу скасовано.", getMainKeyboard(ctx));
  }

  const result = groupService.joinGroup(message, {
    id: String(ctx.from.id),
    name: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx))
  });

  clearFlow(String(ctx.from.id));

  if (!result.ok) {
    return ctx.reply(result.message, getTripKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id)));
  }

  void notifyTripMembers(
    telegram,
    result.group,
    buildMemberJoinedNotification(result.group, userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx))),
    { excludeMemberId: String(ctx.from.id) }
  );
  return ctx.reply(`✅ Ти приєднався до походу "${result.group.name}".`, getTripKeyboard(result.group, String(ctx.from.id)));
}

async function handleGrantAccessFlow(ctx, flow, groupService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Надання прав скасовано.", getTripKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id)));
  }

  const index = Number(message);
  const candidate = flow.data.candidates[index - 1];

  if (!candidate) {
    return ctx.reply("Введи номер учасника зі списку.", FLOW_CANCEL_KEYBOARD);
  }

  const result = groupService.grantManagePermission({
    groupId: flow.tripId,
    actorId: String(ctx.from.id),
    targetMemberId: candidate.id
  });

  clearFlow(String(ctx.from.id));

  if (!result.ok) {
    return ctx.reply(result.message, getTripKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id)));
  }

  return ctx.reply(
    `✅ ${candidate.name} тепер має права редагування походу.`,
    getTripKeyboard(result.group, String(ctx.from.id))
  );
}

async function handleGearAddFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Додавання спорядження скасовано.", getTripGearKeyboard());
  }

  if (flow.step === "name") {
    flow.data.name = message;
    flow.data.attributes = {};
    flow.data.fieldIndex = 0;
    flow.step = "quantity";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("➕ ДОДАТИ СПОРЯДЖЕННЯ", flow.data.name),
        "",
        ...buildGearRecognitionSummaryLines(flow.data.name),
        "",
        "Скільки одиниць додати?",
        "Приклад: <code>1</code>"
      ]),
      {
        parse_mode: "HTML",
        ...FLOW_CANCEL_KEYBOARD
      }
    );
  }

  if (flow.step === "quantity") {
    const quantity = Number(message);
    if (!message || Number.isNaN(quantity) || quantity <= 0) {
      return ctx.reply("Введи коректну кількість числом.\nПриклад: `1`", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.quantity = quantity;
    flow.step = "field";
    setFlow(String(ctx.from.id), flow);
    const { field } = getGearFlowField(flow);
    if (!field) {
      flow.step = "save";
    } else {
      return ctx.reply(
        buildGearFieldPromptMessage("➕ ДОДАТИ СПОРЯДЖЕННЯ", flow.data.name, field, flow.data.attributes),
        { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
      );
    }
  }

  if (flow.step === "field" || flow.step === "save") {
    if (flow.step === "field") {
      const { profile, field, fieldIndex } = getGearFlowField(flow);
      if (!field) {
        flow.step = "save";
        setFlow(String(ctx.from.id), flow);
      } else {
        const parsed = parseGearFieldInput(field, message);
        if (!parsed.ok) {
          return ctx.reply(`${parsed.error}\n\nПриклад дивись у підказці вище.`, {
            parse_mode: "HTML",
            ...FLOW_CANCEL_KEYBOARD
          });
        }

        flow.data.attributes = {
          ...(flow.data.attributes || {}),
          [field.key]: parsed.value
        };

        if (profile.fields[fieldIndex + 1]) {
          flow.data.fieldIndex = fieldIndex + 1;
          setFlow(String(ctx.from.id), flow);
          return ctx.reply(
            buildGearFieldPromptMessage(
              "➕ ДОДАТИ СПОРЯДЖЕННЯ",
              flow.data.name,
              profile.fields[fieldIndex + 1],
              flow.data.attributes
            ),
            { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
          );
        }

        flow.step = "save";
      }
    }

    const quantity = flow.data.quantity;
    const scope = flow.data.mode;
    const attributes = { ...(flow.data.attributes || {}) };

    groupService.addGear({
      groupId: flow.tripId,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      gear: {
        name: flow.data.name,
        quantity,
        attributes,
        weightGrams: Number(attributes.weightGrams) || 0,
        season: String(attributes.season || "").trim(),
        details: String(attributes.details || "").trim(),
        note: String(attributes.note || "").trim(),
        shareable: scope === "spare",
        scope
      }
    });

    clearFlow(String(ctx.from.id));

    const labels = {
      shared: "спільне спорядження",
      personal: "особисте спорядження",
      spare: "запасне спорядження"
    };

    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ СПОРЯДЖЕННЯ ДОДАНО", flow.data.name),
        "",
        ...buildGearAttributesSummaryLines(flow.data.name, quantity, attributes, [`Тип: ${labels[scope]}`])
      ]),
      { parse_mode: "HTML", ...getTripGearKeyboard() }
    );
  }

  return null;
}

async function handleGearEditFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (flow.step === "delete_confirm" && message === "❌ Скасувати") {
    flow.step = "action";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", flow.data.item.name),
        "",
        `Тип: ${getTripGearScopeLabel(flow.data.item)}`,
        `Поточна кількість: ${flow.data.item.quantity}`,
        flow.data.item.memberName ? `Додав: ${flow.data.item.memberName}` : null,
        "",
        "Що хочеш зробити з цією позицією?"
      ].filter(Boolean)),
      { parse_mode: "HTML", ...getTripGearEditActionKeyboard() }
    );
  }

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Редагування спорядження скасовано.", getTripGearKeyboard());
  }

  if (flow.step === "pick") {
    const items = flow.data.items || [];
    const numericIndex = Number.parseInt(message, 10);
    const item = items.find((entry) => entry.actionLabel === message)
      || (Number.isInteger(numericIndex) ? items[numericIndex - 1] : null);

    if (!item) {
      return ctx.reply("Обери спорядження кнопкою нижче.", getTripGearEditItemsKeyboard(items));
    }

    flow.step = "action";
    flow.data.item = item;
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", item.name),
        "",
        `Тип: ${getTripGearScopeLabel(item)}`,
        `Поточна кількість: ${item.quantity}`,
        item.memberName ? `Додав: ${item.memberName}` : null,
        "",
        "Що хочеш зробити з цією позицією?"
      ].filter(Boolean)),
      { parse_mode: "HTML", ...getTripGearEditActionKeyboard() }
    );
  }

  if (flow.step === "action") {
    if (message === GEAR_EDIT_BACK_LABEL) {
      flow.step = "pick";
      delete flow.data.item;
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", "Вибір позиції"),
          "",
          "Обери спорядження, яке хочеш змінити."
        ]),
        { parse_mode: "HTML", ...getTripGearEditItemsKeyboard(flow.data.items || []) }
      );
    }

    if (message === GEAR_EDIT_DELETE_LABEL) {
      flow.step = "delete_confirm";
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("🗑 ПІДТВЕРДЖЕННЯ ВИДАЛЕННЯ", flow.data.item.name),
          "",
          `Тип: ${getTripGearScopeLabel(flow.data.item)}`,
          `Кількість: ${flow.data.item.quantity}`,
          flow.data.item.memberName ? `Додав: ${flow.data.item.memberName}` : null,
          "",
          "Підтвердь видалення цієї позиції."
        ].filter(Boolean)),
        { parse_mode: "HTML", ...getGearDeleteConfirmKeyboard() }
      );
    }

    if (message !== GEAR_EDIT_ACTION_LABEL) {
      return ctx.reply("Обери дію кнопкою нижче.", getTripGearEditActionKeyboard());
    }

    flow.step = "quantity";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", flow.data.item.name),
        "",
        `Тип: ${getTripGearScopeLabel(flow.data.item)}`,
        `Поточна кількість: ${flow.data.item.quantity}`,
        "Введи нову кількість.",
        `Щоб просто продовжити редагування без зміни кількості, введи <code>${flow.data.item.quantity}</code>.`,
        "",
        "⚠️ Зверни увагу:",
        "• якщо не хочеш змінювати кількість, просто введи поточне значення"
      ]),
      { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
    );
  }

  if (flow.step === "delete_confirm") {
    if (message !== GEAR_DELETE_CONFIRM_LABEL) {
      return ctx.reply("Натисни кнопку підтвердження або повернись назад.", getGearDeleteConfirmKeyboard());
    }

    const removed = groupService.deleteGear({
      groupId: flow.tripId,
      gearId: flow.data.item.id
    });
    clearFlow(String(ctx.from.id));
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("🗑 СПОРЯДЖЕННЯ ВИДАЛЕНО", removed?.name || flow.data.item.name),
        "",
        "Позицію прибрано зі спорядження походу."
      ]),
      { parse_mode: "HTML", ...getTripGearKeyboard() }
    );
    return showTripGear(ctx, groupService);
  }

  if (flow.step === "quantity") {
    const quantity = Number(message.replace(",", "."));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return ctx.reply("Вкажи додатну кількість числом. Приклад: `1`.", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.quantity = quantity;
    flow.step = "scope";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✏️ ТИП СПОРЯДЖЕННЯ", flow.data.item.name),
        "",
        `Поточний тип: ${getTripGearScopeLabel(flow.data.item)}`,
        "Обери новий тип або залиш без змін.",
        "",
        "⚠️ Зверни увагу:",
        "• це працює тільки для спорядження походу",
        "• тип визначає, чи річ спільна, особиста або доступна для позики"
      ]),
      { parse_mode: "HTML", ...getTripGearScopeKeyboard(true) }
    );
  }

  if (flow.step === "scope") {
    const parsedScope = parseTripGearScopeChoice(message, flow.data.item.scope);
    if (!parsedScope.ok) {
      return ctx.reply(parsedScope.error, getTripGearScopeKeyboard(true));
    }

    flow.data.scope = parsedScope.scope;
    flow.data.shareable = parsedScope.shareable;
    flow.data.attributes = { ...(flow.data.item.attributes || {}) };
    flow.data.fieldIndex = 0;
    flow.step = "field";
    setFlow(String(ctx.from.id), flow);
    const { field } = getGearFlowField({
      ...flow,
      data: {
        ...flow.data,
        name: flow.data.item.name,
        attributes: flow.data.attributes,
        fieldIndex: flow.data.fieldIndex
      }
    });
    if (!field) {
      flow.step = "save";
    } else {
      return ctx.reply(
        buildGearFieldPromptMessage("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", flow.data.item.name, field, flow.data.attributes),
        { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
      );
    }
  }

  if (flow.step === "field" || flow.step === "save") {
    if (flow.step === "field") {
      const profile = resolveGearProfile(flow.data.item.name);
      const fieldIndex = Number(flow.data.fieldIndex) || 0;
      const field = profile.fields[fieldIndex];

      if (!field) {
        flow.step = "save";
        setFlow(String(ctx.from.id), flow);
      } else {
        const parsed = parseGearFieldInput(field, message);
        if (!parsed.ok) {
          return ctx.reply(`${parsed.error}\n\nПриклад дивись у підказці вище.`, {
            parse_mode: "HTML",
            ...FLOW_CANCEL_KEYBOARD
          });
        }

        flow.data.attributes = {
          ...(flow.data.attributes || {}),
          [field.key]: parsed.value
        };

        if (profile.fields[fieldIndex + 1]) {
          flow.data.fieldIndex = fieldIndex + 1;
          setFlow(String(ctx.from.id), flow);
          return ctx.reply(
            buildGearFieldPromptMessage(
              "✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ",
              flow.data.item.name,
              profile.fields[fieldIndex + 1],
              flow.data.attributes
            ),
            { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
          );
        }

        flow.step = "save";
      }
    }

    const attributes = { ...(flow.data.attributes || {}) };
    groupService.updateGear({
      groupId: flow.tripId,
      gearId: flow.data.item.id,
      patch: {
        quantity: flow.data.quantity,
        scope: flow.data.scope,
        shareable: flow.data.shareable,
        attributes,
        weightGrams: Number(attributes.weightGrams) || 0,
        season: String(attributes.season || "").trim(),
        details: String(attributes.details || "").trim(),
        note: String(attributes.note || "").trim()
      }
    });
    clearFlow(String(ctx.from.id));
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ СПОРЯДЖЕННЯ ОНОВЛЕНО", flow.data.item.name),
        "",
        ...buildGearAttributesSummaryLines(
          flow.data.item.name,
          flow.data.quantity,
          attributes,
          [`Тип: ${getTripGearScopeLabel({ ...flow.data.item, scope: flow.data.scope, shareable: flow.data.shareable })}`]
        )
      ]),
      { parse_mode: "HTML", ...getTripGearKeyboard() }
    );
    return showTripGear(ctx, groupService);
  }

  return null;
}

async function handleGearDeleteFlow(ctx, flow, groupService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати" || message === GEAR_DELETE_CANCEL_LABEL) {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Видалення спорядження скасовано.", getTripGearKeyboard());
  }

  if (flow.step === "pick") {
    const index = Number(message);
    const item = flow.data.items[index - 1];

    if (!item) {
      return ctx.reply("Введи номер позиції зі списку.", FLOW_CANCEL_KEYBOARD);
    }

    flow.step = "confirm";
    flow.data.item = item;
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🗑 ПІДТВЕРДЖЕННЯ ВИДАЛЕННЯ", item.name),
        "",
        `Тип: ${getTripGearScopeLabel(item)}`,
        `Кількість: ${item.quantity}`,
        item.memberName ? `Додав: ${item.memberName}` : null,
        "",
        "Підтвердь видалення цієї позиції."
      ].filter(Boolean)),
      { parse_mode: "HTML", ...getGearDeleteConfirmKeyboard() }
    );
  }

  if (flow.step === "confirm") {
    if (message !== GEAR_DELETE_CONFIRM_LABEL) {
      return ctx.reply("Натисни `✅ Так, видалити` або `⬅️ Не видаляти`.", {
        parse_mode: "Markdown",
        ...getGearDeleteConfirmKeyboard()
      });
    }

    const removed = groupService.deleteGear({
      groupId: flow.tripId,
      gearId: flow.data.item.id
    });
    clearFlow(String(ctx.from.id));
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("🗑 СПОРЯДЖЕННЯ ВИДАЛЕНО", removed?.name || flow.data.item.name),
        "",
        "Позицію прибрано зі спорядження походу."
      ]),
      { parse_mode: "HTML", ...getTripGearKeyboard() }
    );
    return showTripGear(ctx, groupService);
  }

  return null;
}

async function handleGearNeedFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Запит на спорядження скасовано.", getTripGearKeyboard());
  }

  if (flow.step === "name") {
    flow.data.name = message;
    flow.step = "quantity";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply("Скільки одиниць тобі потрібно?\nПриклад: `1`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  if (flow.step === "quantity") {
    const quantity = Number(message);
    if (!message || Number.isNaN(quantity) || quantity <= 0) {
      return ctx.reply("Введи коректну кількість числом.\nПриклад: `1`", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    groupService.addGearNeed({
      groupId: flow.tripId,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      need: { name: flow.data.name, quantity, note: "" }
    });

    clearFlow(String(ctx.from.id));
    return ctx.reply(`📌 Запит "${flow.data.name}" додано.`, getTripGearKeyboard());
  }

  return null;
}

async function handleFoodAddFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Додавання продуктів скасовано.", getTripFoodKeyboard());
  }

  if (flow.step === "name") {
    flow.data.name = message;
    flow.step = "weight";
    setFlow(String(ctx.from.id), flow);
    const measureKind = inferFoodMeasureKind(flow.data.name);
    const amountPrompt = measureKind === "volume"
      ? "Для цієї позиції бот очікує <b>обʼєм</b>. Вкажи його у <b>л</b> або <b>мл</b>."
      : measureKind === "weight"
        ? "Для цієї позиції бот очікує <b>вагу</b>. Вкажи її у <b>кг</b> або <b>г</b>."
        : "Вкажи загальну вагу або обʼєм цієї позиції у <b>кг</b>, <b>г</b>, <b>л</b> або <b>мл</b>.";
    const amountExample = measureKind === "volume"
      ? "Приклад: <b>1.5 л</b> або <b>750 мл</b>"
      : measureKind === "weight"
        ? "Приклад: <b>800 г</b> або <b>1.2 кг</b>"
        : "Приклад: <b>800 г</b>, <b>1.2 кг</b>, <b>500 мл</b> або <b>2 л</b>";
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🥘 ДОДАТИ ПРОДУКТ", flow.data.name),
        "",
        amountPrompt,
        "",
        amountExample,
        "",
        "⚠️ Зверни увагу:",
        "• якщо точну вагу або обʼєм не знаєш, введи <b>0 г</b>"
      ]),
      { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
    );
  }

  if (flow.step === "weight") {
    const measureKind = inferFoodMeasureKind(flow.data.name);
    const amount = parseFoodAmountInput(message, measureKind);
    if (!amount) {
      const errorText = measureKind === "volume"
        ? "Введи обʼєм у форматі `1.5 л` або `750 мл`."
        : measureKind === "weight"
          ? "Введи вагу у форматі `800 г` або `1.2 кг`."
          : "Введи вагу або обʼєм у форматі `800 г`, `1.2 кг`, `500 мл` або `2 л`.";
      return ctx.reply(errorText, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.weightGrams = amount.weightGrams;
    flow.data.amountLabel = amount.amountLabel;
    flow.step = "quantity";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply("Яку кількість додати?\nПриклад: `2 пачки`, `4 шт`, `1 упаковка`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  if (flow.step === "quantity") {
    flow.data.quantity = message;
    flow.step = "cost";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply("Яка вартість цієї позиції у гривнях?\nПриклад: `180`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  if (flow.step === "cost") {
    const cost = Number(String(message).replace(",", "."));

    if (!message || Number.isNaN(cost) || cost < 0) {
      return ctx.reply("Введи коректну вартість числом.\nПриклад: `180`", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    groupService.addFood({
      groupId: flow.tripId,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      food: {
        name: flow.data.name,
        amountLabel: flow.data.amountLabel,
        weightGrams: flow.data.weightGrams,
        quantity: flow.data.quantity,
        cost
      }
    });

    clearFlow(String(ctx.from.id));
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ ПРОДУКТ ДОДАНО", flow.data.name),
        "",
        `Вага / обʼєм: ${flow.data.amountLabel || formatWeightGrams(flow.data.weightGrams)}`,
        `Кількість: ${flow.data.quantity}`,
        `Вартість: ${formatMoney(cost)}`
      ]),
      { parse_mode: "HTML", ...getTripFoodKeyboard() }
    );
  }

  return null;
}

async function handleFoodDeleteFlow(ctx, flow, groupService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Видалення продукту скасовано.", getTripFoodKeyboard());
  }

  if (flow.step === "pick") {
    const index = Number.parseInt(message, 10);
    if (!Number.isInteger(index) || index < 1 || index > flow.data.items.length) {
      return ctx.reply(
        `Введи номер позиції від 1 до ${flow.data.items.length}.`,
        FLOW_CANCEL_KEYBOARD
      );
    }

    const item = flow.data.items[index - 1];
    const removed = groupService.deleteFood({
      groupId: flow.tripId,
      foodId: item.id
    });

    clearFlow(String(ctx.from.id));

    if (!removed) {
      return ctx.reply(
        "Не вдалося знайти цю позицію. Спробуй ще раз відкрити список харчування.",
        getTripFoodKeyboard()
      );
    }

    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ ПРОДУКТ ВИДАЛЕНО", removed.name),
        "",
        `Вага / обʼєм: ${removed.amountLabel || formatWeightGrams(removed.weightGrams)}`,
        `Кількість: ${removed.quantity || "—"}`,
        `Вартість: ${formatMoney(removed.cost)}`
      ]),
      { parse_mode: "HTML", ...getTripFoodKeyboard() }
    );

    return showTripFood(ctx, groupService, userService);
  }

  return null;
}

async function handleExpenseAddFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Додавання витрати скасовано.", getTripExpensesKeyboard());
  }

  if (flow.step === "title") {
    flow.data.title = message;
    flow.step = "quantity";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply("Введи кількість.\nПриклад: `2` або `1`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  if (flow.step === "quantity") {
    const quantity = Number(String(message).replace(",", "."));

    if (!message || Number.isNaN(quantity) || quantity <= 0) {
      return ctx.reply("Введи коректну кількість числом.\nПриклад: `2`", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.quantity = quantity;
    flow.step = "price";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply("Введи ціну за одиницю у гривнях.\nПриклад: `450`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  if (flow.step === "price") {
    const price = Number(String(message).replace(",", "."));

    if (!message || Number.isNaN(price) || price < 0) {
      return ctx.reply("Введи коректну ціну числом.\nПриклад: `450`", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    const amount = flow.data.quantity * price;

    groupService.addExpense({
      groupId: flow.tripId,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      expense: {
        title: flow.data.title,
        quantity: flow.data.quantity,
        price,
        amount,
      }
    });

    clearFlow(String(ctx.from.id));
    return ctx.reply(`✅ Витрату "${flow.data.title}" додано.`, getTripExpensesKeyboard());
  }

  return null;
}

async function handleFaqFlow(ctx, flow, advisorService) {
  const message = ctx.message.text.trim();
  const questions = flow.data?.questions || [];

  if (message === FAQ_REFRESH_LABEL) {
    return showFaqMenu(ctx, advisorService, flow.data?.previousIds || []);
  }

  if (message === "⬅️ Головне меню") {
    clearFlow(String(ctx.from.id));
    return sendHome(ctx);
  }

  const selectedQuestion = questions.find((item) => item.question === message);
  if (!selectedQuestion) {
    return ctx.reply("Обери питання кнопкою нижче або натисни `🔄 Інші питання`.", {
      parse_mode: "Markdown",
      ...getFaqKeyboard(questions)
    });
  }

  return ctx.reply(advisorService.getFaqAnswer(selectedQuestion.id), getFaqKeyboard(questions));
}

async function handleHelpFlow(ctx, flow) {
  const message = ctx.message.text.trim();

  if (message === "⬅️ Головне меню") {
    clearFlow(String(ctx.from.id));
    return sendHome(ctx);
  }

  if (message === HELP_BACK_LABEL) {
    return sendHelp(ctx);
  }

  if (!HELP_SECTIONS.includes(message)) {
    return ctx.reply("Обери розділ допомоги кнопкою нижче.", getHelpMenuKeyboard());
  }

  flow.step = "section";
  flow.data = {
    ...flow.data,
    section: message
  };
  setFlow(String(ctx.from.id), flow);

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("ℹ️ ДОПОМОГА", message),
      "",
      HELP_CONTENT[message] || "Пояснення для цього розділу поки не додано."
    ]),
    { parse_mode: "HTML", ...getHelpSectionKeyboard() }
  );
}

async function handleProfileEditFlow(ctx, flow, userService) {
  const message = ctx.message.text.trim();

  if (message === PROFILE_BACK_LABEL || message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return showProfileMenu(ctx, userService);
  }

  const fieldConfig = PROFILE_EDIT_FIELDS.find((item) => item.key === flow.step);
  if (!fieldConfig) {
    clearFlow(String(ctx.from.id));
    return showProfileMenu(ctx, userService);
  }

  if (message !== PROFILE_SKIP_LABEL) {
    flow.data[fieldConfig.key] = message;
  }

  const currentIndex = PROFILE_EDIT_FIELDS.findIndex((item) => item.key === fieldConfig.key);
  const nextField = PROFILE_EDIT_FIELDS[currentIndex + 1];

  if (!nextField) {
    userService.updateProfile({
      userId: String(ctx.from.id),
      userName: getUserLabel(ctx),
      patch: flow.data
    });
    clearFlow(String(ctx.from.id));
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ ПРОФІЛЬ ОНОВЛЕНО", getUserLabel(ctx)),
        "",
        "Анкету збережено. Тепер ці дані можна використовувати в походах."
      ]),
      { parse_mode: "HTML", ...getProfileKeyboard() }
    );
    return showProfileAbout(ctx, userService);
  }

  flow.step = nextField.key;
  setFlow(String(ctx.from.id), flow);
  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("✏️ РЕДАГУВАННЯ ПРОФІЛЮ", "Наступне поле"),
      "",
      nextField.prompt,
      "",
      "⚠️ Зверни увагу:",
      "• можна пропустити поле, якщо заповниш його пізніше"
    ]),
    { parse_mode: "HTML", ...getProfileEditKeyboard() }
  );
}

async function handleMyGearAddFlow(ctx, flow, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return showMyGearMenu(ctx);
  }

  if (flow.step === "name") {
    flow.data.name = message;
    flow.data.attributes = {};
    flow.data.fieldIndex = 0;
    flow.step = "quantity";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("➕ ДОДАТИ МОЄ СПОРЯДЖЕННЯ", flow.data.name),
        "",
        "Вкажи кількість.",
        "",
        "Приклад: <b>1</b>"
      ]),
      { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
    );
  }

  if (flow.step === "quantity") {
    const quantity = Number(message.replace(",", "."));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return ctx.reply("Вкажи нормальну кількість числом. Приклад: `1`", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.quantity = quantity;
    flow.step = "field";
    setFlow(String(ctx.from.id), flow);
    const { field } = getGearFlowField(flow);
    if (!field) {
      flow.step = "save";
    } else {
      return ctx.reply(
        buildGearFieldPromptMessage("➕ ДОДАТИ МОЄ СПОРЯДЖЕННЯ", flow.data.name, field, flow.data.attributes),
        { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
      );
    }
  }

  if (flow.step === "field" || flow.step === "save") {
    if (flow.step === "field") {
      const { profile, field, fieldIndex } = getGearFlowField(flow);
      if (!field) {
        flow.step = "save";
        setFlow(String(ctx.from.id), flow);
      } else {
        const parsed = parseGearFieldInput(field, message);
        if (!parsed.ok) {
          return ctx.reply(`${parsed.error}\n\nПриклад дивись у підказці вище.`, {
            parse_mode: "HTML",
            ...FLOW_CANCEL_KEYBOARD
          });
        }

        flow.data.attributes = {
          ...(flow.data.attributes || {}),
          [field.key]: parsed.value
        };

        if (profile.fields[fieldIndex + 1]) {
          flow.data.fieldIndex = fieldIndex + 1;
          setFlow(String(ctx.from.id), flow);
          return ctx.reply(
            buildGearFieldPromptMessage(
              "➕ ДОДАТИ МОЄ СПОРЯДЖЕННЯ",
              flow.data.name,
              profile.fields[fieldIndex + 1],
              flow.data.attributes
            ),
            { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
          );
        }

        flow.step = "save";
      }
    }

    const attributes = { ...(flow.data.attributes || {}) };
    userService.addPersonalGear({
      userId: String(ctx.from.id),
      userName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      gear: {
        name: flow.data.name,
        quantity: flow.data.quantity,
        attributes,
        note: String(attributes.note || "").trim(),
        details: String(attributes.details || "").trim(),
        season: String(attributes.season || "").trim(),
        weightGrams: Number(attributes.weightGrams) || 0
      }
    });
    clearFlow(String(ctx.from.id));
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ СПОРЯДЖЕННЯ ДОДАНО", flow.data.name),
        "",
        ...buildGearAttributesSummaryLines(flow.data.name, flow.data.quantity, attributes)
      ]),
      { parse_mode: "HTML", ...MY_GEAR_KEYBOARD }
    );
    return showMyGear(ctx, userService);
  }

  return null;
}

async function handleMyGearEditFlow(ctx, flow, userService) {
  const message = ctx.message.text.trim();

  if (flow.step === "delete_confirm" && message === "❌ Скасувати") {
    flow.step = "action";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ", flow.data.item.name),
        "",
        `Поточна кількість: ${flow.data.item.quantity}`,
        "",
        "Що хочеш зробити з цією річчю?"
      ]),
      { parse_mode: "HTML", ...getTripGearEditActionKeyboard() }
    );
  }

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return showMyGearMenu(ctx);
  }

  if (flow.step === "pick") {
    const items = flow.data.items || [];
    const numericIndex = Number.parseInt(message, 10);
    const item = items.find((entry) => entry.actionLabel === message)
      || (Number.isInteger(numericIndex) ? items[numericIndex - 1] : null);

    if (!item) {
      return ctx.reply("Обери річ кнопкою нижче.", getTripGearEditItemsKeyboard(items));
    }

    flow.step = "action";
    flow.data.item = item;
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ", item.name),
        "",
        `Поточна кількість: ${item.quantity}`,
        "",
        "Що хочеш зробити з цією річчю?"
      ]),
      { parse_mode: "HTML", ...getTripGearEditActionKeyboard() }
    );
  }

  if (flow.step === "action") {
    if (message === GEAR_EDIT_BACK_LABEL) {
      flow.step = "pick";
      delete flow.data.item;
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ", "Вибір речі"),
          "",
          "Обери річ, яку хочеш змінити."
        ]),
        { parse_mode: "HTML", ...getTripGearEditItemsKeyboard(flow.data.items || []) }
      );
    }

    if (message === GEAR_EDIT_DELETE_LABEL) {
      flow.step = "delete_confirm";
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("🗑 ПІДТВЕРДЖЕННЯ ВИДАЛЕННЯ", flow.data.item.name),
          "",
          `Кількість: ${flow.data.item.quantity}`,
          "",
          "Підтвердь видалення цієї речі."
        ]),
        { parse_mode: "HTML", ...getGearDeleteConfirmKeyboard() }
      );
    }

    if (message !== GEAR_EDIT_ACTION_LABEL) {
      return ctx.reply("Обери дію кнопкою нижче.", getTripGearEditActionKeyboard());
    }

    flow.step = "quantity";
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ", flow.data.item.name),
        "",
        `Поточна кількість: ${flow.data.item.quantity}`,
        "Введи нову кількість.",
        `Щоб просто продовжити редагування без зміни кількості, введи <code>${flow.data.item.quantity}</code>.`
      ]),
      { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
    );
  }

  if (flow.step === "delete_confirm") {
    if (message !== GEAR_DELETE_CONFIRM_LABEL) {
      return ctx.reply("Натисни кнопку підтвердження або повернись назад.", getGearDeleteConfirmKeyboard());
    }

    const removed = userService.deletePersonalGear({
      userId: String(ctx.from.id),
      userName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      gearId: flow.data.item.id
    });
    clearFlow(String(ctx.from.id));
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("🗑 СПОРЯДЖЕННЯ ВИДАЛЕНО", removed.name),
        "",
        "Річ прибрана з твого особистого списку."
      ]),
      { parse_mode: "HTML", ...MY_GEAR_KEYBOARD }
    );
    return showMyGear(ctx, userService);
  }

  if (flow.step === "quantity") {
    const quantity = Number(message.replace(",", "."));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return ctx.reply("Вкажи додатну кількість числом. Приклад: `1`.", {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.quantity = quantity;
    flow.data.attributes = { ...(flow.data.item.attributes || {}) };
    flow.data.fieldIndex = 0;
    flow.step = "field";
    setFlow(String(ctx.from.id), flow);
    const { field } = getGearFlowField({
      ...flow,
      data: {
        ...flow.data,
        name: flow.data.item.name,
        attributes: flow.data.attributes,
        fieldIndex: flow.data.fieldIndex
      }
    });
    if (!field) {
      flow.step = "save";
    } else {
      return ctx.reply(
        buildGearFieldPromptMessage("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", flow.data.item.name, field, flow.data.attributes),
        { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
      );
    }
  }

  if (flow.step === "field" || flow.step === "save") {
    if (flow.step === "field") {
      const profile = resolveGearProfile(flow.data.item.name);
      const fieldIndex = Number(flow.data.fieldIndex) || 0;
      const field = profile.fields[fieldIndex];

      if (!field) {
        flow.step = "save";
        setFlow(String(ctx.from.id), flow);
      } else {
        const parsed = parseGearFieldInput(field, message);
        if (!parsed.ok) {
          return ctx.reply(`${parsed.error}\n\nПриклад дивись у підказці вище.`, {
            parse_mode: "HTML",
            ...FLOW_CANCEL_KEYBOARD
          });
        }

        flow.data.attributes = {
          ...(flow.data.attributes || {}),
          [field.key]: parsed.value
        };

        if (profile.fields[fieldIndex + 1]) {
          flow.data.fieldIndex = fieldIndex + 1;
          setFlow(String(ctx.from.id), flow);
          return ctx.reply(
            buildGearFieldPromptMessage(
              "✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ",
              flow.data.item.name,
              profile.fields[fieldIndex + 1],
              flow.data.attributes
            ),
            { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
          );
        }

        flow.step = "save";
      }
    }

    const attributes = { ...(flow.data.attributes || {}) };
    userService.updatePersonalGear({
      userId: String(ctx.from.id),
      userName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      gearId: flow.data.item.id,
      patch: {
        quantity: flow.data.quantity,
        attributes,
        weightGrams: Number(attributes.weightGrams) || 0,
        season: String(attributes.season || "").trim(),
        details: String(attributes.details || "").trim(),
        note: String(attributes.note || "").trim()
      }
    });
    clearFlow(String(ctx.from.id));
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ СПОРЯДЖЕННЯ ОНОВЛЕНО", flow.data.item.name),
        "",
        ...buildGearAttributesSummaryLines(flow.data.item.name, flow.data.quantity, attributes)
      ]),
      { parse_mode: "HTML", ...MY_GEAR_KEYBOARD }
    );
    return showMyGear(ctx, userService);
  }

  return null;
}

async function handleTripMemberListFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    clearFlow(String(ctx.from.id));
    return null;
  }

  if (message === TRIP_MEMBERS_BACK_LABEL) {
    clearFlow(String(ctx.from.id));
    return showTripMembersMenu(ctx, groupService, userService);
  }

  if (message === "⬅️ До походу") {
    clearFlow(String(ctx.from.id));
    return showTripMenu(ctx, groupService);
  }

  const items = flow.data?.items || [];
  const selected = items.find((item) => item.label === message);
  if (!selected) {
    return ctx.reply("Обери учасника кнопкою нижче.", getTripMembersListKeyboard(items));
  }

  return showTripMemberDetails(ctx, groupService, userService, trip, selected.id, items);
}

async function handleVpohidSearchFlow(ctx, flow, vpohidLiveService, routeService, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim();
  const mode = getVpohidFlowMode(flow);
  const backLabel = getVpohidBackLabel(mode);
  const parentContext = getFlowParentContext(flow);

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return showParentMenuByContext(ctx, groupService, parentContext)
      || (mode === "trip"
        ? ctx.reply("Пошук готового маршруту скасовано.", getTripRouteKeyboard(groupService.findGroupByMember(String(ctx.from.id)), canManageTrip(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id))))
        : ctx.reply("Пошук готового маршруту скасовано.", getRoutesMenuKeyboard(ctx.from.id)));
  }

  if (flow.step === "query") {
    await ctx.reply("Шукаю маршрути на vpohid.com.ua...");

    let matches = [];
    let searchFailed = false;
    let searchDone = false;
    const progressTimer1 = setTimeout(() => {
      if (!searchDone) {
        ctx.reply("Ще шукаю маршрути, це може зайняти трохи часу...");
      }
    }, 2500);
    const progressTimer2 = setTimeout(() => {
      if (!searchDone) {
        ctx.reply("Ще трошки, індексую маршрути на vpohid.com.ua...");
      }
    }, 6000);

    try {
      matches = await vpohidLiveService.searchRoutes(message);
    } catch {
      searchFailed = true;
    } finally {
      searchDone = true;
      clearTimeout(progressTimer1);
      clearTimeout(progressTimer2);
    }

    if (!matches.length) {
      return ctx.reply(
        `${formatVpohidSearchResults(message, matches)}\n\n${
          searchFailed
            ? "vpohid.com.ua зараз не віддав результати. Спробуй ще раз трохи пізніше або зміни запит."
            : "Спробуй іншу назву або коротший фрагмент."
        }`,
        {
          parse_mode: "HTML",
          ...(mode === "trip"
            ? getVpohidSearchKeyboard(mode)
            : getRoutesMenuKeyboard(ctx.from.id))
        }
      );
    }

    flow.step = "results";
    flow.data = {
      ...flow.data,
      query: message,
      matches: matches.slice(0, VPOHID_RESULTS_LIMIT).map((route, index) => ({
        id: route.id,
        title: route.title,
        buttonLabel: buildVpohidResultButton(route, index)
      }))
    };
    setFlow(String(ctx.from.id), flow);

    const prefix = "";
    return ctx.reply(`${prefix}${formatVpohidSearchResults(message, matches)}`, { parse_mode: "HTML", ...getVpohidResultsKeyboard(matches, mode) });
  }

  if (flow.step === "catalog_loading") {
    return true;
  }

  if (flow.step === "results") {
    if (message === "🔎 Повернутися до пошуку") {
      clearFlow(String(ctx.from.id));
      return showVpohidCatalogMenu(ctx, groupService, mode);
    }

    if (message === backLabel) {
      clearFlow(String(ctx.from.id));
      if (mode === "trip") {
        return showRouteMenu(ctx, groupService);
      }
      return showRoutesMenu(ctx);
    }

    const selected = (flow.data?.matches || []).find((item) => item.buttonLabel === message);
    if (!selected) {
      return ctx.reply(
        "Обери маршрут кнопкою зі списку нижче або повернися до пошуку.",
        getVpohidResultsKeyboard(flow.data?.matches || [], mode)
      );
    }

    await ctx.reply("Завантажую деталі маршруту з vpohid і готую точки для треку...");

    let detail = null;
    let report = null;

    try {
      detail = await vpohidLiveService.getRouteDetail(selected.id, { forceRefresh: true });
      ({ report } = await buildVpohidRouteSelection(detail, routeService, vpohidLiveService));
    } catch {
      return ctx.reply(
        "Не вдалося відкрити цей маршрут на vpohid.com.ua. Спробуй інший або запусти пошук ще раз.",
        mode === "trip" ? getVpohidSearchKeyboard(mode) : getRoutesMenuKeyboard(ctx.from.id)
      );
    }

    if (mode !== "trip") {
      const activeTrip = groupService.findGroupByMember(String(ctx.from.id));
      vpohidSelections.set(String(ctx.from.id), {
        detail,
        report: report || null,
        sourceMode: "live",
        mode,
        selectedAt: new Date().toISOString()
      });
      clearFlow(String(ctx.from.id));
      if (report?.ok) {
        await ctx.reply(
          formatUnifiedRouteMessage(
            { summary: report.summary, meta: report.meta },
            activeTrip?.tripCard || null
          ),
          { parse_mode: "HTML", ...getVpohidDetailsKeyboard(mode) }
        );
        return sendInlineTrackPreviewImage(ctx, routeService, report.meta, `Прев’ю треку для "${detail.title}".`);
      }
      return ctx.reply("Для цього маршруту поки не вдалося підготувати придатний трек.", getVpohidDetailsKeyboard(mode));
    }

    flow.step = "preview";
    flow.data = {
      ...flow.data,
      query: flow.data?.query || "",
      matches: flow.data?.matches || [],
      selectedId: selected.id,
      detail,
      report
    };
    setFlow(String(ctx.from.id), flow);

    await ctx.reply(formatVpohidRoutePreview(detail, report), { parse_mode: "HTML", ...getVpohidPreviewKeyboard(mode) });
    if (report?.ok) {
      return sendInlineTrackPreviewImage(ctx, routeService, report.meta, `Прев’ю треку для "${detail.title}".`);
    }
    return null;
  }

  if (flow.step === "catalog_results") {
    const currentPage = Number.isInteger(flow.data?.page) ? flow.data.page : 0;
    const pageStart = currentPage * VPOHID_RESULTS_LIMIT;
    const pageMatches = (flow.data?.matches || []).slice(pageStart, pageStart + VPOHID_RESULTS_LIMIT);
    const totalPages = Math.max(1, Math.ceil((flow.data?.matches || []).length / VPOHID_RESULTS_LIMIT));

    if (message === VPOHID_PREV_PAGE_LABEL || message === VPOHID_NEXT_PAGE_LABEL) {
      const nextPage = message === VPOHID_PREV_PAGE_LABEL ? currentPage - 1 : currentPage + 1;
      flow.data = {
        ...flow.data,
        page: Math.max(0, Math.min(nextPage, totalPages - 1))
      };
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        formatVpohidCatalogResults(flow.data?.matches || [], flow.data.page),
        { parse_mode: "HTML", ...getVpohidCatalogKeyboard(flow.data?.matches || [], mode, flow.data.page) }
      );
    }

    if (message === "🔎 Повернутися до пошуку") {
      clearFlow(String(ctx.from.id));
      return showVpohidCatalogMenu(ctx, groupService, mode);
    }

    if (message === backLabel) {
      clearFlow(String(ctx.from.id));
      if (mode === "trip") {
        return showRouteMenu(ctx, groupService);
      }
      return showRoutesMenu(ctx);
    }

    const selected = pageMatches.find((item) => item.buttonLabel === message);
    if (!selected) {
      return ctx.reply(
        "Обери маршрут кнопкою зі списку нижче або перегорни сторінку каталогу.",
        getVpohidCatalogKeyboard(flow.data?.matches || [], mode, currentPage)
      );
    }

    await ctx.reply("Завантажую деталі маршруту з каталогу і готую точки для треку...");

    let detail = null;
    let report = null;

    try {
      detail = await vpohidLiveService.getRouteDetail(selected.id, { forceRefresh: true });
      ({ report } = await buildVpohidRouteSelection(detail, routeService, vpohidLiveService));
    } catch {
      return ctx.reply(
        "Не вдалося відкрити цей маршрут у каталозі. Спробуй інший або повернися до пошуку.",
        getVpohidCatalogKeyboard(flow.data?.matches || [], mode, currentPage)
      );
    }

    if (mode !== "trip") {
      const activeTrip = groupService.findGroupByMember(String(ctx.from.id));
      vpohidSelections.set(String(ctx.from.id), {
        detail,
        report: report || null,
        sourceMode: "live",
        mode,
        selectedAt: new Date().toISOString()
      });
      clearFlow(String(ctx.from.id));
      if (report?.ok) {
        await ctx.reply(
          formatUnifiedRouteMessage(
            { summary: report.summary, meta: report.meta },
            activeTrip?.tripCard || null
          ),
          { parse_mode: "HTML", ...getVpohidDetailsKeyboard(mode) }
        );
        return sendInlineTrackPreviewImage(ctx, routeService, report.meta, `Прев’ю треку для "${detail.title}".`);
      }
      return ctx.reply("Для цього маршруту поки не вдалося підготувати придатний трек.", getVpohidDetailsKeyboard(mode));
    }

    flow.step = "preview";
    flow.data = {
      ...flow.data,
      selectedId: selected.id,
      detail,
      report
    };
    setFlow(String(ctx.from.id), flow);

    await ctx.reply(formatVpohidRoutePreview(detail, report), { parse_mode: "HTML", ...getVpohidPreviewKeyboard(mode) });
    if (report?.ok) {
      return sendInlineTrackPreviewImage(ctx, routeService, report.meta, `Прев’ю треку для "${detail.title}".`);
    }
    return null;
  }

  if (flow.step === "preview") {
    if (message === "🔎 Повернутися до пошуку") {
      clearFlow(String(ctx.from.id));
      return showVpohidCatalogMenu(ctx, groupService, mode);
    }

    if (message === backLabel) {
      clearFlow(String(ctx.from.id));
      if (mode === "trip") {
        return showRouteMenu(ctx, groupService);
      }
      return showRoutesMenu(ctx);
    }

    const confirmLabel = mode === "trip" ? VPOHID_SAVE_TO_TRIP_LABEL : VPOHID_PICK_LABEL;

    if (message !== confirmLabel) {
      return ctx.reply(`Натисни \`${confirmLabel}\` або повернися до пошуку.`, {
        parse_mode: "Markdown",
        ...getVpohidPreviewKeyboard(mode)
      });
    }

    if (mode === "trip") {
      const trip = requireManageTrip(ctx, groupService);
      if (!trip || trip.id !== flow.tripId) {
        clearFlow(String(ctx.from.id));
        return ctx.reply("Активний похід змінився. Відкрий маршрут походу ще раз.", getTripKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id)));
      }

      if (!flow.data.report?.ok) {
        return ctx.reply("Для цього маршруту не вдалося підготувати придатний трек. Спробуй інший маршрут або повернися до пошуку.", getVpohidPreviewKeyboard(mode));
      }

      const report = flow.data.report;
      const detail = flow.data.detail;
      const vpohidDetail = {
        title: detail.title || "",
        subtitle: detail.subtitle || "",
        distance: detail.distance || "",
        duration: detail.duration || "",
        level: detail.level || "",
        start: detail.start || "",
        finish: detail.finish || "",
        peaks: Array.isArray(detail.peaks) ? detail.peaks : [],
        interesting: Array.isArray(detail.interesting) ? detail.interesting : [],
        weatherSettlements: Array.isArray(detail.weatherSettlements) ? detail.weatherSettlements : [],
        description: detail.description || "",
        url: detail.url || ""
      };
      const previousRoutePlan = trip.routePlan || null;
      const updatedTrip = groupService.updateRoutePlan({
        groupId: trip.id,
        routePlan: {
          from: report.meta?.from || detail.start || detail.points?.[0] || "Старт",
          to: report.meta?.to || detail.finish || detail.points?.[detail.points.length - 1] || "Фініш",
          stops: report.meta?.stops || detail.points?.slice(1, -1) || [],
          points: report.meta?.points || detail.points || [],
          summary: report.summary,
          status: report.reliable ? "confirmed" : "draft",
          meta: {
            ...(report.meta || {}),
            vpohidDetail
          },
          source: "vpohid",
          sourceRouteId: detail.id || null,
          sourceUrl: detail.url || null,
          sourceTitle: detail.title || null
        },
        region: Array.isArray(detail.weatherSettlements) && detail.weatherSettlements.length
          ? detail.weatherSettlements[0]
          : trip.region || report.meta?.from || detail.start
      });
      const actorName = userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx));

      clearFlow(String(ctx.from.id));
      if (hasTripRouteChanged(previousRoutePlan, updatedTrip.routePlan)) {
        void notifyTripMembers(
          telegram,
          updatedTrip,
          buildTripRouteChangedNotification(updatedTrip, actorName, previousRoutePlan),
          { excludeMemberId: String(ctx.from.id) }
        );
      }
      await ctx.reply(
        joinRichLines([
          ...formatCardHeader("✅ МАРШРУТ ЗБЕРЕЖЕНО", updatedTrip.name),
          "",
          `Статус: ${report.reliable ? "підтверджений" : "чернетка"}`,
          `Регіон погоди: ${updatedTrip.region || "не задано"}`
        ]),
        { parse_mode: "HTML", ...getTripRouteKeyboard(updatedTrip, true) }
      );
      const snapshot = groupService.getGearSnapshot(updatedTrip.id);
      await ctx.reply(
        `${formatUnifiedRouteMessage(updatedTrip.routePlan, updatedTrip.tripCard)}\n\n${formatTripCard(updatedTrip, snapshot)}\n\n<b>🆘 Безпека:</b> відкрий розділ «Безпека походу» для контактів рятувальників у регіоні.`,
        { parse_mode: "HTML", ...getTripRouteKeyboard(updatedTrip, true) }
      );
      return sendInlineTrackPreviewImage(ctx, routeService, updatedTrip.routePlan.meta, `Прев’ю треку маршруту походу "${updatedTrip.name}".`);
    }

    vpohidSelections.set(String(ctx.from.id), {
      detail: flow.data.detail,
      report: flow.data.report || null,
      sourceMode: "live",
      mode,
      selectedAt: new Date().toISOString()
    });
    clearFlow(String(ctx.from.id));
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ МАРШРУТ ВІДКРИТО", flow.data.detail.title),
        "",
        "Деталі та трек готові до перегляду."
      ]),
      { parse_mode: "HTML", ...getVpohidDetailsKeyboard(mode) }
    );
    await ctx.reply(formatVpohidChosenRoute({
      detail: flow.data.detail,
      report: flow.data.report || null,
      points: flow.data.detail?.points || []
    }), { parse_mode: "HTML", ...getVpohidDetailsKeyboard(mode) });
    if (flow.data.report?.ok) {
      await ctx.reply(
        formatUnifiedRouteMessage({
          summary: flow.data.report.summary,
          meta: flow.data.report.meta
        }),
        { parse_mode: "HTML", ...getVpohidDetailsKeyboard(mode) }
      );
      return sendInlineTrackPreviewImage(ctx, routeService, flow.data.report.meta, `Прев’ю треку для "${flow.data.detail.title}".`);
    }
    return null;
  }

  return null;
}

async function handleActiveFlow(ctx, groupService, routeService, vpohidLiveService, weatherService, advisorService, userService, telegram = null) {
  const flow = getFlow(String(ctx.from.id));
  if (!flow) {
    return false;
  }

  if (!ctx.message?.text || ctx.message.text.startsWith("/")) {
    return false;
  }

  if (flow.type === "route") {
    await handleRouteFlow(ctx, flow, groupService, routeService, userService, telegram);
    return true;
  }

  if (flow.type === "trip_card") {
    await handleTripCardFlow(ctx, flow, groupService, userService, telegram);
    return true;
  }

  if (flow.type === "trip_create") {
    await handleTripCreateFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "join_trip") {
    await handleJoinTripFlow(ctx, flow, groupService, userService, telegram);
    return true;
  }

  if (flow.type === "grant_access") {
    await handleGrantAccessFlow(ctx, flow, groupService);
    return true;
  }

  if (flow.type === "gear_add") {
    await handleGearAddFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "gear_edit") {
    await handleGearEditFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "gear_delete") {
    await handleGearDeleteFlow(ctx, flow, groupService);
    return true;
  }

  if (flow.type === "gear_need") {
    await handleGearNeedFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "food_add") {
    await handleFoodAddFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "food_delete") {
    await handleFoodDeleteFlow(ctx, flow, groupService);
    return true;
  }

  if (flow.type === "trip_history") {
    await handleTripHistoryFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "expense_add") {
    await handleExpenseAddFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "faq_menu") {
    await handleFaqFlow(ctx, flow, advisorService);
    return true;
  }

  if (flow.type === "help_menu") {
    await handleHelpFlow(ctx, flow);
    return true;
  }

  if (flow.type === "profile_edit") {
    await handleProfileEditFlow(ctx, flow, userService);
    return true;
  }

  if (flow.type === "my_gear_add") {
    await handleMyGearAddFlow(ctx, flow, userService);
    return true;
  }

  if (flow.type === "my_gear_edit") {
    await handleMyGearEditFlow(ctx, flow, userService);
    return true;
  }

  if (flow.type === "trip_member_list") {
    await handleTripMemberListFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "vpohid_search") {
    await handleVpohidSearchFlow(ctx, flow, vpohidLiveService, routeService, groupService, userService, telegram);
    return true;
  }

  if (flow.type === "trip_weather_pick") {
    const trip = groupService.findGroupByMember(String(ctx.from.id));
    const settlements = flow.data?.settlements || [];
    const message = ctx.message.text.trim();

    if (message === TRIP_WEATHER_BACK_LABEL || message === "❌ Скасувати") {
      clearFlow(String(ctx.from.id));
      return showTripMenu(ctx, groupService);
    }

    if (!settlements.includes(message)) {
      await ctx.reply("Обери населений пункт кнопкою нижче.", getTripWeatherSelectionKeyboard(settlements));
      return true;
    }

    clearFlow(String(ctx.from.id));
    await showWeather(ctx, weatherService, message, getTripKeyboard(trip, String(ctx.from.id)));
    return true;
  }

  if (flow.type === "finish_trip_confirm") {
    await handleFinishTripConfirmFlow(ctx, flow, groupService, userService, telegram);
    return true;
  }

  return false;
}

function showMyGear(ctx, userService) {
  const items = userService.getPersonalGear(String(ctx.from.id), getUserLabel(ctx));

  if (!items.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🎒 МОЄ СПОРЯДЖЕННЯ", "Особистий список"),
        "",
        "Поки що тут порожньо.",
        "",
        "⚠️ Зверни увагу:",
        "• додай речі, які береш у похід постійно",
        "• це допоможе швидше збиратися в нові походи"
      ]),
      { parse_mode: "HTML", ...MY_GEAR_KEYBOARD }
    );
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🎒 МОЄ СПОРЯДЖЕННЯ", "Особистий список"),
      "",
      formatSectionHeader("📦", "Що Вже Додано"),
      ...formatGearList(items)
    ]),
    { parse_mode: "HTML", ...MY_GEAR_KEYBOARD }
  );
}

function addMyGear(ctx, userService, input) {
  const [name, quantityRaw, details, note] = input.split(";").map((part) => part?.trim());
  const quantity = Number(quantityRaw);

  if (!name || !quantityRaw || Number.isNaN(quantity)) {
    return ctx.reply("Формат: `/addmygear спальник;1;комфорт +3, 3-сезонний;синтетика`", {
      parse_mode: "Markdown",
      ...MY_GEAR_KEYBOARD
    });
  }

  userService.addPersonalGear({
    userId: String(ctx.from.id),
    userName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
    gear: { name, quantity, details, note }
  });

  return ctx.reply(`✅ Особисте спорядження "${name}" додано.`, MY_GEAR_KEYBOARD);
}

function showTripGearMenu(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🎒 СПОРЯДЖЕННЯ ПОХОДУ", trip.name),
      "",
      formatSectionHeader("🧭", "Що Тут Можна Зробити"),
      "• `➕ Додати спорядження` — спочатку обрати тип, а далі додати річ у похід",
      "• `🆘 Мені бракує спорядження` — додати, чого тобі не вистачає",
      "• `📦 Переглянути все` — побачити всю картину по спорядженню походу",
      "• `✏️ Редагувати спорядження` — змінити свої позиції, а з правами редагування — будь-які",
      "",
      "⚠️ Зверни увагу:",
      "• після натискання `➕ Додати спорядження` бот запропонує тип: спільне, особисте або запасне",
      "• так легше зрозуміти, чого ще бракує групі"
    ]),
    { parse_mode: "HTML", ...getTripGearKeyboard() }
  );
}

function showTripFoodMenu(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🍲 ХАРЧУВАННЯ ПОХОДУ", trip.name),
      "",
      formatSectionHeader("🧭", "Що Тут Можна Зробити"),
      "• `🥘 Додати продукт` — додати позицію в загальний список продуктів походу",
      "• `🗑 Видалити продукт` — прибрати позицію, якщо її внесли помилково",
      "• для кожної позиції вказуй вагу, кількість і вартість",
      "• `🧾 Переглянути все харчування` — повний список продуктів і витрати",
      "",
      "⚠️ Зверни увагу:",
      "• продукти автоматично потрапляють і в загальні витрати походу",
      "• вага продуктів використовується для попереднього розрахунку ваги рюкзака"
    ]),
    { parse_mode: "HTML", ...getTripFoodKeyboard() }
  );
}

function showTripGear(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  const snapshot = groupService.getGearSnapshot(trip.id);
  if (
    !snapshot.sharedGear.length &&
    !snapshot.personalGear.length &&
    !snapshot.spareGear.length &&
    !snapshot.gearNeeds.length
  ) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🎒 СПОРЯДЖЕННЯ ПОХОДУ", trip.name),
        "",
        "Поки що немає жодних позицій або запитів.",
        "",
        "⚠️ Зверни увагу:",
        "• додай спільне або особисте спорядження",
        "• якщо чогось бракує, створи запит у цьому ж розділі"
      ]),
      { parse_mode: "HTML", ...getTripGearKeyboard() }
    );
  }

  const shared = formatGearList(snapshot.sharedGear, { includeOwner: true });
  const personal = formatGearList(snapshot.personalGear, { includeOwner: true });
  const spare = formatGearList(snapshot.spareGear, { includeOwner: true });
  const needs = snapshot.gearNeeds.length
    ? snapshot.gearNeeds.map((item) => `• ${item.name}: ${item.quantity} | ${item.memberName}`).join("\n")
    : "• немає";

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🎒 СПОРЯДЖЕННЯ ПОХОДУ", trip.name),
      "",
      formatSectionHeader("🫕", "Спільне Спорядження"),
      ...shared,
      "",
      formatSectionHeader("🎒", "Особисті Речі Учасників"),
      ...personal,
      "",
      formatSectionHeader("🧰", "Запасне Або Можна Позичити"),
      ...spare,
      "",
      formatSectionHeader("🆘", "Кому Чого Бракує"),
      needs
    ]),
    { parse_mode: "HTML", ...getTripGearKeyboard() }
  );
}

function showMyNeeds(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  const snapshot = groupService.getGearSnapshot(trip.id);
  const needs = snapshot.gearNeeds.filter((item) => item.memberId === String(ctx.from.id));

  if (!needs.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("📋 МОЇ ЗАПИТИ", trip.name),
        "",
        "У тебе немає активних запитів у цьому поході."
      ]),
      { parse_mode: "HTML", ...getTripGearKeyboard() }
    );
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("📋 МОЇ ЗАПИТИ", trip.name),
      "",
      ...needs.map((item) => `• ${item.name}: ${item.quantity}`)
    ]),
    { parse_mode: "HTML", ...getTripGearKeyboard() }
  );
}

function resolveMemberDisplayName(userService, memberId, fallbackName = "") {
  if (!memberId) {
    return fallbackName || "Учасник";
  }

  return userService.getDisplayName(String(memberId), fallbackName || "Учасник");
}

function showTripFood(ctx, groupService, userService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  const snapshot = groupService.getFoodSnapshot(trip.id);

  if (!snapshot || !snapshot.items.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🍲 ХАРЧУВАННЯ ПОХОДУ", trip.name),
        "",
        "У поході поки немає доданих продуктів.",
        "",
        "⚠️ Зверни увагу:",
        "• продукти краще заносити відразу з кількістю та вартістю"
      ]),
      { parse_mode: "HTML", ...getTripFoodKeyboard() }
    );
  }

  const items = snapshot.items.map((item, index) =>
    `${index + 1}. ${item.name}\n   вага / обʼєм: ${item.amountLabel || formatWeightGrams(item.weightGrams)} | кількість: ${item.quantity} | ${formatMoney(item.cost)} | ${resolveMemberDisplayName(userService, item.memberId, item.memberName)}`
  ).join("\n");
  const byMember = snapshot.byMember.length
    ? snapshot.byMember.map((item) => `• ${resolveMemberDisplayName(userService, item.memberId, item.memberName)}: ${item.itemCount} позицій | ${formatWeightGrams(item.totalWeight)} | ${formatMoney(item.totalCost)}`).join("\n")
    : "• немає";

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🍲 ХАРЧУВАННЯ ПОХОДУ", trip.name),
      "",
      formatSectionHeader("🥘", "Перелік Продуктів"),
      items,
      "",
      formatSectionHeader("💸", "Витрати По Учасниках"),
      byMember,
      "",
      formatSectionHeader("🧾", "Разом"),
      `• Загальна вага: ${formatWeightGrams(snapshot.totalWeight)}`,
      `• Загальні витрати: ${formatMoney(snapshot.totalCost)}`
    ]),
    { parse_mode: "HTML", ...getTripFoodKeyboard() }
  );
}

function showBackpackWeight(ctx, groupService, userService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const snapshot = groupService.getBackpackWeightSnapshot(trip.id);
  if (!snapshot?.byMember?.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🎒 ВАГА РЮКЗАКА", trip.name),
        "",
        "Поки що недостатньо даних для розрахунку.",
        "",
        "⚠️ Зверни увагу:",
        "• додай спорядження і продукти з вагою",
        "• тоді бот зможе порахувати попередню вагу твого рюкзака"
      ]),
      { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from.id)) }
    );
  }

  const viewerId = String(ctx.from.id);
  const member = snapshot.byMember.find((item) => item.memberId === viewerId);

  if (!member) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🎒 ВАГА РЮКЗАКА", trip.name),
        "",
        "Для тебе поки немає розрахунку в цьому поході."
      ]),
      { parse_mode: "HTML", ...getTripKeyboard(trip, viewerId) }
    );
  }

  const lines = [
    ...formatCardHeader("🎒 ВАГА РЮКЗАКА", trip.name),
    "",
    snapshot.note,
    "",
    formatSectionHeader("👤", getMemberDisplayName(userService, {
      id: member.memberId,
      name: member.memberName
    })),
    `• Особисте спорядження: ${formatWeightGrams(member.personalGearWeight)}`,
    `• Частка спільного спорядження: ${formatWeightGrams(member.sharedGearShare)}`,
    `• Частка їжі: ${formatWeightGrams(member.foodShare)}`,
    `• Попередня вага рюкзака: ${formatWeightGrams(member.totalWeight)}`,
    member.missingWeights > 0 ? `• Незаповнених ваг у розрахунку: ${member.missingWeights}` : null,
    "",
    "⚠️ Зверни увагу:",
    "• це персональний попередній розрахунок саме твого рюкзака",
    "• спільне спорядження і їжа поки діляться порівну між усіма учасниками",
    "• якщо для речі або продукту вага не вказана, розрахунок буде менш точним"
  ];

  return ctx.reply(joinRichLines(lines), { parse_mode: "HTML", ...getTripKeyboard(trip, viewerId) });
}

function showTripExpensesMenu(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("💸 ВИТРАТИ ПОХОДУ", trip.name),
      "",
      formatSectionHeader("🧭", "Що Тут Можна Зробити"),
      "• `💸 Додати витрату` — ввести назву, кількість і ціну",
      "• `🧾 Переглянути всі витрати` — повний облік витрат без непорозумінь",
      "• у загальному зведенні автоматично враховуються продукти з розділу харчування",
      "",
      "⚠️ Зверни увагу:",
      "• тут видно і прямі витрати, і продукти, і хто скільки покрив"
    ]),
    { parse_mode: "HTML", ...getTripExpensesKeyboard() }
  );
}

function showTripExpenses(ctx, groupService, userService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  const expenseSnapshot = groupService.getExpenseSnapshot(trip.id);
  const foodSnapshot = groupService.getFoodSnapshot(trip.id);
  const expenseItems = expenseSnapshot?.items || [];
  const foodTotal = foodSnapshot?.totalCost || 0;

  if (!expenseItems.length && foodTotal === 0) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("💸 ВИТРАТИ ПОХОДУ", trip.name),
        "",
        "У поході поки немає витрат."
      ]),
      { parse_mode: "HTML", ...getTripExpensesKeyboard() }
    );
  }

  const divider = "────────────────────────────";
  const formatTotalLine = (label, value) => {
    const money = formatMoney(value);
    const dotsCount = Math.max(3, 28 - label.length - money.length);
    return `${label} ${".".repeat(dotsCount)} ${money}`;
  };

  const items = expenseItems.length
    ? expenseItems.map((item, index) => `${index + 1}. ${item.title}\n   ${item.quantity} × ${formatMoney(item.price)} = ${formatMoney(item.amount)}\n   платить: ${resolveMemberDisplayName(userService, item.memberId, item.memberName)}`).join("\n")
    : "немає";
  const directExpenses = expenseSnapshot?.totalCost || 0;
  const combinedByMemberMap = new Map();
  const foodByMemberMap = new Map();

  for (const item of expenseSnapshot?.byMember || []) {
    const memberName = resolveMemberDisplayName(userService, item.memberId, item.memberName);
    const current = combinedByMemberMap.get(memberName) || { total: 0, food: 0 };
    current.total += item.totalCost;
    combinedByMemberMap.set(memberName, current);
  }

  for (const item of foodSnapshot?.byMember || []) {
    const memberName = resolveMemberDisplayName(userService, item.memberId, item.memberName);
    const current = combinedByMemberMap.get(memberName) || { total: 0, food: 0 };
    current.total += item.totalCost;
    current.food += item.totalCost;
    combinedByMemberMap.set(memberName, current);
    foodByMemberMap.set(memberName, item.totalCost);
  }

  const foodByMember = [...foodByMemberMap.entries()]
    .map(([memberName, totalCost]) => formatTotalLine(memberName, totalCost))
    .join("\n") || "немає";
  const combinedByMember = [...combinedByMemberMap.entries()]
    .map(([memberName, totals]) => formatTotalLine(memberName, totals.total))
    .join("\n") || "немає";
  const grandTotal = directExpenses + foodTotal;
  const settlements = calculateSettlements(trip.members || [], combinedByMemberMap, grandTotal);

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("💸 ВИТРАТИ ПОХОДУ", trip.name),
      "",
      formatSectionHeader("🧾", "Позиції Витрат"),
      items,
      "",
      formatSectionHeader("🍲", "Продукти"),
      foodByMember,
      "",
      formatSectionHeader("👥", "По Учасниках"),
      combinedByMember,
      "",
      formatSectionHeader("📌", "Підсумок"),
      formatTotalLine("Інші витрати", directExpenses),
      formatTotalLine("Продукти", foodTotal),
      formatTotalLine("ВСЬОГО", grandTotal),
      formatTotalLine("З кожного порівну", settlements.perPerson),
      "",
      divider
    ]),
    { parse_mode: "HTML", ...getTripExpensesKeyboard() }
  );
}

function formatMemberAwardsMessage(trip, userService, member, awardSummary) {
  const routeName = trip.finalSummary?.routeName || formatRouteStatus(trip.routePlan) || trip.name;
  const hasTrackableRoute = Boolean(
    trip?.routePlan &&
    (
      trip.routePlan.sourceTitle ||
      trip.routePlan.sourceRouteId ||
      trip.routePlan.from ||
      trip.routePlan.to ||
      (Array.isArray(trip.routePlan.points) && trip.routePlan.points.length >= 2) ||
      Number(trip.routePlan?.meta?.distance) > 0
    )
  );
  const newAwards = awardSummary.newAwards.length
    ? awardSummary.newAwards.map((award) => `• ${formatAwardName(award)}`).join("\n")
    : hasTrackableRoute
      ? "• Цього разу нових відзнак не відкрито, але прогрес збережено."
      : "• Похід завершено без маршруту, тому прогрес і нагороди не були зараховані.";
  const latestAwards = awardSummary.latestAwards.length
    ? awardSummary.latestAwards.slice(0, 5).map((award) => `• ${formatAwardName(award)}`).join("\n")
    : "• Поки що немає нагород";
  const xpSummary = awardSummary.xp;
  const xpBonusLine = xpSummary?.awardBonusXp > 0 ? `• Бонус за нові нагороди: +${xpSummary.awardBonusXp} XP` : null;

  return joinRichLines([
    ...formatCardHeader("🎉 ВІТАЄМО І ДЯКУЄМО", userService.getDisplayName(member.id, member.name)),
    "",
    `Дякуємо за участь у поході <b>${escapeHtml(trip.name)}</b>.`,
    `Маршрут: ${escapeHtml(routeName)}`,
    "",
    formatSectionHeader("⭐", "XP За Похід"),
    hasTrackableRoute
      ? `• Ти отримав: +${xpSummary.gainedXp} XP`
      : "• XP не нараховано, бо похід завершено без маршруту.",
    hasTrackableRoute && xpSummary.previousLevel !== xpSummary.level
      ? `• Рівень: ${xpSummary.previousLevel} → ${xpSummary.level}`
      : `• Рівень: ${xpSummary.level}`,
    hasTrackableRoute
      ? (xpSummary.progress.next
        ? `• Прогрес: ${xpSummary.progress.currentXp} / ${xpSummary.progress.nextTargetXp} XP`
        : `• Прогрес: ${xpSummary.progress.currentXp} XP`)
      : null,
    xpBonusLine,
    "",
    formatSectionHeader("🏆", "Нові Досягнення"),
    newAwards,
    "",
    formatSectionHeader("📈", "Твій Прогрес"),
    `• Походів: ${awardSummary.stats.hikesCount}`,
    `• Кілометрів: ${awardSummary.stats.totalKm.toFixed(1)} км`,
    `• Ночівель: ${awardSummary.stats.totalNights}`,
    "",
    formatSectionHeader("🎯", "Поточний Титул"),
    `• ${awardSummary.currentTitle || "ще не відкрито"}`,
    "",
    formatSectionHeader("🏅", "Останні Нагороди"),
    latestAwards,
    "",
    "⚠️ Зверни увагу:",
    "• усі нагороди зберігаються в твоєму профілі",
    hasTrackableRoute
      ? "• нові відзнаки автоматично відкриватимуться після наступних завершених походів"
      : "• похід без маршруту не вважається пройденим і не додається в нагородний прогрес"
  ]);
}

async function finishTrip(ctx, groupService, userService, telegram = null) {
  const trip = requireOwnerTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  const completed = groupService.completeGroup(trip.id);
  const awardResults = completed.members.map((member) => ({
    member,
    awards: userService.grantTripAwards({
      trip: completed,
      memberId: member.id,
      userName: member.name
    })
  }));
  const hasTrackableRoute = Boolean(
    completed?.routePlan &&
    (
      completed.routePlan.sourceTitle ||
      completed.routePlan.sourceRouteId ||
      completed.routePlan.from ||
      completed.routePlan.to ||
      (Array.isArray(completed.routePlan.points) && completed.routePlan.points.length >= 2) ||
      Number(completed.routePlan?.meta?.distance) > 0
    )
  );

  clearFlow(String(ctx.from.id));

  if (telegram) {
    for (const item of awardResults) {
      try {
        await telegram.sendMessage(
          item.member.id,
          formatMemberAwardsMessage(completed, userService, item.member, item.awards),
          { parse_mode: "HTML", ...getMainKeyboard(item.member.id) }
        );
      } catch {
        // Ignore delivery errors for participants who blocked the bot or have no active chat.
      }
    }
  }

  return ctx.reply(
    joinRichLines([
      formatTripCompletionSummary(completed, userService),
      "",
      formatSectionHeader("🏅", "Нагороди Учасників"),
      hasTrackableRoute
        ? "• усім учасникам надіслано персональні підсумки й нові нагороди"
        : "• похід завершено без маршруту, тому прогрес і нагороди учасникам не зараховані"
    ]),
    { parse_mode: "HTML", ...getMainKeyboard(ctx) }
  );
}

function startFinishTripConfirm(ctx, groupService) {
  const trip = requireOwnerTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  setFlow(String(ctx.from.id), {
    type: "finish_trip_confirm",
    tripId: trip.id,
    step: "confirm",
    data: {}
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("✅ ЗАВЕРШЕННЯ ПОХОДУ", trip.name),
      "",
      "Після підтвердження похід:",
      "• отримає статус `завершений`",
      "• перестане бути активним",
      "• перейде в історію з фінальним підсумком",
      "",
      "⚠️ Зверни увагу:",
      "• ця дія має сенс, коли маршрут уже завершено"
    ]),
    { parse_mode: "HTML", ...FINISH_TRIP_CONFIRM_KEYBOARD }
  );
}

async function handleFinishTripConfirmFlow(ctx, flow, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim();

  if (message === FINISH_TRIP_NO_LABEL) {
    clearFlow(String(ctx.from.id));
    return showTripMenu(ctx, groupService);
  }

  if (message === FINISH_TRIP_YES_LABEL) {
    return finishTrip(ctx, groupService, userService, telegram);
  }

  return ctx.reply("Обери одну з кнопок нижче: Так або Ні.", FINISH_TRIP_CONFIRM_KEYBOARD);
}

function calculateDaysUntil(dateString) {
  if (!dateString) {
    return null;
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const target = new Date(`${dateString}T00:00:00Z`);

  if (Number.isNaN(target.getTime())) {
    return null;
  }

  return Math.round((target.getTime() - todayUtc) / (24 * 60 * 60 * 1000));
}

function buildAutoReminderMessage(trip, reminderKey) {
  const readiness = trip.tripCard?.gearReadinessStatus || "не вказано";
  const routeStatus = getRouteStatusLabel(trip.routePlan?.meta);
  const safety = resolveSafetyProfile(trip);

  if (reminderKey === "d3") {
    return [
      `🔔 Нагадування: до походу "${trip.name}" залишилось 3 дні`,
      "",
      "Що перевірити зараз:",
      "• актуальну погоду по маршруту",
      `• готовність спорядження: ${readiness}`,
      `• активні запити на спорядження: ${trip.gearNeeds?.length || 0}`
    ].join("\n");
  }

  if (reminderKey === "d1") {
    return [
      `🔔 Нагадування: до походу "${trip.name}" залишилась 1 доба`,
      "",
      "Що зробити перед виходом:",
      "• завантажити GPX/KML трек",
      "• відкрити HTML-карту треку і ще раз звірити маршрут",
      `• статус маршруту: ${routeStatus}`,
      `• перевірити логістику старту: ${trip.routePlan?.from || "не вказано"}`
    ].join("\n");
  }

  return [
    `🏔 Сьогодні старт походу "${trip.name}"`,
    "",
    `Маршрут: ${formatRouteStatus(trip.routePlan)}`,
    `Готовність спорядження: ${readiness}`,
    `Безпека: ${safety.title}`,
    `Екстрені номери: ${safety.general.flatMap((item) => item.phones).join(" / ")}`,
    "Перед виходом ще раз перевір воду, заряд телефону і офлайн-трек."
  ].join("\n");
}

function startTripReminderLoop(bot, groupService) {
  const sendDueReminders = async () => {
    const activeTrips = groupService.getActiveGroups();

    for (const trip of activeTrips) {
      const startDate = trip.tripCard?.startDate;
      const daysUntil = calculateDaysUntil(startDate);

      if (daysUntil === null) {
        continue;
      }

      const reminderKey = daysUntil === 3 ? "d3" : daysUntil === 1 ? "d1" : daysUntil === 0 ? "d0" : null;
      if (!reminderKey || trip.reminderState?.[reminderKey]) {
        continue;
      }

      const text = buildAutoReminderMessage(trip, reminderKey);

      let delivered = false;
      for (const member of trip.members || []) {
        try {
          await bot.telegram.sendMessage(member.id, text, getTripKeyboard(trip, member.id));
          delivered = true;
        } catch {
          // Ignore users who haven't opened the bot or blocked it.
        }
      }

      if (delivered) {
        groupService.markReminderSent({ groupId: trip.id, reminderKey });
      }
    }
  };

  void sendDueReminders();
  return setInterval(() => {
    void sendDueReminders();
  }, 60 * 60 * 1000);
}

function startVpohidArchiveSyncLoop(vpohidLiveService) {
  if (!config.vpohidArchiveSyncEnabled) {
    return null;
  }

  const intervalMs = config.vpohidArchiveSyncHours * 60 * 60 * 1000;
  const startupDelayMs = config.vpohidArchiveSyncStartupDelayMinutes * 60 * 1000;

  const runSync = async () => {
    try {
      const summary = await vpohidLiveService.syncArchive();
      console.log(
        `vpohid archive sync completed: ok=${summary.ok}, failed=${summary.failed}, skipped=${summary.skipped}`
      );
    } catch (error) {
      console.error("vpohid archive sync failed:", error?.message || error);
    }
  };

  const startupTimer = setTimeout(() => {
    void runSync();
  }, startupDelayMs);

  const interval = setInterval(() => {
    void runSync();
  }, intervalMs);

  return {
    stop() {
      clearTimeout(startupTimer);
      clearInterval(interval);
    }
  };
}

export function createBot(store) {
  const bot = new Telegraf(config.botToken);
  const groupService = new GroupService(store);
  const userService = new UserService(store);
  const weatherService = new WeatherService();
  const vpohidLiveService = new VpohidLiveService();
  const routeService = new RouteService({
    openRouteServiceApiKey: config.openRouteServiceApiKey,
    graphHopperApiKey: config.graphHopperApiKey
  });
  const advisorService = new AdvisorService();
  startTripReminderLoop(bot, groupService);
  const vpohidArchiveSyncLoop = startVpohidArchiveSyncLoop(vpohidLiveService);

  bot.vpohidArchiveSyncLoop = vpohidArchiveSyncLoop;

  const notifyMemberJoined = (trip, memberId, memberName) =>
    notifyTripMembers(
      bot.telegram,
      trip,
      buildMemberJoinedNotification(trip, memberName),
      { excludeMemberId: memberId }
    );

  const joinTripByInviteCode = async (ctx, inviteCode) => {
    const memberId = String(ctx.from.id);
    const memberName = userService.getDisplayName(memberId, getUserLabel(ctx));
    const result = groupService.joinGroup(inviteCode, {
      id: memberId,
      name: memberName
    });

    if (!result.ok) {
      return ctx.reply(result.message, getTripKeyboard(groupService.findGroupByMember(memberId), memberId));
    }

    void notifyMemberJoined(result.group, memberId, memberName);
    return ctx.reply(`✅ Ти приєднався до походу "${result.group.name}".`, getTripKeyboard(result.group, memberId));
  };

  bot.start((ctx) => {
    userService.ensureUserRecord({
      userId: String(ctx.from.id),
      userName: getUserLabel(ctx)
    });
    const payload = ctx.message.text.replace("/start", "").trim();
    const inviteCode = extractJoinInviteCode(payload);
    if (inviteCode) {
      return joinTripByInviteCode(ctx, inviteCode);
    }

    return sendHome(ctx);
  });
  bot.help((ctx) => sendHelp(ctx));

  bot.command("newgroup", (ctx) => {
    const name = ctx.message.text.replace("/newgroup", "").trim();
    const activeTrip = groupService.findGroupByMember(String(ctx.from.id));
    if (activeTrip) {
      return ctx.reply(
        `У тебе вже є активний похід "${activeTrip.name}". Спочатку заверш його, а потім створюй новий.`,
        getTripKeyboard(activeTrip, String(ctx.from.id))
      );
    }

    return startCreateTripWizard(ctx, name);
  });

  bot.command("join", (ctx) => {
    const inviteCode = ctx.message.text.replace("/join", "").trim().toUpperCase();
    if (!inviteCode) {
      return startJoinTripWizard(ctx);
    }

    return joinTripByInviteCode(ctx, inviteCode);
  });
  bot.command("invite", (ctx) => showInviteInfo(ctx, groupService));
  bot.command("grantaccess", (ctx) => startGrantAccessWizard(ctx, groupService, userService));

  bot.command("mygroup", (ctx) => showTripPassport(ctx, groupService, userService));
  bot.command("route", (ctx) => {
    const input = ctx.message.text.replace("/route", "").trim();
    if (!input) {
      return startRouteWizard(ctx, groupService, "search");
    }
    return showRouteSearch(ctx, groupService, routeService, input);
  });
  bot.command("weather", (ctx) => showWeather(ctx, weatherService, ctx.message.text.replace("/weather", "").trim(), getMainKeyboard(ctx)));
  bot.command("setgrouproute", (ctx) => {
    const input = ctx.message.text.replace("/setgrouproute", "").trim();
    return saveDirectTripRoute(ctx, groupService, routeService, userService, bot.telegram, input, "create");
  });
  bot.command("editgrouproute", (ctx) => {
    const input = ctx.message.text.replace("/editgrouproute", "").trim();
    return saveDirectTripRoute(ctx, groupService, routeService, userService, bot.telegram, input, "edit");
  });
  bot.command("grouproute", (ctx) => showRouteReport(ctx, groupService));
  bot.command("setgroupregion", (ctx) => {
    const trip = requireManageTrip(ctx, groupService);
    if (!trip) {
      return null;
    }
    const region = ctx.message.text.replace("/setgroupregion", "").trim();
    if (!region) {
      return ctx.reply("Формат: `/setgroupregion Ворохта`", { parse_mode: "Markdown", ...getTripKeyboard(trip, String(ctx.from.id)) });
    }
    const updatedTrip = groupService.setRegion({ groupId: trip.id, region });
    return ctx.reply(`✅ Регіон походу оновлено: ${region}`, getTripKeyboard(updatedTrip, String(ctx.from.id)));
  });
  bot.command("groupweather", async (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
    if (!trip) {
      return null;
    }
    const region = getTripWeatherLocation(trip);
    if (!region) {
      return ctx.reply("Для походу ще не задано регіон або маршрут.", getTripKeyboard(trip, String(ctx.from.id)));
    }
    return showWeather(ctx, weatherService, region, getTripKeyboard(trip, String(ctx.from.id)));
  });
  bot.command("finishtrip", (ctx) => finishTrip(ctx, groupService, userService, bot.telegram));
  bot.command("grouphistory", (ctx) => showTripHistory(ctx, groupService, userService));
  bot.command("addmygear", (ctx) => addMyGear(ctx, userService, ctx.message.text.replace("/addmygear", "").trim()));
  bot.command("mygear", (ctx) => showMyGear(ctx, userService));
  bot.command("advice", (ctx) => {
    const input = ctx.message.text.replace("/advice", "").trim();
    if (!input) {
      return showAdvicePrompt(ctx, advisorService);
    }
    const [season, days, difficulty] = input.split(";").map((part) => part?.trim());
    if (!season || !days || !difficulty) {
      return showAdvicePrompt(ctx, advisorService);
    }
    return ctx.reply(advisorService.getPreparationAdvice({ season, days, difficulty }), getMainKeyboard(ctx));
  });
  bot.command("addgear", (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
    if (!trip) {
      return null;
    }
    const [name, quantityRaw, scopeRaw, shareableRaw] = ctx.message.text.replace("/addgear", "").trim().split(";").map((part) => part?.trim());
    const quantity = Number(quantityRaw);
    if (!name || !quantityRaw || Number.isNaN(quantity)) {
      return ctx.reply("Формат: `/addgear пальник;1;shared|personal|spare;так|ні`", { parse_mode: "Markdown", ...getTripGearKeyboard() });
    }
    const normalizedScope = String(scopeRaw || "shared").toLowerCase();
    const scope = ["personal", "spare"].includes(normalizedScope) ? normalizedScope : "shared";
    const shareable = scope === "spare" || ["так", "yes", "true", "1"].includes((shareableRaw || "").toLowerCase());
    groupService.addGear({
      groupId: trip.id,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      gear: {
        name,
        quantity,
        shareable,
        scope
      }
    });
    return ctx.reply(`✅ "${name}" додано в похід.`, getTripGearKeyboard());
  });
  bot.command("needgear", (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
    if (!trip) {
      return null;
    }
    const [name, quantityRaw, note] = ctx.message.text.replace("/needgear", "").trim().split(";").map((part) => part?.trim());
    const quantity = Number(quantityRaw);
    if (!name || !quantityRaw || Number.isNaN(quantity)) {
      return ctx.reply("Формат: `/needgear кішки;1;не маю власних`", { parse_mode: "Markdown", ...getTripGearKeyboard() });
    }
    groupService.addGearNeed({
      groupId: trip.id,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      need: { name, quantity, note }
    });
    return ctx.reply(`📌 Запит "${name}" додано.`, getTripGearKeyboard());
  });
  bot.command("gear", (ctx) => showTripGear(ctx, groupService));
  bot.command("requestgear", (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
    if (!trip) {
      return null;
    }
    const gearName = ctx.message.text.replace("/requestgear", "").trim();
    if (!gearName) {
      return ctx.reply("Формат: `/requestgear намет`", { parse_mode: "Markdown", ...getTripGearKeyboard() });
    }
    const coverage = groupService.findGearCoverage(trip.id, gearName);
    if (!coverage.matches.length) {
      return ctx.reply(`Ніхто не позначив "${gearName}" як доступне для передачі.`, getTripGearKeyboard());
    }
    const lines = coverage.matches.map((item) => `• ${item.memberName}: ${item.name} (${item.quantity})`);
    return ctx.reply(`🤝 Можуть поділитися:\n${lines.join("\n")}`, getTripGearKeyboard());
  });
  bot.command("myneeds", (ctx) => showMyNeeds(ctx, groupService));
  bot.command("addfood", (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
    if (!trip) {
      return null;
    }
    const [name, amountRaw, quantity, costRaw] = ctx.message.text.replace("/addfood", "").trim().split(";").map((part) => part?.trim());
    const amount = parseFoodAmountInput(amountRaw, inferFoodMeasureKind(name));
    const cost = Number(String(costRaw || "").replace(",", "."));

    if (!name || !amountRaw || !quantity || !costRaw || !amount || Number.isNaN(cost) || cost < 0) {
      return ctx.reply("Формат: `/addfood гречка;800 г;2 пачки;180`", { parse_mode: "Markdown", ...getTripFoodKeyboard() });
    }

    groupService.addFood({
      groupId: trip.id,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      food: { name, amountLabel: amount.amountLabel, weightGrams: amount.weightGrams, quantity, cost }
    });

    return ctx.reply(`✅ "${name}" додано в харчування походу.`, getTripFoodKeyboard());
  });
  bot.command("food", (ctx) => showTripFood(ctx, groupService, userService));
  bot.command("tripreminders", (ctx) => showTripReminders(ctx, groupService));
  bot.command("passport", (ctx) => showTripPassport(ctx, groupService, userService));
  bot.command("addexpense", (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
    if (!trip) {
      return null;
    }
    const [title, quantityRaw, priceRaw] = ctx.message.text.replace("/addexpense", "").trim().split(";").map((part) => part?.trim());
    const quantity = Number(String(quantityRaw || "").replace(",", "."));
    const price = Number(String(priceRaw || "").replace(",", "."));

    if (!title || !quantityRaw || !priceRaw || Number.isNaN(quantity) || quantity <= 0 || Number.isNaN(price) || price < 0) {
      return ctx.reply("Формат: `/addexpense Квиток Київ-Ворохта;1;450`", { parse_mode: "Markdown", ...getTripExpensesKeyboard() });
    }

    groupService.addExpense({
      groupId: trip.id,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      expense: { title, quantity, price, amount: quantity * price }
    });

    return ctx.reply(`✅ Витрату "${title}" додано.`, getTripExpensesKeyboard());
  });
  bot.command("expenses", (ctx) => showTripExpenses(ctx, groupService, userService));

  bot.hears("🌦 Погода", (ctx) => ctx.reply("Введи: `/weather Яремче`", { parse_mode: "Markdown", ...getMainKeyboard(ctx) }));
  bot.hears("🗺 Маршрути", (ctx) => showRoutesMenu(ctx));
  bot.hears("👥 Похід", (ctx) => showTripMenu(ctx, groupService));
  bot.hears(KEYBOARD_PLACEHOLDER, () => null);
  bot.hears(PROFILE_LABEL, (ctx) => showProfileMenu(ctx, userService));
  bot.hears(PROFILE_DASHBOARD_LABEL, (ctx) => showProfileDashboard(ctx, userService, groupService));
  bot.hears(PROFILE_ABOUT_LABEL, (ctx) => showProfileAbout(ctx, userService));
  bot.hears(PROFILE_MEDICAL_LABEL, (ctx) => showProfileMedicalCard(ctx, userService));
  bot.hears(PROFILE_AWARDS_LABEL, (ctx) => showProfileAwards(ctx, userService));
  bot.hears(PROFILE_EDIT_LABEL, (ctx) => startProfileEditWizard(ctx, userService));
  bot.hears(PROFILE_BACK_LABEL, (ctx) => showProfileMenu(ctx, userService));
  bot.hears("🎒 Моє спорядження", (ctx) => showMyGearMenu(ctx));
  bot.hears(FAQ_LABEL, (ctx) => showFaqMenu(ctx, advisorService));
  bot.hears("🕓 Історія походів", (ctx) => showTripHistory(ctx, groupService, userService));
  bot.hears("ℹ️ Допомога", (ctx) => sendHelp(ctx));
  bot.hears(ROUTES_GENERATE_LABEL, (ctx) => {
    const context = getMenuContext(ctx.from.id);
    return isTripRouteContext(context)
      ? startRouteWizard(ctx, groupService, groupService.findGroupByMember(String(ctx.from.id))?.routePlan ? "edit" : "create")
      : startRouteWizard(ctx, groupService, "search");
  });
  bot.hears(ROUTES_EXISTING_LABEL, (ctx) => {
    const context = getMenuContext(ctx.from.id);
    return isTripRouteContext(context)
      ? showVpohidCatalogMenu(ctx, groupService, "trip")
      : showVpohidCatalogMenu(ctx, groupService, "routes");
  });
  bot.hears(VPOHID_SEARCH_LABEL, (ctx) => {
    const context = getMenuContext(ctx.from.id);
    return isTripRouteContext(context)
      ? startVpohidSearchWizard(ctx, groupService, "trip")
      : startVpohidSearchWizard(ctx, groupService, "routes");
  });
  bot.hears(VPOHID_BROWSE_ALL_LABEL, (ctx) => {
    const context = getMenuContext(ctx.from.id);
    return isTripRouteContext(context)
      ? startVpohidCatalogBrowse(ctx, vpohidLiveService, groupService, "trip")
      : startVpohidCatalogBrowse(ctx, vpohidLiveService, groupService, "routes");
  });
  bot.hears(ROUTES_DETAILS_LABEL, (ctx) => showVpohidChosenRoute(ctx, routeService, vpohidLiveService));
  bot.hears("📍 Деталі маршруту vpohid", (ctx) => showVpohidChosenRoute(ctx, routeService, vpohidLiveService));
  bot.hears("🗺 Переглянути маршрут vpohid", (ctx) => showVpohidChosenRoute(ctx, routeService, vpohidLiveService));
  bot.hears("📄 GPX vpohid", (ctx) => sendVpohidRouteExport(ctx, routeService, vpohidLiveService, "gpx"));
  bot.hears("📄 KML vpohid", (ctx) => sendVpohidRouteExport(ctx, routeService, vpohidLiveService, "kml"));
  bot.hears("🔁 Змінити маршрут", (ctx) => {
    const selection = getVpohidSelection(ctx.from.id);
    const mode = selection?.mode || "routes";
    return mode === "trip" ? startVpohidSearchWizard(ctx, groupService, "trip") : startVpohidSearchWizard(ctx, groupService, "routes");
  });
  bot.hears(VPOHID_BACK_TO_TRIP_ROUTE_LABEL, (ctx) => showRouteMenu(ctx, groupService));
  bot.hears(VPOHID_BACK_TO_ROUTES_LABEL, (ctx) => showRoutesMenu(ctx));
  bot.hears("👤 Учасники походу", (ctx) => showTripMembersMenu(ctx, groupService, userService));
  bot.hears("📋 Список учасників", (ctx) => showTripMembers(ctx, groupService, userService));
  bot.hears("✏️ Редагувати дані походу", (ctx) => handleTripDataAction(ctx, groupService));
  bot.hears("➕ Створити похід", (ctx) => {
    const activeTrip = groupService.findGroupByMember(String(ctx.from.id));
    if (activeTrip) {
      return ctx.reply(
        `У тебе вже є активний похід "${activeTrip.name}". Спочатку заверш його, а потім створюй новий.`,
        getTripKeyboard(activeTrip)
      );
    }

    return startCreateTripWizard(ctx);
  });
  bot.hears("🔑 Приєднатися до походу", (ctx) => startJoinTripWizard(ctx));
  bot.hears("➕ Запросити учасників", (ctx) => showInviteInfo(ctx, groupService));
  bot.hears("🛡 Права редагування", (ctx) => startGrantAccessWizard(ctx, groupService, userService));
  bot.hears("📍 Маршрут походу", (ctx) => showRouteMenu(ctx, groupService));
  bot.hears("📄 GPX трек", (ctx) => sendRouteExport(ctx, groupService, routeService, "gpx"));
  bot.hears("📄 KML трек", (ctx) => sendRouteExport(ctx, groupService, routeService, "kml"));
  bot.hears("🧭 HTML карта треку", (ctx) => sendRouteExport(ctx, groupService, routeService, "html"));
  bot.hears("🎒 Спорядження походу", (ctx) => showTripGearMenu(ctx, groupService));
  bot.hears("🍲 Харчування походу", (ctx) => showTripFoodMenu(ctx, groupService));
  bot.hears("💸 Витрати походу", (ctx) => showTripExpensesMenu(ctx, groupService));
  bot.hears("🪪 Паспорт походу", (ctx) => showTripPassport(ctx, groupService, userService));
  bot.hears("🔔 Нагадування", (ctx) => showTripReminders(ctx, groupService));
  bot.hears("🆘 Безпека походу", (ctx) => showTripSafety(ctx, groupService));
  bot.hears("🌦 Погода походу", (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
    if (!trip) {
      return null;
    }
    const settlements = getTripWeatherSettlements(trip);
    if (!settlements.length) {
      return ctx.reply("Для походу ще не задано регіон або маршрут.", getTripKeyboard(trip, String(ctx.from.id)));
    }
    if (settlements.length > 1) {
      return startTripWeatherSelection(ctx, groupService);
    }
    return showWeather(ctx, weatherService, settlements[0], getTripKeyboard(trip, String(ctx.from.id)));
  });
  bot.hears("✅ Завершити похід", (ctx) => startFinishTripConfirm(ctx, groupService));
  bot.hears(FINISH_TRIP_YES_LABEL, (ctx) => handleFinishTripConfirmFlow(ctx, getFlow(String(ctx.from.id)) || { type: "finish_trip_confirm" }, groupService, userService, bot.telegram));
  bot.hears(FINISH_TRIP_NO_LABEL, (ctx) => handleFinishTripConfirmFlow(ctx, getFlow(String(ctx.from.id)) || { type: "finish_trip_confirm" }, groupService, userService, bot.telegram));
  bot.hears("📌 Задати маршрут походу", (ctx) => startRouteWizard(ctx, groupService, "create"));
  bot.hears("🧭 Згенерувати власний маршрут", (ctx) => startRouteWizard(ctx, groupService, groupService.findGroupByMember(String(ctx.from.id))?.routePlan ? "edit" : "create"));
  bot.hears(ROUTE_CHANGE_LABEL, (ctx) => showTripRouteChangeMenu(ctx, groupService));
  bot.hears("✏️ Редагувати маршрут походу", (ctx) => showTripRouteChangeMenu(ctx, groupService));
  bot.hears("🧭 Переглянути маршрут походу", (ctx) => showRouteReport(ctx, groupService, routeService, vpohidLiveService));
  bot.hears("➕ Додати моє спорядження", (ctx) => startMyGearAddWizard(ctx));
  bot.hears("✏️ Редагувати моє спорядження", (ctx) => startMyGearEditWizard(ctx, userService));
  bot.hears("📦 Моє спорядження", (ctx) => showMyGear(ctx, userService));
  bot.hears("🫕 Додати спільне", (ctx) => startGearAddWizard(ctx, groupService, "shared"));
  bot.hears("🎒 Додати особисте", (ctx) => startGearAddWizard(ctx, groupService, "personal"));
  bot.hears("🧰 Додати запасне / позичу", (ctx) => startGearAddWizard(ctx, groupService, "spare"));
  bot.hears("🆘 Мені бракує спорядження", (ctx) => startGearNeedWizard(ctx, groupService));
  bot.hears(TRIP_GEAR_ADD_LABEL, (ctx) => showTripGearAddMenu(ctx, groupService));
  bot.hears(TRIP_GEAR_ADD_BACK_LABEL, (ctx) => showTripGearMenu(ctx, groupService));
  bot.hears("📦 Переглянути все", (ctx) => showTripGear(ctx, groupService));
  bot.hears("📋 Мої запити", (ctx) => showMyNeeds(ctx, groupService));
  bot.hears("✏️ Редагувати спорядження", (ctx) => startGearEditWizard(ctx, groupService));
  bot.hears("🥘 Додати продукт", (ctx) => startFoodAddWizard(ctx, groupService));
  bot.hears("🗑 Видалити продукт", (ctx) => startFoodDeleteWizard(ctx, groupService));
  bot.hears("🧾 Переглянути все харчування", (ctx) => showTripFood(ctx, groupService, userService));
  bot.hears("🎒 Вага рюкзака", (ctx) => showBackpackWeight(ctx, groupService, userService));
  bot.hears("💸 Додати витрату", (ctx) => startExpenseAddWizard(ctx, groupService));
  bot.hears("🧾 Переглянути всі витрати", (ctx) => showTripExpenses(ctx, groupService, userService));
  bot.hears("⬅️ До походу", (ctx) => showTripMenu(ctx, groupService));
  bot.hears("⬅️ Головне меню", (ctx) => {
    clearFlow(String(ctx.from.id));
    return sendHome(ctx);
  });
  bot.hears("❌ Скасувати", (ctx) => {
    const activeFlow = getFlow(String(ctx.from.id));
    const menuContext = getMenuContext(ctx.from.id);
    clearFlow(String(ctx.from.id));

    if (activeFlow?.type === "faq_menu") {
      return sendHome(ctx);
    }

    if (activeFlow?.type === "help_menu") {
      return sendHome(ctx);
    }

    if (activeFlow?.type === "profile_edit") {
      return showProfileMenu(ctx, userService);
    }

    if (activeFlow?.type === "my_gear_add" || activeFlow?.type === "my_gear_edit") {
      return showMyGearMenu(ctx);
    }

    if (activeFlow?.type === "trip_member_list") {
      return showTripMembersMenu(ctx, groupService, userService);
    }

    if (activeFlow?.type === "vpohid_search") {
      const mode = getVpohidFlowMode(activeFlow);
      if (mode === "trip") {
        const trip = groupService.findGroupByMember(String(ctx.from.id));
        return ctx.reply("<b>❌ Дію скасовано</b>", { parse_mode: "HTML", ...getTripRouteKeyboard(trip, canManageTrip(trip, String(ctx.from.id))) });
      }
      return ctx.reply("<b>❌ Дію скасовано</b>", { parse_mode: "HTML", ...getRoutesMenuKeyboard(ctx.from.id) });
    }

    if (activeFlow?.type === "gear_add" || activeFlow?.type === "gear_edit" || activeFlow?.type === "gear_delete" || activeFlow?.type === "gear_need") {
      return ctx.reply("<b>❌ Дію скасовано</b>", { parse_mode: "HTML", ...getTripGearKeyboard() });
    }

    if (activeFlow?.type === "food_add" || activeFlow?.type === "food_delete") {
      return ctx.reply("<b>❌ Дію скасовано</b>", { parse_mode: "HTML", ...getTripFoodKeyboard() });
    }

    if (activeFlow?.type === "expense_add") {
      return ctx.reply("<b>❌ Дію скасовано</b>", { parse_mode: "HTML", ...getTripExpensesKeyboard() });
    }

    if (menuContext === "trip-route-catalog") {
      return showRouteMenu(ctx, groupService);
    }

    if (menuContext === "routes-catalog") {
      return showRoutesMenu(ctx);
    }

    if (menuContext === "my-gear") {
      return showMyGearMenu(ctx);
    }

    if (menuContext === "profile") {
      return showProfileMenu(ctx, userService);
    }

    return ctx.reply(
      "<b>❌ Дію скасовано</b>",
      { parse_mode: "HTML", ...getTripKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id)) }
    );
  });

  bot.on("text", async (ctx) => {
    const flowHandled = await handleActiveFlow(ctx, groupService, routeService, vpohidLiveService, weatherService, advisorService, userService, bot.telegram);
    if (flowHandled) {
      return;
    }

    if (ctx.message.text.startsWith("/")) {
      ctx.reply("Команду не знайдено. Використай нижнє меню або `ℹ️ Допомога`.", {
        parse_mode: "Markdown",
        ...getMainKeyboard(ctx)
      });
    }
  });

  return bot;
}

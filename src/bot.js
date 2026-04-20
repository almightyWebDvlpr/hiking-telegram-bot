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
  BADGE_SERIES,
  AWARD_RULES_OVERVIEW,
  MANUAL_AWARDS_OVERVIEW,
  TITLE_RULES_OVERVIEW,
  formatAwardName,
  getTierMeta
} from "./data/awardsCatalog.js";
import {
  categorizeGearName,
  canonicalizeGearName,
  formatGearAttribute,
  resolveGearProfile,
  summarizeGearAttributes
} from "./data/gearCatalog.js";
import {
  canonicalizeFoodName,
  inferFoodMeasureKind as inferFoodMeasureKindFromCatalog
} from "./data/foodCatalog.js";
import { canonicalizeExpenseTitle } from "./data/expenseCatalog.js";
import {
  validateBloodType,
  validateCity,
  validateInviteCode,
  validateGearItemName,
  validateGearStatus,
  validateIsoDate,
  validateLongProfileText,
  validateMeetingPoint,
  validateMeetingTime,
  validatePhone,
  validatePositiveInteger,
  validatePositiveMoney,
  validateProfileName,
  validateRoutePlace,
  validateSearchQuery,
  validateShortProfileText,
  validateTripName
} from "./services/validationService.js";
import {
  getGearAddNextStep
} from "./state/gearAddMachine.js";
import {
  getExpenseAddNextStep,
  getExpenseAddPreviousStep
} from "./state/expenseAddMachine.js";
import {
  getFoodAddNextStep,
  getFoodAddPreviousStep
} from "./state/foodAddMachine.js";
import {
  getBorrowedGearNextStep,
  getBorrowedGearPreviousStep
} from "./state/borrowedGearMachine.js";
import {
  getGearEditNextStep,
  getGearEditPreviousStep
} from "./state/gearEditMachine.js";
import {
  getGearNeedNextStep,
  getGearNeedPreviousStep
} from "./state/gearNeedMachine.js";
import {
  getGearNeedManageNextStep,
  getGearNeedManagePreviousStep
} from "./state/gearNeedManageMachine.js";
import {
  getLoanedGearNextStep,
  getLoanedGearPreviousStep
} from "./state/loanedGearMachine.js";
import {
  getMyGearEditNextStep,
  getMyGearEditPreviousStep
} from "./state/myGearEditMachine.js";
import {
  getProfileEditNextStep,
  getProfileEditPreviousStep
} from "./state/profileEditMachine.js";
import {
  getRouteNextStep,
  getRoutePreviousStep
} from "./state/routeMachine.js";
import { getTripCreateNextStep, getTripCreatePreviousStep } from "./state/tripCreateMachine.js";
import { getTripCardNextStep, getTripCardPreviousStep } from "./state/tripCardMachine.js";



const flows = new Map();
const vpohidSelections = new Map();
const menuContexts = new Map();
const vpohidCatalogLoads = new Set();
const FAQ_LABEL = "❓ Часті питання";
const FAQ_SEARCH_LABEL = "🔎 Пошук по FAQ";
const FAQ_ALL_LABEL = "📚 Усі питання";
const FAQ_PREV_LABEL = "⬅️ Попередні";
const FAQ_NEXT_LABEL = "➡️ Наступні";
const HELP_BACK_LABEL = "⬅️ До допомоги";
const PROFILE_LABEL = "🙍 Мій профіль";
const AUTH_CONTACT_LABEL = "📱 Підтвердити свій номер";
const PROFILE_DASHBOARD_LABEL = "📊 Дашборд";
const PROFILE_ABOUT_LABEL = "👤 Про мене";
const PROFILE_MEDICAL_LABEL = "🩺 Медична картка";
const PROFILE_EDIT_LABEL = "✏️ Редагувати профіль";
const PROFILE_PHOTO_ALBUMS_LABEL = "🖼 Фотоальбоми";
const PROFILE_BACK_LABEL = "⬅️ До профілю";
const PROFILE_SKIP_LABEL = "⏭ Пропустити";
const TRIP_MEMBERS_BACK_LABEL = "⬅️ Назад";
const TRIP_HISTORY_BACK_LABEL = "⬅️ До історії";
const PROFILE_PHOTO_ALBUMS_BACK_LABEL = "⬅️ До фотоальбомів";
const TRIP_DETAILS_LABEL = "🪪 Деталі походу";
const TRIP_DETAILS_BACK_LABEL = "⬅️ Назад";
const TRIP_SETTINGS_LABEL = "⚙️ Налаштування";
const TRIP_SETTINGS_BACK_LABEL = "⬅️ До походу";
const TRIP_TRANSFER_ORGANIZER_LABEL = "🔁 Передати похід";
const TRIP_TRANSFER_BACK_LABEL = "⬅️ До налаштувань";
const TRIP_TRANSFER_INVITE_LABEL = "➕ Запросити нового організатора";
const MEMBER_TICKETS_LABEL = "🎫 Квитки";
const MEMBER_TICKETS_UPLOAD_LABEL = "📤 Завантажити квиток";
const MEMBER_TICKETS_OPEN_LABEL = "📎 Відкрити файл";
const MEMBER_TICKETS_DELETE_LABEL = "🗑 Видалити квиток";
const MEMBER_TICKETS_BACK_LABEL = "⬅️ До учасників";
const MEMBER_TICKETS_LIST_BACK_LABEL = "⬅️ До квитків";
const MEMBER_TICKET_FLOW_BACK_LABEL = "⬅️ Назад";
const TRIP_LIST_BACK_LABEL = "⬅️ До списку походів";
const TRIP_REMINDERS_ENABLE_LABEL = "✅ Увімкнути нагадування";
const TRIP_REMINDERS_DISABLE_LABEL = "⛔️ Вимкнути нагадування";
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
  ["🌦 Погода"],
  [FAQ_LABEL, "ℹ️ Допомога"]
]).resize().persistent();

const ROUTES_BACK_LABEL = "⬅️ До маршрутів";
const ROUTES_GENERATE_LABEL = "🧭 Згенерувати маршрут";
const ROUTES_EXISTING_LABEL = "📚 Знайти в каталозі маршрутів";
const ROUTES_DETAILS_LABEL = "📋 Деталі маршруту";
const TRIP_WEATHER_BACK_LABEL = "⬅️ До походу";
const TRIP_PHOTOS_LABEL = "📸 Фото походу";
const TRIP_PHOTOS_ADD_LABEL = "📷 Поділитися фото";
const TRIP_PHOTO_ALBUM_LABEL = "🖼 Фотоальбом";
const TRIP_SOS_LABEL = "🚨 SOS пакет";
const GEAR_DELETE_CONFIRM_LABEL = "✅ Так, видалити";
const GEAR_EDIT_ACTION_LABEL = "✏️ Редагувати";
const GEAR_EDIT_DELETE_LABEL = "🗑 Видалити";
const GEAR_EDIT_BACK_LABEL = "⬅️ Назад";
const GEAR_NEED_HELP_LABEL = "🤝 Хто може допомогти";
const GEAR_NEED_REQUEST_LABEL = "🙋 Хочу взяти в користування";
const GEAR_NEED_CANCEL_LABEL = "❌ Скасувати запит";
const GEAR_NEED_CONFIRM_CANCEL_LABEL = "✅ Так, скасувати запит";
const GEAR_LOAN_APPROVE_LABEL = "✅ Підтвердити передачу";
const GEAR_LOAN_DECLINE_LABEL = "❌ Відмовити";
const GEAR_RETURN_REQUEST_LABEL = "↩️ Повернути власнику";
const GEAR_RETURN_REMIND_LABEL = "🔔 Нагадати власнику";
const GEAR_RETURN_CONFIRM_LABEL = "✅ Підтвердити повернення";
const GEAR_SCOPE_SHARED_LABEL = "🫕 Спільне";
const GEAR_SCOPE_PERSONAL_LABEL = "🎒 Особисте";
const GEAR_SCOPE_SPARE_LABEL = "🧰 Запасне / позичу";
const GEAR_SCOPE_KEEP_LABEL = "⏭ Без змін";
const PAGINATION_PREV_LABEL = "⬅️ Попередні";
const PAGINATION_NEXT_LABEL = "➡️ Наступні";
const TRIP_GEAR_ADD_LABEL = "➕ Додати спорядження";
const TRIP_GEAR_VIEW_ALL_LABEL = "🗂 Переглянути все";
const TRIP_GEAR_ADD_BACK_LABEL = "⬅️ До спорядження походу";
const TRIP_GEAR_ACCOUNTING_LABEL = "🧾 Запити та облік спорядження";
const GEAR_NEED_CREATE_LABEL = "🆘 Зробити запит на спорядження";
const GEAR_MY_REQUESTS_LABEL = "📝 Мої запити";
const GEAR_BORROWED_LABEL = "🫴 В користуванні";
const GEAR_LOANED_LABEL = "👥 Користуються";

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
const CANCEL_TRIP_LABEL = "🚫 Скасувати похід";
const FLOW_GEAR_STATUS_KEYBOARD = Markup.keyboard([
  ["🟢 Готово", "🟡 Частково готово"],
  ["🔴 Збираємо", "❌ Скасувати"]
]).resize().persistent();

const TRIP_CREATE_KEYBOARD = Markup.keyboard([["❌ Скасувати"]]).resize().persistent();
const FLOW_GEAR_STATUS_WITH_SKIP_KEYBOARD = Markup.keyboard([
  ["🟢 Готово", "🟡 Частково готово"],
  ["🔴 Збираємо", PROFILE_SKIP_LABEL],
  ["❌ Скасувати"]
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
    "Там бот показує питання сторінками по походах, одягу, спорядженню, воді, табору і безпеці.",
    "Для швидкого пошуку потрібної теми натисни `🔎 Пошук по FAQ`."
  ].join("\n")
};

function buildKeyboard(rows) {
  return Markup.keyboard(rows).resize().persistent();
}

function getMainKeyboard(ctxOrUser = null) {
  return MAIN_KEYBOARD;
}

function getAuthorizationKeyboard(authState = { contactVerified: false }) {
  const rows = [];
  if (!authState.contactVerified) {
    rows.push([Markup.button.contactRequest(AUTH_CONTACT_LABEL)]);
  }
  rows.push([FAQ_LABEL, "ℹ️ Допомога"]);
  return Markup.keyboard(rows).resize().persistent();
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

function stripHtmlTags(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function splitRichText(text, maxLength = 3500) {
  const source = String(text || "").trim();
  if (!source) {
    return [""];
  }

  if (source.length <= maxLength) {
    return [source];
  }

  const chunks = [];
  const lines = source.split("\n");
  let current = "";

  const pushCurrent = () => {
    const normalized = current.trim();
    if (normalized) {
      chunks.push(normalized);
    }
    current = "";
  };

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      pushCurrent();
    }

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    const words = line.split(" ");
    let lineChunk = "";
    for (const word of words) {
      const wordCandidate = lineChunk ? `${lineChunk} ${word}` : word;
      if (wordCandidate.length <= maxLength) {
        lineChunk = wordCandidate;
        continue;
      }

      if (lineChunk) {
        chunks.push(lineChunk.trim());
      }
      lineChunk = word;
    }

    if (lineChunk) {
      current = lineChunk;
    }
  }

  if (current) {
    pushCurrent();
  }

  return chunks.length ? chunks : [source];
}

async function replyRichText(ctx, text, extra = {}) {
  const chunks = splitRichText(text);
  let lastResult = null;
  for (const chunk of chunks) {
    lastResult = await ctx.reply(chunk, extra);
  }
  return lastResult;
}

async function sendRichText(telegram, chatId, text, extra = {}) {
  const chunks = splitRichText(text);
  let lastResult = null;
  for (const chunk of chunks) {
    lastResult = await telegram.sendMessage(chatId, chunk, extra);
  }
  return lastResult;
}

function buildContextualFaqInlineKeyboard(items = []) {
  return Markup.inlineKeyboard(
    items.map((item) => [Markup.button.callback(`❓ ${truncateButtonLabel(item.question, 30)}`, `faqctx:${item.id}`)])
  );
}

function formatContextualFaqSuggestionMessage(items = [], title = "Корисно саме зараз") {
  return joinRichLines([
    formatSectionHeader("💡", title),
    ...items.map((item) => `• ${escapeHtml(item.question)}`),
    "",
    "Натисни на потрібну підказку нижче.",
    "Більше відповідей на питання можна знайти в розділі `❓ Часті питання`."
  ]);
}

async function sendContextualFaqSuggestions(ctx, advisorService, context = {}, title = "Корисно саме зараз") {
  if (!advisorService) {
    return null;
  }

  const suggestions = advisorService.getContextualFaqSuggestions(context, { limit: 3 });
  if (!suggestions.length) {
    return null;
  }

  return ctx.reply(
    formatContextualFaqSuggestionMessage(suggestions, title),
    {
      parse_mode: "HTML",
      ...buildContextualFaqInlineKeyboard(suggestions)
    }
  );
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
    [PROFILE_AWARDS_LABEL],
    [PROFILE_ABOUT_LABEL, "🎒 Моє спорядження"],
    [PROFILE_PHOTO_ALBUMS_LABEL, "🕓 Історія походів"],
    ["⬅️ Головне меню"]
  ]);
}

function getProfileAboutKeyboard() {
  return buildKeyboard([
    [PROFILE_EDIT_LABEL, PROFILE_MEDICAL_LABEL],
    [PROFILE_BACK_LABEL, "⬅️ Головне меню"]
  ]);
}

function getProfileEditKeyboard() {
  return buildKeyboard([
    [PROFILE_SKIP_LABEL, "❌ Скасувати"]
  ]);
}

function getTripMember(trip, userId) {
  return trip?.members?.find((member) => member.id === userId) || null;
}

function isTripMemberNotGoing(trip, userId) {
  return String(getTripMember(trip, userId)?.attendanceStatus || "") === "not_going";
}

function hasTripAttendanceRestrictionWindow(trip) {
  const daysUntil = calculateDaysUntil(trip?.tripCard?.startDate);
  return daysUntil !== null && daysUntil <= 7;
}

function hasTripStarted(trip) {
  const daysUntil = calculateDaysUntil(trip?.tripCard?.startDate);
  return daysUntil !== null && daysUntil <= 0;
}

function canTripBeCancelled(trip) {
  const daysUntil = calculateDaysUntil(trip?.tripCard?.startDate);
  return daysUntil !== null && daysUntil > 0;
}

function canTripBeFinished(trip) {
  return hasTripStarted(trip);
}

function isTripMemberAutoExcluded(trip, userId) {
  const member = getTripMember(trip, userId);
  if (member?.role === "owner") {
    return false;
  }
  return (
    String(member?.attendanceStatus || "") === "not_going"
    && hasTripAttendanceRestrictionWindow(trip)
  );
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

function isUserAuthorized(userService, userId, userName = "") {
  return userService.getAuthorizationState(String(userId), userName).isAuthorized;
}

function formatAuthorizationMissingList(authState) {
  return (authState?.missing || []).map((item) => `• ${item}`);
}

function getMemberDisplayName(userService, member) {
  return userService.getDisplayName(member.id, member.name);
}

function getAttendanceStatusMeta(status) {
  switch (String(status || "")) {
    case "going":
      return { key: "going", emoji: "👍", label: "Йду" };
    case "thinking":
      return { key: "thinking", emoji: "🤔", label: "Думаю" };
    case "not_going":
      return { key: "not_going", emoji: "👎", label: "Не йду" };
    default:
      return { key: "", emoji: "🤔", label: "Думаю" };
  }
}

function formatAttendanceStatusText(status) {
  const meta = getAttendanceStatusMeta(status);
  return `${meta.emoji} ${meta.label}`;
}

function getAttendanceStatusEmoji(status) {
  const meta = getAttendanceStatusMeta(status);
  return meta.emoji;
}

function getMemberTickets(member = {}) {
  return Array.isArray(member?.tickets) ? member.tickets.filter((ticket) => ticket?.fileId) : [];
}

const SUPPORTED_TICKET_DOCUMENT_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg"]);

function isSupportedTicketDocument(document = null) {
  if (!document?.file_id) {
    return false;
  }

  const mimeType = String(document.mime_type || "").toLowerCase();
  if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
    return true;
  }

  const fileName = String(document.file_name || "").trim().toLowerCase();
  const extension = fileName.includes(".") ? fileName.split(".").pop() || "" : "";
  return SUPPORTED_TICKET_DOCUMENT_EXTENSIONS.has(extension);
}

function normalizeTicketSegmentInput(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const MEMBER_TICKET_CATEGORY_OPTIONS = [
  { key: "train", label: "🚆 Залізничний" },
  { key: "bus", label: "🚌 Автобусний" },
  { key: "other", label: "🎫 Інший" }
];

function normalizeMemberTicketCategory(value = "") {
  const key = String(value || "").trim().toLowerCase();
  if (["train", "rail", "railway"].includes(key)) {
    return "train";
  }
  if (["bus", "coach"].includes(key)) {
    return "bus";
  }
  return "other";
}

function getMemberTicketCategoryLabel(value = "") {
  const normalized = normalizeMemberTicketCategory(value);
  return MEMBER_TICKET_CATEGORY_OPTIONS.find((item) => item.key === normalized)?.label || "🎫 Інший";
}

function getMemberTicketCategoryKeyByLabel(value = "") {
  const label = String(value || "").trim();
  return MEMBER_TICKET_CATEGORY_OPTIONS.find((item) => item.label === label)?.key || "";
}

function buildMemberTicketCategoryKeyboard() {
  return buildKeyboard([
    MEMBER_TICKET_CATEGORY_OPTIONS.map((item) => item.label),
    [MEMBER_TICKET_FLOW_BACK_LABEL]
  ]);
}

function buildMemberTicketSegmentKey(category = "", segmentFrom = "", segmentTo = "") {
  const normalizedCategory = normalizeMemberTicketCategory(category);
  const from = normalizeTicketSegmentInput(segmentFrom).toLowerCase();
  const to = normalizeTicketSegmentInput(segmentTo).toLowerCase();
  return from && to ? `${normalizedCategory}::${from}::${to}` : "";
}

function getMemberTicketSegmentLabel(ticket = {}) {
  const categoryLabel = getMemberTicketCategoryLabel(ticket.category || "");
  const from = normalizeTicketSegmentInput(ticket.segmentFrom || "");
  const to = normalizeTicketSegmentInput(ticket.segmentTo || "");
  if (from && to) {
    return `${categoryLabel}: ${from} → ${to}`;
  }
  return categoryLabel;
}

function getMemberTicketsStatusLabel(member = {}) {
  const count = getMemberTickets(member).length;
  return count ? `🎫 Є квитки (${count})` : "🎫 Немає квитків";
}

function getMemberTicketListLabel(ticket = {}, index = null) {
  const segmentLabel = getMemberTicketSegmentLabel(ticket);
  const fileName = String(ticket.fileName || "").trim();
  const baseLabel = segmentLabel || fileName || "Квиток";
  const suffix = fileName && fileName !== baseLabel ? ` (${fileName})` : "";
  const numberedLabel = typeof index === "number" ? `${index + 1}. ${baseLabel}${suffix}` : `${baseLabel}${suffix}`;
  return numberedLabel;
}

function summarizeTripTickets(trip) {
  const members = Array.isArray(trip?.members) ? trip.members : [];
  const ticketCount = members.reduce((sum, member) => sum + getMemberTickets(member).length, 0);
  const membersWithTickets = members.filter((member) => getMemberTickets(member).length > 0).length;
  return {
    ticketCount,
    membersWithTickets,
    totalMembers: members.length
  };
}

function canManageTripMemberTickets(trip, viewerId, memberId) {
  return canManageTrip(trip, viewerId) || String(viewerId) === String(memberId);
}

function isMemberIncludedInCalculations(member) {
  return String(member?.attendanceStatus || "") === "going";
}

function getTripMembersIncludedInCalculations(trip) {
  return (trip?.members || []).filter(isMemberIncludedInCalculations);
}

function isAttendanceStatusPending(status) {
  const key = String(status || "");
  return key !== "going" && key !== "not_going";
}

function isTripMemberAttendanceSelfLocked(trip, memberId) {
  const member = trip?.members?.find((item) => String(item.id) === String(memberId));
  if (member?.role === "owner") {
    return false;
  }
  return String(member?.attendanceStatus || "") === "not_going" && hasTripAttendanceRestrictionWindow(trip);
}

function getTripExchangeAvailability(trip, groupService, userId = "") {
  if (!trip || !groupService || !userId) {
    return {
      borrowedCount: 0,
      loanedCount: 0,
      requestCount: 0,
      hasBorrowed: false,
      hasLoaned: false,
      hasRequests: false,
      hasExchangeActivity: false
    };
  }

  const borrowedCount = groupService.getBorrowedGearForMember(trip.id, userId).length;
  const loanedCount = groupService.getLoanedOutGearForMember(trip.id, userId).length;
  const requestCount = groupService.getMemberGearNeeds(trip.id, userId, { includeResolved: true }).length;

  return {
    borrowedCount,
    loanedCount,
    requestCount,
    hasBorrowed: borrowedCount > 0,
    hasLoaned: loanedCount > 0,
    hasRequests: requestCount > 0,
    hasExchangeActivity: borrowedCount > 0 || loanedCount > 0 || requestCount > 0
  };
}

function canTripMemberAccessPhotos(trip, userId) {
  return !isTripMemberAutoExcluded(trip, userId);
}

function getRestrictedTripSectionMessage(trip) {
  return joinRichLines([
    ...formatCardHeader("👎 ОБМЕЖЕНИЙ ДОСТУП", trip.name),
    "",
    "У тебе зараз статус `👎 Не йду`, а до старту залишилось 7 днів або менше, тому основні розділи походу тимчасово заблоковані.",
    "",
    "Що тобі лишається доступним:",
    "• `🎒 Спорядження походу` — тільки для обміну речами",
    "• повернення позичених речей",
    "• підтвердження повернення речей, якими користуються інші",
    "",
    "⚠️ Зверни увагу:",
    "• нові запити на позичання і фотоальбом для тебе недоступні",
    "• якщо статус змінився помилково, звернись до організатора або редактора"
  ]);
}

function replyRestrictedTripSection(ctx, trip) {
  return ctx.reply(
    getRestrictedTripSectionMessage(trip),
    { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from?.id || "")) }
  );
}

function canRestrictedTripMemberAccessGearSection(trip, groupService, userId = "") {
  if (!trip || !userId) {
    return false;
  }

  if (groupService) {
    const exchange = getTripExchangeAvailability(trip, groupService, userId);
    return exchange.hasBorrowed || exchange.hasLoaned;
  }

  const normalizedUserId = String(userId);
  const hasBorrowed = Array.isArray(trip.gear) && trip.gear.some((item) =>
    Array.isArray(item?.loans) && item.loans.some((loan) => String(loan?.borrowerMemberId || "") === normalizedUserId)
  );
  const hasLoaned = Array.isArray(trip.gear) && trip.gear.some((item) =>
    String(item?.memberId || "") === normalizedUserId && Array.isArray(item?.loans) && item.loans.length > 0
  );

  return hasBorrowed || hasLoaned;
}

function canUpdateTripMemberStatus(trip, viewerId, memberId) {
  if (canManageTrip(trip, viewerId)) {
    return true;
  }

  return (
    String(viewerId) === String(memberId) &&
    !isTripMemberAttendanceSelfLocked(trip, memberId)
  );
}

function getActiveTripsForUser(groupService, userId) {
  if (!groupService || !userId) {
    return [];
  }

  if (typeof groupService.getActiveGroupsByMember === "function") {
    return groupService.getActiveGroupsByMember(userId);
  }

  const trip = groupService.findGroupByMember(userId);
  return trip ? [trip] : [];
}

function getTripHubItems(groupService, userId) {
  const trips = getActiveTripsForUser(groupService, userId);
  const items = [];
  const labelCounts = new Map();

  for (const trip of trips) {
    const member = getTripMember(trip, userId);
    if (!member) {
      continue;
    }

    const isRestricted = isTripMemberAutoExcluded(trip, userId);
    const prefix = isRestricted
      ? "👎"
      : member.role === "owner"
        ? "🧭"
        : getAttendanceStatusEmoji(member.attendanceStatus) || "🟢";
    const suffix = isRestricted ? " (Не йду)" : "";
    const baseLabel = `${prefix} ${trip.name}${suffix}`;
    const count = (labelCounts.get(baseLabel) || 0) + 1;
    labelCounts.set(baseLabel, count);
    const label = count > 1 ? `${baseLabel} (${count})` : baseLabel;

    items.push({
      id: trip.id,
      label,
      trip,
      isRestricted,
      isPrimary: !isRestricted
    });
  }

  return items;
}

function getTripHubKeyboard(items, options = {}) {
  if (options.canCreate) {
    return buildKeyboard([
      ["➕ Створити похід"],
      ...items.map((item) => [item.label]),
      ["⬅️ Головне меню"]
    ]);
  }

  return buildKeyboard([
    ...items.map((item) => [item.label]),
    ["⬅️ Головне меню"]
  ]);
}

function getTripHubDetailKeyboard(options = {}) {
  const rows = [[TRIP_DETAILS_BACK_LABEL]];

  if (options.canCreate) {
    rows.push(["➕ Створити похід"]);
  }

  rows.push(["⬅️ Головне меню"]);
  return buildKeyboard(rows);
}

function formatTripHubDetailMessage(trip, userId, userService, primaryTrip = null) {
  const member = getTripMember(trip, userId);
  const role = member?.role === "owner" ? "організатор" : member?.canManage ? "редактор" : "учасник";
  const period = trip.tripCard
    ? `${trip.tripCard.startDate} -> ${trip.tripCard.endDate} | Ночівлі: ${trip.tripCard.nights}`
    : "ще не заповнено";
  const readiness = trip.tripCard?.gearReadinessStatus || "ще не задано";
  const route = formatRouteStatus(trip.routePlan);
  const lines = [
    ...formatCardHeader("👥 ПОХІД", trip.name),
    "",
    `Твоя роль: ${role}`,
    `Твій статус: ${formatAttendanceStatusText(member?.attendanceStatus)}`,
    `Статус походу: ${getTripLifecycleLabel(trip.status)}`,
    `Маршрут: ${route}`,
    `Регіон: ${trip.region || "ще не задано"}`,
    `Дати походу: ${period}`,
    `Готовність спорядження: ${readiness}`
  ];

  if (isTripMemberAutoExcluded(trip, userId)) {
    lines.push("");
    lines.push("⚠️ У цьому поході бот уже зафіксував тобі `👎 Не йду`, тому це лише короткий перегляд.");
  }

  if (primaryTrip && String(primaryTrip.id) !== String(trip.id)) {
    lines.push("");
    lines.push(`Активний похід, у якому ти зараз береш участь: ${escapeHtml(primaryTrip.name)}`);
  }

  return joinRichLines(lines);
}

function formatTripDateRangeLabel(trip) {
  if (!trip?.tripCard?.startDate || !trip?.tripCard?.endDate) {
    return "дати ще не задані";
  }

  return `${trip.tripCard.startDate} → ${trip.tripCard.endDate}`;
}

function showTripMenuForTrip(ctx, groupService, trip, { fromHub = false } = {}) {
  setMenuContext(ctx.from?.id, fromHub ? "trip-linked" : "trip");
  const snapshot = groupService.getGearSnapshot(trip.id);
  const isRestricted = isTripMemberAutoExcluded(trip, String(ctx.from.id));
  const role = isTripOwner(trip, String(ctx.from.id)) ? "організатор" : canManageTrip(trip, String(ctx.from.id)) ? "редактор" : "учасник";
  const route = formatRouteStatus(trip.routePlan);
  const period = trip.tripCard
    ? `${trip.tripCard.startDate} -> ${trip.tripCard.endDate} | Ночівлі: ${trip.tripCard.nights}`
    : "ще не заповнено";
  const readiness = trip.tripCard
    ? trip.tripCard.gearReadinessStatus
    : snapshot.readiness;
  const hintLines = isRestricted
    ? [
        "Що зараз доступно:",
        "• Спорядження походу — тільки обмін речами та повернення",
        "• фото, робочі розділи й нові позики для тебе заблоковані",
        "• якщо це сталося помилково, звернись до організатора або редактора"
      ]
    : [
        "Що де шукати:",
        "• Деталі походу — головна зведена картка",
        "• Маршрут походу — трек, GPX/KML і перегляд карти",
        "• Учасники походу — список і запрошення",
        "• Спорядження походу — речі, запити і облік",
        "• Харчування / Витрати — робочі списки походу",
        "• Фото походу — кадри з маршруту, короткі підписи і фотоальбом"
      ];

  if (!isRestricted && canManageTrip(trip, String(ctx.from.id))) {
    hintLines.push("• У Деталях походу можна редагувати назву, дати і готовність");
    hintLines.push("• У Налаштуваннях зібрані нагадування і службові дії по походу");
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

  const backLabel = getMenuContext(userId) === "trip-linked"
    ? TRIP_LIST_BACK_LABEL
    : "⬅️ Головне меню";

  if (isTripMemberAutoExcluded(trip, userId)) {
    const rows = [];
    if (canRestrictedTripMemberAccessGearSection(trip, null, userId)) {
      rows.push(["🎒 Спорядження походу"]);
    }

    if (canManageTrip(trip, userId)) {
      rows.push([TRIP_SETTINGS_LABEL]);
    }

    rows.push([backLabel]);
    return buildKeyboard(rows);
  }

  const rows = [
    [TRIP_DETAILS_LABEL, "👥 Учасники походу", canManageTrip(trip, userId) ? TRIP_SETTINGS_LABEL : KEYBOARD_PLACEHOLDER],
    ["🗺 Маршрут походу", "🎒 Спорядження походу", "⚖️ Вага рюкзака"],
    ["🆘 Безпека походу", "🍲 Харчування походу", TRIP_PHOTOS_LABEL],
    ["🌦 Погода походу", "💸 Витрати походу"],
    [backLabel]
  ];

  return buildKeyboard(rows);
}

function getTripSettingsKeyboard(trip, userId = "") {
  if (!trip || !canManageTrip(trip, userId)) {
    return buildKeyboard([[TRIP_SETTINGS_BACK_LABEL]]);
  }

  const rows = [["🔔 Нагадування"]];
  if (isTripOwner(trip, userId)) {
    rows.push([TRIP_TRANSFER_ORGANIZER_LABEL]);
    rows.push(["🛡 Права редагування"]);
  }
  rows.push([TRIP_SETTINGS_BACK_LABEL]);
  return buildKeyboard(rows);
}

function getTransferOrganizerKeyboard(items = [], { includeInvite = false } = {}) {
  const rows = [];
  for (const item of items) {
    rows.push([item.label]);
  }
  if (includeInvite) {
    rows.push([TRIP_TRANSFER_INVITE_LABEL]);
  }
  rows.push([TRIP_TRANSFER_BACK_LABEL]);
  return buildKeyboard(rows);
}

function buildOrganizerTransferInlineKeyboard(groupId, requestId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Прийняти роль організатора", `towner|a|${requestId}`),
      Markup.button.callback("❌ Відмовитись", `towner|d|${requestId}`)
    ]
  ]);
}

function getTripRemindersKeyboard(trip) {
  const rows = [];
  if (trip?.remindersEnabled === true) {
    rows.push([TRIP_REMINDERS_DISABLE_LABEL]);
  } else {
    rows.push([TRIP_REMINDERS_ENABLE_LABEL]);
  }
  rows.push([TRIP_DETAILS_BACK_LABEL]);
  return buildKeyboard(rows);
}

function getTripDetailsKeyboard(trip, userId = "") {
  if (!canManageTrip(trip, userId)) {
    return null;
  }

  const backLabel = getMenuContext(userId) === "trip_details_linked"
    ? TRIP_LIST_BACK_LABEL
    : TRIP_DETAILS_BACK_LABEL;
  const rows = [["✏️ Редагувати дані походу"]];
  if (isTripOwner(trip, userId)) {
    const actionRow = [];
    if (canTripBeFinished(trip)) {
      actionRow.push("✅ Завершити похід");
    }
    if (canTripBeCancelled(trip)) {
      actionRow.push(CANCEL_TRIP_LABEL);
    }
    if (actionRow.length) {
      rows.push(actionRow);
    }
  }
  rows.push([backLabel]);
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

function showParentMenuByContext(ctx, groupService, context, advisorService = null) {
  if (context === "trip-route-change") {
    return showTripRouteChangeMenu(ctx, groupService);
  }
  if (context === "trip-route" || context === "trip-route-catalog") {
    return showRouteMenu(ctx, groupService, advisorService);
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
  if (mode === "trip") {
    return buildKeyboard([["❌ Скасувати", getVpohidBackLabel(mode)]]);
  }

  return buildKeyboard([["❌ Скасувати"]]);
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
    ["❌ Скасувати"]
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
    lines.push("", "🧭 Точки для генерації треку", detail.points.join(" → "));
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
    "📋 Деталі маршруту",
    detail.title
  ];

  if (detail.subtitle) {
    lines.push("", detail.subtitle);
  }

  if (detail.start || detail.finish) {
    lines.push(`Старт / фініш: ${detail.start || "—"}${detail.finish ? ` → ${detail.finish}` : ""}`);
  }

  if (detail.points?.length) {
    lines.push(`Точки маршруту: ${detail.points.join(" → ")}`);
  }

  if (selection.points?.length) {
    lines.push(`Точки для генерації треку: ${selection.points.join(" → ")}`);
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
  rows.push(["⬅️ До походу"]);

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

function getTripMemberStatusInlineKeyboard(trip, memberId, viewerId) {
  const rows = [];
  const member = trip?.members?.find((item) => String(item.id) === String(memberId)) || null;

  if (canUpdateTripMemberStatus(trip, viewerId, memberId)) {
    rows.push([
      Markup.button.callback("👍 Йду", `mstatus|${trip.id}|${memberId}|going`),
      Markup.button.callback("🤔 Думаю", `mstatus|${trip.id}|${memberId}|thinking`),
      Markup.button.callback("👎 Не йду", `mstatus|${trip.id}|${memberId}|not_going`)
    ]);
  }

  if (member && getMemberTickets(member).length > 0 && canManageTripMemberTickets(trip, viewerId, memberId)) {
    rows.push([
      Markup.button.callback(MEMBER_TICKETS_LABEL, `mtickets|${trip.id}|${memberId}`)
    ]);
  }

  return rows.length ? Markup.inlineKeyboard(rows) : {};
}

function getTripMemberDetailsKeyboard(trip, viewerId, memberId) {
  const rows = [];
  if (canManageTripMemberTickets(trip, viewerId, memberId)) {
    rows.push([MEMBER_TICKETS_UPLOAD_LABEL]);
  }
  rows.push([MEMBER_TICKETS_BACK_LABEL]);
  return buildKeyboard(rows);
}

function getTripMemberTicketsKeyboard(items = [], { selected = false } = {}) {
  const rows = [];

  for (const item of items) {
    rows.push([item.label]);
  }

  rows.push([MEMBER_TICKETS_BACK_LABEL]);
  return buildKeyboard(rows);
}

function getTripMemberTicketUploadKeyboard() {
  return buildKeyboard([[MEMBER_TICKET_FLOW_BACK_LABEL]]);
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

  const firstRow = ["🗺 Переглянути маршрут походу"];

  if (canManage) {
    firstRow.push(ROUTE_CHANGE_LABEL);
  }
  rows.push(firstRow);
  const hasExportTrack = ["verified", "router-generated"].includes(trip?.routePlan?.meta?.trackQuality);

  if (hasExportTrack) {
    rows.push(["📄 GPX трек", "📄 KML трек"]);
    rows.push(["🗺 HTML карта треку", "⬅️ До походу"]);
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

function hasEditableTripGear(trip, groupService, userId = "") {
  if (!trip || !groupService || !userId) {
    return false;
  }

  return getEditableTripGearItems(trip, groupService, userId).length > 0;
}

function getTripGearKeyboard(trip = null, groupService = null, userId = "") {
  if (trip && isTripMemberAutoExcluded(trip, userId)) {
    if (!canRestrictedTripMemberAccessGearSection(trip, groupService, userId)) {
      return buildKeyboard([
        ["⬅️ До походу"]
      ]);
    }
    return buildKeyboard([
      [TRIP_GEAR_ACCOUNTING_LABEL],
      ["⬅️ До походу"]
    ]);
  }

  const rows = [[TRIP_GEAR_ADD_LABEL, TRIP_GEAR_VIEW_ALL_LABEL]];

  if (hasEditableTripGear(trip, groupService, userId)) {
    rows.push(["✏️ Редагувати спорядження", TRIP_GEAR_ACCOUNTING_LABEL]);
  } else {
    rows.push([TRIP_GEAR_ACCOUNTING_LABEL]);
  }

  rows.push(["⬅️ До походу"]);
  return buildKeyboard(rows);
}

function getCurrentTripGearKeyboard(ctx, groupService) {
  const userId = String(ctx.from?.id || "");
  const trip = groupService?.findGroupByMember(userId) || null;
  return getTripGearKeyboard(trip, groupService, userId);
}

function getTripGearAccountingKeyboard(trip = null, groupService = null, userId = "") {
  const exchange = getTripExchangeAvailability(trip, groupService, userId);
  const isRestricted = Boolean(trip && isTripMemberAutoExcluded(trip, userId));
  const rows = [];

  if (!isRestricted) {
    rows.push([GEAR_NEED_CREATE_LABEL, GEAR_MY_REQUESTS_LABEL]);
  } else if (exchange.hasBorrowed || exchange.hasLoaned) {
    rows.push([GEAR_MY_REQUESTS_LABEL]);
  }

  if (exchange.hasBorrowed && exchange.hasLoaned) {
    rows.push([GEAR_BORROWED_LABEL, GEAR_LOANED_LABEL]);
  } else if (exchange.hasBorrowed) {
    rows.push([GEAR_BORROWED_LABEL]);
  } else if (exchange.hasLoaned) {
    rows.push([GEAR_LOANED_LABEL]);
  }

  rows.push([TRIP_GEAR_ADD_BACK_LABEL]);
  return buildKeyboard(rows);
}

function getCurrentTripGearAccountingKeyboard(ctx, groupService) {
  const userId = String(ctx.from?.id || "");
  const trip = groupService?.findGroupByMember(userId) || null;
  return getTripGearAccountingKeyboard(trip, groupService, userId);
}

function getLoanedGearShortcutKeyboard() {
  return buildKeyboard([
    [GEAR_LOANED_LABEL]
  ]);
}

function getGearDeleteConfirmKeyboard() {
  return buildKeyboard([
    [GEAR_DELETE_CONFIRM_LABEL, "❌ Скасувати"]
  ]);
}

function getTripGearEditItemsKeyboard(items, page = 0) {
  return getPaginatedItemsKeyboard(items, page);
}

function getPaginatedItemsKeyboard(items, page = 0, pageSize = 8) {
  const pagesCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(0, Number(page) || 0), pagesCount - 1);
  const startIndex = safePage * pageSize;
  const visibleItems = items.slice(startIndex, startIndex + pageSize);
  const rows = [];
  for (let index = 0; index < visibleItems.length; index += 2) {
    rows.push(visibleItems.slice(index, index + 2).map((item) => item.actionLabel));
  }
  if (pagesCount > 1) {
    const paginationRow = [];
    if (safePage > 0) {
      paginationRow.push(PAGINATION_PREV_LABEL);
    }
    if (safePage < pagesCount - 1) {
      paginationRow.push(PAGINATION_NEXT_LABEL);
    }
    if (paginationRow.length) {
      rows.push(paginationRow);
    }
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

function getMyGearNeedItemsKeyboard(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2).map((item) => item.actionLabel));
  }
  rows.push([GEAR_EDIT_BACK_LABEL]);
  return buildKeyboard(rows);
}

function getMyGearNeedActionKeyboard(need, { showHelp = false, allowBorrowRequest = false } = {}) {
  const rows = [];

  if (showHelp && allowBorrowRequest) {
    rows.push([GEAR_NEED_HELP_LABEL, GEAR_NEED_REQUEST_LABEL]);
  } else if (showHelp) {
    rows.push([GEAR_NEED_HELP_LABEL]);
  } else if (allowBorrowRequest) {
    rows.push([GEAR_NEED_REQUEST_LABEL]);
  }

  rows.push([GEAR_NEED_CANCEL_LABEL, GEAR_EDIT_BACK_LABEL]);
  return buildKeyboard(rows);
}

function getMyGearNeedMatchesKeyboard(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2).map((item) => item.actionLabel));
  }
  rows.push([GEAR_EDIT_BACK_LABEL]);
  return buildKeyboard(rows);
}

function getGearNeedCancelConfirmKeyboard() {
  return buildKeyboard([
    [GEAR_NEED_CONFIRM_CANCEL_LABEL, "❌ Скасувати"]
  ]);
}

function getGearLoanApprovalKeyboard() {
  return buildKeyboard([
    [GEAR_LOAN_APPROVE_LABEL, GEAR_LOAN_DECLINE_LABEL]
  ]);
}

function getBorrowedGearItemsKeyboard(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2).map((item) => item.actionLabel));
  }
  rows.push([GEAR_EDIT_BACK_LABEL]);
  return buildKeyboard(rows);
}

function getBorrowedGearActionKeyboard({ allowReturn = false, allowReminder = false } = {}) {
  const rows = [];
  if (allowReturn) {
    rows.push([GEAR_RETURN_REQUEST_LABEL]);
  }
  if (allowReminder) {
    rows.push([GEAR_RETURN_REMIND_LABEL]);
  }
  rows.push(["❌ Скасувати"]);
  return buildKeyboard(rows);
}

function getLoanedGearItemsKeyboard(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2).map((item) => item.actionLabel));
  }
  rows.push([GEAR_EDIT_BACK_LABEL]);
  return buildKeyboard(rows);
}

function getLoanedGearActionKeyboard({ allowConfirm = false } = {}) {
  const rows = [];
  if (allowConfirm) {
    rows.push([GEAR_RETURN_CONFIRM_LABEL]);
  }
  rows.push([GEAR_EDIT_BACK_LABEL]);
  return buildKeyboard(rows);
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

function getTripGearAddTypeKeyboard({ allowPersonal = true } = {}) {
  const rows = [];

  if (allowPersonal) {
    rows.push(["🫕 Додати спільне", "🎒 Додати особисте"]);
  } else {
    rows.push(["🫕 Додати спільне", "🧰 Додати запасне / позичу"]);
  }

  if (allowPersonal) {
    rows.push(["🧰 Додати запасне / позичу"]);
  }

  rows.push(["❌ Скасувати"]);
  return buildKeyboard(rows);
}

function getTripFoodKeyboard({ hasItems = false } = {}) {
  const rows = [["🥘 Додати продукт"]];
  if (hasItems) {
    rows[0].push("🗑 Видалити продукт");
  }
  rows.push(["🧾 Переглянути все харчування"]);
  rows.push(["⬅️ До походу"]);
  return buildKeyboard(rows);
}

function getTripPhotosKeyboard() {
  return buildKeyboard([
    [TRIP_PHOTOS_ADD_LABEL, TRIP_PHOTO_ALBUM_LABEL],
    ["⬅️ До походу"]
  ]);
}

function getTripSafetyKeyboard() {
  return buildKeyboard([
    ["⬅️ До походу"]
  ]);
}

function getTripSafetyInlineKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback(TRIP_SOS_LABEL, "trip_sos_package")]]);
}

function getTripExpensesKeyboard({ hasItems = false } = {}) {
  const rows = [["💸 Додати витрату"]];
  if (hasItems) {
    rows[0].push("🗑 Видалити витрату");
  }
  rows.push(["🧾 Переглянути всі витрати"]);
  rows.push(["⬅️ До походу"]);
  return buildKeyboard(rows);
}

function getTripFoodMenuKeyboard(groupService, tripId) {
  const hasItems = Boolean(groupService.getFoodSnapshot(tripId)?.items?.length);
  return getTripFoodKeyboard({ hasItems });
}

function getTripExpensesMenuKeyboard(groupService, tripId) {
  const hasItems = Boolean(groupService.getExpenseSnapshot(tripId)?.items?.length);
  return getTripExpensesKeyboard({ hasItems });
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

function buildTripCardChangedNotification(trip, actorName, previousTripCard = {}) {
  const nextTripCard = trip.tripCard || {};
  const datesChanged =
    previousTripCard?.startDate !== nextTripCard?.startDate ||
    previousTripCard?.endDate !== nextTripCard?.endDate;
  const meetingPointChanged =
    normalizeLocationLabel(previousTripCard?.meetingPoint || "") !==
    normalizeLocationLabel(nextTripCard?.meetingPoint || "");
  const meetingDateTimeChanged =
    formatTripMeetingDateTime(previousTripCard || {}) !== formatTripMeetingDateTime(nextTripCard || {});

  const lines = [
    ...formatCardHeader("🪪", "ЗМІНЕНО ДАНІ ПОХОДУ"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> оновлено дані.`
  ];
  const pushChangedBlock = (label, previousValue, nextValue) => {
    lines.push(
      "",
      `<b>${escapeHtml(label)}</b>`,
      `Було: <b>${escapeHtml(previousValue || "не вказано")}</b>`,
      `Стало: <b>${escapeHtml(nextValue || "не вказано")}</b>`
    );
  };

  if (datesChanged) {
    pushChangedBlock(
      "Дати",
      formatTripDatesRange(previousTripCard),
      formatTripDatesRange(nextTripCard)
    );
  }

  if (meetingPointChanged) {
    pushChangedBlock(
      "Точка збору",
      normalizeLocationLabel(previousTripCard?.meetingPoint || ""),
      normalizeLocationLabel(nextTripCard?.meetingPoint || "")
    );
  }

  if (meetingDateTimeChanged) {
    pushChangedBlock(
      "Дата та Час збору",
      formatTripMeetingDateTime(previousTripCard || {}),
      formatTripMeetingDateTime(nextTripCard || {})
    );
  }

  lines.push("");
  lines.push(`Змінив: <b>${escapeHtml(actorName)}</b>`);
  return joinRichLines(lines);
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
      await sendRichText(telegram, member.id, text, {
        parse_mode: "HTML",
        ...getTripKeyboard(trip, member.id)
      });
    } catch {
      // Ignore users who blocked the bot or haven't started it yet.
    }
  }
}

function getTripOwnerMember(trip) {
  return trip?.members?.find((member) => member.role === "owner") || trip?.members?.[0] || null;
}

function buildAttendanceReminderMessage(trip, member, userService) {
  const owner = getTripOwnerMember(trip);
  const ownerName = owner ? getMemberDisplayName(userService, owner) : "організатор";

  return joinRichLines([
    `🔔 Підтверди участь у поході "${trip.name}"`,
    "",
    `Зараз у тебе статус: ${formatAttendanceStatusText(member.attendanceStatus)}`,
    "До старту залишилось 8 днів, тому вже час зафіксувати участь.",
    "",
    "Де це змінити:",
    "• `👥 Похід`",
    "• `👥 Учасники походу`",
    "• обери себе в списку і натисни один зі статусів: `👍 Йду`, `🤔 Думаю` або `👎 Не йду`",
    "",
    `Якщо щось неясно, напиши організатору: ${ownerName}.`
  ]);
}

function buildAttendanceAutoDeclinedMessage(trip, member, userService) {
  const owner = getTripOwnerMember(trip);
  const ownerName = owner ? getMemberDisplayName(userService, owner) : "організатор";

  return joinRichLines([
    `⚠️ Статус участі в поході "${trip.name}" оновлено автоматично`,
    "",
    `Твій статус був: ${formatAttendanceStatusText(member.attendanceStatus)}`,
    `Новий статус: ${formatAttendanceStatusText("not_going")}`,
    "",
    "До старту залишилось 7 днів, а участь не була підтверджена, тому бот автоматично перевів тебе в статус `Не йду`.",
    "Активні запити на спорядження, якщо вони були, бот теж скасував.",
    "Самостійно змінити цей статус тепер не можна.",
    `Якщо це помилка або плани змінились, зв'яжися з організатором: ${ownerName}.`
  ]);
}

function buildOwnerPendingAttendanceMessage(trip, members, userService) {
  const lines = [
    `🔔 Підтвердження участі в поході "${trip.name}"`,
    "",
    "До старту залишилось 8 днів.",
    "Ці учасники ще не підтвердили участь або залишились у статусі `🤔 Думаю`:",
    ""
  ];

  for (const [index, member] of members.entries()) {
    lines.push(`${index + 1}. ${getMemberDisplayName(userService, member)} — ${formatAttendanceStatusText(member.attendanceStatus)}`);
  }

  lines.push("");
  lines.push("Їх уже окремо попросили підтвердити участь у розділі `👥 Учасники походу`.");
  return joinRichLines(lines);
}

function buildOwnerAutoDeclinedAttendanceMessage(trip, members, userService) {
  const lines = [
    `⚠️ Автопереведення статусів у поході "${trip.name}"`,
    "",
    "До старту залишилось 7 днів, і бот автоматично перевів у `👎 Не йду` таких учасників:",
    ""
  ];

  for (const [index, member] of members.entries()) {
    lines.push(`${index + 1}. ${getMemberDisplayName(userService, member)}`);
  }

  lines.push("");
  lines.push("Ці учасники більше не можуть самі змінити свій статус. Якщо потрібно, ти або редактор можете змінити його вручну.");
  return joinRichLines(lines);
}

function buildAttendanceStatusChangedNotification(trip, member, actorLabel, previousStatus, nextStatus, { automatic = false } = {}) {
  const lines = [
    `👥 Оновлення статусу участі в поході "${trip.name}"`,
    "",
    `Учасник: ${member}`,
    `Було: ${formatAttendanceStatusText(previousStatus)}`,
    `Стало: ${formatAttendanceStatusText(nextStatus)}`
  ];

  if (automatic) {
    lines.push("Оновлено автоматично ботом за правилом підтвердження участі.");
  } else if (actorLabel) {
    lines.push(`Змінив: ${actorLabel}`);
  }

  return lines.join("\n");
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
  if (mode === "edit" || mode === "create") {
    return buildKeyboard([["❌ Скасувати"]]);
  }

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

  if (mode === "edit" || mode === "create") {
    rows.push(["❌ Скасувати"]);
  } else {
    rows.push(["❌ Скасувати", getRouteFlowBackLabel(mode)]);
  }
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
  const meetingDateTime = formatTripMeetingDateTime(tripCard);
  return joinRichLines([
      ...formatCardHeader("🗂 ДАНІ ПОХОДУ", trip.name),
    "",
    `Дати: ${tripCard.startDate} -> ${tripCard.endDate}`,
    `Ночівлі: ${tripCard.nights}`,
    `Статус готовності спорядження: ${readiness}`,
    tripCard.meetingPoint ? `Точка збору: ${tripCard.meetingPoint}` : null,
    meetingDateTime ? `Дата та Час збору: ${meetingDateTime}` : null,
    `Додано спорядження: ${totalGear}`,
    `Активних запитів: ${missingCount}`
  ].filter(Boolean));
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
  const meetingPoint = normalizeLocationLabel(trip.tripCard?.meetingPoint || "");
  const meetingDateTime = formatTripMeetingDateTime(trip.tripCard || {});
  const lines = [...formatCardHeader("🔔 НАГАДУВАННЯ", trip.name), ""];

  lines.push(`Статус нагадувань: ${trip.remindersEnabled === true ? "увімкнено" : "вимкнено"}`);
  lines.push("");

  if (meetingPoint || meetingDateTime) {
    lines.push("🚆 Що бот також нагадає учасникам про збір");
    if (meetingPoint) {
      lines.push(`• Точка збору: ${meetingPoint}`);
    }
    if (meetingDateTime) {
      lines.push(`• Дата та Час збору: ${meetingDateTime}`);
    }
    lines.push("");
  }

  for (const item of plan) {
    const sentAt = reminderState[item.key];
    lines.push(`${item.title}`);
    lines.push(`• Дата походу: ${formatDateShort(item.date)}`);
    lines.push(`• Що нагадає бот: ${item.text}`);
    lines.push(`• Статус: ${sentAt ? `вже надіслано (${String(sentAt).slice(0, 16).replace("T", " ")})` : "очікує"}`);
    lines.push("");
  }

  lines.push("⚠️ Нагадування бот надсилає учасникам автоматично.");
  if (meetingPoint || meetingDateTime) {
    lines.push("• якщо точку збору вже задано, бот також додасть її в автоматичні повідомлення");
  }
  return joinRichLines(lines);
}

async function applyImmediateAttendanceDeadlineRules(telegram, groupService, userService, trip) {
  if (!trip?.id || !trip?.tripCard?.startDate) {
    return trip;
  }

  const daysUntil = calculateDaysUntil(trip.tripCard.startDate);
  if (daysUntil === null || daysUntil > 7) {
    return trip;
  }

  let currentTrip = trip;
  const autoDeclinedMembers = [];

  for (const member of currentTrip.members || []) {
    const memberId = String(member?.id || "");
    if (!memberId || member.role === "owner" || !isAttendanceStatusPending(member.attendanceStatus)) {
      continue;
    }

    const result = groupService.setMemberAttendanceStatusSystem({
      groupId: currentTrip.id,
      targetMemberId: memberId,
      status: "not_going",
      lockSelfChange: true
    });

    if (!result.ok) {
      continue;
    }

    groupService.cancelActiveGearNeedsForMember({
      groupId: currentTrip.id,
      memberId
    });

    currentTrip = groupService.getGroup(currentTrip.id) || result.group;
    const updatedMember = currentTrip.members.find((item) => String(item.id) === memberId) || member;

    if (result.previousStatus !== updatedMember.attendanceStatus) {
      autoDeclinedMembers.push(updatedMember);

      if (telegram) {
        try {
          await sendRichText(
            telegram,
            memberId,
            buildAttendanceAutoDeclinedMessage(currentTrip, member, userService),
            getTripKeyboard(currentTrip, memberId)
          );
        } catch {
          // Ignore users who haven't opened the bot or blocked it.
        }
      }

      void notifyTripMembers(
        telegram,
        currentTrip,
        buildAttendanceStatusChangedNotification(
          currentTrip,
          getMemberDisplayName(userService, updatedMember),
          "",
          result.previousStatus,
          updatedMember.attendanceStatus,
          { automatic: true }
        )
      );
    }
  }

  if (autoDeclinedMembers.length) {
    const ownerMember = getTripOwnerMember(currentTrip);
    if (telegram && ownerMember?.id) {
      try {
        await sendRichText(
          telegram,
          ownerMember.id,
          buildOwnerAutoDeclinedAttendanceMessage(currentTrip, autoDeclinedMembers, userService),
          getTripKeyboard(currentTrip, ownerMember.id)
        );
      } catch {
        // Ignore users who haven't opened the bot or blocked it.
      }
    }
  }

  return currentTrip;
}

function normalizeLocationKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’`"]/g, "")
    .replace(/\bм\.\s*/g, "")
    .replace(/\bмісто\s+/g, "")
    .replace(/\bобласть\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLocationLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

const DEPARTURE_HUB_RULES = [
  { hub: "Київ", keywords: ["київ", "біла церква", "бориспіль", "бровари", "ірпінь", "буча", "вишневе", "обухів", "васильків", "фастів"] },
  { hub: "Львів", keywords: ["львів", "дрогобич", "стрий", "трускавець", "червоноград", "новояворівськ"] },
  { hub: "Івано-Франківськ", keywords: ["івано-франківськ", "франківськ", "калуш", "долина", "болехів", "надвірна", "стара гута", "манява", "осмолода"] },
  { hub: "Ворохта", keywords: ["ворохта", "татарів", "яремче", "буковель", "поляниця", "яблуниця", "лазещина", "кваси", "заросляк", "дземброня", "верховина"] },
  { hub: "Воловець", keywords: ["воловець", "пилипець", "міжгіря", "міжгір'я", "синевир", "боржава", "подобовець"] },
  { hub: "Мукачево", keywords: ["ужгород", "мукачево", "свалява", "берегове", "чоп"] },
  { hub: "Ясіня", keywords: ["ясіня", "рахів", "драгобрат", "свидовець"] },
  { hub: "Сколе", keywords: ["сколе", "славське", "труханів", "орявчик", "парашка", "бескиди"] },
  { hub: "Чернівці", keywords: ["чернівці", "вижниця", "путиля", "селятин", "буковина"] }
];

const ARRIVAL_HUB_RULES = [
  { hub: "Івано-Франківськ", keywords: ["стара гута", "осмолода", "манява", "сивуля", "мала сивуля", "ігровець", "висока", "горган", "кедрова палата", "бистриця", "калуш", "долина"] },
  { hub: "Ворохта", keywords: ["ворохта", "заросляк", "кукул", "говерла", "петрос", "хомяк", "хом'як", "синяк", "яремче", "татарів", "лазещина", "кваси", "дземброня", "верховина", "чорногора", "чорногора"] },
  { hub: "Воловець", keywords: ["пилипець", "воловець", "боржава", "подобовець", "міжгіря", "міжгір'я", "синевир"] },
  { hub: "Ясіня", keywords: ["ясіня", "рахів", "драгобрат", "свидовець", "близниця", "близниця"] },
  { hub: "Сколе", keywords: ["сколе", "славське", "парашка", "бескиди", "тустань"] },
  { hub: "Чернівці", keywords: ["путиля", "селятин", "буковина", "чернівці"] }
];

const HUB_DETAILS = {
  "Київ": {
    region: "Київської області",
    station: "Київ — Центральний залізничний вокзал / автостанція"
  },
  "Львів": {
    region: "Львівської області",
    station: "Львів — головний залізничний вокзал / автостанція"
  },
  "Івано-Франківськ": {
    region: "Івано-Франківської області",
    station: "Івано-Франківськ — залізничний вокзал / автостанція"
  },
  "Ворохта": {
    region: "Івано-Франківської області",
    station: "Ворохта — залізнична станція / автостанція"
  },
  "Воловець": {
    region: "Закарпатської області",
    station: "Воловець — залізнична станція / автостанція"
  },
  "Мукачево": {
    region: "Закарпатської області",
    station: "Мукачево — залізничний вокзал / автостанція"
  },
  "Ясіня": {
    region: "Закарпатської області",
    station: "Ясіня — залізнична станція / автостанція"
  },
  "Сколе": {
    region: "Львівської області",
    station: "Сколе — залізнична станція / автостанція"
  },
  "Чернівці": {
    region: "Чернівецької області",
    station: "Чернівці — залізничний вокзал / автостанція"
  }
};

function getHubDetails(hub) {
  return HUB_DETAILS[hub] || {
    region: "",
    station: `${hub} — залізничний вокзал / автостанція`
  };
}

function formatParticipantCountLabel(count) {
  const map = {
    1: "Один учасник",
    2: "Два учасники",
    3: "Три учасники",
    4: "Чотири учасники"
  };

  return map[count] || `${count} учасників`;
}

function formatParticipantShortName(name = "") {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0];
  }

  const surname = [...parts].sort((left, right) => right.length - left.length)[0];
  const namePart = parts.find((part) => part !== surname) || parts[0];
  return `${surname} ${namePart.charAt(0)}.`;
}

function formatHumanList(items = []) {
  const values = [...new Set((items || []).filter(Boolean))];

  if (values.length <= 1) {
    return values[0] || "";
  }

  if (values.length === 2) {
    return `${values[0]} та ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")} та ${values[values.length - 1]}`;
}

function formatOriginLabel(cities, region) {
  const normalizedCities = [...new Set((cities || []).filter(Boolean))];

  if (!normalizedCities.length) {
    return "без вказаного міста";
  }

  if (normalizedCities.length === 1) {
    return `з м. ${normalizedCities[0]}${region ? `, ${region}` : ""}`;
  }

  return `з міст ${normalizedCities.map((item) => `м. ${item}`).join(", ")}${region ? `, ${region}` : ""}`;
}

function formatParticipantGroupLabel(memberNames, count) {
  const namesLabel = formatHumanList(memberNames);
  if (!namesLabel) {
    return formatParticipantCountLabel(count);
  }

  if (count === 1) {
    return `Учасник ${namesLabel}`;
  }

  return `${formatParticipantCountLabel(count)} ${namesLabel}`;
}

function extractMeetingPointCity(meetingPoint = "") {
  return normalizeLocationLabel(String(meetingPoint || "").split(/[,—–-]/)[0] || "");
}

function isValidMeetingTime(value = "") {
  return validateMeetingTime(value).ok;
}

function buildTripMeetingPointPrompt(currentValue = "") {
  return [
    "Введи точку збору.",
    currentValue ? `Поточне значення: ${currentValue}` : null,
    "Приклад: `Івано-Франківськ, залізничний вокзал`",
    "",
    "Можна натиснути `⏭ Пропустити`, тоді бот використає автоматичну логіку."
  ].filter(Boolean).join("\n");
}

function buildTripMeetingTimePrompt(currentValue = "") {
  return [
    "Введи час збору у форматі HH:MM.",
    currentValue ? `Поточне значення: ${currentValue}` : null,
    "Приклад: `07:30`",
    "",
    "Можна натиснути `⏭ Пропустити`, якщо час ще не визначено."
  ].filter(Boolean).join("\n");
}

function buildRoutePrompt(step, mode = "search") {
  if (step === "from") {
    return mode === "search"
      ? "Введи точку старту маршруту.\nПриклад: `Яремче` або `Заросляк`."
      : "Введи точку старту походу.\nПриклад: `Заросляк` або `Ворохта`.";
  }

  if (step === "to") {
    return mode === "search"
      ? "Введи точку фінішу маршруту.\nПриклад: `Говерла` або `Кукул`."
      : "Введи точку фінішу або цілі походу.\nПриклад: `Кукул` або `Говерла`.";
  }

  return "Введи регіон або населений пункт для погоди походу.\nПриклад: `Ворохта`";
}

function buildTripMeetingDatePrompt(currentValue = "") {
  return [
    "Введи дату збору у форматі YYYY-MM-DD.",
    currentValue ? `Поточне значення: ${currentValue}` : null,
    "Приклад: `2026-07-14`",
    "",
    "Можна натиснути `⏭ Пропустити`, якщо дату ще не визначено."
  ].filter(Boolean).join("\n");
}

function formatTripMeetingDateTime(tripCard = {}) {
  const meetingDate = String(tripCard?.meetingDate || "").trim();
  const startDate = String(tripCard?.startDate || "").trim();
  const meetingTime = String(tripCard?.meetingTime || "").trim();
  const hasExplicitMeetingDate = Object.prototype.hasOwnProperty.call(tripCard || {}, "meetingDate");
  const effectiveDate = hasExplicitMeetingDate ? meetingDate : (meetingDate || startDate);
  const timeMatch = meetingTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (effectiveDate && timeMatch) {
    const hour = Number(timeMatch[1]);
    const dayPeriod = hour >= 5 && hour < 12
      ? "ранку"
      : hour >= 12 && hour < 17
        ? "дня"
        : hour >= 17 && hour < 23
          ? "вечора"
          : "ночі";

    return `${effectiveDate} о ${meetingTime} ${dayPeriod}`;
  }

  if (effectiveDate && meetingTime) {
    return `${effectiveDate} о ${meetingTime}`;
  }

  return effectiveDate || meetingTime || "";
}

function formatIsoDateTimeShort(value = "") {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 16).replace("T", " ") : "не вказано";
}

function truncateListForMessage(items = [], limit = 3) {
  if (!items.length) {
    return [];
  }

  if (items.length <= limit) {
    return items;
  }

  return [...items.slice(0, limit), `… і ще ${items.length - limit}`];
}

function formatTripPhotoAlbumSummary(trip, album) {
  const lines = [
    ...formatCardHeader("🖼 ФОТОАЛЬБОМ", trip.name),
    "",
    `Усього фото: ${album.totalCount}`,
    `Останнє оновлення: ${formatIsoDateTimeShort(album.latestAt)}`,
    ""
  ];

  if (album.byMoment.length) {
    lines.push(formatSectionHeader("🗂", "За Подіями"));
    lines.push(...album.byMoment.map((item) => `• ${item.label}: ${item.count}`));
    lines.push("");
  }

  if (album.byAuthor.length) {
    lines.push(formatSectionHeader("👥", "Хто Додавав Фото"));
    lines.push(...truncateListForMessage(album.byAuthor, 5).map((item) =>
      typeof item === "string" ? `• ${item}` : `• ${escapeHtml(item.authorMemberName)}: ${item.count}`
    ));
    lines.push("");
  }

  lines.push(`Показую останні фото: ${album.items.length}${album.totalCount > album.items.length ? ` із ${album.totalCount}` : ""}.`);
  return joinRichLines(lines);
}

function groupTripPhotoItemsByMoment(items = []) {
  const grouped = new Map();

  for (const item of items) {
    const key = String(item?.momentKey || "route");
    const current = grouped.get(key);
    if (current) {
      current.items.push(item);
      continue;
    }

    grouped.set(key, {
      key,
      label: item?.momentLabel || "Маршрут і команда",
      items: [item]
    });
  }

  return [...grouped.values()];
}

function getTripSosMedicalLines(trip, userService, viewerCanManage = false) {
  if (!viewerCanManage) {
    return [];
  }

  const lines = [];

  for (const member of trip.members || []) {
    const profile = userService.getProfile(member.id, member.name).profile;
    const details = [
      profile.bloodType ? `група крові: ${profile.bloodType}` : null,
      profile.allergies ? `алергії: ${profile.allergies}` : null,
      profile.medications ? `ліки: ${profile.medications}` : null,
      profile.healthNotes ? `важливо: ${profile.healthNotes}` : null,
      profile.emergencyContactName
        ? `контакт: ${profile.emergencyContactName}${profile.emergencyContactPhone ? `, ${profile.emergencyContactPhone}` : ""}`
        : null
    ].filter(Boolean);

    if (!details.length) {
      continue;
    }

    lines.push(`• ${escapeHtml(userService.getDisplayName(member.id, member.name))} — ${escapeHtml(details.join(" | "))}`);
  }

  return lines;
}

function formatTripSosPackage(trip, groupService, userService, viewerId = "") {
  const safety = resolveSafetyProfile(trip);
  const safetyPhones = [...new Set((safety.general || []).flatMap((item) => item.phones || []))];
  const members = (trip.members || []).map((member) => {
    const profile = userService.getProfile(member.id, member.name).profile;
    const phone = profile.phone || "телефон не вказано";
    return `• ${escapeHtml(userService.getDisplayName(member.id, member.name))} — ${escapeHtml(phone)}`;
  });
  const routeLine = formatRouteStatus(trip.routePlan);
  const localRescuers = (safety.contacts || []).map((item) => `• ${item.label}: ${item.phones.join(" / ")}`);
  const medicalLines = getTripSosMedicalLines(trip, userService, canManageTrip(trip, viewerId));
  const lines = [
    ...formatCardHeader("🚨 SOS ПАКЕТ", trip.name),
    "",
    `Маршрут: ${routeLine}`,
    `Регіон: ${trip.region || safety.title}`,
    trip.tripCard ? `Дати: ${trip.tripCard.startDate} -> ${trip.tripCard.endDate}` : null,
    trip.tripCard?.meetingPoint ? `Точка збору: ${escapeHtml(trip.tripCard.meetingPoint)}` : null,
    formatTripMeetingDateTime(trip.tripCard || {}) ? `Дата та Час збору: ${formatTripMeetingDateTime(trip.tripCard || {})}` : null,
    "",
    formatSectionHeader("👥", "Учасники і Контакти"),
    ...members,
    "",
    formatSectionHeader("🚨", "Екстрені Номери"),
    `• ${safetyPhones.join(" / ")}`,
    "",
    formatSectionHeader("⛰", "Рятувальники Регіону"),
    ...(localRescuers.length ? localRescuers : ["• Локальний підрозділ не визначено автоматично. У разі загрози телефонуй 101 або 112."])
  ].filter(Boolean);

  if (medicalLines.length) {
    lines.push("", formatSectionHeader("🩺", "Медичні Позначки"));
    lines.push(...medicalLines);
  }

  lines.push("", "⚠️ Це короткий пакет, який можна швидко переслати в разі потреби.");
  return joinRichLines(lines);
}

function buildTripNamePrompt(currentValue = "") {
  return [
    "Введи назву походу.",
    currentValue ? `Поточна назва: ${currentValue}` : null,
    "Приклад: `Карпати квітень`",
    "",
    "Можна натиснути `⏭ Пропустити`, якщо назву не потрібно змінювати."
  ].filter(Boolean).join("\n");
}

function buildTripDatePrompt(label, example, currentValue = "") {
  return [
    `Введи ${label} у форматі YYYY-MM-DD.`,
    currentValue ? `Поточне значення: ${currentValue}` : null,
    `Приклад: \`${example}\``,
    "",
    "Можна натиснути `⏭ Пропустити`, якщо дату не потрібно змінювати."
  ].filter(Boolean).join("\n");
}

function replyTripCardStepPrompt(ctx, flow) {
  if (flow.step === "name") {
    return ctx.reply(buildTripNamePrompt(flow.data.name), {
      parse_mode: "Markdown",
      ...getProfileEditKeyboard()
    });
  }

  if (flow.step === "startDate") {
    return ctx.reply(buildTripDatePrompt("дату початку", "2026-07-14", flow.data.startDate), {
      parse_mode: "Markdown",
      ...getProfileEditKeyboard()
    });
  }

  if (flow.step === "endDate") {
    return ctx.reply(buildTripDatePrompt("дату завершення", "2026-07-16", flow.data.endDate), {
      parse_mode: "Markdown",
      ...getProfileEditKeyboard()
    });
  }

  if (flow.step === "gearStatus") {
    return ctx.reply(
      `Ночівель розраховано автоматично: ${flow.data.nights}\n\nОбери статус готовності спорядження.`,
      FLOW_GEAR_STATUS_WITH_SKIP_KEYBOARD
    );
  }

  if (flow.step === "meetingPoint") {
    return ctx.reply(buildTripMeetingPointPrompt(flow.data.meetingPoint), {
      parse_mode: "Markdown",
      ...getProfileEditKeyboard()
    });
  }

  if (flow.step === "meetingDate") {
    return ctx.reply(buildTripMeetingDatePrompt(flow.data.meetingDate), {
      parse_mode: "Markdown",
      ...getProfileEditKeyboard()
    });
  }

  if (flow.step === "meetingTime") {
    return ctx.reply(buildTripMeetingTimePrompt(flow.data.meetingTime), {
      parse_mode: "Markdown",
      ...getProfileEditKeyboard()
    });
  }

  return ctx.reply(
    [
      "Перевір дані походу:",
      `• Назва: ${flow.data.name}`,
      `• Дати: ${flow.data.startDate} -> ${flow.data.endDate}`,
      `• Ночівлі: ${flow.data.nights}`,
      `• Готовність спорядження: ${flow.data.gearReadinessStatus}`,
      `• Точка збору: ${flow.data.meetingPoint || "автоматично за логікою бота"}`,
      `• Дата та Час збору: ${formatTripMeetingDateTime({ meetingDate: flow.data.meetingDate, meetingTime: flow.data.meetingTime }) || "ще не задано"}`
    ].join("\n"),
    FLOW_CONFIRM_CARD_KEYBOARD
  );
}

function resolveDepartureHub(city) {
  const normalizedCity = normalizeLocationKey(city);
  if (!normalizedCity) {
    return "";
  }

  const matchedRule = DEPARTURE_HUB_RULES.find((rule) => rule.keywords.some((keyword) => normalizedCity.includes(keyword)));
  return matchedRule?.hub || normalizeLocationLabel(city);
}

function resolveArrivalHub(trip, safety) {
  const haystack = normalizeLocationKey([
    trip.region,
    trip.routePlan?.sourceTitle,
    trip.routePlan?.from,
    trip.routePlan?.to,
    ...(trip.routePlan?.stops || [])
  ].filter(Boolean).join(" "));

  const matchedRule = ARRIVAL_HUB_RULES.find((rule) => rule.keywords.some((keyword) => haystack.includes(keyword)));
  if (matchedRule) {
    return matchedRule.hub;
  }

  const fallbackTitle = normalizeLocationLabel(safety?.title || "");
  if (fallbackTitle.includes("Івано-Франків")) {
    return "Івано-Франківськ";
  }
  if (fallbackTitle.includes("Закарпат")) {
    return "Мукачево";
  }
  if (fallbackTitle.includes("Львів")) {
    return "Сколе";
  }
  if (fallbackTitle.includes("Чернів")) {
    return "Чернівці";
  }

  return normalizeLocationLabel(trip.region) || "найближчий вокзал регіону";
}

function buildTripMeetingPointLines(trip, userService, safety) {
  const tripCard = trip.tripCard || {};
  const arrivalHub = resolveArrivalHub(trip, safety);
  const arrivalDetails = getHubDetails(arrivalHub);
  const manualMeetingPoint = normalizeLocationLabel(tripCard.meetingPoint || "");
  const manualMeetingDateTime = formatTripMeetingDateTime(tripCard);
  const manualMeetingCity = extractMeetingPointCity(manualMeetingPoint);
  const manualMeetingRegion = manualMeetingCity
    ? getHubDetails(resolveDepartureHub(manualMeetingCity)).region
    : "";
  const grouped = new Map();
  let unknownCount = 0;

  for (const member of trip.members || []) {
    const profile = userService.getProfile(String(member.id), member.name || "").profile;
    const city = normalizeLocationLabel(profile.city);
    if (!city) {
      unknownCount += 1;
      continue;
    }

    const departureHub = resolveDepartureHub(city);
    const departureDetails = getHubDetails(departureHub);
    const bucket = grouped.get(departureHub) || {
      hub: departureHub,
      region: departureDetails.region,
      cities: new Set(),
      members: [],
      count: 0
    };
    bucket.cities.add(city);
    bucket.members.push(formatParticipantShortName(getMemberDisplayName(userService, member)));
    bucket.count += 1;
    grouped.set(departureHub, bucket);
  }

  const lines = [
    formatSectionHeader("🚆", "Точка збору")
  ];

  if (manualMeetingPoint) {
    lines.push(`Точка збору: ${manualMeetingPoint}`);
    if (manualMeetingDateTime) {
      lines.push(`Дата та Час збору: ${manualMeetingDateTime}`);
    }
  } else {
    lines.push(`Спільна точка прибуття: ${arrivalDetails.station}`);
  }

  const groups = [...grouped.values()].sort((left, right) => right.count - left.count || left.hub.localeCompare(right.hub, "uk"));
  for (const group of groups) {
    const groupCities = [...group.cities];
    const originLabel = formatOriginLabel([...group.cities], group.region);
    const participantLabel = formatParticipantGroupLabel(group.members, group.count);
    const groupContainsManualMeetingCity = manualMeetingCity
      ? groupCities.some((city) => normalizeLocationKey(city) === normalizeLocationKey(manualMeetingCity))
      : false;
    const groupContainsArrivalCity = groupCities.some((city) => normalizeLocationKey(city) === normalizeLocationKey(arrivalHub));

    if (manualMeetingPoint) {
      if (groupContainsManualMeetingCity) {
        lines.push(`• ${participantLabel} ${originLabel}: збір на вокзалі вашого міста.`);
      } else if (manualMeetingCity && group.region && manualMeetingRegion && group.region === manualMeetingRegion) {
        lines.push(`• ${participantLabel} ${originLabel}: прямуйте до точки збору — ${manualMeetingPoint}.`);
      } else if (normalizeLocationKey(group.hub) === normalizeLocationKey(arrivalHub)) {
        lines.push(`• ${participantLabel} ${originLabel}: збір у ${group.hub}, далі прямуйте до точки збору — ${manualMeetingPoint}.`);
      } else if (group.count > 1) {
        lines.push(`• ${participantLabel} ${originLabel}: збір у ${group.hub}, далі разом до точки збору — ${manualMeetingPoint}.`);
      } else {
        lines.push(`• ${participantLabel} ${originLabel}: самостійно прямує до точки збору — ${manualMeetingPoint}.`);
      }
    } else {
      if (groupContainsArrivalCity) {
        lines.push(`• ${participantLabel} ${originLabel}: збір на вокзалі вашого міста, далі разом до старту походу.`);
      } else if (group.region && arrivalDetails.region && group.region === arrivalDetails.region) {
        lines.push(`• ${participantLabel} ${originLabel}: прямуйте до спільної точки прибуття — ${arrivalDetails.station}.`);
      } else if (group.count > 1) {
        lines.push(`• ${participantLabel} ${originLabel}: збір у ${group.hub}, далі разом до ${arrivalHub}.`);
      } else {
        lines.push(`• ${participantLabel} ${originLabel}: самостійно прибуває до ${arrivalHub}.`);
      }
    }
  }

  if (unknownCount > 0) {
    lines.push(`• ${unknownCount} учасн. без міста в профілі — логістику потрібно уточнити вручну.`);
  }

  return lines;
}

function formatTripPassport(trip, groupService, userService, userId = "") {
  const gearSnapshot = groupService.getGearSnapshot(trip.id);
  const safety = resolveSafetyProfile(trip);
  const routeStatus = getRouteStatusLabel(trip.routePlan?.meta);
  const ticketSummary = summarizeTripTickets(trip);
  const members = trip.members.map((member) => {
    const name = getMemberDisplayName(userService, member);
    const emoji = getAttendanceStatusEmoji(member.attendanceStatus);
    return `• ${emoji ? `${emoji} ` : ""}${name} — ${member.role === "owner" ? "організатор" : member.canManage ? "редактор" : "учасник"}`;
  });
  const endpoints = getRouteEndpoints(trip.routePlan);
  const routeLine = trip.routePlan
    ? (trip.routePlan.source === "vpohid" && trip.routePlan.sourceTitle
      ? trip.routePlan.sourceTitle
      : `${endpoints.from || "Старт"} -> ${endpoints.to || "Фініш"}`)
    : "не задано";
  const safetyPhones = [...new Set((safety.general || []).flatMap((item) => item.phones || []))];

  return joinRichLines([
    ...formatCardHeader("🪪 ДЕТАЛІ ПОХОДУ", trip.name),
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
    formatSectionHeader("👥", `Учасники (${trip.members.length})`),
    ...members,
    "",
    formatSectionHeader("🎫", "Квитки"),
    `• Учасників із квитками: ${ticketSummary.membersWithTickets} з ${ticketSummary.totalMembers}`,
    `• Завантажено файлів квитків: ${ticketSummary.ticketCount}`,
    "",
    ...buildTripMeetingPointLines(trip, userService, safety),
    "",
    formatSectionHeader("🆘", "Безпека"),
    `• Регіон рятувальників: ${safety.title}`,
    `• Екстрені номери: ${safetyPhones.join(" / ")}`
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

function formatHistoryDateLabel(trip) {
  const raw = trip?.archivedAt || trip?.completedAt || trip?.createdAt || "";
  return raw ? String(raw).slice(0, 10) : "без дати";
}

function getTripHistoryButtonLabel(trip, index) {
  const title = String(trip?.name || trip?.finalSummary?.routeName || formatRouteStatus(trip?.routePlan) || "Похід").trim();
  return `${index + 1}. ${truncateButtonLabel(`${title} • ${formatHistoryDateLabel(trip)}`, 30)}`;
}

function getTripHistoryKeyboard(items, { includeHistoryBack = false } = {}) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2).map((item) => item.label));
  }
  rows.push([includeHistoryBack ? TRIP_HISTORY_BACK_LABEL : TRIP_DETAILS_BACK_LABEL]);
  return buildKeyboard(rows);
}

function getTripHistoryDetailsKeyboard(items) {
  return getTripHistoryKeyboard(items, { includeHistoryBack: true });
}

function getProfilePhotoAlbumKeyboard(items, { includeAlbumsBack = false } = {}) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2).map((item) => item.label));
  }

  if (includeAlbumsBack) {
    rows.push([PROFILE_PHOTO_ALBUMS_BACK_LABEL, "⬅️ Головне меню"]);
  } else {
    rows.push([PROFILE_BACK_LABEL, "⬅️ Головне меню"]);
  }

  return buildKeyboard(rows);
}

function buildMatchedNeedsSummaryLines(needs, userService, { availableQuantity = null } = {}) {
  return needs.map((need) => {
    const requester = need.memberId
      ? userService.getDisplayName(String(need.memberId), need.memberName || "Учасник")
      : (need.memberName || "Учасник");
    const coverage = Number.isFinite(availableQuantity)
      ? ` | ${escapeHtml(availableQuantity >= need.quantity ? `повністю ${availableQuantity}/${need.quantity}` : `частково ${availableQuantity}/${need.quantity}`)}`
      : "";
    return `• ${escapeHtml(requester)}: ${escapeHtml(need.name)} | ${escapeHtml(String(need.quantity))}${coverage}`;
  });
}

function getGearCoverageStatusLabel(match) {
  if (match?.isEnough) {
    return `повністю: ${match.availableQuantity}/${match.requestedQuantity}`;
  }
  return `частково: ${match.availableQuantity}/${match.requestedQuantity}`;
}

function getGearNeedMatchState(groupService, tripId, need, memberId) {
  const trip = groupService.getGroup(tripId);
  const requesterBlocked = isTripMemberAutoExcluded(trip, String(memberId));
  const matches = groupService.findGearCoverage(tripId, need.name, {
    excludeMemberId: String(memberId),
    requestedQuantity: need.quantity
  }).matches;
  const fullMatches = matches.filter((item) => item.isEnough);
  const matchedCandidate = need?.matchedGearId
    ? matches.find((item) => String(item.id) === String(need.matchedGearId))
    : null;
  const isPendingApproval = need?.loanRequestStatus === "pending";
  return {
    matches,
    fullMatches,
    isPendingApproval,
    showHelp: !requesterBlocked && (need?.status === "matched" || fullMatches.length > 0),
    allowBorrowRequest: !requesterBlocked && !isPendingApproval && (Boolean(matchedCandidate?.isEnough) || fullMatches.length > 0)
  };
}

function buildGearCoverageMatchLines(matches) {
  return matches.map((item, index) =>
    `• ${index + 1}. ${escapeHtml(item.name)} | ${escapeHtml(item.memberName || "учасник")} | ${escapeHtml(getGearCoverageStatusLabel(item))}`
  );
}

function formatGearCoverageNotice(matches = []) {
  if (!Array.isArray(matches) || !matches.length) {
    return "🤝 Поки що бот не знайшов спорядження, яке відповідає цьому запиту.";
  }

  const fullMatches = matches.filter((item) => item.isEnough);
  if (fullMatches.length) {
    return `🤝 Уже є учасники, які можуть допомогти: ${fullMatches.map((item) => `${item.memberName || "учасник"} (${getGearCoverageStatusLabel(item)})`).join(", ")}`;
  }

  const partialMatches = matches.filter((item) => Number(item.availableQuantity) > 0);
  if (partialMatches.length) {
    return `⚠️ Є лише часткові збіги, але кількості поки недостатньо: ${partialMatches.map((item) => `${item.memberName || "учасник"} (${getGearCoverageStatusLabel(item)})`).join(", ")}`;
  }

  return `⚠️ Є схожі речі, але зараз вони недоступні в наявній кількості: ${matches.map((item) => `${item.memberName || "учасник"} (${getGearCoverageStatusLabel(item)})`).join(", ")}`;
}

function formatGearCoverageFollowup(matches = []) {
  if (!Array.isArray(matches) || !matches.some((item) => item.isEnough)) {
    return null;
  }

  return `Відкрий <b>${escapeHtml(GEAR_MY_REQUESTS_LABEL)}</b>, щоб переглянути учасників, у яких є спорядження, яке можна позичити.`;
}

function buildGearNeedActionStatusLines(matchState) {
  const matches = Array.isArray(matchState?.matches) ? matchState.matches : [];
  const fullMatches = Array.isArray(matchState?.fullMatches) ? matchState.fullMatches : [];

  if (fullMatches.length > 0) {
    return [
      "🤝 У поході вже є відповідне спорядження в наявності.",
      `Може допомогти: ${fullMatches.map((item) => `${item.memberName || "учасник"} (${getGearCoverageStatusLabel(item)})`).join(", ")}`
    ];
  }

  if (!matches.length) {
    return [
      "⚠️ Поки що в поході немає відповідного спорядження для цього запиту."
    ];
  }

  const partialMatches = matches.filter((item) => Number(item.availableQuantity) > 0);
  if (partialMatches.length) {
    return [
      "⚠️ Є лише часткові збіги, але доступної кількості поки недостатньо.",
      `Зараз видно: ${partialMatches.map((item) => `${item.memberName || "учасник"} (${getGearCoverageStatusLabel(item)})`).join(", ")}`
    ];
  }

  return [
    "⚠️ Є схожі речі, але зараз вони недоступні в наявній кількості.",
    `Зараз видно: ${matches.map((item) => `${item.memberName || "учасник"} (${getGearCoverageStatusLabel(item)})`).join(", ")}`
  ];
}

function formatResolvedGearNeedListLine(need) {
  const matched = need.matchedByMemberName ? ` | допоміг: ${escapeHtml(need.matchedByMemberName)}` : "";
  return `• ${escapeHtml(need.name)}: ${escapeHtml(String(need.quantity))} | ${escapeHtml(getGearNeedStatusLabel(need.status))}${matched}`;
}

function formatTripCompletionSummary(trip, userService = null) {
  const finalSummary = trip.finalSummary || {};
  const completedAt = trip.completedAt ? String(trip.completedAt).slice(0, 16).replace("T", " ") : "щойно";
  const period = trip.tripCard
    ? `${trip.tripCard.startDate} -> ${trip.tripCard.endDate} | Ночівлі: ${trip.tripCard.nights}`
    : "не задано";
  const routeName = finalSummary.routeName || formatRouteStatus(trip.routePlan) || "маршрут не задано";
  const summaryMembers = Array.isArray(finalSummary.members)
    ? finalSummary.members.filter(isMemberIncludedInCalculations)
    : [];
  const liveMembers = Array.isArray(trip.members)
    ? trip.members.filter(isMemberIncludedInCalculations)
    : [];
  const members = summaryMembers.length
    ? summaryMembers.map((member) => userService ? getMemberDisplayName(userService, member) : member.name).join(" • ")
    : liveMembers.map((member) => userService ? getMemberDisplayName(userService, member) : member.name).join(" • ");

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
    `Фото: ${finalSummary.photoCount || 0}`,
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
  const summaryMembers = Array.isArray(finalSummary.members)
    ? finalSummary.members.filter(isMemberIncludedInCalculations)
    : [];
  const liveMembers = Array.isArray(trip.members)
    ? trip.members.filter(isMemberIncludedInCalculations)
    : [];
  const members = summaryMembers.length
    ? summaryMembers.map((member) => userService ? getMemberDisplayName(userService, member) : member.name).join(" • ")
    : liveMembers.map((member) => userService ? getMemberDisplayName(userService, member) : member.name).join(" • ");

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
    `Фото: ${finalSummary.photoCount || 0}`,
    `Інші витрати: ${formatMoney(finalSummary.expensesTotal || 0)}`,
    `Разом витрат: ${formatMoney(finalSummary.totalCost || 0)}`
  );

  const expenseSettlement = buildTripExpenseSettlementData(
    trip,
    {
      items: Array.isArray(trip.expenses) ? trip.expenses : [],
      totalCost: Array.isArray(trip.expenses)
        ? trip.expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
        : 0,
      byMember: Array.isArray(trip.expenses)
        ? [...new Map(
            trip.expenses.map((item) => {
              const key = getSettlementActorKey(item.memberId, item.memberName);
              return [key, {
                memberId: item.memberId || "",
                memberName: item.memberName || "",
                totalCost: 0
              }];
            })
          ).values()].map((entry) => ({
            ...entry,
            totalCost: (Array.isArray(trip.expenses) ? trip.expenses : [])
              .filter((item) => getSettlementActorKey(item.memberId, item.memberName) === getSettlementActorKey(entry.memberId, entry.memberName))
              .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
          }))
        : []
    },
    {
      totalCost: Array.isArray(trip.food)
        ? trip.food.reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
        : 0,
      byMember: Array.isArray(trip.food)
        ? [...new Map(
            trip.food.map((item) => {
              const key = getSettlementActorKey(item.memberId, item.memberName);
              return [key, {
                memberId: item.memberId || "",
                memberName: item.memberName || "",
                totalCost: 0
              }];
            })
          ).values()].map((entry) => ({
            ...entry,
            totalCost: (Array.isArray(trip.food) ? trip.food : [])
              .filter((item) => getSettlementActorKey(item.memberId, item.memberName) === getSettlementActorKey(entry.memberId, entry.memberName))
              .reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
          }))
        : []
    },
    userService
  );
  const directExpenseItems = expenseSettlement.directExpenseItems;
  const foodItems = expenseSettlement.foodItems;
  const hasExpenseReport = directExpenseItems.length > 0 || foodItems.length > 0;

  if (hasExpenseReport) {
    const formatTotalLine = (label, value) => {
      const money = formatMoney(value);
      const dotsCount = Math.max(3, 28 - label.length - money.length);
      return `${label} ${".".repeat(dotsCount)} ${money}`;
    };

    const directExpenseLines = directExpenseItems.length
      ? directExpenseItems.map((item, index) =>
          `${index + 1}. ${item.title}\n   ${Number(item.quantity) || 1} × ${formatMoney(item.price)} = ${formatMoney(item.amount)}\n   платить: ${resolveMemberDisplayName(userService, item.memberId, item.memberName)}`
        )
      : ["немає"];

    const foodLines = foodItems.length
      ? foodItems.map((item, index) => {
          const quantity = Number(item.quantity) || 1;
          const weightLabel = Number(item.weight) > 0 ? ` | вага: ${formatWeightGrams(item.weight)}` : "";
          return `${index + 1}. ${item.name}\n   ${quantity} × ${formatMoney(item.price)} = ${formatMoney(item.cost)}${weightLabel}\n   платить: ${resolveMemberDisplayName(userService, item.memberId, item.memberName)}`;
        })
      : ["немає"];

    lines.push(
      "",
      formatSectionHeader("💸", "Повний Звіт По Витратах"),
      "",
      formatSectionHeader("🧾", "Інші Витрати"),
      ...directExpenseLines,
      "",
      formatSectionHeader("🍲", "Продукти І Харчування"),
      ...foodLines,
      "",
      formatSectionHeader("👥", "По Учасниках"),
      ...(expenseSettlement.paidByMemberLines.length
        ? expenseSettlement.paidByMemberLines.map((item) => formatTotalLine(item.label, item.value))
        : ["немає"]),
      "",
      formatSectionHeader("📌", "Фінальний Підсумок"),
      formatTotalLine("Інші витрати", expenseSettlement.directExpensesTotal),
      formatTotalLine("Продукти", expenseSettlement.foodTotal),
      formatTotalLine("ВСЬОГО", expenseSettlement.grandTotal),
      formatTotalLine("Частка 1 учасника", expenseSettlement.perPerson),
      `• У розрахунку беруть участь: ${expenseSettlement.participantCount}`,
      ...(expenseSettlement.excludedMembers.length
        ? [`• У статусі \`👎 Не йду\`: ${expenseSettlement.excludedMembers.map((item) => item.memberName).join(", ")}`]
        : []),
      "",
      formatSectionHeader("💱", "Баланс По Учасниках"),
      ...(expenseSettlement.memberSettlementLines.length
        ? expenseSettlement.memberSettlementLines
        : ["• немає"])
    );
  }

  return joinRichLines(lines);
}

function buildOrganizerTransferAcceptedNotification(trip, previousOwnerName, nextOwnerName) {
  return joinRichLines([
    ...formatCardHeader("🔁", "ОРГАНІЗАТОРА ЗМІНЕНО"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> змінено організатора.`,
    `Було: <b>${escapeHtml(previousOwnerName)}</b>`,
    `Стало: <b>${escapeHtml(nextOwnerName)}</b>`
  ]);
}

function buildOrganizerTransferDeclinedNotification(trip, targetName) {
  return joinRichLines([
    ...formatCardHeader("⚠️", "ПЕРЕДАЧУ ПОХОДУ ВІДХИЛЕНО"),
    "",
    `<b>${escapeHtml(targetName)}</b> відхилив(ла) передачу ролі організатора в поході <b>${escapeHtml(trip.name)}</b>.`,
    "За потреби можна запросити іншу людину або надіслати новий запит пізніше."
  ]);
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
  const expectedByName = new Map(
    members.map((member) => [member.name, perPerson])
  );
  const balanceNames = new Set([
    ...expectedByName.keys(),
    ...paidByMember.keys()
  ]);
  const balances = [...balanceNames].map((memberName) => {
    const paid = paidByMember.get(memberName) || 0;
    const expected = expectedByName.get(memberName) || 0;
    return {
      memberName,
      paid,
      balance: paid - expected
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

function getSettlementActorKey(memberId = "", memberName = "") {
  const normalizedMemberId = String(memberId || "").trim();
  if (normalizedMemberId) {
    return `id:${normalizedMemberId}`;
  }

  const normalizedName = String(memberName || "").trim();
  return normalizedName ? `name:${normalizedName}` : "";
}

function buildTripExpenseSettlementData(trip, expenseSnapshot, foodSnapshot, userService) {
  const participants = getTripMembersIncludedInCalculations(trip);
  const participantKeys = new Map();
  const excludedMemberKeys = new Map();
  const paidByKey = new Map();
  const directExpenseItems = expenseSnapshot?.items || [];
  const foodItems = Array.isArray(trip?.food) ? trip.food : [];
  const directExpensesTotal = expenseSnapshot?.totalCost || 0;
  const foodTotal = foodSnapshot?.totalCost || 0;
  const grandTotal = directExpensesTotal + foodTotal;

  for (const member of participants) {
    const key = getSettlementActorKey(member.id, member.name);
    if (!key) {
      continue;
    }
    participantKeys.set(key, {
      memberId: String(member.id || ""),
      memberName: resolveMemberDisplayName(userService, member.id, member.name)
    });
  }

  for (const member of Array.isArray(trip?.members) ? trip.members : []) {
    if (member?.attendanceStatus !== "not_going") {
      continue;
    }

    const key = getSettlementActorKey(member.id, member.name);
    if (!key || participantKeys.has(key)) {
      continue;
    }

    excludedMemberKeys.set(key, {
      memberId: String(member.id || ""),
      memberName: resolveMemberDisplayName(userService, member.id, member.name)
    });
  }

  const registerPaidItem = (memberId, memberName, amount) => {
    const key = getSettlementActorKey(memberId, memberName);
    if (!key) {
      return;
    }

    const current = paidByKey.get(key) || {
      memberId: String(memberId || ""),
      memberName: resolveMemberDisplayName(userService, memberId, memberName),
      total: 0
    };
    current.total += Number(amount) || 0;
    paidByKey.set(key, current);
  };

  for (const item of expenseSnapshot?.byMember || []) {
    registerPaidItem(item.memberId, item.memberName, item.totalCost);
  }

  for (const item of foodSnapshot?.byMember || []) {
    registerPaidItem(item.memberId, item.memberName, item.totalCost);
  }

  const allKeys = new Set([
    ...participantKeys.keys(),
    ...excludedMemberKeys.keys(),
    ...paidByKey.keys()
  ]);

  const perPerson = participants.length ? grandTotal / participants.length : 0;
  const balances = [...allKeys].map((key) => {
    const participant = participantKeys.get(key);
    const excludedMember = excludedMemberKeys.get(key);
    const payer = paidByKey.get(key);
    const paid = payer?.total || 0;
    const expected = participant ? perPerson : 0;
    return {
      key,
      memberId: participant?.memberId || excludedMember?.memberId || payer?.memberId || "",
      memberName: participant?.memberName || excludedMember?.memberName || payer?.memberName || "учасник",
      isParticipant: Boolean(participant),
      isExcluded: Boolean(excludedMember) && !participant,
      paid,
      expected,
      balance: paid - expected
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

  const paidByMemberLines = balances
    .sort((left, right) => {
      if (left.isParticipant !== right.isParticipant) {
        return left.isParticipant ? -1 : 1;
      }
      return right.paid - left.paid || left.memberName.localeCompare(right.memberName, "uk");
    })
    .map((item) => ({
      label: item.isExcluded ? `${item.memberName} — 👎 Не йду` : item.memberName,
      value: item.paid
    }));

  const memberSettlementLines = balances
    .sort((left, right) => {
      if (left.isParticipant !== right.isParticipant) {
        return left.isParticipant ? -1 : 1;
      }
      return left.memberName.localeCompare(right.memberName, "uk");
    })
    .map((item) => {
      if (!item.isParticipant) {
        return `• ${item.memberName} — 👎 Не йду | сплачено ${formatMoney(item.paid)} | ${item.paid > 0.5 ? `повернути ${formatMoney(item.paid)}` : "у поділі не бере участі"}`;
      }

      const outcome = item.balance > 0.5
        ? `отримати ${formatMoney(item.balance)}`
        : item.balance < -0.5
          ? `доплатити ${formatMoney(Math.abs(item.balance))}`
          : "нічого не винен";

      return `• ${item.memberName} — сплачено ${formatMoney(item.paid)} | частка ${formatMoney(item.expected)} | ${outcome}`;
    });

  const excludedPayers = balances.filter((item) => !item.isParticipant && item.paid > 0.5);
  const excludedMembers = balances.filter((item) => item.isExcluded);

  return {
    directExpenseItems,
    foodItems,
    directExpensesTotal,
    foodTotal,
    grandTotal,
    perPerson,
    participantCount: participants.length,
    paidByMemberLines,
    memberSettlementLines,
    balances,
    excludedMembers,
    excludedPayers,
    transfers
  };
}

function showAuthorizationRequired(ctx, userService, extraNotice = "") {
  setMenuContext(ctx.from?.id, "auth");
  const authState = userService.getAuthorizationState(String(ctx.from.id), getUserLabel(ctx));

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🔐", "ПІДТВЕРДИ НОМЕР"),
      "",
      "Щоб користуватися ботом далі, потрібно підтвердити свій номер телефону.",
      "",
      "Що потрібно:",
      ...formatAuthorizationMissingList(authState),
      "",
      "Що зробити:",
      authState.contactVerified ? null : "• натисни `📱 Підтвердити свій номер` і надішли саме свій Telegram-контакт",
      extraNotice || null
    ].filter(Boolean)),
    {
      parse_mode: "HTML",
      ...getAuthorizationKeyboard(authState)
    }
  );
}

function sendHome(ctx, userService = null) {
  setMenuContext(ctx.from?.id, "home");
  if (userService && !isUserAuthorized(userService, String(ctx.from.id), getUserLabel(ctx))) {
    return showAuthorizationRequired(ctx, userService);
  }

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

function isAuthExemptFlow(flow) {
  return ["profile_edit", "help_menu", "faq_menu"].includes(flow?.type || "");
}

function isAuthExemptText(text = "") {
  return [
    PROFILE_LABEL,
    PROFILE_ABOUT_LABEL,
    PROFILE_EDIT_LABEL,
    PROFILE_MEDICAL_LABEL,
    PROFILE_BACK_LABEL,
    FAQ_LABEL,
    FAQ_SEARCH_LABEL,
    FAQ_ALL_LABEL,
    FAQ_PREV_LABEL,
    FAQ_NEXT_LABEL,
    "ℹ️ Допомога",
    HELP_BACK_LABEL,
    PROFILE_SKIP_LABEL,
    "❌ Скасувати",
    "⬅️ Головне меню",
    ...HELP_SECTIONS
  ].includes(text);
}

function showTripHistory(ctx, groupService, userService) {
  setMenuContext(ctx.from?.id, "trip-history");
  const history = groupService.getGroupHistoryByMember(String(ctx.from.id));

  if (!history.length) {
    clearFlow(String(ctx.from.id));
    setMenuContext(ctx.from?.id, "profile");
    return ctx.reply("Історія походів поки порожня.", getProfileKeyboard());
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

  if (message === TRIP_DETAILS_BACK_LABEL) {
    if (flow.step === "detail") {
      flow.step = "list";
      delete flow.data.selectedId;
      setFlow(String(ctx.from.id), flow);
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
        { parse_mode: "HTML", ...getTripHistoryKeyboard(flow.data?.items || []) }
      );
    }

    clearFlow(String(ctx.from.id));
    return showProfileMenu(ctx, userService);
  }

  if (message === "⬅️ Головне меню") {
    clearFlow(String(ctx.from.id));
    return showProfileMenu(ctx, userService);
  }

  const items = flow.data?.items || [];
  const selected = items.find((item) => item.label === message);
  if (!selected) {
    return ctx.reply(
      "Обери похід кнопкою нижче.",
      flow.step === "detail" ? getTripHistoryDetailsKeyboard(items) : getTripHistoryKeyboard(items)
    );
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
  const userId = String(ctx.from.id);
  const activeTrips = getActiveTripsForUser(groupService, userId);
  const primaryTrip = groupService.findGroupByMember(userId);
  const blockedTrips = activeTrips.filter((trip) => isTripMemberAutoExcluded(trip, userId));
  const canCreateAnotherTrip = !groupService.findBlockingActiveGroupByMember(userId);

  if (!activeTrips.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("👥 ПОХІД", "Активного походу немає"),
        "",
        "Натисни `➕ Створити похід`, щоб задати назву, дату початку, дату завершення і статус готовності спорядження."
      ]),
      {
        parse_mode: "HTML",
        ...getTripKeyboard(null, userId)
      }
    );
  }

  if (blockedTrips.length > 0 || activeTrips.length > 1) {
    const items = getTripHubItems(groupService, userId);
    setFlow(userId, {
      type: "trip_hub",
      step: "pick",
      data: {
        items,
        canCreate: canCreateAnotherTrip
      }
    });

    const lines = [
      ...formatCardHeader("👥 МОЇ ПОХОДИ", `${activeTrips.length} активн.`),
      "",
      "Обери похід кнопкою нижче."
    ];

    if (blockedTrips.length > 0) {
      lines.push("");
      lines.push("⚠️ Похід із позначкою `👎` зараз доступний лише для короткого перегляду.");
    }

    if (canCreateAnotherTrip) {
      lines.push("");
      lines.push("Можеш приєднатися до іншого походу або створити свій, бо зараз у тебе немає іншого активного походу, який блокує нову участь.");
    }

    return ctx.reply(
      joinRichLines(lines),
      { parse_mode: "HTML", ...getTripHubKeyboard(items, { canCreate: canCreateAnotherTrip }) }
    );
  }

  return showTripMenuForTrip(ctx, groupService, primaryTrip);
}

async function handleTripHubFlow(ctx, flow, groupService, userService) {
  const message = String(ctx.message?.text || "").trim();
  const userId = String(ctx.from.id);
  const items = Array.isArray(flow.data?.items) ? flow.data.items : [];
  const canCreate = flow.data?.canCreate === true;

  if (message === TRIP_DETAILS_BACK_LABEL) {
    flow.step = "pick";
    setFlow(userId, flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("👥 МОЇ ПОХОДИ", `${items.length} активн.`),
        "",
        "Обери похід кнопкою нижче."
      ]),
      { parse_mode: "HTML", ...getTripHubKeyboard(items, { canCreate }) }
    );
  }

  const selected = items.find((item) => item.label === message);
  if (!selected) {
    return ctx.reply(
      "Обери похід кнопкою нижче.",
      getTripHubKeyboard(items, { canCreate })
    );
  }

  if (!selected.isRestricted) {
    clearFlow(userId);
    const trip = groupService.getGroup(selected.id);
    if (!trip) {
      return ctx.reply("Похід більше не знайдено.", getMainKeyboard(ctx));
    }
    return showTripMenuForTrip(ctx, groupService, trip, { fromHub: true });
  }

  const trip = groupService.getGroup(selected.id);
  if (!trip) {
    return ctx.reply("Похід більше не знайдено.", getMainKeyboard(ctx));
  }

  const primaryTrip = groupService.findBlockingActiveGroupByMember(userId, { excludeGroupId: trip.id });
  return ctx.reply(
    formatTripHubDetailMessage(trip, userId, userService, primaryTrip),
    { parse_mode: "HTML", ...getTripHubKeyboard(items, { canCreate }) }
  );
}

function showTripSafety(ctx, groupService) {
  setMenuContext(ctx.from?.id, "trip-safety");
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  return replyRichText(ctx, formatSafetySection(trip), {
    parse_mode: "HTML",
    ...getTripSafetyInlineKeyboard()
  });
}

function showTripSettings(ctx, groupService) {
  setMenuContext(ctx.from?.id, "trip-settings");
  const trip = requireManageTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  const lines = [
    ...formatCardHeader("⚙️ НАЛАШТУВАННЯ", trip.name),
    "",
    "Тут зібрані службові дії для керування походом.",
    "",
    "• `🔔 Нагадування` — план і тексти автоматичних повідомлень учасникам"
  ];

  if (isTripOwner(trip, String(ctx.from.id))) {
    lines.push("• `🔁 Передати похід` — передати роль організатора іншому учаснику з підтвердженням");
    lines.push("• `🛡 Права редагування` — кому з учасників дозволено керувати походом");
  }

  if (trip.pendingOrganizerTransfer) {
    lines.push("");
    lines.push(`⏳ Очікує підтвердження: <b>${escapeHtml(trip.pendingOrganizerTransfer.targetMemberName || "учасник")}</b>`);
  }

  return ctx.reply(
    joinRichLines(lines),
    { parse_mode: "HTML", ...getTripSettingsKeyboard(trip, String(ctx.from.id)) }
  );
}

function startOrganizerTransferWizard(ctx, groupService, userService, options = {}) {
  const trip = requireOwnerTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  const items = [];
  const blocked = [];

  for (const member of trip.members.filter((item) => item.role !== "owner")) {
    const eligibility = groupService.getOrganizerTransferEligibility({
      groupId: trip.id,
      targetMemberId: member.id
    });
    const label = getMemberDisplayName(userService, member);

    if (eligibility.ok) {
      items.push({
        id: member.id,
        label
      });
    } else {
      blocked.push({
        label,
        reason: eligibility.message
      });
    }
  }

  setFlow(String(ctx.from.id), {
    type: "transfer_organizer",
    tripId: trip.id,
    step: "member",
    data: {
      items,
      previousOwnerStatusOnAccept:
        options.previousOwnerStatusOnAccept === "not_going"
          ? "not_going"
          : ""
    }
  });

  const lines = [
    ...formatCardHeader("🔁 ПЕРЕДАТИ ПОХІД", trip.name),
    "",
    "Обери учасника, якому хочеш передати роль організатора.",
    `Дати походу: ${formatTripDateRangeLabel(trip)}`,
    "",
    "Що відбудеться далі:",
    "• бот надішле цій людині окремий запит",
    "• роль зміниться тільки після її підтвердження",
    "• новий організатор не повинен бути зайнятий в іншому активному поході на ті самі дати",
    "• учаснику зі статусом «👎 Не йду» передати похід не можна"
  ];

  if (options.previousOwnerStatusOnAccept === "not_going") {
    lines.push("• після підтвердження ти автоматично отримаєш статус «👎 Не йду» як звичайний учасник");
  }

  if (!items.length) {
    lines.push("");
    lines.push("Зараз у поході немає жодного учасника, якому можна безпечно передати роль.");
    lines.push("Якщо потрібної людини ще немає в поході, спочатку запроси її.");
  }

  if (blocked.length) {
    lines.push("");
    lines.push("Кому зараз передати не можна:");
    for (const item of blocked) {
      lines.push(`• ${escapeHtml(item.label)} — ${escapeHtml(item.reason)}`);
    }
  }

  return ctx.reply(
    joinRichLines(lines),
    {
      parse_mode: "HTML",
      ...getTransferOrganizerKeyboard(items, { includeInvite: true })
    }
  );
}

async function handleOrganizerTransferFlow(ctx, flow, groupService, userService, telegram) {
  const message = String(ctx.message?.text || "").trim();

  if (message === TRIP_TRANSFER_BACK_LABEL && flow.step === "invite_info") {
    return startOrganizerTransferWizard(ctx, groupService, userService, {
      previousOwnerStatusOnAccept: flow.data?.previousOwnerStatusOnAccept || ""
    });
  }

  if (message === TRIP_TRANSFER_BACK_LABEL || message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return showTripSettings(ctx, groupService);
  }

  if (message === TRIP_TRANSFER_INVITE_LABEL) {
    flow.step = "invite_info";
    setFlow(String(ctx.from.id), flow);
    return showInviteInfo(ctx, groupService, { mode: "transfer_organizer" });
  }

  const selected = (flow.data?.items || []).find((item) => item.label === message);
  if (!selected) {
    return ctx.reply(
      "Обери учасника кнопкою нижче або запроси нового.",
      getTransferOrganizerKeyboard(flow.data?.items || [], { includeInvite: true })
    );
  }

  const result = groupService.startOrganizerTransfer({
    groupId: flow.tripId,
    actorId: String(ctx.from.id),
    targetMemberId: selected.id,
    previousOwnerStatusOnAccept: flow.data?.previousOwnerStatusOnAccept || ""
  });

  clearFlow(String(ctx.from.id));

  if (!result.ok) {
    return ctx.reply(result.message, getTripSettingsKeyboard(groupService.getGroup(flow.tripId), String(ctx.from.id)));
  }

  const targetLabel = getMemberDisplayName(userService, result.member);
  const actorLabel = getMemberDisplayName(userService, result.actor);

  if (telegram && result.request?.id) {
    try {
      await telegram.sendMessage(
        result.member.id,
        joinRichLines([
          ...formatCardHeader("🔁 ПЕРЕДАЧА ПОХОДУ", result.group.name),
          "",
          `${escapeHtml(actorLabel)} хоче передати тобі роль організатора.`,
          `Дати походу: ${formatTripDateRangeLabel(result.group)}`,
          `Маршрут: ${escapeHtml(formatRouteStatus(result.group.routePlan))}`,
          "",
          "Що це означає:",
          "• ти станеш новим організатором цього походу",
          "• зможеш редагувати похід, керувати учасниками і пізніше теж передати роль далі",
          "",
          "Підтвердь або відхили запит нижче."
        ]),
        {
          parse_mode: "HTML",
          ...buildOrganizerTransferInlineKeyboard(result.group.id, result.request.id)
        }
      );
    } catch {
      // Ignore delivery issues; owner still gets confirmation locally.
    }
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("✅ ЗАПИТ НА ПЕРЕДАЧУ НАДСИЛАНО", result.group.name),
      "",
      `Кандидат: <b>${escapeHtml(targetLabel)}</b>`,
      "Роль організатора зміниться тільки після підтвердження цією людиною."
    ]),
    { parse_mode: "HTML", ...getTripSettingsKeyboard(result.group, String(ctx.from.id)) }
  );
}

function showTripSosPackage(ctx, groupService, userService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  return replyRichText(
    ctx,
    formatTripSosPackage(trip, groupService, userService, String(ctx.from.id)),
    { parse_mode: "HTML" }
  );
}

function showTripReminders(ctx, groupService) {
  setMenuContext(ctx.from?.id, "trip-reminders");
  const trip = requireManageTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  return replyRichText(ctx, formatReminderPlan(trip), {
    parse_mode: "HTML",
    ...getTripRemindersKeyboard(trip)
  });
}

function toggleTripReminders(ctx, groupService, enabled) {
  const trip = requireManageTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  const updatedTrip = groupService.setRemindersEnabled({
    groupId: trip.id,
    enabled
  });

  setMenuContext(ctx.from?.id, "trip-reminders");
  return replyRichText(
    ctx,
    joinRichLines([
      ...formatCardHeader(enabled ? "✅ НАГАДУВАННЯ УВІМКНЕНО" : "⛔️ НАГАДУВАННЯ ВИМКНЕНО", updatedTrip.name),
      "",
      enabled
        ? "Бот тепер надсилатиме автоматичні нагадування учасникам за розкладом цього походу."
        : "Бот більше не надсилатиме автоматичні нагадування учасникам для цього походу."
    ]),
    {
      parse_mode: "HTML",
      ...getTripRemindersKeyboard(updatedTrip)
    }
  );
}

function showTripPhotosMenu(ctx, groupService) {
  setMenuContext(ctx.from?.id, "trip-photos");
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (!canTripMemberAccessPhotos(trip, String(ctx.from.id))) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("📸 ФОТО ПОХОДУ", trip.name),
        "",
        "Бот уже зафіксував тобі статус `👎 Не йду`, тому фото походу й фотоальбом для тебе недоступні.",
        "",
        "Якщо статус треба змінити, звернись до організатора або редактора."
      ]),
      { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from.id)) }
    );
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("📸 ФОТО ПОХОДУ", trip.name),
      "",
      "Що тут можна робити:",
      `• \`${TRIP_PHOTOS_ADD_LABEL}\` — надіслати фото з маршруту, табору або команди`,
      `• \`${TRIP_PHOTO_ALBUM_LABEL}\` — відкрити зведений фотоальбом походу`,
      "",
      "⚠️ Зверни увагу:",
      "• бот не зберігає важкі файли фото в БД",
      "• для фотоальбому зберігаються лише легкі службові дані і Telegram file_id",
      "• фото одразу надсилається учасникам походу через Telegram",
      "• можна додати підпис прямо в повідомленні до фото"
    ]),
    { parse_mode: "HTML", ...getTripPhotosKeyboard() }
  );
}

async function sendTripPhotoAlbumPreview(telegram, chatId, items = []) {
  const momentGroups = groupTripPhotoItemsByMoment(items);

  for (const group of momentGroups) {
    try {
      await telegram.sendMessage(
        chatId,
        joinRichLines([
          formatSectionHeader("🗂", group.label),
          `• Фото в цій події: ${group.items.length}`
        ]),
        { parse_mode: "HTML" }
      );
    } catch {
      // Ignore section header delivery errors and still try to send the photos.
    }

    const chunks = [];
    for (let index = 0; index < group.items.length; index += 10) {
      chunks.push(group.items.slice(index, index + 10));
    }

    for (const chunk of chunks) {
      const media = chunk.map((item) => ({
        type: "photo",
        media: item.fileId
      }));

      try {
        await telegram.sendMediaGroup(chatId, media);
      } catch {
        for (const item of chunk) {
          try {
            await telegram.sendPhoto(chatId, item.fileId);
          } catch {
            // Ignore invalid or expired file ids and continue.
          }
        }
      }
    }
  }
}

async function showTripPhotoAlbum(ctx, groupService, telegram) {
  setMenuContext(ctx.from?.id, "trip-photos");
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (!canTripMemberAccessPhotos(trip, String(ctx.from.id))) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🖼 ФОТОАЛЬБОМ", trip.name),
        "",
        "Фотоальбом недоступний, бо бот уже зафіксував тобі статус `👎 Не йду`."
      ]),
      { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from.id)) }
    );
  }

  const album = groupService.getTripPhotoAlbum(trip.id, { limit: 10 });
  if (!album || !album.totalCount) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🖼 ФОТОАЛЬБОМ", trip.name),
        "",
        "У фотоальбомі походу поки ще немає фото.",
        "",
        `Скористайся \`${TRIP_PHOTOS_ADD_LABEL}\`, щоб почати збирати альбом.`
      ]),
      { parse_mode: "HTML", ...getTripPhotosKeyboard() }
    );
  }

  await replyRichText(ctx, formatTripPhotoAlbumSummary(trip, album), { parse_mode: "HTML", ...getTripPhotosKeyboard() });
  await sendTripPhotoAlbumPreview(telegram, ctx.chat.id, album.items);
  return null;
}

function getProfileTripAlbumItems(groupService, userId) {
  const items = [];
  const seen = new Set();
  const activeTrip = groupService.findGroupByMember(userId);

  const pushTrip = (trip) => {
    if (!trip?.id || seen.has(trip.id)) {
      return;
    }
    const album = groupService.getTripPhotoAlbum(trip.id, { limit: 10 });
    if (!album?.totalCount) {
      return;
    }

    seen.add(trip.id);
    items.push({
      id: trip.id,
      label: getTripHistoryButtonLabel(trip, items.length),
      trip
    });
  };

  if (activeTrip && canTripMemberAccessPhotos(activeTrip, userId)) {
    pushTrip(activeTrip);
  }
  for (const trip of groupService.getGroupHistoryByMember(userId)) {
    pushTrip(trip);
  }

  return items;
}

function showProfilePhotoAlbumsMenu(ctx, groupService) {
  setMenuContext(ctx.from?.id, "profile");
  const userId = String(ctx.from.id);
  const items = getProfileTripAlbumItems(groupService, userId);

  if (!items.length) {
    clearFlow(userId);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🖼 МОЇ ФОТОАЛЬБОМИ", getUserLabel(ctx)),
        "",
        "У твоїх походах поки ще немає фотоальбомів.",
        "",
        "Коли в поході з'являться фото, вони автоматично збиратимуться тут по кожному походу окремо."
      ]),
      { parse_mode: "HTML", ...getProfileKeyboard() }
    );
  }

  setFlow(userId, {
    type: "profile_photo_album",
    step: "list",
    data: {
      items
    }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🖼 МОЇ ФОТОАЛЬБОМИ", getUserLabel(ctx)),
      "",
      "Обери похід кнопкою нижче, щоб відкрити його фотоальбом.",
      "",
      "⚠️ Зверни увагу:",
      "• тут показані тільки ті походи, де є фото",
      "• відкриється коротка картка походу і сам альбом"
    ]),
    { parse_mode: "HTML", ...getProfilePhotoAlbumKeyboard(items) }
  );
}

async function handleProfilePhotoAlbumFlow(ctx, flow, groupService, userService, telegram) {
  const message = String(ctx.message?.text || "").trim();

  if (message === PROFILE_BACK_LABEL) {
    clearFlow(String(ctx.from.id));
    return showProfileMenu(ctx, userService);
  }

  if (message === PROFILE_PHOTO_ALBUMS_BACK_LABEL) {
    return showProfilePhotoAlbumsMenu(ctx, groupService);
  }

  if (message === "⬅️ Головне меню") {
    clearFlow(String(ctx.from.id));
    return sendHome(ctx, userService);
  }

  const items = flow.data?.items || [];
  const selected = items.find((item) => item.label === message);
  if (!selected) {
    return ctx.reply(
      "Обери похід кнопкою нижче.",
      flow.step === "detail"
        ? getProfilePhotoAlbumKeyboard(items, { includeAlbumsBack: true })
        : getProfilePhotoAlbumKeyboard(items)
    );
  }

  const album = groupService.getTripPhotoAlbum(selected.id, { limit: 10 });
  if (!album?.totalCount) {
    return ctx.reply(
      "У цьому поході фотоальбом поки порожній.",
      getProfilePhotoAlbumKeyboard(items)
    );
  }

  flow.step = "detail";
  flow.data = {
    ...flow.data,
    selectedId: selected.id
  };
  setFlow(String(ctx.from.id), flow);

  await replyRichText(
    ctx,
    formatTripPhotoAlbumSummary(selected.trip, album),
    { parse_mode: "HTML", ...getProfilePhotoAlbumKeyboard(items, { includeAlbumsBack: true }) }
  );
  await sendTripPhotoAlbumPreview(telegram, ctx.chat.id, album.items);
  return null;
}

function startTripPhotoAddWizard(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (!canTripMemberAccessPhotos(trip, String(ctx.from.id))) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("📷 ДОДАТИ ФОТО", trip.name),
        "",
        "Бот уже зафіксував тобі статус `👎 Не йду`, тому додавання фото для цього походу вимкнене."
      ]),
      { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from.id)) }
    );
  }

  setMenuContext(ctx.from?.id, "trip-photos");
  setFlow(String(ctx.from.id), {
    type: "trip_photo_add",
    tripId: trip.id,
    step: "await_photo",
    data: {}
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("📷 ДОДАТИ ФОТО", trip.name),
      "",
      "Надішли фото повідомленням.",
      "Якщо хочеш, додай короткий підпис прямо до фото.",
      "",
      "⚠️ Зверни увагу:",
      "• бот не зберігає важкі файли фото в БД",
      "• для фотоальбому зберігаються лише легкі службові дані і Telegram file_id",
      "• фото буде розіслано учасникам походу",
      "• можна надсилати кілька фото підряд",
      "• `❌ Скасувати` поверне в розділ фото походу"
    ]),
    { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
  );
}

async function showTripPassport(ctx, groupService, userService, advisorService = null) {
  setMenuContext(
    ctx.from?.id,
    getMenuContext(ctx.from?.id) === "trip-linked" ? "trip_details_linked" : "trip_details"
  );
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  const detailsKeyboard = getTripDetailsKeyboard(trip, String(ctx.from.id));
  const response = await replyRichText(
    ctx,
    formatTripPassport(trip, groupService, userService, String(ctx.from.id)),
    detailsKeyboard
      ? { parse_mode: "HTML", ...detailsKeyboard }
      : { parse_mode: "HTML" }
  );

  await sendContextualFaqSuggestions(ctx, advisorService, {
    screen: "trip_details",
    trip
  });

  return response;
}

function showTripMembersMenu(ctx, groupService, userService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
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

  if (canManageTrip(trip, String(ctx.from.id))) {
    body.push("• нагадування і службові дії винесені в `⚙️ Налаштування`");
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("👥 УЧАСНИКИ", trip.name),
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

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  const items = [];
  const labelCounts = new Map();
  const memberSummaryLines = [];

  for (const member of trip.members) {
    const baseLabel = getMemberDisplayName(userService, member);
    const statusEmoji = getAttendanceStatusEmoji(member.attendanceStatus);
    const roleSuffix = member.role === "owner" ? " (Організатор)" : "";
    const count = (labelCounts.get(baseLabel) || 0) + 1;
    labelCounts.set(baseLabel, count);
    const memberView = userService.getTripMemberView(member, false);
    const roleLabel = member.role === "owner" ? "організатор" : member.canManage ? "редактор" : "учасник";
    const displayLabel = `${statusEmoji ? `${statusEmoji} ` : ""}${baseLabel}${roleSuffix}`;

    items.push({
      id: member.id,
      label: count > 1 ? `${displayLabel} (${count})` : displayLabel
    });

    memberSummaryLines.push(`${items.length}. ${displayLabel}`);
    memberSummaryLines.push(`• Телефон: ${escapeHtml(memberView.title.split(" — ").slice(1).join(" — ") || "не вказано")}`);
    memberSummaryLines.push(`• Роль: ${roleLabel}`);
    memberSummaryLines.push(`• Статус: ${formatAttendanceStatusText(member.attendanceStatus)}`);
    memberSummaryLines.push(`• Квитки: ${getMemberTicketsStatusLabel(member)}`);
    memberSummaryLines.push("");
  }

  setFlow(String(ctx.from.id), {
    type: "trip_member_list",
    tripId: trip.id,
    step: "pick",
    data: { items }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("👥 СПИСОК УЧАСНИКІВ", trip.name),
      "",
      ...memberSummaryLines.slice(0, -1),
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

function formatTripMemberDetailsMessage(trip, member, userService, viewerId) {
  const canSeeFull = canManageTrip(trip, viewerId) || member.id === viewerId;
  const role = member.role === "owner" ? "організатор" : member.canManage ? "редактор" : "учасник";
  const memberView = userService.getTripMemberView(member, canSeeFull);
  const titleName = `${getAttendanceStatusEmoji(member.attendanceStatus) ? `${getAttendanceStatusEmoji(member.attendanceStatus)} ` : ""}${getMemberDisplayName(userService, member)}`;
  const tickets = getMemberTickets(member);
  const ticketLines = tickets.length
    ? tickets.map((ticket, index) => `• ${escapeHtml(getMemberTicketListLabel(ticket, index))}`)
    : ["• Квитків ще немає"];

  return joinRichLines([
    ...formatCardHeader("👤 УЧАСНИК ПОХОДУ", titleName),
    "",
    memberView.title,
    `Роль: ${role}`,
    `Статус: ${formatAttendanceStatusText(member.attendanceStatus)}`,
    `Квитки: ${getMemberTicketsStatusLabel(member)}`,
    isTripMemberAttendanceSelfLocked(trip, member.id)
      ? "Самозміна статусу вимкнена. Для оновлення звернись до організатора або редактора."
      : null,
    "",
    ...memberView.details,
    "",
    "🎫 Квитки",
    ...ticketLines
  ]);
}

async function showTripMemberDetails(ctx, groupService, userService, trip, memberId, items = []) {
  const resolvedTrip = groupService.getGroup(trip?.id || "") || trip;
  const member = resolvedTrip?.members?.find((item) => String(item.id) === String(memberId));
  if (!member) {
    return ctx.reply("Учасника не знайдено в цьому поході.", getTripMembersKeyboard(resolvedTrip, String(ctx.from.id)));
  }

  const viewerId = String(ctx.from.id);
  const text = formatTripMemberDetailsMessage(resolvedTrip, member, userService, viewerId);
  const inlineKeyboard = getTripMemberStatusInlineKeyboard(resolvedTrip, member.id, viewerId);
  setFlow(viewerId, {
    type: "trip_member_detail",
    tripId: resolvedTrip.id,
    step: "menu",
    data: {
      memberId,
      items
    }
  });

  try {
    await ctx.reply(
      text,
      {
        parse_mode: "HTML",
        ...inlineKeyboard
      }
    );
  } catch {
    try {
      await ctx.reply(
        stripHtmlTags(text),
        inlineKeyboard
      );
    } catch {
      await ctx.reply(stripHtmlTags(text));
    }
  }

  return ctx.reply(
    "Дії з учасником:",
    getTripMemberDetailsKeyboard(resolvedTrip, viewerId, member.id)
  );
}

function formatTripMemberTicketsMessage(trip, member, userService) {
  const tickets = getMemberTickets(member);
  const lines = [
    ...formatCardHeader("🎫 КВИТКИ УЧАСНИКА", getMemberDisplayName(userService, member)),
    "",
    `Статус: ${getMemberTicketsStatusLabel(member)}`,
    ""
  ];

  if (!tickets.length) {
    lines.push("Поки що жодного квитка не додано.");
  } else {
    lines.push("Завантажені квитки:");
    for (const [index, ticket] of tickets.entries()) {
      lines.push(`• ${escapeHtml(getMemberTicketListLabel(ticket, index))}`);
    }
  }
  return joinRichLines(lines);
}

function formatTripMemberTicketDetailsMessage(trip, member, ticket, userService) {
  const segmentLabel = getMemberTicketSegmentLabel(ticket);
  return joinRichLines([
    ...formatCardHeader("🎫 КВИТОК", getMemberDisplayName(userService, member)),
    "",
    segmentLabel ? `Маршрут: ${escapeHtml(segmentLabel)}` : null,
    `Файл: ${escapeHtml(ticket.fileName || "Квиток")}`,
    `Тип файла: ${ticket.mediaType === "photo" ? "фото" : "документ"}`,
    `Завантажено: ${formatDateTimeLabel(ticket.createdAt)}`,
    ticket.uploadedByMemberName ? `Завантажив: ${escapeHtml(ticket.uploadedByMemberName)}` : null,
    "",
    "Можна відкрити файл і повернутися до списку квитків."
  ].filter(Boolean));
}

async function safeReplyTripTicketBlock(ctx, text, keyboard = null) {
  const plainText = stripHtmlTags(text);
  if (keyboard) {
    try {
      return await ctx.reply(plainText, keyboard);
    } catch {
      return ctx.reply(plainText);
    }
  }
  return ctx.reply(plainText);
}

async function sendTripMemberTicketsDirectly(ctx, member) {
  const tickets = getMemberTickets(member);
  if (!tickets.length) {
    return ctx.reply("У цього учасника ще немає завантажених квитків.");
  }

  let sentCount = 0;
  for (const ticket of tickets) {
    try {
      await sendTripMemberTicketFile(ctx, member, ticket);
      sentCount += 1;
    } catch {
      const segmentLabel = getMemberTicketSegmentLabel(ticket);
      await ctx.reply(
        `Не вдалося відкрити квиток${segmentLabel ? ` ${segmentLabel}` : ""}. Спробуй перевантажити цей файл.`
      );
    }
  }

  if (!sentCount) {
    return ctx.reply("Не вдалося відкрити жоден квиток. Спробуй перевантажити файл квитка.");
  }

  return null;
}

function showTripMemberTickets(ctx, groupService, userService, trip, memberId) {
  const resolvedTrip = groupService.getGroup(trip?.id || "") || trip;
  const member = resolvedTrip?.members?.find((item) => String(item.id) === String(memberId));
  if (!member) {
    return ctx.reply("Учасника не знайдено в цьому поході.", getTripMembersKeyboard(resolvedTrip, String(ctx.from.id)));
  }

  const viewerId = String(ctx.from.id);
  if (!canManageTripMemberTickets(resolvedTrip, viewerId, memberId)) {
    return ctx.reply("Тобі недоступні квитки цього учасника.", getTripMembersListKeyboard([]));
  }

  if (!getMemberTickets(member).length) {
    return ctx.reply("У цього учасника ще немає завантажених квитків.");
  }

  return safeReplyTripTicketBlock(
    ctx,
    formatTripMemberTicketsMessage(resolvedTrip, member, userService)
  );
}

async function sendTripMemberTicketFile(ctx, member, ticket) {
  const segmentLabel = getMemberTicketSegmentLabel(ticket);
  const caption = `🎫 ${segmentLabel || ticket.fileName || "Квиток"}`;
  if (ticket.mediaType === "photo") {
    return ctx.telegram.sendPhoto(ctx.chat.id, ticket.fileId, { caption });
  }
  return ctx.telegram.sendDocument(ctx.chat.id, ticket.fileId, { caption });
}

function renderTripMemberTicketStep(ctx, step, flow, member) {
  if (step === "upload_category") {
    return ctx.reply(
      "Обери тип квитка для цього сегмента.",
      buildMemberTicketCategoryKeyboard()
    );
  }

  if (step === "upload_from") {
    return ctx.reply(
      "Вкажи звідки їде людина за цим квитком.\nПриклад: Київ або Івано-Франківськ",
      getTripMemberTicketUploadKeyboard()
    );
  }

  if (step === "upload_to") {
    return ctx.reply(
      "Тепер вкажи куди цей квиток.\nПриклад: Івано-Франківськ або Ворохта",
      getTripMemberTicketUploadKeyboard()
    );
  }

  if (step === "upload") {
    const category = normalizeMemberTicketCategory(flow.data?.ticketDraft?.category || "other");
    const categoryLabel = getMemberTicketCategoryLabel(category);
    const segmentFrom = normalizeTicketSegmentInput(flow.data?.ticketDraft?.segmentFrom || "");
    const segmentTo = normalizeTicketSegmentInput(flow.data?.ticketDraft?.segmentTo || "");
    const uploadHint = `Додаємо квиток ${categoryLabel} для сегмента ${segmentFrom} → ${segmentTo}.\n\nМожна надсилати кілька квитків у цій самій категорії.\nПідійде фото або документ у форматі PDF / PNG / JPG / JPEG.`;
    return ctx.reply(uploadHint, getTripMemberTicketUploadKeyboard());
  }

  return null;
}

async function handleTripMemberTicketFlow(ctx, flow, groupService, userService) {
  const message = String(ctx.message?.text || "").trim();
  const viewerId = String(ctx.from.id);
  const trip = groupService.getGroup(flow.tripId);

  if (!trip) {
    clearFlow(viewerId);
    return ctx.reply("Похід не знайдено.", getTripKeyboard(null, viewerId));
  }

  const member = trip.members.find((item) => String(item.id) === String(flow.data?.memberId || ""));
  if (!member) {
    clearFlow(viewerId);
    return ctx.reply("Учасника не знайдено.", getTripMembersKeyboard(trip, viewerId));
  }

  if (message === MEMBER_TICKETS_BACK_LABEL) {
    clearFlow(viewerId);
    return showTripMembers(ctx, groupService, userService);
  }

  if (message === MEMBER_TICKET_FLOW_BACK_LABEL) {
    if (flow.step === "upload_category") {
      clearFlow(viewerId);
      return showTripMemberDetails(ctx, groupService, userService, trip, member.id);
    }

    if (flow.step === "upload_from") {
      flow.step = "upload_category";
      flow.data.ticketDraft = {};
      setFlow(viewerId, flow);
      return renderTripMemberTicketStep(ctx, "upload_category", flow, member);
    }

    if (flow.step === "upload_to") {
      flow.step = "upload_from";
      flow.data.ticketDraft = {
        ...(flow.data.ticketDraft || {}),
        segmentFrom: ""
      };
      setFlow(viewerId, flow);
      return renderTripMemberTicketStep(ctx, "upload_from", flow, member);
    }

    if (flow.step === "upload") {
      flow.step = "upload_to";
      setFlow(viewerId, flow);
      return renderTripMemberTicketStep(ctx, "upload_to", flow, member);
    }
  }

  if (flow.step === "upload_category") {
    const category = getMemberTicketCategoryKeyByLabel(message);
    if (!category) {
      return ctx.reply(
        "Обери тип квитка кнопкою нижче.",
        buildMemberTicketCategoryKeyboard()
      );
    }
    flow.step = "upload_from";
    flow.data.ticketDraft = {
      ...(flow.data.ticketDraft || {}),
      category
    };
    setFlow(viewerId, flow);
    return renderTripMemberTicketStep(ctx, "upload_from", flow, member);
  }

  if (flow.step === "upload_from") {
    const segmentFrom = normalizeTicketSegmentInput(message);
    if (!segmentFrom) {
      return ctx.reply(
        "Вкажи звідки їде людина за цим квитком.\nПриклад: Київ або Івано-Франківськ",
        getTripMemberTicketUploadKeyboard()
      );
    }
    flow.step = "upload_to";
    flow.data.ticketDraft = {
      ...(flow.data.ticketDraft || {}),
      segmentFrom
    };
    setFlow(viewerId, flow);
    return renderTripMemberTicketStep(ctx, "upload_to", flow, member);
  }

  if (flow.step === "upload_to") {
    const segmentTo = normalizeTicketSegmentInput(message);
    if (!segmentTo) {
      return ctx.reply(
        "Вкажи куди їде людина за цим квитком.",
        getTripMemberTicketUploadKeyboard()
      );
    }

    flow.step = "upload";
    flow.data.ticketDraft = {
      category: normalizeMemberTicketCategory(flow.data?.ticketDraft?.category || "other"),
      segmentFrom: normalizeTicketSegmentInput(flow.data?.ticketDraft?.segmentFrom || ""),
      segmentTo,
      segmentKey: buildMemberTicketSegmentKey(
        flow.data?.ticketDraft?.category || "other",
        flow.data?.ticketDraft?.segmentFrom || "",
        segmentTo
      )
    };
    setFlow(viewerId, flow);
    return renderTripMemberTicketStep(ctx, "upload", flow, member);
  }

  if (flow.step === "upload") {
    return renderTripMemberTicketStep(ctx, "upload", flow, member);
  }

  return null;
}

async function handleTripMemberTicketMedia(ctx, flow, groupService, userService) {
  const viewerId = String(ctx.from.id);
  const trip = groupService.getGroup(flow.tripId);
  if (!trip) {
    clearFlow(viewerId);
    return ctx.reply("Похід не знайдено.", getTripKeyboard(null, viewerId));
  }

  const member = trip.members.find((item) => String(item.id) === String(flow.data?.memberId || ""));
  if (!member) {
    clearFlow(viewerId);
    return ctx.reply("Учасника не знайдено.", getTripMembersKeyboard(trip, viewerId));
  }

  if (!canManageTripMemberTickets(trip, viewerId, member.id)) {
    clearFlow(viewerId);
    return ctx.reply("Тобі недоступно завантаження квитків для цього учасника.", getTripMembersKeyboard(trip, viewerId));
  }

  const document = ctx.message?.document || null;
  const photo = Array.isArray(ctx.message?.photo) ? ctx.message.photo.at(-1) : null;

  if (!document?.file_id && !photo?.file_id) {
    return ctx.reply("Надішли фото або документ квитка у форматі PDF / PNG / JPG / JPEG.", getTripMemberTicketUploadKeyboard());
  }

  if (document?.file_id && !isSupportedTicketDocument(document)) {
    return ctx.reply(
      "Підтримуються квитки як фото або документи у форматі PDF / PNG / JPG / JPEG.",
      getTripMemberTicketUploadKeyboard()
    );
  }

  const ticket = document
    ? {
        fileId: document.file_id,
        fileUniqueId: document.file_unique_id || "",
        fileName: document.file_name || "Квиток",
        mimeType: document.mime_type || "",
        mediaType: "document",
        category: normalizeMemberTicketCategory(flow.data?.ticketDraft?.category || "other"),
        segmentFrom: normalizeTicketSegmentInput(flow.data?.ticketDraft?.segmentFrom || ""),
        segmentTo: normalizeTicketSegmentInput(flow.data?.ticketDraft?.segmentTo || ""),
        segmentKey: buildMemberTicketSegmentKey(
          flow.data?.ticketDraft?.category || "other",
          flow.data?.ticketDraft?.segmentFrom || "",
          flow.data?.ticketDraft?.segmentTo || ""
        ),
        uploadedByMemberId: viewerId,
        uploadedByMemberName: userService.getDisplayName(viewerId, getUserLabel(ctx))
      }
    : {
        fileId: photo.file_id,
        fileUniqueId: photo.file_unique_id || "",
        fileName: `Фото квитка ${new Date().toLocaleDateString("uk-UA")}`,
        mimeType: "image/jpeg",
        mediaType: "photo",
        category: normalizeMemberTicketCategory(flow.data?.ticketDraft?.category || "other"),
        segmentFrom: normalizeTicketSegmentInput(flow.data?.ticketDraft?.segmentFrom || ""),
        segmentTo: normalizeTicketSegmentInput(flow.data?.ticketDraft?.segmentTo || ""),
        segmentKey: buildMemberTicketSegmentKey(
          flow.data?.ticketDraft?.category || "other",
          flow.data?.ticketDraft?.segmentFrom || "",
          flow.data?.ticketDraft?.segmentTo || ""
        ),
        uploadedByMemberId: viewerId,
        uploadedByMemberName: userService.getDisplayName(viewerId, getUserLabel(ctx))
      };

  const result = groupService.addMemberTicket({
    groupId: trip.id,
    targetMemberId: member.id,
    ticket
  });

  if (!result.ok) {
    return ctx.reply(result.message, getTripMemberTicketUploadKeyboard());
  }

  try {
    if (typeof groupService.store?.flush === "function") {
      await groupService.store.flush();
    }
  } catch {
    clearFlow(viewerId);
    return ctx.reply(
      "Не вдалося надійно зберегти квиток у базі даних. Спробуй надіслати файл ще раз.",
      getTripMemberDetailsKeyboard(trip, viewerId, member.id)
    );
  }

  const refreshedTrip = groupService.getGroup(trip.id) || result.group;
  const refreshedMember = refreshedTrip.members.find((item) => String(item.id) === String(member.id)) || member;
  if (String(flow.data?.returnContext || "") === "member_detail") {
    clearFlow(viewerId);
    const segmentLabel = getMemberTicketSegmentLabel(result.ticket || ticket);
    await ctx.reply(`✅ Квиток${segmentLabel ? ` ${escapeHtml(segmentLabel)}` : ""} для ${escapeHtml(getMemberDisplayName(userService, refreshedMember))} збережено.`, {
      parse_mode: "HTML"
    });
    return showTripMemberDetails(ctx, groupService, userService, refreshedTrip, refreshedMember.id);
  }

  return safeReplyTripTicketBlock(
    ctx,
    joinRichLines([
      `✅ Квиток для ${escapeHtml(getMemberDisplayName(userService, refreshedMember))} збережено.`,
      "",
      formatTripMemberTicketsMessage(refreshedTrip, refreshedMember, userService)
    ])
  );
}

async function startTripMemberTicketUpload(ctx, groupService, userService, tripId, memberId) {
  const viewerId = String(ctx.from.id);
  const trip = groupService.getGroup(tripId);
  if (!trip) {
    if (ctx.answerCbQuery) {
      await ctx.answerCbQuery("Активний похід не знайдено.", { show_alert: true });
    }
    return null;
  }

  const member = trip.members.find((item) => String(item.id) === String(memberId));
  if (!member) {
    if (ctx.answerCbQuery) {
      await ctx.answerCbQuery("Учасника не знайдено в цьому поході.", { show_alert: true });
    }
    return null;
  }

  if (!canManageTripMemberTickets(trip, viewerId, member.id)) {
    if (ctx.answerCbQuery) {
      await ctx.answerCbQuery("Ти не можеш завантажувати квитки цьому учаснику.", { show_alert: true });
    }
    return null;
  }

  try {
    setFlow(viewerId, {
      type: "trip_member_ticket_manage",
      tripId: trip.id,
      step: "upload_category",
      data: {
        memberId: member.id,
        selectedTicketId: "",
        uploadMode: "create",
        ticketDraft: {},
        returnContext: "member_detail"
      }
    });

    if (ctx.answerCbQuery && ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const prompt = "Обери тип квитка для цього сегмента.";
    try {
      return await ctx.reply(prompt, buildMemberTicketCategoryKeyboard());
    } catch {
      return ctx.reply(prompt);
    }
  } catch {
    setFlow(viewerId, {
      type: "trip_member_ticket_manage",
      tripId: trip.id,
      step: "upload_category",
      data: {
        memberId: member.id,
        selectedTicketId: "",
        uploadMode: "create",
        ticketDraft: {},
        returnContext: "member_detail"
      }
    });
    return ctx.reply(
      "Обери тип квитка для цього сегмента.",
      buildMemberTicketCategoryKeyboard()
    );
  }
}

async function handleTripMemberDetailFlow(ctx, flow, groupService, userService) {
  const viewerId = String(ctx.from.id);
  const message = String(ctx.message?.text || "").trim();
  const trip = groupService.getGroup(flow.tripId);

  if (!trip) {
    clearFlow(viewerId);
    return ctx.reply("Похід не знайдено.", getTripKeyboard(null, viewerId));
  }

  const member = trip.members.find((item) => String(item.id) === String(flow.data?.memberId || ""));
  if (!member) {
    clearFlow(viewerId);
    return ctx.reply("Учасника не знайдено.", getTripMembersKeyboard(trip, viewerId));
  }

  if (message === MEMBER_TICKETS_BACK_LABEL) {
    clearFlow(viewerId);
    return showTripMembers(ctx, groupService, userService);
  }

  if (message === MEMBER_TICKETS_UPLOAD_LABEL) {
    clearFlow(viewerId);
    try {
      return await startTripMemberTicketUpload(ctx, groupService, userService, trip.id, member.id);
    } catch {
      setFlow(viewerId, {
        type: "trip_member_ticket_manage",
        tripId: trip.id,
        step: "upload_category",
        data: {
          memberId: member.id,
          selectedTicketId: "",
          uploadMode: "create",
          ticketDraft: {},
          returnContext: "member_detail"
        }
      });
      return ctx.reply(
        "Обери тип квитка для цього сегмента.",
        buildMemberTicketCategoryKeyboard()
      );
    }
  }

  return ctx.reply(
    "Обери дію кнопкою нижче.",
    getTripMemberDetailsKeyboard(trip, viewerId, member.id)
  );
}

async function handleTripMemberStatusAction(ctx, groupService, userService, tripId, memberId, status) {
  const viewerId = String(ctx.from.id);
  const trip = groupService.getGroup(tripId);
  if (!trip) {
    await ctx.answerCbQuery("Активний похід не знайдено.", { show_alert: true });
    return null;
  }

  const member = trip.members.find((item) => String(item.id) === String(memberId));
  if (!member) {
    await ctx.answerCbQuery("Учасника не знайдено в цьому поході.", { show_alert: true });
    return null;
  }

  if (!canUpdateTripMemberStatus(trip, viewerId, member.id)) {
    const selfLocked = String(viewerId) === String(member.id) && isTripMemberAttendanceSelfLocked(trip, member.id);
    await ctx.answerCbQuery(
      selfLocked
        ? "Твій статус уже зафіксовано як «Не йду». Для зміни звернися до організатора або редактора."
        : "Ти можеш змінювати тільки свій статус участі.",
      { show_alert: true }
    );
    return null;
  }

  if (member.role === "owner" && status === "not_going") {
    await ctx.answerCbQuery(
      "Спочатку передай похід іншій людині через «⚙️ Налаштування → 🔁 Передати похід».",
      { show_alert: true }
    );
    return startOrganizerTransferWizard(ctx, groupService, userService, {
      previousOwnerStatusOnAccept: "not_going"
    });
  }

  const actorMember = trip.members.find((item) => String(item.id) === viewerId) || null;
  const result = groupService.setMemberAttendanceStatus({
    groupId: trip.id,
    actorId: viewerId,
    targetMemberId: member.id,
    status,
    clearSelfLock: canManageTrip(trip, viewerId)
  });

  if (!result.ok) {
    await ctx.answerCbQuery(result.message || "Не вдалося оновити статус.", { show_alert: true });
    return null;
  }

  const updatedTrip = result.group;
  const updatedMember = updatedTrip.members.find((item) => String(item.id) === String(member.id));
  if (!updatedMember) {
    await ctx.answerCbQuery("Учасника не знайдено після оновлення.", { show_alert: true });
    return null;
  }

  if (!result.changed) {
    await ctx.answerCbQuery(`Статус уже: ${formatAttendanceStatusText(updatedMember.attendanceStatus)}`);
    return null;
  }

  await ctx.answerCbQuery(`Статус оновлено: ${formatAttendanceStatusText(updatedMember.attendanceStatus)}`);
  let response = null;
  try {
    response = await ctx.editMessageText(
      formatTripMemberDetailsMessage(updatedTrip, updatedMember, userService, viewerId),
      {
        parse_mode: "HTML",
        ...getTripMemberStatusInlineKeyboard(updatedTrip, updatedMember.id, viewerId)
      }
    );
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (!message.includes("message is not modified")) {
      throw error;
    }
  }

  if (result.previousStatus !== updatedMember.attendanceStatus) {
    const actorLabel = actorMember ? getMemberDisplayName(userService, actorMember) : getUserLabel(ctx);
    void notifyTripMembers(
      ctx.telegram,
      updatedTrip,
      buildAttendanceStatusChangedNotification(
        updatedTrip,
        getMemberDisplayName(userService, updatedMember),
        actorLabel,
        result.previousStatus,
        updatedMember.attendanceStatus
      ),
      { excludeMemberId: viewerId }
    );
  }

  return response;
}

async function handleTripMemberStatusBack(ctx, groupService, userService) {
  await ctx.answerCbQuery();
  try {
    await ctx.deleteMessage();
  } catch {
    // Ignore delete failures and still show the list again.
  }
  return showTripMembers(ctx, groupService, userService);
}

async function handleOrganizerTransferAction(ctx, groupService, userService, action, requestId) {
  const targetMemberId = String(ctx.from.id);
  const group = groupService.findGroupByOrganizerTransferRequest(requestId);
  const groupId = group?.id || "";
  const result = groupService.resolveOrganizerTransfer({
    groupId,
    requestId,
    targetMemberId,
    accept: action === "a"
  });

  if (!result.ok) {
    await ctx.answerCbQuery(result.message || "Не вдалося обробити запит.", { show_alert: true });
    return null;
  }

  if (!result.accepted) {
    await ctx.answerCbQuery("Передачу ролі відхилено.");
    try {
      await ctx.editMessageText(
        joinRichLines([
          ...formatCardHeader("❌ ПЕРЕДАЧУ РОЛІ ВІДХИЛЕНО", result.group.name),
          "",
          "Ти відхилив(ла) запит на роль організатора."
        ]),
        { parse_mode: "HTML" }
      );
    } catch {
      try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      } catch {
        // Ignore stale markup errors.
      }
    }

    const trip = result.group;
    const targetName = getMemberDisplayName(userService, result.member);
    const ownerId = String(result.request?.initiatedById || "");
    if (ownerId) {
      try {
        await sendRichText(
          ctx.telegram,
          ownerId,
          buildOrganizerTransferDeclinedNotification(trip, targetName),
          { parse_mode: "HTML", ...getTripSettingsKeyboard(trip, ownerId) }
        );
      } catch {
        // Ignore delivery issues.
      }
    }

    return null;
  }

  await ctx.answerCbQuery("Тепер ти організатор цього походу.");
  try {
    await ctx.editMessageText(
      joinRichLines([
        ...formatCardHeader("✅ РОЛЬ ПІДТВЕРДЖЕНО", result.group.name),
        "",
        "Ти прийняв(ла) роль організатора цього походу."
      ]),
      { parse_mode: "HTML" }
    );
  } catch {
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {
      // Ignore stale markup errors.
    }
  }

  const trip = result.group;
  const previousOwnerName = getMemberDisplayName(userService, result.previousOwner);
  const nextOwnerName = getMemberDisplayName(userService, result.member);

  try {
    await sendRichText(
      ctx.telegram,
      targetMemberId,
      joinRichLines([
        ...formatCardHeader("✅ ТЕПЕР ТИ ОРГАНІЗАТОР", trip.name),
        "",
        "Передачу ролі підтверджено.",
        "Тепер саме ти керуєш цим походом."
      ]),
      { parse_mode: "HTML", ...getTripKeyboard(trip, targetMemberId) }
    );
  } catch {
    // Ignore delivery issues.
  }

  void notifyTripMembers(
    ctx.telegram,
    trip,
    buildOrganizerTransferAcceptedNotification(trip, previousOwnerName, nextOwnerName)
  );

  return null;
}

function showInviteInfo(ctx, groupService, options = {}) {
  const trip = requireManageTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  const configuredUsername = isValidTelegramUsername(config.botUsername) ? config.botUsername : "";

  const runtimeUsername = isValidTelegramUsername(ctx.botInfo?.username) ? ctx.botInfo.username : "";
  const botUsername = configuredUsername || runtimeUsername;

  const inviteInfo = groupService.getInviteInfo(trip.id, botUsername);
  const botLink = botUsername ? `https://t.me/${botUsername}` : null;

  const isTransferMode = options.mode === "transfer_organizer";
  const shareText = isTransferMode
    ? [
        ...formatCardHeader("🔁 ЗАПРОСИТИ НОВОГО ОРГАНІЗАТОРА", trip.name),
        "",
        "Якщо потрібної людини ще немає в поході, спочатку запроси її цим кодом.",
        `Код походу: ${inviteInfo.inviteCode}`,
        "",
        "Як приєднатися:",
        botLink ? `1. Відкрити бота: ${botLink}` : "1. Відкрити бота",
        "2. Натиснути `🔑 Приєднатися до походу`",
        `3. Ввести код: \`${inviteInfo.inviteCode}\``,
        "",
        "Після того як людина приєднається до походу, повернись у `🔁 Передати похід` і заверши передачу ролі."
      ]
    : [
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

  const keyboard = isTransferMode
    ? buildKeyboard([[TRIP_TRANSFER_BACK_LABEL]])
    : getTripMembersKeyboard(trip, String(ctx.from.id));

  return ctx.reply(shareText.join("\n"), keyboard);
}

function startJoinTripWizard(ctx) {
  setFlow(String(ctx.from.id), {
    type: "join_trip",
    step: "inviteCode",
    data: {}
  });

  return ctx.reply("Введи код запрошення в похід.\nПриклад: `A1F951`", {
    parse_mode: "Markdown",
    ...buildKeyboard([["❌ Скасувати"]])
  });
}

function startGrantAccessWizard(ctx, groupService, userService) {
  const trip = requireOwnerTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  const candidates = trip.members.filter((member) => !member.canManage && member.role !== "owner");
  if (!candidates.length) {
    return ctx.reply("Усі учасники вже мають права редагування або в поході ще немає кого призначати.", getTripSettingsKeyboard(trip, String(ctx.from.id)));
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

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🎒 СПОРЯДЖЕННЯ ПОХОДУ", trip.name),
        "",
        "Бот уже зафіксував тобі статус `👎 Не йду`, тому додавання нового спорядження в похід вимкнене.",
        "",
        "Залишається доступним тільки обмін речами: повернення, підтвердження повернення і твої вже видані речі."
      ]),
      { parse_mode: "HTML", ...getTripGearKeyboard(trip, groupService, String(ctx.from.id)) }
    );
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
  setMenuContext(ctx.from?.id, "trip-gear-add");
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const isRestricted = isTripMemberAutoExcluded(trip, String(ctx.from.id));

  if (isRestricted) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🎒 СПОРЯДЖЕННЯ ПОХОДУ", trip.name),
        "",
        "Бот уже зафіксував тобі статус `👎 Не йду`, тому додавання нового спорядження в похід вимкнене.",
        "",
        "Залишається доступним тільки `🧾 Запити та облік спорядження` для повернення речей і чинного обміну."
      ]),
      { parse_mode: "HTML", ...getTripGearKeyboard(trip, groupService, String(ctx.from.id)) }
    );
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
    { parse_mode: "HTML", ...getTripGearAddTypeKeyboard({ allowPersonal: !isNotGoing }) }
  );
}

function startGearNeedWizard(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🆘 ЗАПИТ НА СПОРЯДЖЕННЯ", trip.name),
        "",
        "Бот уже зафіксував тобі статус `👎 Не йду`, тому нові запити на позичання речей недоступні.",
        "Ти можеш тільки повернути вже позичене або дати свої речі іншим."
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
    );
  }
  setMenuContext(ctx.from?.id, "trip-gear-accounting");

  setFlow(String(ctx.from.id), {
    type: "gear_need",
    tripId: trip.id,
    step: "name",
    data: {}
  });

  return ctx.reply("Яку річ ти хочеш запросити в поході?\nПриклад: `спальник`", {
    parse_mode: "Markdown",
    ...FLOW_CANCEL_KEYBOARD
  });
}

function startMyNeedsWizard(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }
  setMenuContext(ctx.from?.id, "trip-gear-accounting");

  const exchange = getTripExchangeAvailability(trip, groupService, String(ctx.from.id));
  if (isTripMemberAutoExcluded(trip, String(ctx.from.id)) && !(exchange.hasBorrowed || exchange.hasLoaned)) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("📋 МОЇ ЗАПИТИ", trip.name),
        "",
        "У тебе немає активного обміну спорядженням.",
        "",
        "Після автопереведення в `👎 Не йду` цей розділ відкривається лише тоді, коли ти вже користуєшся чиїмось спорядженням або хтось користується твоїм."
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
    );
  }

  const needs = groupService.getMemberGearNeeds(trip.id, String(ctx.from.id));
  const historyNeeds = groupService
    .getMemberGearNeeds(trip.id, String(ctx.from.id), { includeResolved: true })
    .filter((item) => item.status === "fulfilled" || item.status === "cancelled");
  if (!needs.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("📋 МОЇ ЗАПИТИ", trip.name),
        "",
        "У тебе немає активних запитів у цьому поході.",
        "",
        "⚠️ Зверни увагу:",
        "• якщо чогось бракує, створи новий запит у цьому ж розділі",
        "• отримані або скасовані запити автоматично не потрапляють у робочий список",
        ...(historyNeeds.length
          ? [
              "",
              "🕓 Останні закриті запити:",
              ...historyNeeds.slice(-3).reverse().map((item) => formatResolvedGearNeedListLine(item))
            ]
          : [])
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
    );
  }

  const preparedNeeds = needs.map((item, index) => ({
    ...item,
    actionLabel: `${index + 1}. ${item.name}`
  }));

  setFlow(String(ctx.from.id), {
    type: "gear_need_manage",
    tripId: trip.id,
    step: "pick",
    data: { items: preparedNeeds }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("📋 МОЇ ЗАПИТИ", trip.name),
      "",
      "Обери запит, який хочеш переглянути або оновити."
    ]),
    { parse_mode: "HTML", ...getMyGearNeedItemsKeyboard(preparedNeeds) }
  );
}

function getEditableTripGearItems(trip, groupService, memberId) {
  const snapshot = groupService.getGearSnapshot(trip.id);
  const combined = [...snapshot.sharedGear, ...snapshot.personalGear, ...snapshot.spareGear];
  const seen = new Set();

  return combined.filter((item) => {
    if (!item?.id || seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return String(item.memberId) === String(memberId);
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

function formatGearAvailabilitySummary(item) {
  const totalQuantity = Math.max(0, Number(item?.quantity) || 0);
  const availableQuantity = Math.max(0, Number(item?.availableQuantity ?? totalQuantity) || 0);
  const inUseQuantity = Math.max(0, Number(item?.inUseQuantity) || 0);
  const isShareable = item?.scope === "shared" || item?.scope === "spare" || item?.shareable;

  if (!isShareable && inUseQuantity <= 0) {
    return "";
  }

  const parts = [
    availableQuantity > 0
      ? `в наявності: ${availableQuantity}/${totalQuantity}`
      : `немає в наявності: 0/${totalQuantity}`
  ];

  if (inUseQuantity > 0) {
    const borrowerNames = [...new Set((item?.loans || []).map((loan) => loan.borrowerMemberName).filter(Boolean))];
    parts.push(`в користуванні: ${inUseQuantity}${borrowerNames.length ? ` (${borrowerNames.join(", ")})` : ""}`);
  }

  return parts.join(" | ");
}

function formatGearAvailabilityLines(item, { includeOwner = false } = {}) {
  const lines = [];
  if (includeOwner && item?.memberName) {
    lines.push(`◦ Власник: ${item.memberName}`);
  }

  const isShareable = item?.scope === "shared" || item?.scope === "spare" || item?.shareable;
  if (!isShareable) {
    return lines;
  }

  const totalQuantity = Math.max(0, Number(item?.quantity) || 0);
  const availableQuantity = Math.max(0, Number(item?.availableQuantity ?? totalQuantity) || 0);
  lines.push(`◦ Доступно зараз: ${availableQuantity}/${totalQuantity}`);

  if (Array.isArray(item?.loans) && item.loans.length) {
    const aggregatedLoans = new Map();
    for (const loan of item.loans) {
      const key = String(loan.borrowerMemberId || loan.borrowerMemberName || "");
      const current = aggregatedLoans.get(key);
      if (current) {
        current.quantity += Number(loan.quantity) || 0;
        continue;
      }

      aggregatedLoans.set(key, {
        borrowerMemberName: loan.borrowerMemberName || "учасник",
        quantity: Number(loan.quantity) || 0
      });
    }

    for (const loan of aggregatedLoans.values()) {
      lines.push(`◦ В користуванні: ${loan.borrowerMemberName} | ${loan.quantity} шт.`);
    }
  }

  return lines;
}

function getGearNeedStatusLabel(status = "open") {
  if (status === "matched") {
    return "знайдено";
  }
  if (status === "fulfilled") {
    return "отримано";
  }
  if (status === "cancelled") {
    return "скасовано";
  }
  return "відкрито";
}

function formatGearNeedSummaryLines(need, { includeMember = false } = {}) {
  const lines = [
    `Статус: ${need.loanRequestStatus === "pending" ? "очікує підтвердження власника" : getGearNeedStatusLabel(need.status)}`,
    `Потрібно: ${need.name}`,
    `Кількість: ${need.quantity}`
  ];

  if (includeMember && need.memberName) {
    lines.push(`Учасник: ${need.memberName}`);
  }

  if (need.note) {
    lines.push(`Коментар: ${need.note}`);
  }

  if (need.matchedByMemberName || need.matchedGearName) {
    lines.push(
      `Знайдено у: ${need.matchedByMemberName || "учасника"}${need.matchedGearName ? ` | ${need.matchedGearName}` : ""}`
    );
  }

  if (need.loanRequestStatus === "pending" && need.matchedByMemberName) {
    lines.push(`Погодження: очікується від ${need.matchedByMemberName}`);
  }

  return lines;
}

function formatGearNeedListLine(need, { includeMember = false } = {}) {
  const suffix = includeMember && need.memberName ? ` | ${need.memberName}` : "";
  const statusLabel = need.loanRequestStatus === "pending"
    ? "очікує підтвердження власника"
    : getGearNeedStatusLabel(need.status);
  const match = need.loanRequestStatus === "pending"
    ? ` | очікує згоди: ${need.matchedByMemberName || "учасника"}`
    : need.matchedByMemberName
      ? ` | може допомогти: ${need.matchedByMemberName}`
      : "";
  return `• ${need.name}: ${need.quantity} | ${statusLabel}${suffix}${match}`;
}

function buildGearNeedCreatedNotification(trip, requesterName, need) {
  return joinRichLines([
    ...formatCardHeader("🆘", "НОВИЙ ЗАПИТ НА СПОРЯДЖЕННЯ"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> з’явився новий запит.`,
    `Учасник: <b>${escapeHtml(requesterName)}</b>`,
    `Потрібно: <b>${escapeHtml(need.name)}</b>`,
    `Кількість: <b>${escapeHtml(String(need.quantity))}</b>`,
    need.note ? `Коментар: <b>${escapeHtml(need.note)}</b>` : null
  ].filter(Boolean));
}

function buildGearNeedMatchedNotification(trip, need) {
  return joinRichLines([
    ...formatCardHeader("🤝", "ЗНАЙДЕНО СПОРЯДЖЕННЯ"),
    "",
    `Для запиту в поході <b>${escapeHtml(trip.name)}</b> знайдено відповідь.`,
    `Потрібно: <b>${escapeHtml(need.name)}</b>`,
    `Кількість: <b>${escapeHtml(String(need.quantity))}</b>`,
    need.matchedByMemberName ? `Може допомогти: <b>${escapeHtml(need.matchedByMemberName)}</b>` : null,
    need.memberName ? `Кому: <b>${escapeHtml(need.memberName)}</b>` : null,
    need.matchedGearName ? `Річ: <b>${escapeHtml(need.matchedGearName)}</b>` : null
  ].filter(Boolean));
}

function buildGearLoanRequestForLenderNotification(trip, need) {
  return joinRichLines([
    ...formatCardHeader("🙋", "ЗАПИТ НА КОРИСТУВАННЯ РІЧЧЮ"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> учасник хоче взяти твою річ у користування.`,
    need.memberName ? `Хто просить: <b>${escapeHtml(need.memberName)}</b>` : null,
    `Потрібно: <b>${escapeHtml(need.name)}</b>`,
    `Кількість: <b>${escapeHtml(String(need.quantity))}</b>`,
    need.matchedGearName ? `Твоя річ: <b>${escapeHtml(need.matchedGearName)}</b>` : null,
    "",
    "Підтвердь або відхили цей запит кнопками нижче."
  ].filter(Boolean));
}

function buildGearLoanRequestSentNotification(trip, need) {
  return joinRichLines([
    ...formatCardHeader("🙋", "ЗАПИТ НАДІСЛАНО"),
    "",
    `Для походу <b>${escapeHtml(trip.name)}</b> надіслано запит на користування річчю.`,
    need.matchedByMemberName ? `Кому надіслано: <b>${escapeHtml(need.matchedByMemberName)}</b>` : null,
    need.matchedGearName ? `Річ: <b>${escapeHtml(need.matchedGearName)}</b>` : null,
    "",
    "Тепер чекаємо підтвердження від власника."
  ].filter(Boolean));
}

function buildGearLoanDeclinedNotification(trip, need) {
  return joinRichLines([
    ...formatCardHeader("❌", "ЗАПИТ ВІДХИЛЕНО"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> власник не підтвердив передачу речі.`,
    need.matchedGearName ? `Річ: <b>${escapeHtml(need.matchedGearName)}</b>` : null,
    need.matchedByMemberName ? `Власник: <b>${escapeHtml(need.matchedByMemberName)}</b>` : null,
    "",
    "Запит знову відкритий, тож можна пошукати іншу відповідь."
  ].filter(Boolean));
}

function buildGearReturnRequestNotification(trip, borrowerName, item) {
  return joinRichLines([
    ...formatCardHeader("↩️", "ПОВЕРНЕННЯ РЕЧІ"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> учасник хоче повернути твою річ.`,
    `Хто повертає: <b>${escapeHtml(borrowerName)}</b>`,
    `Річ: <b>${escapeHtml(item.gearName)}</b>`,
    `Кількість: <b>${escapeHtml(String(item.quantity))}</b>`,
    "",
    "Натисни кнопку <b>✅ Підтвердити повернення</b> нижче або повернись назад."
  ]);
}

function buildGearReturnReminderNotification(trip, borrowerName, item) {
  return joinRichLines([
    ...formatCardHeader("🔔", "НАГАДУВАННЯ ПРО ПОВЕРНЕННЯ"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> учасник ще чекає підтвердження повернення твоєї речі.`,
    `Хто повертає: <b>${escapeHtml(borrowerName)}</b>`,
    `Річ: <b>${escapeHtml(item.gearName)}</b>`,
    `Кількість: <b>${escapeHtml(String(item.quantity))}</b>`,
    "",
    "Натисни кнопку <b>✅ Підтвердити повернення</b> нижче або повернись назад."
  ]);
}

function buildGearReturnConfirmedNotification(trip, gearName, ownerName, quantity) {
  return joinRichLines([
    ...formatCardHeader("✅", "ПОВЕРНЕННЯ ПІДТВЕРДЖЕНО"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> підтверджено повернення речі.`,
    `Річ: <b>${escapeHtml(gearName)}</b>`,
    `Кількість: <b>${escapeHtml(String(quantity))}</b>`,
    `Власник: <b>${escapeHtml(ownerName)}</b>`
  ]);
}

function buildOutstandingLoansSummaryLines(loans = []) {
  const lines = [];
  for (const [index, item] of loans.entries()) {
    lines.push(`${index + 1}. ${item.gearName}`);
    lines.push(`◦ Власник: ${item.ownerMemberName}`);
    for (const loan of item.loans || []) {
      lines.push(`◦ Не повернув: ${loan.borrowerMemberName} | ${loan.quantity} шт.`);
    }
  }
  return lines;
}

function buildGearNeedFulfilledNotification(trip, requesterName, need) {
  return joinRichLines([
    ...formatCardHeader("✅", "ЗАПИТ ЗАКРИТО"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> закрито запит на спорядження.`,
    `Учасник: <b>${escapeHtml(requesterName)}</b>`,
    `Річ: <b>${escapeHtml(need.name)}</b>`,
    need.matchedByMemberName ? `Отримано від: <b>${escapeHtml(need.matchedByMemberName)}</b>` : null,
    `Статус: <b>отримано</b>`
  ].filter(Boolean));
}

function buildGearNeedCancelledNotification(trip, requesterName, need) {
  return joinRichLines([
    ...formatCardHeader("🗑", "ЗАПИТ СКАСОВАНО"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> скасовано запит на спорядження.`,
    `Учасник: <b>${escapeHtml(requesterName)}</b>`,
    `Річ: <b>${escapeHtml(need.name)}</b>`
  ]);
}

function buildGearCoverageAvailableNotification(trip, gearItem, actorName, need) {
  const availableQuantity = Math.max(0, Number(gearItem?.quantity) || 0);
  const coverageText = availableQuantity >= need.quantity
    ? `повне покриття: ${availableQuantity}/${need.quantity}`
    : `часткове покриття: ${availableQuantity}/${need.quantity}`;
  return joinRichLines([
    ...formatCardHeader("🤝", "З'ЯВИЛАСЯ МОЖЛИВА ДОПОМОГА"),
    "",
    `У поході <b>${escapeHtml(trip.name)}</b> з'явилося спорядження, яке може закрити твій запит.`,
    `Запит: <b>${escapeHtml(need.name)}</b> | ${escapeHtml(String(need.quantity))}`,
    `Додав: <b>${escapeHtml(actorName)}</b>`,
    `Річ: <b>${escapeHtml(gearItem.name)}</b> | ${escapeHtml(getTripGearScopeLabel(gearItem))}`,
    `Статус покриття: <b>${escapeHtml(coverageText)}</b>`,
    "",
    `Відкрий <b>${escapeHtml(GEAR_MY_REQUESTS_LABEL)}</b>, щоб переглянути цей збіг і за потреби надіслати запит власнику речі.`
  ]);
}

async function notifyNeedOwnersAboutCoverage(telegram, trip, gearItem, needs, actorName) {
  if (!telegram || !trip || !Array.isArray(needs) || !needs.length) {
    return;
  }

  const delivered = new Set();
  for (const need of needs) {
    const memberId = String(need.memberId || "");
    if (!memberId || delivered.has(memberId)) {
      continue;
    }

    delivered.add(memberId);

    try {
      await telegram.sendMessage(
        memberId,
        buildGearCoverageAvailableNotification(trip, gearItem, actorName, need),
        {
          parse_mode: "HTML",
          ...getTripKeyboard(trip, memberId)
        }
      );
    } catch {
      // Ignore users who blocked the bot or have no active chat.
    }
  }
}

async function sendGearLoanApprovalRequest(telegram, trip, need) {
  const lenderId = String(need?.matchedByMemberId || "");
  if (!telegram || !trip || !lenderId || !need?.id) {
    return false;
  }

  setFlow(lenderId, {
    type: "gear_loan_approval",
    tripId: trip.id,
    step: "confirm",
    data: {
      needId: need.id
    }
  });

  try {
    await telegram.sendMessage(
      lenderId,
      buildGearLoanRequestForLenderNotification(trip, need),
      {
        parse_mode: "HTML",
        ...getGearLoanApprovalKeyboard()
      }
    );
    return true;
  } catch {
    clearFlow(lenderId);
    return false;
  }
}

async function sendGearReturnConfirmationRequest(telegram, groupService, trip, ownerId, borrowerName, item, { reminder = false } = {}) {
  const normalizedOwnerId = String(ownerId || "");
  if (!telegram || !groupService || !trip || !normalizedOwnerId || !item?.gearId) {
    return false;
  }

  const currentItem = groupService
    .getLoanedOutGearForMember(trip.id, normalizedOwnerId)
    .find((entry) => entry.gearId === item.gearId && entry.hasPendingReturns);

  if (!currentItem) {
    return false;
  }

  setFlow(normalizedOwnerId, {
    type: "loaned_gear_manage",
    tripId: trip.id,
    step: "action",
    data: {
      item: currentItem,
      directConfirm: true
    }
  });

  try {
    await telegram.sendMessage(
      normalizedOwnerId,
      reminder
        ? buildGearReturnReminderNotification(trip, borrowerName, { gearName: currentItem.gearName, quantity: currentItem.pendingReturnQuantity || currentItem.quantity })
        : buildGearReturnRequestNotification(trip, borrowerName, { gearName: currentItem.gearName, quantity: currentItem.pendingReturnQuantity || currentItem.quantity }),
      {
        parse_mode: "HTML",
        ...getLoanedGearActionKeyboard({ allowConfirm: currentItem.hasPendingReturns })
      }
    );
    return true;
  } catch {
    clearFlow(normalizedOwnerId);
    return false;
  }
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
    const tail = [];
    if (item.memberName) {
      tail.push(item.memberName);
    }
    const availability = formatGearAvailabilitySummary(item);
    if (availability) {
      tail.push(availability);
    }
    return `${index + 1}. ${item.name} | ${getTripGearScopeLabel(item)} | ${item.quantity} шт.${tail.length ? ` | ${tail.join(" | ")}` : ""}`;
  });
}

function startGearEditWizard(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🎒 СПОРЯДЖЕННЯ ПОХОДУ", trip.name),
        "",
        "Бот уже зафіксував тобі статус `👎 Не йду`, тому редагування спорядження в поході вимкнене.",
        "",
        "Залишається доступним тільки `🧾 Запити та облік спорядження` для повернення та підтвердження повернення речей."
      ]),
      { parse_mode: "HTML", ...getTripGearKeyboard(trip, groupService, String(ctx.from.id)) }
    );
  }

  const items = getEditableTripGearItems(trip, groupService, String(ctx.from.id));
  if (!items.length) {
    return ctx.reply(
      "Немає позицій спорядження, які ти можеш редагувати.",
      getCurrentTripGearKeyboard(ctx, groupService)
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
    data: { items: preparedItems, page: 0 }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", trip.name),
      "",
      "Обери своє спорядження, яке хочеш змінити.",
      "",
      "⚠️ Зверни увагу:",
      "• у списку є тільки ті позиції, які додав саме ти",
      "• після вибору відкриється окреме меню дій",
      "• кнопка <b>❌ Скасувати</b> поверне до розділу спорядження"
    ]),
    { parse_mode: "HTML", ...getTripGearEditItemsKeyboard(preparedItems, 0) }
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
      getCurrentTripGearKeyboard(ctx, groupService)
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

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
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

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  const snapshot = groupService.getFoodSnapshot(trip.id);
  if (!snapshot?.items?.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🗑 ВИДАЛЕННЯ ПРОДУКТУ", trip.name),
        "",
        "У поході поки немає позицій харчування для видалення."
      ]),
      { parse_mode: "HTML", ...getTripFoodMenuKeyboard(groupService, trip.id) }
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

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
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

function startExpenseDeleteWizard(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  const snapshot = groupService.getExpenseSnapshot(trip.id);
  if (!snapshot?.items?.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🗑 ВИДАЛЕННЯ ВИТРАТИ", trip.name),
        "",
        "У поході поки немає витрат для видалення."
      ]),
      { parse_mode: "HTML", ...getTripExpensesMenuKeyboard(groupService, trip.id) }
    );
  }

  const items = snapshot.items.map((item, index) =>
    `${index + 1}. ${item.title} — ${item.quantity} × ${formatMoney(item.price)} = ${formatMoney(item.amount)}`
  );

  setFlow(String(ctx.from.id), {
    type: "expense_delete",
    tripId: trip.id,
    step: "pick",
    data: {
      items: snapshot.items.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        amount: item.amount
      }))
    }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🗑 ВИДАЛЕННЯ ВИТРАТИ", trip.name),
      "",
      "Введи номер витрати, яку потрібно видалити.",
      "",
      ...items,
      "",
      "⚠️ Зверни увагу:",
      "• видалення одразу прибере позицію зі списку витрат",
      "• якщо передумав, натисни <b>❌ Скасувати</b>"
    ]),
    { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
  );
}

function handleTripDataAction(ctx, groupService) {
  const trip = requireManageTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  const snapshot = groupService.getGearSnapshot(trip.id);
  setFlow(String(ctx.from.id), {
    type: "trip_card",
    tripId: trip.id,
    step: "name",
    data: {
      name: trip.name,
      meetingDate: trip.tripCard?.meetingDate || trip.tripCard?.startDate || "",
      ...(trip.tripCard || {})
    }
  });

  return ctx.reply(
    joinRichLines([
      formatTripCard(trip, snapshot),
      "",
      ...formatCardHeader("✏️ ОНОВЛЕННЯ ДАНИХ ПОХОДУ", trip.name),
      "",
      "Введи назву походу.",
      `Поточна назва: ${trip.name}`,
      "Приклад: <code>Карпати квітень</code>",
      "",
      "• натисни <b>⏭ Пропустити</b>, якщо назву не потрібно змінювати"
    ]),
    {
      parse_mode: "HTML",
      ...getProfileEditKeyboard()
    }
  );
}

async function showRouteMenu(ctx, groupService, advisorService = null) {
  setMenuContext(ctx.from?.id, "trip-route");
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  const response = await ctx.reply(
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

  await sendContextualFaqSuggestions(ctx, advisorService, {
    screen: "route",
    trip,
    routeMeta: trip.routePlan?.meta || null
  }, "Перед таким маршрутом корисно");

  return response;
}

function startTripWeatherSelection(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
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

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  if (!trip.routePlan) {
    return ctx.reply("У походу ще немає маршруту. Натисни `🧭 Згенерувати власний маршрут` або `📚 Знайти в каталозі маршрутів`.", {
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
      ...formatCardHeader("🗺 КАРТА МАРШРУТУ", trip.name),
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

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
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
  return inferFoodMeasureKindFromCatalog(name);
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
      sections.push(`${index + 1}. <b>${escapeHtml(item.name)}</b> — ${item.quantity} шт.`);

      for (const line of formatGearAvailabilityLines(item, { includeOwner })) {
        sections.push(line);
      }

      const attributes = summarizeGearAttributes(item);
      for (const line of attributes) {
        sections.push(`◦ ${line}`);
      }

      if (index < group.items.length - 1) {
        sections.push("");
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
    data: { items: preparedItems, page: 0 }
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
    { parse_mode: "HTML", ...getTripGearEditItemsKeyboard(preparedItems, 0) }
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

function validateProfileEditValue(fieldKey, message) {
  switch (fieldKey) {
    case "fullName":
      return validateProfileName(message);
    case "birthDate":
      return validateIsoDate(message);
    case "bloodType":
      return validateBloodType(message);
    case "phone":
    case "emergencyContactPhone":
      return validatePhone(message);
    case "city":
      return validateCity(message);
    case "gender":
    case "emergencyContactRelation":
    case "experienceLevel":
      return validateShortProfileText(message);
    case "allergies":
    case "medications":
    case "healthNotes":
    case "emergencyContactName":
      return validateLongProfileText(message);
    default:
      return { ok: true, value: String(message || "").trim() };
  }
}

function buildProfileEditPrompt(fieldConfig, notice = "• можна пропустити будь-яке поле і повернутися до нього пізніше") {
  return joinRichLines([
    ...formatCardHeader("✏️ РЕДАГУВАННЯ ПРОФІЛЮ", "Анкета користувача"),
    "",
    fieldConfig.prompt,
    "",
    "⚠️ Зверни увагу:",
    notice
  ]);
}

function replyProfileEditStepPrompt(ctx, flow, notice) {
  const fieldConfig = PROFILE_EDIT_FIELDS.find((item) => item.key === flow.step) || PROFILE_EDIT_FIELDS[0];
  return ctx.reply(
    buildProfileEditPrompt(fieldConfig, notice),
    { parse_mode: "HTML", ...getProfileEditKeyboard() }
  );
}

function replyGearNeedStepPrompt(ctx, flow) {
  if (flow.step === "name") {
    return ctx.reply(
      "Якого спорядження тобі бракує?\nПриклад: `спальник`",
      { parse_mode: "Markdown", ...FLOW_CANCEL_KEYBOARD }
    );
  }

  if (flow.step === "quantity") {
    return ctx.reply("Скільки одиниць тобі потрібно?\nПриклад: `1`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🆘 КОМЕНТАР ДО ЗАПИТУ", flow.data.name || "Запит"),
      "",
      "Додай короткий коментар або введи <b>-</b>, якщо він не потрібен.",
      "",
      "Приклад: <b>не маю власних</b>"
    ]),
    { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
  );
}

function replyFoodAddStepPrompt(ctx, flow) {
  if (flow.step === "name") {
    return ctx.reply("Що додаємо до харчування?\nПриклад: `гречка`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  if (flow.step === "weight") {
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

  if (flow.step === "quantity") {
    return ctx.reply("Яку кількість додати?\nПриклад: `2 пачки`, `4 шт`, `1 упаковка`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  return ctx.reply("Яка вартість цієї позиції у гривнях?\nПриклад: `180`", {
    parse_mode: "Markdown",
    ...FLOW_CANCEL_KEYBOARD
  });
}

function replyExpenseAddStepPrompt(ctx, flow) {
  if (flow.step === "title") {
    return ctx.reply("Що це за витрата?\nПриклад: `квиток на автобус`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  if (flow.step === "quantity") {
    return ctx.reply("Введи кількість.\nПриклад: `2` або `1`", {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  return ctx.reply("Введи ціну за одиницю у гривнях.\nПриклад: `450`", {
    parse_mode: "Markdown",
    ...FLOW_CANCEL_KEYBOARD
  });
}

function formatUkrainianCount(value, forms) {
  const count = Math.abs(Number(value) || 0);
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} ${forms[0]}`;
  }
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return `${count} ${forms[1]}`;
  }
  return `${count} ${forms[2]}`;
}

function getSeriesDynamicDescription(seriesKey, stats, fallbackDescription = "") {
  switch (seriesKey) {
    case "hikes":
      return formatUkrainianCount(stats.hikesCount, ["завершений похід", "завершені походи", "завершених походів"]);
    case "distance":
      return `${Number(stats.totalKm || 0).toFixed(1)} км`;
    case "nights":
      return formatUkrainianCount(stats.totalNights, ["ночівля", "ночівлі", "ночівель"]);
    case "ascent":
      return `${Math.round(stats.totalAscent || 0)} м набору висоти`;
    case "weatheredTrips":
      return `${formatUkrainianCount(stats.weatherTrips, ["похід", "походи", "походів"])} з погодними попередженнями`;
    case "stormTrips":
      return `${formatUkrainianCount(stats.stormTrips, ["похід", "походи", "походів"])} з грозою, дощем або сильним вітром`;
    case "freezeTrips":
      return `${formatUkrainianCount(stats.freezeTrips, ["похід", "походи", "походів"])} з ризиком морозу або заморозку`;
    case "longestDistance":
      return `Найдовший маршрут: ${Number(stats.longestDistance || 0).toFixed(1)} км`;
    case "longestOneDayDistance":
      return `Найдовший одноденний маршрут: ${Number(stats.longestOneDayDistance || 0).toFixed(1)} км`;
    case "openSkyNights":
      return formatUkrainianCount(stats.openSkyNights, ["ніч", "ночі", "ночей"]) + " у польових умовах";
    case "organizer":
      return `${formatUkrainianCount(stats.organizedTrips, ["похід", "походи", "походів"])} як організатор або провідник`;
    case "foodTrips":
      return `${formatUkrainianCount(stats.foodTrips, ["похід", "походи", "походів"])} із закритим харчуванням`;
    case "sharedGearTrips":
      return `${formatUkrainianCount(stats.sharedGearTrips, ["похід", "походи", "походів"])} зі спільним або запасним спорядженням`;
    case "safetyTrips":
      return `${formatUkrainianCount(stats.safetyTrips, ["похід", "походи", "походів"])} із закритою аптечкою або безпекою`;
    case "expenseTrips":
      return `${formatUkrainianCount(stats.expenseTrips, ["похід", "походи", "походів"])} із веденням витрат`;
    case "preparedLevel":
      return fallbackDescription;
    default:
      return fallbackDescription;
  }
}

function buildUnifiedAwardLines(awards = [], stats = {}) {
  const normalizedAwards = (Array.isArray(awards) ? awards : []).filter((award) => award && typeof award === "object");
  const seriesEntries = [];
  const oneTimeEntries = [];

  for (const series of BADGE_SERIES) {
    const awarded = normalizedAwards
      .filter((award) => String(award.key || "").startsWith(`${series.key}_`))
      .sort((left, right) => {
        const leftIndex = series.milestones.findIndex((item) => item.tier === left.tier);
        const rightIndex = series.milestones.findIndex((item) => item.tier === right.tier);
        return leftIndex - rightIndex;
      });

    if (!awarded.length) {
      continue;
    }

    const icons = awarded
      .map((award) => getTierMeta(award.tier).icon)
      .join(" ");
    const highestAward = awarded[awarded.length - 1];
    const description = getSeriesDynamicDescription(series.key, stats, highestAward.description || "");

    seriesEntries.push(`• ${icons} ${series.title}${description ? ` — ${description}` : ""}`);
  }

  for (const award of normalizedAwards) {
    const isSeriesAward = BADGE_SERIES.some((series) => String(award.key || "").startsWith(`${series.key}_`));
    if (isSeriesAward) {
      continue;
    }
    oneTimeEntries.push(`• ${formatAwardName(award)}${award.description ? ` — ${award.description}` : ""}`);
  }

  return [...seriesEntries, ...oneTimeEntries];
}

function formatProfileAwards(userService, userId, userName, options = {}) {
  const historyLimit = Number.isFinite(Number(options.historyLimit)) ? Number(options.historyLimit) : 10;
  const awardLimit = Number.isFinite(Number(options.awardLimit)) ? Number(options.awardLimit) : null;
  const data = userService.getAwards(userId, userName);
  const dashboard = userService.getDashboard(userId, userName);
  const awards = Array.isArray(data?.awards) ? data.awards.filter((item) => item && typeof item === "object") : [];
  const history = Array.isArray(data?.history) ? data.history.filter((item) => item && typeof item === "object") : [];
  const stats = data?.stats && typeof data.stats === "object" ? data.stats : {};
  const xp = data?.xp && typeof data.xp === "object" ? data.xp : {};
  const xpProgress = xp?.progress && typeof xp.progress === "object" ? xp.progress : {};
  const limitedAwards = awardLimit && awardLimit > 0 ? awards.slice(0, awardLimit) : awards;
  const limitedHistory = historyLimit >= 0 ? history.slice(0, historyLimit) : history;
  const awardLines = limitedAwards.length
    ? buildUnifiedAwardLines(limitedAwards, stats)
    : ["• Поки що нагород немає. Заверши перший похід, і вони з’являться тут."];
  const historyLines = limitedHistory.length
    ? limitedHistory.flatMap((item) => {
      const lines = [
        `• <b>${escapeHtml(item.tripName || "Похід")}</b>`,
        `  Маршрут: ${escapeHtml(item.routeName || "маршрут не задано")}`,
        `  XP: +${Number(item.gainedXp) || 0} (база ${Number(item.baseXp) || 0}${Number(item.awardBonusXp) > 0 ? `, бонус ${Number(item.awardBonusXp)}` : ""})`,
        `  Рівень: ${Number(item.levelBefore) || 1} → ${Number(item.levelAfter) || 1}`,
        `  Разом XP: ${Number(item.totalXpAfter) || 0}`
      ];

      if (Array.isArray(item.components) && item.components.length) {
        lines.push(`  Складові: ${item.components.filter((part) => part && typeof part === "object").map((part) => `${part.label || "XP"} +${Number(part.xp) || 0}`).join(" • ")}`);
      }

      return [...lines, ""];
    }).slice(0, -1)
    : ["• Історія XP поки порожня. Заверши перший реальний похід, і тут з’являться нарахування."];
  const trimmedHistoryNotice = history.length > limitedHistory.length
    ? [`• Показано останні ${limitedHistory.length} нарахувань XP із ${history.length}.`]
    : [];
  const trimmedAwardsNotice = awards.length > limitedAwards.length
    ? [`• Показано ${limitedAwards.length} нагород із ${awards.length}.`]
    : [];

  return joinRichLines([
    ...formatCardHeader("🏅 МОЇ ДОСЯГНЕННЯ", data.fullName),
    "",
    formatSectionHeader("🎯", "Титул, Рівень І XP"),
    `• Поточний титул: ${data.title || "ще не відкрито"}`,
    `• Рівень: ${Number(xp.level) || 1}`,
    `• Загальний XP: ${Number(xp.totalXp) || 0}`,
    xpProgress.next
      ? `• До наступного рівня: ${Number(xpProgress.currentXp) || 0} / ${Number(xpProgress.nextTargetXp) || 0} XP`
      : `• Максимальний відкритий рівень: ${Number(xpProgress.currentXp) || 0} XP`,
    "",
    formatSectionHeader("🥾", "Підсумок По Походах"),
    `• Пройдених походів: ${Number(dashboard.hikesCount) || 0}`,
    `• Активних походів: ${Number(dashboard.activeTrips) || 0}`,
    `• Архівних походів: ${Number(dashboard.archivedTrips) || 0}`,
    "",
    formatSectionHeader("📍", "Пройдений Обсяг"),
    `• Кілометри: ${Number(stats.totalKm || 0).toFixed(1)} км`,
    `• Набір висоти: ${Math.round(Number(stats.totalAscent) || 0)} м`,
    `• Днів у походах: ${Number(stats.totalDays) || 0}`,
    `• Ночівель: ${Number(stats.totalNights) || 0}`,
    "",
    formatSectionHeader("💸", "Витрати І Спорядження"),
    `• Сумарні витрати: ${formatMoney(Number(dashboard.totalCost) || 0)}`,
    `• Позицій у моєму спорядженні: ${Number(dashboard.personalGearCount) || 0}`,
    `• Організованих походів: ${Number(dashboard.organizedTrips) || 0}`,
    "",
    formatSectionHeader("🧾", "Останні Нарахування XP"),
    ...historyLines,
    ...trimmedHistoryNotice,
    "",
    formatSectionHeader("🏆", "Усі Нагороди"),
    ...awardLines,
    ...trimmedAwardsNotice,
    "",
    "⚠️ Зверни увагу:",
    "• статистика рахується по завершених та архівних походах",
    "• активний похід окремо не додається в пройдену статистику"
  ]);
}

function buildSafeProfileAwardsMessage(userService, userId, userName) {
  const variants = [
    { historyLimit: 10, awardLimit: null },
    { historyLimit: 6, awardLimit: 24 },
    { historyLimit: 4, awardLimit: 18 },
    { historyLimit: 3, awardLimit: 12 }
  ];
  let lastError = null;

  for (const variant of variants) {
    try {
      const message = formatProfileAwards(userService, userId, userName, variant);
      if (message.length <= 3900) {
        return message;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.error("Failed to build full awards message", { userId, userName, error: lastError });
  }

  return formatProfileAwards(userService, userId, userName, { historyLimit: 2, awardLimit: 8 });
}

function formatProfileAbout(userService, userId, userName) {
  const profileData = userService.getProfile(userId, userName);
  const profile = profileData.profile;
  const authState = userService.getAuthorizationState(userId, userName);
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
    `Номер підтверджено: ${authState.contactVerified ? "так" : "ні"}`,
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

function showProfileDashboard(ctx, userService) {
  return showProfileAwards(ctx, userService);
}

function showProfileAbout(ctx, userService) {
  setMenuContext(ctx.from?.id, "profile");
  return ctx.reply(
    formatProfileAbout(userService, String(ctx.from.id), getUserLabel(ctx)),
    { parse_mode: "HTML", ...getProfileAboutKeyboard() }
  );
}

function showProfileMedicalCard(ctx, userService) {
  setMenuContext(ctx.from?.id, "profile");
  return ctx.reply(
    formatProfileMedicalCard(userService, String(ctx.from.id), getUserLabel(ctx)),
    { parse_mode: "HTML", ...getProfileAboutKeyboard() }
  );
}

function showProfileAwards(ctx, userService) {
  setMenuContext(ctx.from?.id, "profile");
  try {
    return ctx.reply(
      buildSafeProfileAwardsMessage(userService, String(ctx.from.id), getUserLabel(ctx)),
      { parse_mode: "HTML", ...getProfileKeyboard() }
    );
  } catch (error) {
    console.error("Failed to render profile awards", { userId: String(ctx.from?.id || ""), error });
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🏅 МОЇ ДОСЯГНЕННЯ", getUserLabel(ctx)),
        "",
        "Не вдалося показати повну версію досягнень, але профіль і нагороди збережені.",
        "",
        "Спробуй ще раз трохи пізніше."
      ]),
      { parse_mode: "HTML", ...getProfileKeyboard() }
    );
  }
}

function startProfileEditWizard(ctx, userService) {
  const current = userService.getProfile(String(ctx.from.id), getUserLabel(ctx)).profile;
  setFlow(String(ctx.from.id), {
    type: "profile_edit",
    step: PROFILE_EDIT_FIELDS[0].key,
    data: { ...current }
  });

  return replyProfileEditStepPrompt(ctx, {
    type: "profile_edit",
    step: PROFILE_EDIT_FIELDS[0].key,
    data: { ...current }
  });
}

function getFaqKeyboard({ questions = [], mode = "browse", canPrev = false, canNext = false }) {
  const rows = [];
  rows.push([FAQ_SEARCH_LABEL]);

  for (let index = 0; index < questions.length; index += 2) {
    const pair = questions.slice(index, index + 2).map((item) => item.question);
    rows.push(pair);
  }

  if (mode === "search_results" || mode === "search_prompt") {
    rows.push([FAQ_ALL_LABEL]);
  }

  const paginationRow = [];
  if (canPrev) {
    paginationRow.push(FAQ_PREV_LABEL);
  }
  if (canNext) {
    paginationRow.push(FAQ_NEXT_LABEL);
  }
  if (paginationRow.length) {
    rows.push(paginationRow);
  }

  rows.push(["⬅️ Головне меню"]);
  return buildKeyboard(rows);
}

function formatFaqMenuMessage(pageData) {
  const questions = pageData.items || [];
  return [
    ...formatCardHeader("❓ ЧАСТІ ПИТАННЯ", "Швидкі відповіді"),
    "",
    "Обери будь-яке питання нижче.",
    "",
    "⚠️ Зверни увагу:",
    "• можна натиснути `🔎 Пошук по FAQ` і ввести частину питання або ключове слово",
    "• питання охоплюють маршрут, одяг, спорядження, воду, безпеку, табір і навігацію",
    `Сторінка: ${pageData.page + 1} з ${pageData.totalPages}`,
    `Усього в довіднику: ${pageData.totalCount} питань`,
    `На цій сторінці: ${questions.length}`
  ].join("\n");
}

function formatFaqSearchPrompt() {
  return joinRichLines([
    ...formatCardHeader("🔎 ПОШУК ПО FAQ", "Швидкі відповіді"),
    "",
    "Введи частину питання або ключове слово.",
    "",
    "Приклади:",
    "• дощовик",
    "• вода",
    "• весна",
    "• спальник"
  ]);
}

function formatFaqSearchResultsMessage(query, pageData) {
  const questions = pageData.items || [];
  return joinRichLines([
    ...formatCardHeader("🔎 РЕЗУЛЬТАТИ ПОШУКУ", query),
    "",
    questions.length
      ? `Знайшов ${pageData.totalCount} питань. Сторінка ${pageData.page + 1} з ${pageData.totalPages}.`
      : "Нічого не знайшов. Спробуй інше ключове слово або натисни `📚 Усі питання`."
  ]);
}

function buildFaqFlowData(flowData = {}, updates = {}) {
  return {
    mode: "browse",
    browsePage: 0,
    browseTotalPages: 1,
    browseTotalCount: 0,
    browseQuestions: [],
    searchQuery: "",
    searchPage: 0,
    searchTotalPages: 1,
    searchTotalCount: 0,
    searchQuestions: [],
    ...flowData,
    ...updates
  };
}

function showFaqMenu(ctx, advisorService, flowData = {}, page = 0) {
  const pageData = advisorService.getFaqQuestionsPage({ page, pageSize: 10 });
  const nextData = buildFaqFlowData(flowData, {
    mode: "browse",
    browsePage: pageData.page,
    browseTotalPages: pageData.totalPages,
    browseTotalCount: pageData.totalCount,
    browseQuestions: pageData.items
  });

  setFlow(String(ctx.from.id), {
    type: "faq_menu",
    step: "pick",
    data: nextData
  });

  return ctx.reply(formatFaqMenuMessage(pageData), {
    parse_mode: "HTML",
    ...getFaqKeyboard({
      questions: pageData.items,
      mode: "browse",
      canPrev: pageData.page > 0,
      canNext: pageData.page < pageData.totalPages - 1
    })
  });
}

function showFaqSearchResults(ctx, advisorService, flowData = {}, query, page = 0) {
  const pageData = advisorService.searchFaqQuestions(query, { page, pageSize: 10 });
  const nextData = buildFaqFlowData(flowData, {
    mode: "search_results",
    searchQuery: query,
    searchPage: pageData.page,
    searchTotalPages: pageData.totalPages,
    searchTotalCount: pageData.totalCount,
    searchQuestions: pageData.items
  });

  setFlow(String(ctx.from.id), {
    type: "faq_menu",
    step: "pick",
    data: nextData
  });

  return ctx.reply(formatFaqSearchResultsMessage(query, pageData), {
    parse_mode: "HTML",
    ...getFaqKeyboard({
      questions: pageData.items,
      mode: "search_results",
      canPrev: pageData.page > 0,
      canNext: pageData.page < pageData.totalPages - 1
    })
  });
}

function showAdvicePrompt(ctx, advisorService) {
  return showFaqMenu(ctx, advisorService);
}

async function showWeather(ctx, weatherService, location, keyboard = undefined, advisorService = null, faqContext = {}) {
  const targetKeyboard = keyboard === undefined ? getMainKeyboard(ctx) : keyboard;
  if (!location) {
    return ctx.reply("Введи локацію: `/weather Яремче`", {
      parse_mode: "Markdown",
      ...(targetKeyboard || {})
    });
  }

  const summary = await weatherService.getWeatherSummary(location);
  const response = await ctx.reply(summary, { parse_mode: "HTML", ...(targetKeyboard || {}) });
  await sendContextualFaqSuggestions(ctx, advisorService, {
    screen: "weather",
    weatherSummary: summary,
    location,
    ...faqContext
  }, "Під це варто глянути");
  return response;
}

async function showRouteSearch(ctx, groupService, routeService, input, advisorService = null) {
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
  await sendContextualFaqSuggestions(ctx, advisorService, {
    screen: "route",
    trip: activeTrip || null,
    routeMeta: report.meta || null
  }, "Перед таким маршрутом корисно");
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

    if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
      return replyRestrictedTripSection(ctx, trip);
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
    buildRoutePrompt("from", mode),
    {
      parse_mode: "Markdown",
      ...getRouteFlowKeyboard(mode)
    }
  );
}

function startTripCardWizardForTrip(ctx, tripId, initialData = {}) {
  setFlow(String(ctx.from.id), {
    type: "trip_card",
    tripId,
    step: "name",
    data: {
      meetingDate: initialData.meetingDate || initialData.startDate || "",
      ...initialData
    }
  });

  return ctx.reply(buildTripNamePrompt(initialData.name), {
    parse_mode: "Markdown",
    ...getProfileEditKeyboard()
  });
}

function startCreateTripWizard(ctx, tripName = "") {
  const parentContext = getMenuContext(ctx.from?.id);
  setFlow(String(ctx.from.id), {
    type: "trip_create",
    step: tripName ? getTripCreateNextStep("name") : "name",
    data: {
      ...(tripName ? { name: tripName } : {}),
      parentContext
    }
  });

  if (tripName) {
    return ctx.reply("Введи дату початку у форматі YYYY-MM-DD.\nПриклад: `2026-07-14`", {
      parse_mode: "Markdown",
      ...TRIP_CREATE_KEYBOARD
    });
  }

  return ctx.reply("Введи назву походу.\nПриклад: `Карпати серпень`", {
    parse_mode: "Markdown",
    ...TRIP_CREATE_KEYBOARD
  });
}

function isValidDate(value) {
  return validateIsoDate(value).ok;
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
  const advisorService = routeService?.advisorService || null;

  if (message === "❌ Скасувати") {
    const previousStep = getRoutePreviousStep(flow.step);

    if (previousStep !== flow.step) {
      flow.step = previousStep;
      setFlow(String(ctx.from.id), flow);

      if (flow.step === "from") {
        return ctx.reply(
          buildRoutePrompt("from", flow.mode),
          { parse_mode: "Markdown", ...getRouteFlowKeyboard(flow.mode) }
        );
      }

      if (flow.step === "to") {
        return ctx.reply(
          buildRoutePrompt("to", flow.mode),
          { parse_mode: "Markdown", ...getRouteFlowKeyboard(flow.mode) }
        );
      }

      if (flow.step === "stops") {
        return ctx.reply(
          (flow.data.stopSuggestions || []).length
            ? `Обери проміжні точки з перевіреного списку.\nМожна натиснути кілька точок по черзі, а потім \`${FLOW_STOPS_DONE_LABEL}\`.`
            : "Для цього маршруту немає перевірених проміжних точок у бібліотеці.\nЯкщо зупинок немає, натисни `⏭ Без зупинок`.",
          { parse_mode: "Markdown", ...getRouteStopsKeyboard(flow.data.stopSuggestions || [], flow.data.stops || [], flow.mode) }
        );
      }
    }

    clearFlow(String(ctx.from.id));
    return showParentMenuByContext(ctx, groupService, parentContext, advisorService)
      || (flow.mode === "search" ? showRoutesMenu(ctx) : showRouteMenu(ctx, groupService, advisorService));
  }

  if (message === getRouteFlowBackLabel(flow.mode)) {
    const previousStep = getRoutePreviousStep(flow.step);
    if (previousStep === flow.step) {
      clearFlow(String(ctx.from.id));
      return showParentMenuByContext(ctx, groupService, parentContext, advisorService)
        || (flow.mode === "search" ? showRoutesMenu(ctx) : showRouteMenu(ctx, groupService, advisorService));
    }

    flow.step = previousStep;
    setFlow(String(ctx.from.id), flow);

    if (flow.step === "from") {
      return ctx.reply(
        buildRoutePrompt("from", flow.mode),
        { parse_mode: "Markdown", ...getRouteFlowKeyboard(flow.mode) }
      );
    }

    if (flow.step === "to") {
      return ctx.reply(
        buildRoutePrompt("to", flow.mode),
        { parse_mode: "Markdown", ...getRouteFlowKeyboard(flow.mode) }
      );
    }

    if (flow.step === "stops") {
      return ctx.reply(
        (flow.data.stopSuggestions || []).length
          ? `Обери проміжні точки з перевіреного списку.\nМожна натиснути кілька точок по черзі, а потім \`${FLOW_STOPS_DONE_LABEL}\`.`
          : "Для цього маршруту немає перевірених проміжних точок у бібліотеці.\nЯкщо зупинок немає, натисни `⏭ Без зупинок`.",
        { parse_mode: "Markdown", ...getRouteStopsKeyboard(flow.data.stopSuggestions || [], flow.data.stops || [], flow.mode) }
      );
    }

    return ctx.reply(buildRoutePrompt("region", flow.mode), {
      parse_mode: "Markdown",
      ...getRouteFlowKeyboard(flow.mode)
    });
  }

  if (flow.step === "from") {
    const validation = validateRoutePlace(message);
    if (!validation.ok) {
      return ctx.reply(validation.error, {
        parse_mode: "Markdown",
        ...getRouteFlowKeyboard(flow.mode)
      });
    }

    flow.data.from = validation.value;
    flow.step = getRouteNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      buildRoutePrompt("to", flow.mode),
      {
        parse_mode: "Markdown",
        ...getRouteFlowKeyboard(flow.mode)
      }
    );
  }

  if (flow.step === "to") {
    const validation = validateRoutePlace(message);
    if (!validation.ok) {
      return ctx.reply(validation.error, {
        parse_mode: "Markdown",
        ...getRouteFlowKeyboard(flow.mode)
      });
    }

    flow.data.to = validation.value;
    flow.data.stops = [];
    flow.data.stopSuggestions = routeService.getSuggestedWaypoints({
      from: flow.data.from,
      to: flow.data.to
    });

    flow.step = getRouteNextStep(flow.step);
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

    flow.step = getRouteNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(buildRoutePrompt("region", flow.mode), {
      parse_mode: "Markdown",
      ...getRouteFlowKeyboard(flow.mode)
    });
  }

  if (flow.step === "region") {
    const validation = validateRoutePlace(message);
    if (!validation.ok) {
      return ctx.reply(validation.error, {
        parse_mode: "Markdown",
        ...getRouteFlowKeyboard(flow.mode)
      });
    }

    flow.data.region = validation.value;
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

    flow.step = getRouteNextStep(flow.step);
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
    if (flow.step === "name") {
      clearFlow(String(ctx.from.id));
      return showTripPassport(ctx, groupService, userService, telegram?.advisorService || null);
    }
    flow.step = getTripCardPreviousStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyTripCardStepPrompt(ctx, flow);
  }

  if (flow.step === "name") {
    if (message === PROFILE_SKIP_LABEL) {
      if (!flow.data.name) {
        return ctx.reply("Назву походу потрібно заповнити. Натиснути `Пропустити` можна тільки якщо поточна назва вже є.", {
          parse_mode: "Markdown",
          ...getProfileEditKeyboard()
        });
      }

      flow.step = "startDate";
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(buildTripDatePrompt("дату початку", "2026-07-14", flow.data.startDate), {
        parse_mode: "Markdown",
        ...getProfileEditKeyboard()
      });
    }

    const validation = validateTripName(message);
    if (!validation.ok) {
      return ctx.reply(`${validation.error}\n\n${buildTripNamePrompt(flow.data.name)}`, {
        parse_mode: "Markdown",
        ...getProfileEditKeyboard()
      });
    }

    flow.data.name = validation.value;
    flow.step = getTripCardNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyTripCardStepPrompt(ctx, flow);
  }

  if (flow.step === "startDate") {
    if (message === PROFILE_SKIP_LABEL) {
      if (!flow.data.startDate) {
        return ctx.reply("Дату початку потрібно заповнити. `Пропустити` працює лише коли значення вже задане.", {
          parse_mode: "Markdown",
          ...getProfileEditKeyboard()
        });
      }

      flow.step = getTripCardNextStep(flow.step);
      setFlow(String(ctx.from.id), flow);
      return replyTripCardStepPrompt(ctx, flow);
    }

    const validation = validateIsoDate(message);
    if (!validation.ok) {
      return ctx.reply(`${validation.error}\n\n${buildTripDatePrompt("дату початку", "2026-07-14", flow.data.startDate)}`, {
        parse_mode: "Markdown",
        ...getProfileEditKeyboard()
      });
    }

    flow.data.startDate = validation.value;
    flow.step = getTripCardNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyTripCardStepPrompt(ctx, flow);
  }

  if (flow.step === "endDate") {
    if (message === PROFILE_SKIP_LABEL) {
      if (!flow.data.endDate) {
        return ctx.reply("Дату завершення потрібно заповнити. `Пропустити` працює лише коли значення вже задане.", {
          parse_mode: "Markdown",
          ...getProfileEditKeyboard()
        });
      }

      flow.data.nights = calculateNights(flow.data.startDate, flow.data.endDate);
      flow.step = getTripCardNextStep(flow.step);
      setFlow(String(ctx.from.id), flow);
      return replyTripCardStepPrompt(ctx, flow);
    }

    const validation = validateIsoDate(message);
    if (!validation.ok) {
      return ctx.reply(`${validation.error}\n\n${buildTripDatePrompt("дату завершення", "2026-07-16", flow.data.endDate)}`, {
        parse_mode: "Markdown",
        ...getProfileEditKeyboard()
      });
    }

    flow.data.endDate = validation.value;
    flow.data.nights = calculateNights(flow.data.startDate, flow.data.endDate);
    flow.step = getTripCardNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyTripCardStepPrompt(ctx, flow);
  }

  if (flow.step === "gearStatus") {
    if (message === PROFILE_SKIP_LABEL) {
      if (!flow.data.gearReadinessStatus) {
        return ctx.reply("Статус готовності потрібно вказати. `Пропустити` працює лише коли значення вже задане.", FLOW_GEAR_STATUS_WITH_SKIP_KEYBOARD);
      }

      flow.step = getTripCardNextStep(flow.step);
      setFlow(String(ctx.from.id), flow);
      return replyTripCardStepPrompt(ctx, flow);
    }

    const normalized = normalizeGearStatus(message);
    const validation = validateGearStatus(normalized);
    if (!validation.ok) {
      return ctx.reply(validation.error, FLOW_GEAR_STATUS_WITH_SKIP_KEYBOARD);
    }

    flow.data.gearReadinessStatus = validation.value;
    flow.step = getTripCardNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyTripCardStepPrompt(ctx, flow);
  }

  if (flow.step === "meetingPoint") {
    if (message !== PROFILE_SKIP_LABEL) {
      const validation = validateMeetingPoint(message);
      if (!validation.ok) {
        return ctx.reply(`${validation.error}\n\n${buildTripMeetingPointPrompt(flow.data.meetingPoint)}`, {
          parse_mode: "Markdown",
          ...getProfileEditKeyboard()
        });
      }
      flow.data.meetingPoint = validation.value;
    }

    flow.step = getTripCardNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyTripCardStepPrompt(ctx, flow);
  }

  if (flow.step === "meetingDate") {
    if (message !== PROFILE_SKIP_LABEL) {
      const validation = validateIsoDate(message);
      if (!validation.ok) {
        return ctx.reply(`${validation.error}\n\n${buildTripMeetingDatePrompt(flow.data.meetingDate)}`, {
          parse_mode: "Markdown",
          ...getProfileEditKeyboard()
        });
      }

      flow.data.meetingDate = validation.value;
    }

    flow.step = getTripCardNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyTripCardStepPrompt(ctx, flow);
  }

  if (flow.step === "meetingTime") {
    if (message !== PROFILE_SKIP_LABEL) {
      const validation = validateMeetingTime(message);
      if (!validation.ok) {
        return ctx.reply(`${validation.error}\n\n${buildTripMeetingTimePrompt(flow.data.meetingTime)}`, {
          parse_mode: "Markdown",
          ...getProfileEditKeyboard()
        });
      }

      flow.data.meetingTime = validation.value;
    }

    flow.step = getTripCardNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyTripCardStepPrompt(ctx, flow);
  }

  if (flow.step === "confirm") {
    if (message !== "✅ Зберегти дані походу") {
      return ctx.reply("Натисни `✅ Зберегти дані походу` або `❌ Скасувати`.", {
        parse_mode: "Markdown",
        ...FLOW_CONFIRM_CARD_KEYBOARD
      });
    }

    const previousTrip = groupService.findGroupByMember(String(ctx.from.id));
    let updatedTrip = groupService.setTripCard({
      groupId: flow.tripId,
      tripName: flow.data.name,
      tripCard: {
        startDate: flow.data.startDate,
        endDate: flow.data.endDate,
        nights: flow.data.nights,
        gearReadinessStatus: flow.data.gearReadinessStatus,
        meetingPoint: flow.data.meetingPoint || "",
        meetingDate: flow.data.meetingDate || "",
        meetingTime: flow.data.meetingTime || ""
      }
    });
    updatedTrip = await applyImmediateAttendanceDeadlineRules(
      telegram,
      groupService,
      userService,
      updatedTrip
    );
    const snapshot = groupService.getGearSnapshot(updatedTrip.id);
    const actorName = userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx));
    const tripCardChanged = Boolean(
      previousTrip?.tripCard &&
      (
        previousTrip.tripCard.startDate !== updatedTrip.tripCard?.startDate ||
        previousTrip.tripCard.endDate !== updatedTrip.tripCard?.endDate ||
        normalizeLocationLabel(previousTrip.tripCard.meetingPoint || "") !== normalizeLocationLabel(updatedTrip.tripCard?.meetingPoint || "") ||
        formatTripMeetingDateTime(previousTrip.tripCard || {}) !== formatTripMeetingDateTime(updatedTrip.tripCard || {})
      )
    );

    clearFlow(String(ctx.from.id));
    if (tripCardChanged) {
      void notifyTripMembers(
        telegram,
        updatedTrip,
        buildTripCardChangedNotification(updatedTrip, actorName, previousTrip.tripCard),
        { excludeMemberId: String(ctx.from.id) }
      );
    }
    return ctx.reply(formatTripCard(updatedTrip, snapshot), { parse_mode: "HTML", ...getTripDetailsKeyboard(updatedTrip, String(ctx.from.id)) });
  }

  return null;
}

async function handleTripCreateFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    const previousStep = getTripCreatePreviousStep(flow.step);
    if (previousStep === flow.step) {
      const parentContext = getFlowParentContext(flow);
      clearFlow(String(ctx.from.id));
      return (
        showParentMenuByContext(ctx, groupService, parentContext)
        || showTripMenu(ctx, groupService)
      );
    }

    flow.step = previousStep;
    setFlow(String(ctx.from.id), flow);

    if (flow.step === "name") {
      return ctx.reply("Введи назву походу.\nПриклад: `Карпати серпень`", {
        parse_mode: "Markdown",
        ...TRIP_CREATE_KEYBOARD
      });
    }

    if (flow.step === "startDate") {
      return ctx.reply("Введи дату початку у форматі YYYY-MM-DD.\nПриклад: `2026-07-14`", {
        parse_mode: "Markdown",
        ...TRIP_CREATE_KEYBOARD
      });
    }

    if (flow.step === "endDate") {
      return ctx.reply("Введи дату завершення у форматі YYYY-MM-DD.\nПриклад: `2026-07-16`", {
        parse_mode: "Markdown",
        ...TRIP_CREATE_KEYBOARD
      });
    }

    if (flow.step === "gearStatus") {
      return ctx.reply(
        `Ночівель розраховано автоматично: ${flow.data.nights}\n\nОбери статус готовності спорядження.`,
        FLOW_GEAR_STATUS_KEYBOARD
      );
    }

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

  if (flow.step === "name") {
    const validation = validateTripName(message);
    if (!validation.ok) {
      return ctx.reply(validation.error, {
        parse_mode: "Markdown",
        ...TRIP_CREATE_KEYBOARD
      });
    }

    flow.data.name = validation.value;
    flow.step = getTripCreateNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return ctx.reply("Введи дату початку у форматі YYYY-MM-DD.\nПриклад: `2026-07-14`", {
      parse_mode: "Markdown",
      ...TRIP_CREATE_KEYBOARD
    });
  }

  if (flow.step === "startDate") {
    const validation = validateIsoDate(message);
    if (!validation.ok) {
      return ctx.reply(`${validation.error}\nПриклад: \`2026-07-14\``, {
        parse_mode: "Markdown",
        ...TRIP_CREATE_KEYBOARD
      });
    }

    flow.data.startDate = validation.value;
    flow.step = getTripCreateNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return ctx.reply("Введи дату завершення у форматі YYYY-MM-DD.\nПриклад: `2026-07-16`", {
      parse_mode: "Markdown",
      ...TRIP_CREATE_KEYBOARD
    });
  }

  if (flow.step === "endDate") {
    const validation = validateIsoDate(message);
    if (!validation.ok) {
      return ctx.reply(`${validation.error}\nПриклад: \`2026-07-16\``, {
        parse_mode: "Markdown",
        ...TRIP_CREATE_KEYBOARD
      });
    }

    flow.data.endDate = validation.value;
    flow.data.nights = calculateNights(flow.data.startDate, flow.data.endDate);
    flow.step = getTripCreateNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      `Ночівель розраховано автоматично: ${flow.data.nights}\n\nОбери статус готовності спорядження.`,
      FLOW_GEAR_STATUS_KEYBOARD
    );
  }

  if (flow.step === "gearStatus") {
    const normalized = normalizeGearStatus(message);
    const validation = validateGearStatus(normalized);
    if (!validation.ok) {
      return ctx.reply(validation.error, FLOW_GEAR_STATUS_KEYBOARD);
    }

    flow.data.gearReadinessStatus = validation.value;
    flow.step = getTripCreateNextStep(flow.step);
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
    return sendHome(ctx, userService);
  }

  const validation = validateInviteCode(message);
  if (!validation.ok) {
    return ctx.reply(validation.error, {
      parse_mode: "Markdown",
      ...FLOW_CANCEL_KEYBOARD
    });
  }

  const result = groupService.joinGroup(validation.value, {
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

async function handleGrantAccessFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return showTripMembersMenu(ctx, groupService, userService);
  }

  const indexValidation = validatePositiveInteger(message);
  const candidate = indexValidation.ok ? flow.data.candidates[indexValidation.value - 1] : null;

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
    return ctx.reply(
      result.message,
      getTripSettingsKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id))
    );
  }

  return ctx.reply(
    `✅ ${candidate.name} тепер має права редагування походу.`,
    getTripSettingsKeyboard(result.group, String(ctx.from.id))
  );
}

async function handleGearAddFlow(ctx, flow, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Додавання спорядження скасовано.", getCurrentTripGearKeyboard(ctx, groupService));
  }

  if (flow.step === "name") {
    flow.data.name = canonicalizeGearName(message);
    flow.data.attributes = {};
    flow.data.fieldIndex = 0;
    flow.step = getGearAddNextStep(flow.step);
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
    const validation = validatePositiveInteger(message);
    if (!validation.ok) {
      return ctx.reply(`${validation.error}\nПриклад: \`1\``, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.quantity = validation.value;
    flow.step = getGearAddNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    const { field } = getGearFlowField(flow);
    if (!field) {
      flow.step = getGearAddNextStep(flow.step);
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
        flow.step = getGearAddNextStep(flow.step);
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

        flow.step = getGearAddNextStep(flow.step);
      }
    }

    const quantity = flow.data.quantity;
    const scope = flow.data.mode;
    const attributes = { ...(flow.data.attributes || {}) };

    const addedGear = groupService.addGear({
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

    const matchedNeeds = (scope === "shared" || scope === "spare" || addedGear.shareable)
      ? groupService.findNeedsMatchedByGear(flow.tripId, addedGear.name, { excludeMemberId: String(ctx.from.id) })
      : [];
    const trip = groupService.findGroupByMember(String(ctx.from.id));
    const actorName = userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx));

    clearFlow(String(ctx.from.id));

    if (trip && matchedNeeds.length) {
      void notifyNeedOwnersAboutCoverage(telegram, trip, addedGear, matchedNeeds, actorName);
    }

    const labels = {
      shared: "спільне спорядження",
      personal: "особисте спорядження",
      spare: "запасне спорядження"
    };

    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ СПОРЯДЖЕННЯ ДОДАНО", flow.data.name),
        "",
        ...buildGearAttributesSummaryLines(flow.data.name, quantity, attributes, [`Тип: ${labels[scope]}`]),
        ...(matchedNeeds.length
          ? [
              "",
              "🤝 Ця річ може допомогти закрити такі запити:",
              ...buildMatchedNeedsSummaryLines(matchedNeeds, userService, { availableQuantity: Number(addedGear.availableQuantity ?? addedGear.quantity) || 0 })
            ]
          : [])
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearKeyboard(ctx, groupService) }
    );
  }

  return null;
}

async function handleTripPhotoAddFlow(ctx, flow, groupService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return showTripPhotosMenu(ctx, groupService);
  }

  return ctx.reply(
    "Надішли фото повідомленням. Якщо хочеш, додай підпис прямо до фото.",
    FLOW_CANCEL_KEYBOARD
  );
}

function buildTripPhotoShareCaption(trip, authorName, caption = "") {
  return joinRichLines([
    ...formatCardHeader("📸", "ФОТО З ПОХОДУ"),
    "",
    `Похід: <b>${escapeHtml(trip.name)}</b>`,
    `Надіслав: <b>${escapeHtml(authorName)}</b>`,
    caption ? `Підпис: <b>${escapeHtml(caption)}</b>` : null
  ]);
}

async function shareTripPhotoWithMembers(telegram, trip, senderId, fileId, caption, authorName) {
  const seen = new Set();
  const recipients = (trip.members || []).filter((member) => {
    const memberId = String(member.id || "");
    if (
      !memberId ||
      memberId === String(senderId) ||
      seen.has(memberId) ||
      !canTripMemberAccessPhotos(trip, memberId)
    ) {
      return false;
    }
    seen.add(memberId);
    return true;
  });
  let delivered = 0;

  for (const member of recipients) {
    try {
      await telegram.sendPhoto(member.id, fileId, {
        caption: buildTripPhotoShareCaption(trip, authorName, caption),
        parse_mode: "HTML"
      });
      delivered += 1;
    } catch {
      // skip failed delivery to one recipient and continue
    }
  }

  return { delivered, recipients: recipients.length };
}

async function handleTripPhotoMessage(ctx, flow, groupService, userService, telegram) {
  const trip = groupService.getGroup(flow.tripId);
  const senderId = String(ctx.from.id);

  if (!trip || trip.status !== "active") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Активний похід для цього сценарію вже недоступний.", getTripKeyboard(groupService.findGroupByMember(senderId), senderId));
  }

  if (!trip.members.some((member) => String(member.id) === senderId)) {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Ти більше не є учасником цього походу, тому розсилку фото зупинено.", getTripKeyboard(groupService.findGroupByMember(senderId), senderId));
  }

  if (!canTripMemberAccessPhotos(trip, senderId)) {
    clearFlow(String(ctx.from.id));
    return ctx.reply(
      "У тебе статус `👎 Не йду`, тому фото цього походу для тебе недоступні.",
      getTripKeyboard(trip, senderId)
    );
  }

  const photo = Array.isArray(ctx.message?.photo) ? ctx.message.photo.at(-1) : null;
  if (!photo?.file_id) {
    return ctx.reply("Надішли саме фото повідомленням.", FLOW_CANCEL_KEYBOARD);
  }

  const caption = String(ctx.message?.caption || "").trim();
  const authorName = userService.getDisplayName(senderId, getUserLabel(ctx));
  const delivery = await shareTripPhotoWithMembers(
    telegram,
    trip,
    senderId,
    photo.file_id,
    caption,
    authorName
  );
  const savedPhoto = groupService.addTripPhoto({
    groupId: trip.id,
    photo: {
      authorMemberId: senderId,
      authorMemberName: authorName,
      fileId: photo.file_id,
      caption
    }
  });
  const album = groupService.getTripPhotoAlbum(trip.id, { limit: 10 });

  if (delivery.recipients === 0) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("📸 ФОТО НЕ РОЗІСЛАНО", trip.name),
        "",
        "У цьому поході поки немає інших учасників, яким можна надіслати фото.",
        `Фотоальбом оновлено: ${album?.totalCount || 1} фото.`,
        `Подія: ${savedPhoto.momentLabel}`
      ]),
      { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
    );
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("📸 ФОТО НАДІСЛАНО", trip.name),
      "",
      `Надіслав: ${authorName}`,
      `Подія: ${savedPhoto.momentLabel}`,
      `Отримали учасників: ${delivery.delivered} із ${delivery.recipients}`,
      `Фотоальбом: ${album?.totalCount || 1} фото`,
      caption ? `Підпис: ${caption}` : null,
      "",
      "Можеш надіслати ще фото або натиснути `❌ Скасувати`, щоб повернутися назад."
    ]),
    { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
  );
}

async function handleGearEditFlow(ctx, flow, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim();

  if (flow.step === "delete_confirm" && message === "❌ Скасувати") {
    flow.step = getGearEditPreviousStep(flow.step);
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

  if (flow.step === "quantity" && message === "❌ Скасувати") {
    flow.step = getGearEditPreviousStep(flow.step);
    delete flow.data.quantity;
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", flow.data.item.name),
        "",
        `Тип: ${getTripGearScopeLabel(flow.data.item)}`,
        `Поточна кількість: ${flow.data.item.quantity}`,
        flow.data.item.memberName ? `Додав: ${flow.data.item.memberName}` : null,
        (Number(flow.data.item?.inUseQuantity) || 0) > 0
          ? `Зараз у користуванні: ${flow.data.item.inUseQuantity} шт. Поки річ не повернуть, не можна змінити її тип або видалити.`
          : null,
        "",
        "Що хочеш зробити з цією позицією?"
      ].filter(Boolean)),
      { parse_mode: "HTML", ...getTripGearEditActionKeyboard() }
    );
  }

  if (flow.step === "scope" && message === "❌ Скасувати") {
    flow.step = getGearEditPreviousStep(flow.step);
    delete flow.data.scope;
    delete flow.data.shareable;
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

  if (flow.step === "field" && message === "❌ Скасувати") {
    const fieldIndex = Math.max(0, Number(flow.data.fieldIndex) || 0);

    if (fieldIndex > 0) {
      flow.data.fieldIndex = fieldIndex - 1;
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
      return ctx.reply(
        buildGearFieldPromptMessage("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", flow.data.item.name, field, flow.data.attributes),
        { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
      );
    }

    if ((Number(flow.data.item?.inUseQuantity) || 0) > 0) {
      flow.step = "quantity";
      delete flow.data.fieldIndex;
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

    flow.step = getGearEditPreviousStep(flow.step);
    delete flow.data.fieldIndex;
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

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Редагування спорядження скасовано.", getCurrentTripGearKeyboard(ctx, groupService));
  }

  if (flow.step === "pick") {
    const items = flow.data.items || [];
    const page = Math.max(0, Number(flow.data.page) || 0);
    const maxPage = Math.max(0, Math.ceil(items.length / 8) - 1);

    if (message === PAGINATION_PREV_LABEL || message === PAGINATION_NEXT_LABEL) {
      flow.data.page = message === PAGINATION_PREV_LABEL
        ? Math.max(0, page - 1)
        : Math.min(maxPage, page + 1);
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        "Обери спорядження кнопкою нижче.",
        getTripGearEditItemsKeyboard(items, flow.data.page)
      );
    }

    const numericIndex = Number.parseInt(message, 10);
    const item = items.find((entry) => entry.actionLabel === message)
      || (Number.isInteger(numericIndex) ? items[numericIndex - 1] : null);

    if (!item) {
      return ctx.reply("Обери спорядження кнопкою нижче.", getTripGearEditItemsKeyboard(items, page));
    }

    flow.step = getGearEditNextStep(flow.step);
    flow.data.item = item;
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", item.name),
        "",
        `Тип: ${getTripGearScopeLabel(item)}`,
        `Поточна кількість: ${item.quantity}`,
        item.memberName ? `Додав: ${item.memberName}` : null,
        (Number(item.inUseQuantity) || 0) > 0
          ? `Зараз у користуванні: ${item.inUseQuantity} шт. Поки річ не повернуть, не можна змінити її тип або видалити.`
          : null,
        "",
        "Що хочеш зробити з цією позицією?"
      ].filter(Boolean)),
      { parse_mode: "HTML", ...getTripGearEditActionKeyboard() }
    );
  }

  if (flow.step === "action") {
    if (message === GEAR_EDIT_BACK_LABEL) {
      flow.step = getGearEditPreviousStep(flow.step);
      delete flow.data.item;
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", "Вибір позиції"),
          "",
          "Обери своє спорядження, яке хочеш змінити."
        ]),
        { parse_mode: "HTML", ...getTripGearEditItemsKeyboard(flow.data.items || [], flow.data.page || 0) }
      );
    }

    if (message === GEAR_EDIT_DELETE_LABEL) {
      if ((Number(flow.data.item?.inUseQuantity) || 0) > 0) {
        return ctx.reply(
          "Цю річ зараз не можна видалити, бо вона вже в користуванні іншого учасника. Спочатку її мають повернути.",
          { parse_mode: "HTML", ...getTripGearEditActionKeyboard() }
        );
      }
      flow.step = getGearEditNextStep(flow.step, "DELETE");
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

    flow.step = getGearEditNextStep(flow.step);
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
      return ctx.reply("Натисни `✅ Так, видалити` або `❌ Скасувати`.", {
        parse_mode: "Markdown",
        ...getGearDeleteConfirmKeyboard()
      });
    }

    const removed = groupService.deleteGear({
      groupId: flow.tripId,
      gearId: flow.data.item.id
    });
    if (!removed?.ok) {
      return ctx.reply(
        removed?.message || "Цю позицію зараз не можна видалити.",
        { parse_mode: "HTML", ...getTripGearEditActionKeyboard() }
      );
    }
    clearFlow(String(ctx.from.id));
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("🗑 СПОРЯДЖЕННЯ ВИДАЛЕНО", removed?.item?.name || flow.data.item.name),
        "",
        "Позицію прибрано зі спорядження походу."
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearKeyboard(ctx, groupService) }
    );
    return showTripGear(ctx, groupService);
  }

  if (flow.step === "quantity") {
    const quantityValidation = validatePositiveInteger(message);
    if (!quantityValidation.ok) {
      return ctx.reply(`${quantityValidation.error}\nПриклад: \`1\`.`, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }
    const quantity = quantityValidation.value;
    const minQuantity = Math.max(0, Number(flow.data.item?.inUseQuantity) || 0);
    if (quantity < minQuantity) {
      return ctx.reply(
        `Зараз у користуванні вже ${minQuantity} шт. Не можна зменшити кількість нижче цього значення, поки річ не повернуть.`,
        { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
      );
    }

    flow.data.quantity = quantity;
    const itemInUseQuantity = Math.max(0, Number(flow.data.item?.inUseQuantity) || 0);
    if (itemInUseQuantity > 0) {
      flow.data.scope = flow.data.item.scope;
      flow.data.shareable = flow.data.item.shareable;
      flow.data.attributes = { ...(flow.data.item.attributes || {}) };
      flow.data.fieldIndex = 0;
      flow.step = getGearEditNextStep(flow.step, "NEXT");
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
        flow.step = getGearEditNextStep(flow.step);
        setFlow(String(ctx.from.id), flow);
      } else {
        return ctx.reply(
          joinRichLines([
            "⚠️ Тип спорядження зараз змінювати не можна, бо річ уже в користуванні.",
            "",
            buildGearFieldPromptMessage("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", flow.data.item.name, field, flow.data.attributes)
          ]),
          { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
        );
      }
    }

    flow.step = getGearEditNextStep(flow.step);
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
    flow.step = getGearEditNextStep(flow.step);
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
      flow.step = getGearEditNextStep(flow.step);
    } else {
      return ctx.reply(
        buildGearFieldPromptMessage("✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ", flow.data.item.name, field, flow.data.attributes),
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
        flow.step = getGearEditNextStep(flow.step);
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
              "✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ",
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
    const updatedGear = groupService.updateGear({
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
    if (!updatedGear?.ok) {
      return ctx.reply(
        updatedGear?.message || "Не вдалося оновити спорядження.",
        { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
      );
    }
    const savedGear = updatedGear.item;
    const matchedNeeds = (savedGear?.scope === "shared" || savedGear?.scope === "spare" || savedGear?.shareable)
      ? groupService.findNeedsMatchedByGear(flow.tripId, savedGear.name, { excludeMemberId: String(ctx.from.id) })
      : [];
    const trip = groupService.findGroupByMember(String(ctx.from.id));
    const actorName = userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx));
    clearFlow(String(ctx.from.id));

    if (trip && matchedNeeds.length && savedGear) {
      void notifyNeedOwnersAboutCoverage(telegram, trip, savedGear, matchedNeeds, actorName);
    }
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ СПОРЯДЖЕННЯ ОНОВЛЕНО", flow.data.item.name),
        "",
        ...buildGearAttributesSummaryLines(
          flow.data.item.name,
          flow.data.quantity,
          attributes,
          [`Тип: ${getTripGearScopeLabel({ ...flow.data.item, scope: flow.data.scope, shareable: flow.data.shareable })}`]
        ),
        ...(matchedNeeds.length
          ? [
              "",
              "🤝 Після оновлення ця річ може допомогти закрити такі запити:",
              ...buildMatchedNeedsSummaryLines(matchedNeeds, userService, { availableQuantity: Number(updatedGear.availableQuantity ?? updatedGear.quantity) || 0 })
            ]
          : [])
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearKeyboard(ctx, groupService) }
    );
    return showTripGear(ctx, groupService);
  }

  return null;
}

async function handleGearDeleteFlow(ctx, flow, groupService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати" || message === "⬅️ Не видаляти") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Видалення спорядження скасовано.", getCurrentTripGearKeyboard(ctx, groupService));
  }

  if (flow.step === "pick") {
    const indexValidation = validatePositiveInteger(message);
    const item = indexValidation.ok ? flow.data.items[indexValidation.value - 1] : null;

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
      return ctx.reply("Натисни `✅ Так, видалити` або `❌ Скасувати`.", {
        parse_mode: "Markdown",
        ...getGearDeleteConfirmKeyboard()
      });
    }

    const removed = groupService.deleteGear({
      groupId: flow.tripId,
      gearId: flow.data.item.id
    });
    if (!removed?.ok) {
      return ctx.reply(
        removed?.message || "Цю позицію зараз не можна видалити.",
        { parse_mode: "HTML", ...getGearDeleteConfirmKeyboard() }
      );
    }
    clearFlow(String(ctx.from.id));
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("🗑 СПОРЯДЖЕННЯ ВИДАЛЕНО", removed?.item?.name || flow.data.item.name),
        "",
        "Позицію прибрано зі спорядження походу."
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearKeyboard(ctx, groupService) }
    );
    return showTripGear(ctx, groupService);
  }

  return null;
}

async function handleGearNeedFlow(ctx, flow, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    const previousStep = getGearNeedPreviousStep(flow.step);
    if (previousStep === flow.step) {
      clearFlow(String(ctx.from.id));
      return showTripGearAccountingMenu(ctx, groupService);
    }
    flow.step = previousStep;
    setFlow(String(ctx.from.id), flow);
    return replyGearNeedStepPrompt(ctx, flow);
  }

  if (flow.step === "name") {
    const validation = validateGearItemName(message);
    if (!validation.ok) {
      return ctx.reply(`${validation.error}\nПриклад: \`спальник\``, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.name = canonicalizeGearName(validation.value);
    flow.step = getGearNeedNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyGearNeedStepPrompt(ctx, flow);
  }

  if (flow.step === "quantity") {
    const validation = validatePositiveInteger(message);
    if (!validation.ok) {
      return ctx.reply(`${validation.error}\nПриклад: \`1\``, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.quantity = validation.value;
    flow.step = getGearNeedNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyGearNeedStepPrompt(ctx, flow);
  }

  if (flow.step === "note") {
    const requesterName = userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx));
    const noteValidation = message === "-" ? { ok: true, value: "" } : validateLongProfileText(message);
    if (!noteValidation.ok) {
      return ctx.reply(`${noteValidation.error}\n\nДодай короткий коментар або введи \`-\`.`, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }
    const note = noteValidation.value;
    const need = groupService.addGearNeed({
      groupId: flow.tripId,
      memberId: String(ctx.from.id),
      memberName: requesterName,
      need: { name: flow.data.name, quantity: flow.data.quantity, note }
    });
    const trip = groupService.findGroupByMember(String(ctx.from.id));
    const coverage = trip
      ? groupService.findGearCoverage(trip.id, need.name, {
          excludeMemberId: String(ctx.from.id),
          requestedQuantity: need.quantity
        })
      : { matches: [] };

    clearFlow(String(ctx.from.id));

    if (trip) {
      void notifyTripMembers(
        telegram,
        trip,
        buildGearNeedCreatedNotification(trip, requesterName, need),
        { excludeMemberId: String(ctx.from.id) }
      );
    }

    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("📌 ЗАПИТ ДОДАНО", need.name),
        "",
        ...formatGearNeedSummaryLines(need),
        "",
        formatGearCoverageNotice(coverage.matches),
        formatGearCoverageFollowup(coverage.matches)
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
    );
  }

  return null;
}

async function handleGearNeedManageFlow(ctx, flow, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim();
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    clearFlow(String(ctx.from.id));
    return null;
  }

  const currentNeeds = groupService.getMemberGearNeeds(flow.tripId, String(ctx.from.id));
  if (!currentNeeds.length) {
    clearFlow(String(ctx.from.id));
    return showTripGearAccountingMenu(ctx, groupService);
  }

  if (Array.isArray(flow.data?.items)) {
    flow.data.items = currentNeeds.map((item, index) => ({
      ...item,
      actionLabel: `${index + 1}. ${item.name}`
    }));
  }

  if (flow.data?.need?.id) {
    const freshNeed = groupService.getGearNeed(flow.tripId, flow.data.need.id);
    if (freshNeed) {
      flow.data.need = freshNeed;
      setFlow(String(ctx.from.id), flow);
    }
  }

  if (message === TRIP_GEAR_ADD_BACK_LABEL) {
    clearFlow(String(ctx.from.id));
    return showTripGearMenu(ctx, groupService, telegram?.advisorService || null);
  }

  if (flow.step === "cancel_confirm" && message === "❌ Скасувати") {
    flow.step = getGearNeedManagePreviousStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    const matchState = getGearNeedMatchState(groupService, flow.tripId, flow.data.need, String(ctx.from.id));
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("📋 МОЇ ЗАПИТИ", flow.data.need.name),
        "",
        ...formatGearNeedSummaryLines(flow.data.need),
        "",
        ...buildGearNeedActionStatusLines(matchState),
        "",
        "Що хочеш зробити з цим запитом?"
      ]),
      { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(flow.data.need, matchState) }
    );
  }

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return showTripGearAccountingMenu(ctx, groupService);
  }

  if (flow.step === "pick") {
    const items = flow.data.items || [];
    if (message === GEAR_EDIT_BACK_LABEL) {
      clearFlow(String(ctx.from.id));
      return showTripGearAccountingMenu(ctx, groupService);
    }

    const need = items.find((item) => item.actionLabel === message);
    if (!need) {
      return ctx.reply("Обери запит кнопкою нижче.", getMyGearNeedItemsKeyboard(items));
    }

    flow.step = getGearNeedManageNextStep(flow.step);
    flow.data.need = need;
    setFlow(String(ctx.from.id), flow);
    const matchState = getGearNeedMatchState(groupService, flow.tripId, need, String(ctx.from.id));
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("📋 МОЇ ЗАПИТИ", need.name),
        "",
        ...formatGearNeedSummaryLines(need),
        "",
        ...buildGearNeedActionStatusLines(matchState),
        "",
        "Що хочеш зробити з цим запитом?"
      ]),
      { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(need, matchState) }
    );
  }

  if (flow.step === "action") {
    if (message === GEAR_EDIT_BACK_LABEL) {
      flow.step = getGearNeedManagePreviousStep(flow.step);
      delete flow.data.need;
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("📋 МОЇ ЗАПИТИ", "Вибір запиту"),
          "",
          "Обери запит, який хочеш переглянути або оновити."
        ]),
        { parse_mode: "HTML", ...getMyGearNeedItemsKeyboard(flow.data.items || []) }
      );
    }

    if (message === GEAR_NEED_HELP_LABEL) {
      const matchState = getGearNeedMatchState(groupService, flow.tripId, flow.data.need, String(ctx.from.id));
      if (!matchState.showHelp) {
        return ctx.reply(
          joinRichLines([
            ...formatCardHeader("🤝 ХТО МОЖЕ ДОПОМОГТИ", flow.data.need.name),
            "",
            "Поки що бот не знайшов відповідного спільного або запасного спорядження.",
            "",
            "Що потрібно зробити:",
            "• хтось із учасників має додати цю річ у спорядження походу",
            "• тип речі має бути <b>спільне</b> або <b>запасне / позичу</b>",
            "",
            "Після цього в цьому запиті з’явиться підказка, хто може допомогти."
          ]),
          { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(flow.data.need, matchState) }
        );
      }

      if (!matchState.fullMatches.length && flow.data.need.matchedByMemberName) {
        return ctx.reply(
          joinRichLines([
            ...formatCardHeader("🤝 ХТО МОЖЕ ДОПОМОГТИ", flow.data.need.name),
            "",
            `Може допомогти: <b>${escapeHtml(flow.data.need.matchedByMemberName)}</b>`,
            flow.data.need.memberName ? `Кому: <b>${escapeHtml(flow.data.need.memberName)}</b>` : null,
            flow.data.need.matchedGearName ? `Річ: <b>${escapeHtml(flow.data.need.matchedGearName)}</b>` : null
          ].filter(Boolean)),
          { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(flow.data.need, matchState) }
        );
      }

      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("🤝 ХТО МОЖЕ ДОПОМОГТИ", flow.data.need.name),
          "",
          "Ось хто зараз реально може закрити твій запит.",
          "",
          ...buildGearCoverageMatchLines(matchState.fullMatches)
        ]),
        { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(flow.data.need, matchState) }
      );
    }

    if (message === GEAR_NEED_REQUEST_LABEL) {
      const matchState = getGearNeedMatchState(groupService, flow.tripId, flow.data.need, String(ctx.from.id));
      if (!matchState.allowBorrowRequest) {
        return ctx.reply(
          "Надіслати запит на користування можна тільки тоді, коли є реальний повний збіг і зрозуміло, хто саме може поділитися річчю.",
          getMyGearNeedActionKeyboard(flow.data.need, matchState)
        );
      }

      if (flow.data.need?.status !== "matched" && matchState.fullMatches.length > 1) {
        const preparedMatches = matchState.fullMatches.map((item, index) => ({
          ...item,
          actionLabel: `${index + 1}. ${truncateButtonLabel(item.memberName || item.name, 18)}`
        }));
        flow.step = getGearNeedManageNextStep(flow.step, "MATCH");
        flow.data.matches = preparedMatches;
        flow.data.matchPurpose = "borrow_request";
        setFlow(String(ctx.from.id), flow);
        return ctx.reply(
          joinRichLines([
            ...formatCardHeader("🙋 ХТО МОЖЕ ПОДІЛИТИСЯ", flow.data.need.name),
            "",
            "Обери, кому хочеш надіслати запит на користування цією річчю.",
            "",
            ...buildGearCoverageMatchLines(preparedMatches)
          ]),
          { parse_mode: "HTML", ...getMyGearNeedMatchesKeyboard(preparedMatches) }
        );
      }

      let requestedNeed = flow.data.need;
      if (requestedNeed?.status !== "matched" && matchState.fullMatches.length === 1) {
        const picked = matchState.fullMatches[0];
        requestedNeed = groupService.requestGearLoan({
          groupId: flow.tripId,
          needId: flow.data.need.id,
          lenderMemberId: picked.memberId,
          lenderMemberName: picked.memberName,
          gearId: picked.id
        });
      } else {
        requestedNeed = groupService.requestGearLoan({
          groupId: flow.tripId,
          needId: flow.data.need.id,
          lenderMemberId: flow.data.need.matchedByMemberId,
          lenderMemberName: flow.data.need.matchedByMemberName,
          gearId: flow.data.need.matchedGearId
        });
      }

      if (!requestedNeed) {
        return ctx.reply(
          "Не вдалося надіслати запит власнику речі.",
          getMyGearNeedActionKeyboard(flow.data.need, matchState)
        );
      }

      const delivered = await sendGearLoanApprovalRequest(telegram, trip, requestedNeed);
      flow.data.need = requestedNeed;
      flow.step = "action";
      delete flow.data.matches;
      delete flow.data.matchPurpose;
      setFlow(String(ctx.from.id), flow);

      if (!delivered) {
        return ctx.reply(
          "Не вдалося доставити запит власнику речі. Спробуй ще раз трохи пізніше.",
          { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(requestedNeed, getGearNeedMatchState(groupService, flow.tripId, requestedNeed, String(ctx.from.id))) }
        );
      }

      return ctx.reply(
        buildGearLoanRequestSentNotification(trip, requestedNeed),
        { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(requestedNeed, getGearNeedMatchState(groupService, flow.tripId, requestedNeed, String(ctx.from.id))) }
      );
    }

    if (message === GEAR_NEED_CANCEL_LABEL) {
      flow.step = getGearNeedManageNextStep(flow.step, "CANCEL");
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("🗑 СКАСУВАТИ ЗАПИТ", flow.data.need.name),
          "",
          ...formatGearNeedSummaryLines(flow.data.need),
          "",
          "Підтвердь скасування цього запиту."
        ]),
        { parse_mode: "HTML", ...getGearNeedCancelConfirmKeyboard() }
      );
    }

    return ctx.reply(
      "Обери дію кнопкою нижче.",
      getMyGearNeedActionKeyboard(
        flow.data.need,
        getGearNeedMatchState(groupService, flow.tripId, flow.data.need, String(ctx.from.id))
      )
    );
  }

  if (flow.step === "match_pick") {
    if (message === GEAR_EDIT_BACK_LABEL) {
      flow.step = getGearNeedManagePreviousStep(flow.step);
      delete flow.data.matches;
      delete flow.data.matchPurpose;
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("📋 МОЇ ЗАПИТИ", flow.data.need.name),
          "",
          ...formatGearNeedSummaryLines(flow.data.need),
          "",
          ...buildGearNeedActionStatusLines(getGearNeedMatchState(groupService, flow.tripId, flow.data.need, String(ctx.from.id))),
          "",
          "Що хочеш зробити з цим запитом?"
        ]),
        { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(flow.data.need, getGearNeedMatchState(groupService, flow.tripId, flow.data.need, String(ctx.from.id))) }
      );
    }

    const matches = flow.data.matches || [];
    const picked = matches.find((item) => item.actionLabel === message);
    if (!picked) {
      return ctx.reply("Обери спорядження кнопкою нижче.", getMyGearNeedMatchesKeyboard(matches));
    }

    if (!picked.isEnough) {
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("⚠️ КІЛЬКОСТІ НЕДОСТАТНЬО", picked.name),
          "",
          `Потрібно: <b>${escapeHtml(String(picked.requestedQuantity))}</b>`,
          `Доступно зараз: <b>${escapeHtml(String(picked.availableQuantity))}</b>`,
          "",
          "Ця річ покриває запит лише частково. Обери іншу позицію або дочекайся, поки хтось додасть ще спорядження."
        ]),
        { parse_mode: "HTML", ...getMyGearNeedMatchesKeyboard(matches) }
      );
    }

    const requestedNeed = groupService.requestGearLoan({
      groupId: flow.tripId,
      needId: flow.data.need.id,
      lenderMemberId: picked.memberId,
      lenderMemberName: picked.memberName,
      gearId: picked.id
    });
    if (!requestedNeed) {
      flow.step = getGearNeedManagePreviousStep(flow.step);
      delete flow.data.matches;
      delete flow.data.matchPurpose;
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        "Не вдалося надіслати запит власнику речі.",
        { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(flow.data.need, getGearNeedMatchState(groupService, flow.tripId, flow.data.need, String(ctx.from.id))) }
      );
    }

    const delivered = await sendGearLoanApprovalRequest(telegram, trip, requestedNeed);
    flow.data.need = requestedNeed;
    delete flow.data.matches;
    delete flow.data.matchPurpose;
    flow.step = getGearNeedManagePreviousStep(flow.step);
    setFlow(String(ctx.from.id), flow);

    if (!delivered) {
      return ctx.reply(
        "Не вдалося доставити запит власнику речі. Спробуй ще раз трохи пізніше.",
        { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(requestedNeed, getGearNeedMatchState(groupService, flow.tripId, requestedNeed, String(ctx.from.id))) }
      );
    }

    return ctx.reply(
      buildGearLoanRequestSentNotification(trip, requestedNeed),
      { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(requestedNeed, getGearNeedMatchState(groupService, flow.tripId, requestedNeed, String(ctx.from.id))) }
    );
  }

  if (flow.step === "cancel_confirm") {
    if (message !== GEAR_NEED_CONFIRM_CANCEL_LABEL) {
      return ctx.reply("Натисни кнопку підтвердження або повернись назад.", getGearNeedCancelConfirmKeyboard());
    }

    const cancelledNeed = groupService.cancelGearNeed({
      groupId: flow.tripId,
      needId: flow.data.need.id
    });
    clearFlow(String(ctx.from.id));
    void notifyTripMembers(
      telegram,
      trip,
      buildGearNeedCancelledNotification(trip, userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)), cancelledNeed),
      { excludeMemberId: String(ctx.from.id) }
    );
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("🗑 ЗАПИТ СКАСОВАНО", cancelledNeed.name),
        "",
        "Запит більше не активний."
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearKeyboard(ctx, groupService) }
    );
    return startMyNeedsWizard(ctx, groupService);
  }

  return null;
}

async function handleGearLoanApprovalFlow(ctx, flow, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim();
  const trip = groupService.getGroup(flow.tripId);
  const need = groupService.getGearNeed(flow.tripId, flow.data?.needId);

  if (!trip || !need || need.loanRequestStatus !== "pending") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Цей запит уже оновлено або він більше неактуальний.", getTripKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id)));
  }

  if (message !== GEAR_LOAN_APPROVE_LABEL && message !== GEAR_LOAN_DECLINE_LABEL) {
    return ctx.reply("Обери одну з кнопок нижче.", getGearLoanApprovalKeyboard());
  }

  if (message === GEAR_LOAN_APPROVE_LABEL) {
    const approved = groupService.approveGearLoanRequest({
      groupId: flow.tripId,
      needId: flow.data.needId,
      approverMemberId: String(ctx.from.id)
    });
    clearFlow(String(ctx.from.id));

    if (!approved?.ok) {
      return ctx.reply(approved?.message || "Не вдалося підтвердити передачу речі.", getTripKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id)));
    }

    if (telegram && approved.need?.memberId) {
      try {
        await telegram.sendMessage(
          approved.need.memberId,
          joinRichLines([
            ...formatCardHeader("✅", "ВЛАСНИК ПІДТВЕРДИВ ПЕРЕДАЧУ"),
            "",
            `Річ: <b>${escapeHtml(approved.need.matchedGearName || approved.need.name)}</b>`,
            approved.need.matchedByMemberName ? `Від кого: <b>${escapeHtml(approved.need.matchedByMemberName)}</b>` : null,
            approved.gear ? `Тепер доступно: <b>${escapeHtml(String(approved.gear.availableQuantity))}/${escapeHtml(String(approved.gear.quantity))}</b>` : null
          ].filter(Boolean)),
          { parse_mode: "HTML", ...getTripKeyboard(trip, approved.need.memberId) }
        );
      } catch {
        // ignore
      }
    }

    void notifyTripMembers(
      telegram,
      trip,
      buildGearNeedFulfilledNotification(trip, userService.getDisplayName(String(approved.need.memberId), approved.need.memberName || "учасник"), approved.need),
      { excludeMemberId: String(approved.need.memberId) }
    );

    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅", "ПЕРЕДАЧУ ПІДТВЕРДЖЕНО"),
        "",
        `Річ: <b>${escapeHtml(approved.need.matchedGearName || approved.need.name)}</b>`,
        approved.need.memberName ? `Кому: <b>${escapeHtml(approved.need.memberName)}</b>` : null,
        approved.gear ? `У тебе лишилось у наявності: <b>${escapeHtml(String(approved.gear.availableQuantity))}/${escapeHtml(String(approved.gear.quantity))}</b>` : null
      ].filter(Boolean)),
      { parse_mode: "HTML", ...getTripKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id)) }
    );
  }

  const declined = groupService.declineGearLoanRequest({
    groupId: flow.tripId,
    needId: flow.data.needId,
    approverMemberId: String(ctx.from.id)
  });
  clearFlow(String(ctx.from.id));

  if (!declined?.ok) {
    return ctx.reply(declined?.message || "Не вдалося відхилити запит.", getTripKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id)));
  }

  if (telegram && need.memberId) {
    try {
      await telegram.sendMessage(
        need.memberId,
        buildGearLoanDeclinedNotification(trip, need),
        { parse_mode: "HTML", ...getTripKeyboard(trip, need.memberId) }
      );
    } catch {
      // ignore
    }
  }

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("❌", "ЗАПИТ ВІДХИЛЕНО"),
      "",
      `Річ: <b>${escapeHtml(need.matchedGearName || need.name)}</b>`,
      need.memberName ? `Кому: <b>${escapeHtml(need.memberName)}</b>` : null
    ].filter(Boolean)),
    { parse_mode: "HTML", ...getTripKeyboard(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id)) }
  );
}

async function handleBorrowedGearManageFlow(ctx, flow, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim();
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    clearFlow(String(ctx.from.id));
    return null;
  }

  const items = groupService.getBorrowedGearForMember(trip.id, String(ctx.from.id)).map((item, index) => ({
    ...item,
    actionLabel: `${index + 1}. ${truncateButtonLabel(item.gearName, 20)}`
  }));

  if (!items.length) {
    clearFlow(String(ctx.from.id));
    return showBorrowedGear(ctx, groupService);
  }

  if (flow.step === "pick") {
    if (message === GEAR_EDIT_BACK_LABEL) {
      clearFlow(String(ctx.from.id));
      return showTripGearAccountingMenu(ctx, groupService);
    }

    const item = items.find((entry) => entry.actionLabel === message);
    if (!item) {
      return ctx.reply("Обери річ кнопкою нижче.", getBorrowedGearItemsKeyboard(items));
    }

    flow.step = getBorrowedGearNextStep(flow.step);
    flow.data = { item };
    setFlow(String(ctx.from.id), flow);

    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🫴 В КОРИСТУВАННІ", item.gearName),
        "",
        `Кількість: ${item.quantity} шт.`,
        `Власник: ${item.ownerMemberName}`,
        `Доступно у власника: ${item.availableQuantity}/${item.totalQuantity}`,
        item.pendingReturnQuantity > 0 ? `Повернення: очікує підтвердження власника (${item.pendingReturnQuantity} шт.)` : null
      ].filter(Boolean)),
      {
        parse_mode: "HTML",
        ...getBorrowedGearActionKeyboard({
          allowReturn: item.pendingReturnQuantity <= 0,
          allowReminder: item.pendingReturnQuantity > 0
        })
      }
    );
  }

  if (flow.step === "action") {
    if (message === "❌ Скасувати") {
      flow.step = getBorrowedGearPreviousStep(flow.step);
      delete flow.data.item;
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("🫴 В КОРИСТУВАННІ", trip.name),
          "",
          "Обери річ, яку хочеш переглянути або повернути власнику."
        ]),
        { parse_mode: "HTML", ...getBorrowedGearItemsKeyboard(items) }
      );
    }

    if (message !== GEAR_RETURN_REQUEST_LABEL && message !== GEAR_RETURN_REMIND_LABEL) {
      return ctx.reply(
        "Обери дію кнопкою нижче.",
        getBorrowedGearActionKeyboard({
          allowReturn: flow.data.item?.pendingReturnQuantity <= 0,
          allowReminder: flow.data.item?.pendingReturnQuantity > 0
        })
      );
    }

    if (message === GEAR_RETURN_REMIND_LABEL) {
      if (!telegram || !flow.data.item?.ownerMemberId) {
        return ctx.reply(
          "Не вдалося надіслати нагадування власнику.",
          getBorrowedGearActionKeyboard({
            allowReturn: flow.data.item?.pendingReturnQuantity <= 0,
            allowReminder: flow.data.item?.pendingReturnQuantity > 0
          })
        );
      }

      try {
        await sendGearReturnConfirmationRequest(
          telegram,
          groupService,
          trip,
          flow.data.item.ownerMemberId,
          userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
          flow.data.item,
          { reminder: true }
        );
      } catch {
        return ctx.reply(
          "Не вдалося надіслати нагадування власнику.",
          getBorrowedGearActionKeyboard({
            allowReturn: flow.data.item?.pendingReturnQuantity <= 0,
            allowReminder: flow.data.item?.pendingReturnQuantity > 0
          })
        );
      }

      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("🔔", "НАГАДУВАННЯ НАДІСЛАНО"),
          "",
          `Річ: <b>${escapeHtml(flow.data.item.gearName)}</b>`,
          `Власник: <b>${escapeHtml(flow.data.item.ownerMemberName)}</b>`,
          "",
          "Ми ще раз нагадали підтвердити повернення."
        ]),
        {
          parse_mode: "HTML",
          ...getBorrowedGearActionKeyboard({
            allowReturn: false,
            allowReminder: true
          })
        }
      );
    }

    const requested = groupService.requestGearReturn({
      groupId: trip.id,
      gearId: flow.data.item.gearId,
      borrowerMemberId: String(ctx.from.id)
    });

    if (!requested?.ok) {
      return ctx.reply(
        requested?.message || "Не вдалося надіслати запит на повернення.",
        getBorrowedGearActionKeyboard({ allowReturn: false, allowReminder: flow.data.item?.pendingReturnQuantity > 0 })
      );
    }

    clearFlow(String(ctx.from.id));

    if (telegram && requested.ownerMemberId) {
      try {
        await sendGearReturnConfirmationRequest(
          telegram,
          groupService,
          trip,
          requested.ownerMemberId,
          userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
          { gearId: flow.data.item.gearId, gearName: flow.data.item.gearName, quantity: requested.quantity }
        );
      } catch {
        // ignore
      }
    }

    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("↩️", "ЗАПИТ НА ПОВЕРНЕННЯ НАДІСЛАНО"),
        "",
        `Річ: <b>${escapeHtml(flow.data.item.gearName)}</b>`,
        `Кількість: <b>${escapeHtml(String(requested.quantity))}</b>`,
        `Власник: <b>${escapeHtml(requested.ownerMemberName)}</b>`,
        "",
        "Тепер очікуємо підтвердження від власника."
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
    );
  }

  return null;
}

async function handleLoanedGearManageFlow(ctx, flow, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim();
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    clearFlow(String(ctx.from.id));
    return null;
  }

  const items = groupService.getLoanedOutGearForMember(trip.id, String(ctx.from.id)).map((item, index) => ({
    ...item,
    actionLabel: `${index + 1}. ${truncateButtonLabel(item.gearName, 20)}`
  }));

  if (flow.step === "action" && flow.data?.item?.gearId) {
    const currentItem = items.find((entry) => entry.gearId === flow.data.item.gearId);
    if (currentItem) {
      flow.data.item = currentItem;
      setFlow(String(ctx.from.id), flow);
    }
  }

  if (!items.length) {
    clearFlow(String(ctx.from.id));
    return showLoanedOutGear(ctx, groupService);
  }

  if (flow.step === "pick") {
    if (message === GEAR_EDIT_BACK_LABEL) {
      clearFlow(String(ctx.from.id));
      return showTripGearAccountingMenu(ctx, groupService);
    }

    const item = items.find((entry) => entry.actionLabel === message);
    if (!item) {
      return ctx.reply("Обери річ кнопкою нижче.", getLoanedGearItemsKeyboard(items));
    }

    flow.step = getLoanedGearNextStep(flow.step);
    flow.data = { item };
    setFlow(String(ctx.from.id), flow);

    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("👥 КОРИСТУЮТЬСЯ", item.gearName),
        "",
        `Загальна кількість: ${item.quantity} шт.`,
        `Доступно зараз: ${item.availableQuantity}/${item.quantity}`,
        "",
        ...item.loans.map((loan) =>
          `◦ ${loan.borrowerMemberName || "учасник"} користується ${loan.quantity} шт.${loan.pendingReturnQuantity > 0 ? ` | повертає ${loan.pendingReturnQuantity} шт.` : ""}`
        )
      ]),
      { parse_mode: "HTML", ...getLoanedGearActionKeyboard({ allowConfirm: item.hasPendingReturns }) }
    );
  }

  if (flow.step === "action") {
    if (message === GEAR_EDIT_BACK_LABEL) {
      if (flow.data?.directConfirm) {
        clearFlow(String(ctx.from.id));
        return showLoanedOutGear(ctx, groupService);
      }

      flow.step = getLoanedGearPreviousStep(flow.step);
      delete flow.data.item;
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("👥 КОРИСТУЮТЬСЯ", trip.name),
          "",
          "Обери річ, щоб подивитися, хто нею користується, або підтвердити повернення."
        ]),
        { parse_mode: "HTML", ...getLoanedGearItemsKeyboard(items) }
      );
    }

    if (message !== GEAR_RETURN_CONFIRM_LABEL) {
      return ctx.reply("Обери дію кнопкою нижче.", getLoanedGearActionKeyboard({ allowConfirm: flow.data.item?.hasPendingReturns }));
    }

    if (!flow.data.item?.hasPendingReturns) {
      return ctx.reply("Для цієї речі зараз немає запитів на підтвердження повернення.", getLoanedGearActionKeyboard({ allowConfirm: false }));
    }

    const confirmed = groupService.confirmGearReturn({
      groupId: trip.id,
      gearId: flow.data.item.gearId,
      ownerMemberId: String(ctx.from.id)
    });

    if (!confirmed?.ok) {
      return ctx.reply(confirmed?.message || "Не вдалося підтвердити повернення.", getLoanedGearActionKeyboard({ allowConfirm: flow.data.item?.hasPendingReturns }));
    }

    clearFlow(String(ctx.from.id));

    if (telegram) {
      for (const borrower of confirmed.returnedBorrowers || []) {
        if (!borrower.borrowerMemberId) {
          continue;
        }
        try {
          await telegram.sendMessage(
            borrower.borrowerMemberId,
            buildGearReturnConfirmedNotification(
              trip,
              flow.data.item.gearName,
              userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
              borrower.quantity
            ),
            { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
          );
        } catch {
          // ignore
        }
      }
    }

    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅", "ПОВЕРНЕННЯ ПІДТВЕРДЖЕНО"),
        "",
        `Річ: <b>${escapeHtml(flow.data.item.gearName)}</b>`,
        ...(confirmed.returnedBorrowers || []).map((borrower) => `Повернув: <b>${escapeHtml(borrower.borrowerMemberName)}</b> | ${escapeHtml(String(borrower.quantity))} шт.`)
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
    );
  }

  return null;
}

async function handleFoodAddFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    const previousStep = getFoodAddPreviousStep(flow.step);
    if (previousStep === flow.step) {
      clearFlow(String(ctx.from.id));
      return ctx.reply("Додавання продуктів скасовано.", getTripFoodMenuKeyboard(groupService, flow.tripId));
    }
    flow.step = previousStep;
    setFlow(String(ctx.from.id), flow);
    return replyFoodAddStepPrompt(ctx, flow);
  }

  if (flow.step === "name") {
    const validation = validateGearItemName(message);
    if (!validation.ok) {
      return ctx.reply(`${validation.error}\nПриклад: \`гречка\``, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.name = canonicalizeFoodName(validation.value);
    flow.step = getFoodAddNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyFoodAddStepPrompt(ctx, flow);
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
    flow.step = getFoodAddNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyFoodAddStepPrompt(ctx, flow);
  }

  if (flow.step === "quantity") {
    flow.data.quantity = message;
    flow.step = getFoodAddNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyFoodAddStepPrompt(ctx, flow);
  }

  if (flow.step === "cost") {
    const costValidation = validatePositiveMoney(String(message).replace(",", "."));
    if (!costValidation.ok) {
      return ctx.reply(`${costValidation.error}\nПриклад: \`180\``, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }
    const cost = costValidation.value;

    groupService.addFood({
      groupId: flow.tripId,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      food: {
        name: canonicalizeFoodName(flow.data.name),
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
      { parse_mode: "HTML", ...getTripFoodMenuKeyboard(groupService, flow.tripId) }
    );
  }

  return null;
}

async function handleFoodDeleteFlow(ctx, flow, groupService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Видалення продукту скасовано.", getTripFoodMenuKeyboard(groupService, flow.tripId));
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
        getTripFoodMenuKeyboard(groupService, flow.tripId)
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
      { parse_mode: "HTML", ...getTripFoodMenuKeyboard(groupService, flow.tripId) }
    );

    return showTripFood(ctx, groupService, userService);
  }

  return null;
}

async function handleExpenseAddFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    const previousStep = getExpenseAddPreviousStep(flow.step);
    if (previousStep === flow.step) {
      clearFlow(String(ctx.from.id));
      return ctx.reply("Додавання витрати скасовано.", getTripExpensesMenuKeyboard(groupService, flow.tripId));
    }
    flow.step = previousStep;
    setFlow(String(ctx.from.id), flow);
    return replyExpenseAddStepPrompt(ctx, flow);
  }

  if (flow.step === "title") {
    const validation = validateGearItemName(message);
    if (!validation.ok) {
      return ctx.reply(`${validation.error}\nПриклад: \`квиток на автобус\``, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.title = canonicalizeExpenseTitle(validation.value);
    flow.step = getExpenseAddNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyExpenseAddStepPrompt(ctx, flow);
  }

  if (flow.step === "quantity") {
    const quantityValidation = validatePositiveMoney(String(message).replace(",", "."));
    if (!quantityValidation.ok) {
      return ctx.reply(`${quantityValidation.error}\nПриклад: \`2\``, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.quantity = quantityValidation.value;
    flow.step = getExpenseAddNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return replyExpenseAddStepPrompt(ctx, flow);
  }

  if (flow.step === "price") {
    const priceValidation = validatePositiveMoney(String(message).replace(",", "."));
    if (!priceValidation.ok) {
      return ctx.reply(`${priceValidation.error}\nПриклад: \`450\``, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }
    const price = priceValidation.value;

    const amount = flow.data.quantity * price;

    groupService.addExpense({
      groupId: flow.tripId,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      expense: {
        title: canonicalizeExpenseTitle(flow.data.title),
        quantity: flow.data.quantity,
        price,
        amount,
      }
    });

    clearFlow(String(ctx.from.id));
    return ctx.reply(`✅ Витрату "${flow.data.title}" додано.`, getTripExpensesMenuKeyboard(groupService, flow.tripId));
  }

  return null;
}

async function handleExpenseDeleteFlow(ctx, flow, groupService, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return ctx.reply("Видалення витрати скасовано.", getTripExpensesMenuKeyboard(groupService, flow.tripId));
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
    const removed = groupService.deleteExpense({
      groupId: flow.tripId,
      expenseId: item.id
    });

    clearFlow(String(ctx.from.id));

    if (!removed) {
      return ctx.reply(
        "Не вдалося знайти цю витрату. Спробуй ще раз відкрити список витрат.",
        getTripExpensesMenuKeyboard(groupService, flow.tripId)
      );
    }

    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ ВИТРАТУ ВИДАЛЕНО", removed.title),
        "",
        `Кількість: ${removed.quantity}`,
        `Ціна за одиницю: ${formatMoney(removed.price)}`,
        `Сума: ${formatMoney(removed.amount)}`
      ]),
      { parse_mode: "HTML", ...getTripExpensesMenuKeyboard(groupService, flow.tripId) }
    );

    return showTripExpenses(ctx, groupService, userService);
  }

  return null;
}

async function handleFaqFlow(ctx, flow, advisorService, userService) {
  const message = ctx.message.text.trim();
  const data = buildFaqFlowData(flow.data || {});
  const isSearchMode = data.mode === "search_results" || data.mode === "search_prompt";
  const questions = isSearchMode ? data.searchQuestions || [] : data.browseQuestions || [];

  if (message === FAQ_SEARCH_LABEL) {
    const updatedFlow = {
      ...flow,
      data: buildFaqFlowData(data, {
        mode: "search_prompt"
      })
    };
    setFlow(String(ctx.from.id), updatedFlow);
    return ctx.reply(formatFaqSearchPrompt(), {
      parse_mode: "HTML",
      ...getFaqKeyboard({
        questions,
        mode: "search_prompt",
        canPrev: false,
        canNext: false
      })
    });
  }

  if (message === "⬅️ Головне меню") {
    clearFlow(String(ctx.from.id));
    return sendHome(ctx, userService);
  }

  if (message === FAQ_ALL_LABEL) {
    return showFaqMenu(ctx, advisorService, data, data.browsePage || 0);
  }

  if (message === FAQ_PREV_LABEL) {
    return isSearchMode
      ? showFaqSearchResults(ctx, advisorService, data, data.searchQuery || "", Math.max(0, (data.searchPage || 0) - 1))
      : showFaqMenu(ctx, advisorService, data, Math.max(0, (data.browsePage || 0) - 1));
  }

  if (message === FAQ_NEXT_LABEL) {
    return isSearchMode
      ? showFaqSearchResults(ctx, advisorService, data, data.searchQuery || "", (data.searchPage || 0) + 1)
      : showFaqMenu(ctx, advisorService, data, (data.browsePage || 0) + 1);
  }

  const selectedQuestion = questions.find((item) => item.question === message);
  if (selectedQuestion) {
    return ctx.reply(advisorService.getFaqAnswer(selectedQuestion.id), getFaqKeyboard({
      questions,
      mode: data.mode,
      canPrev: isSearchMode ? (data.searchPage || 0) > 0 : (data.browsePage || 0) > 0,
      canNext: isSearchMode
        ? (data.searchPage || 0) < (data.searchTotalPages || 1) - 1
        : (data.browsePage || 0) < (data.browseTotalPages || 1) - 1
    }));
  }

  return showFaqSearchResults(ctx, advisorService, data, message, 0);
}

async function handleHelpFlow(ctx, flow, userService) {
  const message = ctx.message.text.trim();

  if (message === "⬅️ Головне меню") {
    clearFlow(String(ctx.from.id));
    return sendHome(ctx, userService);
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
  const fieldConfig = PROFILE_EDIT_FIELDS.find((item) => item.key === flow.step);
  const currentIndex = PROFILE_EDIT_FIELDS.findIndex((item) => item.key === flow.step);

  if (message === PROFILE_BACK_LABEL || message === "❌ Скасувати") {
    const previousStep = getProfileEditPreviousStep(flow.step);
    if (previousStep === flow.step || currentIndex <= 0) {
      clearFlow(String(ctx.from.id));
      return showProfileAbout(ctx, userService);
    }

    flow.step = previousStep;
    setFlow(String(ctx.from.id), flow);
    return replyProfileEditStepPrompt(ctx, flow, "• `Пропустити` лишає поточне значення без змін");
  }

  if (!fieldConfig) {
    clearFlow(String(ctx.from.id));
    return showProfileMenu(ctx, userService);
  }

  if (message !== PROFILE_SKIP_LABEL) {
    const validation = validateProfileEditValue(fieldConfig.key, message);
    if (!validation.ok) {
      return ctx.reply(
        `${validation.error}\n\n${buildProfileEditPrompt(fieldConfig, "• можна пропустити будь-яке поле і повернутися до нього пізніше")}`,
        { parse_mode: "HTML", ...getProfileEditKeyboard() }
      );
    }
    flow.data[fieldConfig.key] = validation.value;
  }

  const nextStep = getProfileEditNextStep(flow.step);

  if (nextStep === flow.step || !PROFILE_EDIT_FIELDS[currentIndex + 1]) {
    const updatedProfile = userService.updateProfile({
      userId: String(ctx.from.id),
      userName: getUserLabel(ctx),
      patch: flow.data
    });
    const authState = userService.getAuthorizationState(String(ctx.from.id), getUserLabel(ctx));
    clearFlow(String(ctx.from.id));
    await ctx.reply(
      joinRichLines([
        ...formatCardHeader("✅ ПРОФІЛЬ ОНОВЛЕНО", getUserLabel(ctx)),
        "",
        authState.isAuthorized
          ? "Анкету збережено. Номер підтверджено, тож можна повноцінно користуватися ботом."
          : "Анкету збережено. Якщо хочеш повний доступ до бота, підтвердь свій номер."
      ]),
      {
        parse_mode: "HTML",
        ...(authState.isAuthorized ? getProfileKeyboard() : getProfileKeyboard())
      }
    );
    if (authState.isAuthorized) {
      return showProfileAbout(ctx, userService);
    }
    return showProfileAbout(ctx, userService);
  }

  flow.step = nextStep;
  setFlow(String(ctx.from.id), flow);
  return replyProfileEditStepPrompt(ctx, flow, "• можна пропустити поле, якщо заповниш його пізніше");
}

async function handleMyGearAddFlow(ctx, flow, userService) {
  const message = ctx.message.text.trim();

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return showMyGearMenu(ctx);
  }

  if (flow.step === "name") {
    flow.data.name = canonicalizeGearName(message);
    flow.data.attributes = {};
    flow.data.fieldIndex = 0;
    flow.step = getGearAddNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("➕ ДОДАТИ МОЄ СПОРЯДЖЕННЯ", flow.data.name),
        "",
        ...buildGearRecognitionSummaryLines(flow.data.name),
        "",
        "Вкажи кількість.",
        "",
        "Приклад: <b>1</b>"
      ]),
      { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
    );
  }

  if (flow.step === "quantity") {
    const validation = validatePositiveInteger(message);
    if (!validation.ok) {
      return ctx.reply(`${validation.error}\nПриклад: \`1\``, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }

    flow.data.quantity = validation.value;
    flow.step = getGearAddNextStep(flow.step);
    setFlow(String(ctx.from.id), flow);
    const { field } = getGearFlowField(flow);
    if (!field) {
      flow.step = getGearAddNextStep(flow.step);
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
        flow.step = getGearAddNextStep(flow.step);
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

        flow.step = getGearAddNextStep(flow.step);
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
    flow.step = getMyGearEditPreviousStep(flow.step);
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

  if (flow.step === "quantity" && message === "❌ Скасувати") {
    flow.step = getMyGearEditPreviousStep(flow.step);
    delete flow.data.quantity;
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

  if (flow.step === "field" && message === "❌ Скасувати") {
    const fieldIndex = Math.max(0, Number(flow.data.fieldIndex) || 0);

    if (fieldIndex > 0) {
      flow.data.fieldIndex = fieldIndex - 1;
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
      return ctx.reply(
        buildGearFieldPromptMessage("✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ", flow.data.item.name, field, flow.data.attributes),
        { parse_mode: "HTML", ...FLOW_CANCEL_KEYBOARD }
      );
    }

    flow.step = getMyGearEditPreviousStep(flow.step);
    delete flow.data.fieldIndex;
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

  if (message === "❌ Скасувати") {
    clearFlow(String(ctx.from.id));
    return showMyGearMenu(ctx);
  }

  if (flow.step === "pick") {
    const items = flow.data.items || [];
    const page = Math.max(0, Number(flow.data.page) || 0);
    const maxPage = Math.max(0, Math.ceil(items.length / 8) - 1);

    if (message === PAGINATION_PREV_LABEL || message === PAGINATION_NEXT_LABEL) {
      flow.data.page = message === PAGINATION_PREV_LABEL
        ? Math.max(0, page - 1)
        : Math.min(maxPage, page + 1);
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        "Обери річ кнопкою нижче.",
        getTripGearEditItemsKeyboard(items, flow.data.page)
      );
    }

    const numericIndex = Number.parseInt(message, 10);
    const item = items.find((entry) => entry.actionLabel === message)
      || (Number.isInteger(numericIndex) ? items[numericIndex - 1] : null);

    if (!item) {
      return ctx.reply("Обери річ кнопкою нижче.", getTripGearEditItemsKeyboard(items, page));
    }

    flow.step = getMyGearEditNextStep(flow.step);
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
      flow.step = getMyGearEditPreviousStep(flow.step);
      delete flow.data.item;
      setFlow(String(ctx.from.id), flow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ", "Вибір речі"),
          "",
          "Обери річ, яку хочеш змінити."
        ]),
        { parse_mode: "HTML", ...getTripGearEditItemsKeyboard(flow.data.items || [], flow.data.page || 0) }
      );
    }

    if (message === GEAR_EDIT_DELETE_LABEL) {
      flow.step = getMyGearEditNextStep(flow.step, "DELETE");
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

    flow.step = getMyGearEditNextStep(flow.step);
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
    const quantityValidation = validatePositiveInteger(message);
    if (!quantityValidation.ok) {
      return ctx.reply(`${quantityValidation.error}\nПриклад: \`1\`.`, {
        parse_mode: "Markdown",
        ...FLOW_CANCEL_KEYBOARD
      });
    }
    const quantity = quantityValidation.value;

    flow.data.quantity = quantity;
    flow.data.attributes = { ...(flow.data.item.attributes || {}) };
    flow.data.fieldIndex = 0;
    flow.step = getMyGearEditNextStep(flow.step);
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
      flow.step = getMyGearEditNextStep(flow.step);
    } else {
      return ctx.reply(
        buildGearFieldPromptMessage("✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ", flow.data.item.name, field, flow.data.attributes),
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
        flow.step = getMyGearEditNextStep(flow.step);
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
              "✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ",
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

  if (message === TRIP_MEMBERS_BACK_LABEL || message === TRIP_DETAILS_BACK_LABEL) {
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
    if (flow.step === "query" || flow.step === "catalog_loading") {
      clearFlow(String(ctx.from.id));
      return showParentMenuByContext(ctx, groupService, parentContext)
        || (mode === "trip"
          ? ctx.reply("Пошук готового маршруту скасовано.", getTripRouteKeyboard(groupService.findGroupByMember(String(ctx.from.id)), canManageTrip(groupService.findGroupByMember(String(ctx.from.id)), String(ctx.from.id))))
          : ctx.reply("Пошук готового маршруту скасовано.", getRoutesMenuKeyboard(ctx.from.id)));
    }

    clearFlow(String(ctx.from.id));
    return showVpohidCatalogMenu(ctx, groupService, mode);
  }

  if (flow.step === "query") {
    const validation = validateSearchQuery(message);
    if (!validation.ok) {
      return ctx.reply(validation.error, {
        parse_mode: "Markdown",
        ...getVpohidSearchKeyboard(mode)
      });
    }

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
      matches = await vpohidLiveService.searchRoutes(validation.value);
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
      query: validation.value,
      matches: matches.slice(0, VPOHID_RESULTS_LIMIT).map((route, index) => ({
        id: route.id,
        title: route.title,
        buttonLabel: buildVpohidResultButton(route, index)
      }))
    };
    setFlow(String(ctx.from.id), flow);

    const prefix = "";
    return ctx.reply(`${prefix}${formatVpohidSearchResults(validation.value, matches)}`, { parse_mode: "HTML", ...getVpohidResultsKeyboard(matches, mode) });
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
        return showRouteMenu(ctx, groupService, advisorService);
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
        return showRouteMenu(ctx, groupService, advisorService);
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
        return showRouteMenu(ctx, groupService, advisorService);
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
    await handleGrantAccessFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "transfer_organizer") {
    await handleOrganizerTransferFlow(ctx, flow, groupService, userService, telegram);
    return true;
  }

  if (flow.type === "gear_add") {
    await handleGearAddFlow(ctx, flow, groupService, userService, telegram);
    return true;
  }

  if (flow.type === "trip_photo_add") {
    await handleTripPhotoAddFlow(ctx, flow, groupService);
    return true;
  }

  if (flow.type === "gear_edit") {
    await handleGearEditFlow(ctx, flow, groupService, userService, telegram);
    return true;
  }

  if (flow.type === "gear_delete") {
    await handleGearDeleteFlow(ctx, flow, groupService);
    return true;
  }

  if (flow.type === "gear_need") {
    await handleGearNeedFlow(ctx, flow, groupService, userService, telegram);
    return true;
  }

  if (flow.type === "gear_need_manage") {
    await handleGearNeedManageFlow(ctx, flow, groupService, userService, telegram);
    return true;
  }

  if (flow.type === "gear_loan_approval") {
    await handleGearLoanApprovalFlow(ctx, flow, groupService, userService, telegram);
    return true;
  }

  if (flow.type === "borrowed_gear_manage") {
    await handleBorrowedGearManageFlow(ctx, flow, groupService, userService, telegram);
    return true;
  }

  if (flow.type === "loaned_gear_manage") {
    await handleLoanedGearManageFlow(ctx, flow, groupService, userService, telegram);
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

  if (flow.type === "trip_hub") {
    await handleTripHubFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "profile_photo_album") {
    await handleProfilePhotoAlbumFlow(ctx, flow, groupService, userService, telegram);
    return true;
  }

  if (flow.type === "expense_add") {
    await handleExpenseAddFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "expense_delete") {
    await handleExpenseDeleteFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "faq_menu") {
    await handleFaqFlow(ctx, flow, advisorService, userService);
    return true;
  }

  if (flow.type === "help_menu") {
    await handleHelpFlow(ctx, flow, userService);
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

  if (flow.type === "trip_member_detail") {
    await handleTripMemberDetailFlow(ctx, flow, groupService, userService);
    return true;
  }

  if (flow.type === "trip_member_ticket_manage") {
    await handleTripMemberTicketFlow(ctx, flow, groupService, userService);
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
    await showWeather(ctx, weatherService, message, false, advisorService, { trip });
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

async function showTripGearMenu(ctx, groupService, advisorService = null) {
  setMenuContext(ctx.from?.id, "trip-gear");
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  const isRestricted = isTripMemberAutoExcluded(trip, String(ctx.from.id));
  if (isRestricted && !canRestrictedTripMemberAccessGearSection(trip, groupService, String(ctx.from.id))) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🎒 СПОРЯДЖЕННЯ ПОХОДУ", trip.name),
        "",
        "У тебе зараз немає позичених речей і ніхто не користується твоїм спорядженням.",
        "",
        "Тому розділ спорядження для тебе зараз приховано."
      ]),
      { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from.id)) }
    );
  }

  const response = await ctx.reply(
    joinRichLines([
      ...formatCardHeader("🎒 СПОРЯДЖЕННЯ ПОХОДУ", trip.name),
      "",
      formatSectionHeader("🧭", "Що Тут Можна Зробити"),
      ...(!isRestricted
        ? [
            "• `➕ Додати спорядження` — спочатку обрати тип, а далі додати річ у похід",
            `• \`${TRIP_GEAR_VIEW_ALL_LABEL}\` — побачити всю картину по спорядженню походу`,
            "• `✏️ Редагувати спорядження` — змінити свої позиції, а з правами редагування — будь-які",
            `• \`${TRIP_GEAR_ACCOUNTING_LABEL}\` — запити, речі в користуванні та хто користується спорядженням`
          ]
        : [
            `• \`${TRIP_GEAR_ACCOUNTING_LABEL}\` — повернення речей, підтвердження повернення і чинний обмін`
          ]),
      "",
      "⚠️ Зверни увагу:",
      !isRestricted
        ? "• після натискання `➕ Додати спорядження` бот запропонує тип: спільне, особисте або запасне"
        : "• після автопереведення в `👎 Не йду` доступним лишається тільки обмін речами",
      "• запит на позичання проходить через згоду власника речі, а не закривається односторонньо"
    ]),
    { parse_mode: "HTML", ...getTripGearKeyboard(trip, groupService, String(ctx.from.id)) }
  );

  await sendContextualFaqSuggestions(ctx, advisorService, {
    screen: "trip_gear",
    trip
  }, "Для цього формату походу");

  return response;
}

function showTripGearAccountingMenu(ctx, groupService) {
  setMenuContext(ctx.from?.id, "trip-gear-accounting");
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const isRestricted = isTripMemberAutoExcluded(trip, String(ctx.from.id));
  const exchange = getTripExchangeAvailability(trip, groupService, String(ctx.from.id));

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🧾 ОБЛІК ТА ЗАПИТИ СПОРЯДЖЕННЯ", trip.name),
      "",
      "Тут можна:",
      !isRestricted ? `• \`${GEAR_NEED_CREATE_LABEL}\` — створити запит на потрібну річ` : "• нові запити на позичання вимкнені, бо бот уже зафіксував тобі `👎 Не йду`",
      !isRestricted || exchange.hasBorrowed || exchange.hasLoaned ? `• \`${GEAR_MY_REQUESTS_LABEL}\` — переглянути свої активні запити` : "• `Мої запити` відкриються тільки тоді, коли вже є фактичний обмін речами",
      `• \`${GEAR_BORROWED_LABEL}\` — подивитися, чиїми речами ти зараз користуєшся`,
      `• \`${GEAR_LOANED_LABEL}\` — подивитися, хто зараз користується твоїми речами`,
      "",
      "⚠️ Зверни увагу:",
      "• річ переходить у користування тільки після згоди її власника",
      "• бот веде облік доступної кількості, щоб одну й ту саму річ не видали двічі"
    ]),
    { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
  );
}

function showBorrowedGear(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const items = groupService.getBorrowedGearForMember(trip.id, String(ctx.from.id));
  if (!items.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🫴 В КОРИСТУВАННІ", trip.name),
        "",
        "Зараз ти не користуєшся речами інших учасників."
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
    );
  }

  const preparedItems = items.map((item, index) => ({
    ...item,
    actionLabel: `${index + 1}. ${truncateButtonLabel(item.gearName, 20)}`
  }));

  setFlow(String(ctx.from.id), {
    type: "borrowed_gear_manage",
    tripId: trip.id,
    step: "pick",
    data: { items: preparedItems }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🫴 В КОРИСТУВАННІ", trip.name),
      "",
      "Обери річ, яку хочеш переглянути або повернути власнику."
    ]),
    { parse_mode: "HTML", ...getBorrowedGearItemsKeyboard(preparedItems) }
  );
}

function showLoanedOutGear(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  const items = groupService.getLoanedOutGearForMember(trip.id, String(ctx.from.id));
  if (!items.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("👥 КОРИСТУЮТЬСЯ", trip.name),
        "",
        "Зараз ніхто не користується твоїм спорядженням."
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
    );
  }

  const preparedItems = items.map((item, index) => ({
    ...item,
    actionLabel: `${index + 1}. ${truncateButtonLabel(item.gearName, 20)}`
  }));

  setFlow(String(ctx.from.id), {
    type: "loaned_gear_manage",
    tripId: trip.id,
    step: "pick",
    data: { items: preparedItems }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("👥 КОРИСТУЮТЬСЯ", trip.name),
      "",
      "Обери річ, щоб подивитися, хто нею користується, або підтвердити повернення."
    ]),
    { parse_mode: "HTML", ...getLoanedGearItemsKeyboard(preparedItems) }
  );
}

function showTripFoodMenu(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  const hasItems = Boolean(groupService.getFoodSnapshot(trip.id)?.items?.length);
  const actions = [
    "• `🥘 Додати продукт` — додати позицію в загальний список продуктів походу",
    hasItems ? "• `🗑 Видалити продукт` — прибрати позицію, якщо її внесли помилково" : null,
    "• для кожної позиції вказуй вагу, кількість і вартість",
    "• `🧾 Переглянути все харчування` — повний список продуктів і витрати"
  ].filter(Boolean);

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🍲 ХАРЧУВАННЯ ПОХОДУ", trip.name),
      "",
      formatSectionHeader("🧭", "Що Тут Можна Зробити"),
      ...actions,
      "",
      "⚠️ Зверни увагу:",
      "• продукти автоматично потрапляють і в загальні витрати походу",
      "• вага продуктів використовується для попереднього розрахунку ваги рюкзака"
    ]),
    { parse_mode: "HTML", ...getTripFoodMenuKeyboard(groupService, trip.id) }
  );
}

function showTripGear(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🎒 СПОРЯДЖЕННЯ ПОХОДУ", trip.name),
        "",
        "Бот уже зафіксував тобі статус `👎 Не йду`, тому загальний список спорядження для тебе заблокований.",
        "",
        "Відкрий `🧾 Запити та облік спорядження`, щоб повернути позичені речі або підтвердити повернення своїх."
      ]),
      { parse_mode: "HTML", ...getTripGearKeyboard(trip, groupService, String(ctx.from.id)) }
    );
  }

  const snapshot = groupService.getGearSnapshot(trip.id);
  const shouldHideOwnerItems = (item) => {
    const ownerId = String(item?.memberId || "");
    if (!ownerId) {
      return false;
    }

    const owner = getTripMember(trip, ownerId);
    return isTripMemberAutoExcluded(trip, ownerId) && Math.max(0, Number(item?.inUseQuantity) || 0) <= 0;
  };
  const visibleSharedGear = snapshot.sharedGear.filter((item) => !shouldHideOwnerItems(item));
  const visiblePersonalGear = snapshot.personalGear.filter((item) => !shouldHideOwnerItems(item));
  const visibleSpareGear = snapshot.spareGear.filter((item) => !shouldHideOwnerItems(item));
  const visibleNeeds = snapshot.gearNeeds.filter((item) => !isTripMemberAutoExcluded(trip, String(item.memberId || "")));
  if (
    !visibleSharedGear.length &&
    !visiblePersonalGear.length &&
    !visibleSpareGear.length &&
    !visibleNeeds.length
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
      { parse_mode: "HTML", ...getTripGearKeyboard(trip, groupService, String(ctx.from.id)) }
    );
  }

  const shared = formatGearList(visibleSharedGear, { includeOwner: true });
  const personal = formatGearList(visiblePersonalGear, { includeOwner: true });
  const spare = formatGearList(visibleSpareGear, { includeOwner: true });
  const needs = visibleNeeds.length
    ? visibleNeeds.map((item) => formatGearNeedListLine(item, { includeMember: true })).join("\n")
    : "• немає";

  return replyRichText(
    ctx,
    joinRichLines([
      ...formatCardHeader("🎒 СПОРЯДЖЕННЯ ПОХОДУ", trip.name),
      "",
      formatSectionHeader("🫕", "Спільне Спорядження"),
      ...shared,
      "",
      formatSectionHeader("👥", "Особисті Речі Учасників"),
      ...personal,
      "",
      formatSectionHeader("🧰", "Запасне Або Можна Позичити"),
      ...spare,
      "",
      formatSectionHeader("🆘", "Кому Чого Бракує"),
      needs
    ]),
    { parse_mode: "HTML", ...getTripGearKeyboard(trip, groupService, String(ctx.from.id)) }
  );
}

function showMyNeeds(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  const exchange = getTripExchangeAvailability(trip, groupService, String(ctx.from.id));
  if (isTripMemberAutoExcluded(trip, String(ctx.from.id)) && !(exchange.hasBorrowed || exchange.hasLoaned)) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("📋 МОЇ ЗАПИТИ", trip.name),
        "",
        "Після автопереведення в `👎 Не йду` цей розділ доступний тільки для вже чинного обміну спорядженням."
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
    );
  }

  const allNeeds = groupService.getMemberGearNeeds(trip.id, String(ctx.from.id), { includeResolved: true });
  const needs = allNeeds.filter((item) => item.status === "open" || item.status === "matched");
  const historyNeeds = allNeeds.filter((item) => item.status === "fulfilled" || item.status === "cancelled");

  if (!needs.length && !historyNeeds.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("📋 МОЇ ЗАПИТИ", trip.name),
        "",
        "У тебе немає активних запитів у цьому поході."
      ]),
      { parse_mode: "HTML", ...getTripGearKeyboard(trip, groupService, String(ctx.from.id)) }
    );
  }

  return replyRichText(
    ctx,
    joinRichLines([
      ...formatCardHeader("📋 МОЇ ЗАПИТИ", trip.name),
      "",
      ...(needs.length
        ? [
            formatSectionHeader("🟢", "Активні Запити"),
            ...needs.map((item) => formatGearNeedListLine(item))
          ]
        : ["Активних запитів зараз немає."]),
      ...(historyNeeds.length
        ? [
            "",
            formatSectionHeader("🕓", "Закриті Запити"),
            ...historyNeeds.slice().reverse().map((item) => formatResolvedGearNeedListLine(item))
          ]
        : [])
    ]),
    { parse_mode: "HTML", ...getTripGearKeyboard(trip, groupService, String(ctx.from.id)) }
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

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
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
      { parse_mode: "HTML", ...getTripFoodMenuKeyboard(groupService, trip.id) }
    );
  }

  const items = snapshot.items.map((item, index) =>
    `${index + 1}. ${item.name}\n   вага / обʼєм: ${item.amountLabel || formatWeightGrams(item.weightGrams)} | кількість: ${item.quantity} | ${formatMoney(item.cost)} | ${resolveMemberDisplayName(userService, item.memberId, item.memberName)}`
  ).join("\n");
  const byMember = snapshot.byMember.length
    ? snapshot.byMember.map((item) => `• ${resolveMemberDisplayName(userService, item.memberId, item.memberName)}: ${item.itemCount} позицій | ${formatWeightGrams(item.totalWeight)} | ${formatMoney(item.totalCost)}`).join("\n")
    : "• немає";

  return replyRichText(
    ctx,
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
    { parse_mode: "HTML", ...getTripFoodMenuKeyboard(groupService, trip.id) }
  );
}

function showBackpackWeight(ctx, groupService, userService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  const snapshot = groupService.getBackpackWeightSnapshot(trip.id);
  if (!snapshot?.byMember?.length) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("⚖️ ВАГА РЮКЗАКА", trip.name),
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
        ...formatCardHeader("⚖️ ВАГА РЮКЗАКА", trip.name),
        "",
        getTripMember(trip, viewerId)?.attendanceStatus === "not_going"
          ? "Ти зараз у статусі `👎 Не йду`, тому не враховуєшся в розрахунку ваги."
          : "Для тебе поки немає розрахунку в цьому поході."
      ]),
      { parse_mode: "HTML", ...getTripKeyboard(trip, viewerId) }
    );
  }

  const lines = [
    ...formatCardHeader("⚖️ ВАГА РЮКЗАКА", trip.name),
    "",
    formatSectionHeader("👤", getMemberDisplayName(userService, {
      id: member.memberId,
      name: member.memberName
    })),
    ...buildBackpackWeightDetailLines(member),
    "",
    "⚠️ Зверни увагу",
    member.totalWeight <= 0 && member.missingWeights <= 0 ? "• Для тебе поки немає доданого спорядження чи їжі з вагою." : null,
    member.missingWeights > 0 ? "• Деякі ваги ще не заповнені, тому розрахунок поки неповний." : null,
    "• Позичені речі додаються саме до ваги того, хто їх зараз несе.",
    "• Вільне спільне спорядження і їжа діляться порівну тільки між тими, хто бере участь у поході."
  ];

  return replyRichText(ctx, joinRichLines(lines), { parse_mode: "HTML", ...getTripKeyboard(trip, viewerId) });
}

function buildBackpackWeightDetailLines(member) {
  const lines = [];

  if (member.personalGearWeight > 0) {
    lines.push(`• Особисте спорядження: ${formatWeightGrams(member.personalGearWeight)}`);
    for (const item of member.personalGearDetails || []) {
      lines.push(`  ◦ ${item.name} — ${item.quantity} шт. | ${formatWeightGrams(item.totalWeight)}`);
    }
  }

  if (member.borrowedGearWeight > 0) {
    lines.push(`• Позичені речі в користуванні: ${formatWeightGrams(member.borrowedGearWeight)}`);
    for (const item of member.borrowedGearDetails || []) {
      const ownerLabel = item.ownerMemberName ? ` | від ${item.ownerMemberName}` : "";
      lines.push(`  ◦ ${item.name} — ${item.quantity} шт. | ${formatWeightGrams(item.totalWeight)}${ownerLabel}`);
    }
  }

  if (member.sharedGearShare > 0) {
    lines.push(`• Частка спільного спорядження: ${formatWeightGrams(member.sharedGearShare)}`);
    for (const item of member.sharedGearDetails || []) {
      lines.push(`  ◦ ${item.name} — ${item.quantity} шт. | усього ${formatWeightGrams(item.totalWeight)} | твоя частка ${formatWeightGrams(item.shareWeight)}`);
    }
  }

  if (member.foodShare > 0) {
    lines.push(`• Частка їжі: ${formatWeightGrams(member.foodShare)}`);
    for (const item of member.foodShareDetails || []) {
      const quantityLabel = item.quantity > 0 ? ` — ${item.quantity} шт.` : "";
      lines.push(`  ◦ ${item.name}${quantityLabel} | усього ${formatWeightGrams(item.totalWeight)} | твоя частка ${formatWeightGrams(item.shareWeight)}`);
    }
  }

  if (member.totalWeight > 0) {
    lines.push(`• Попередня вага рюкзака: ${formatWeightGrams(member.totalWeight)}`);
  }

  if (member.missingWeights > 0) {
    lines.push(`• Незаповнених ваг у розрахунку: ${member.missingWeights}`);
  }

  return lines;
}

function showTripExpensesMenu(ctx, groupService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  const hasItems = Boolean(groupService.getExpenseSnapshot(trip.id)?.items?.length);
  const actions = [
    "• `💸 Додати витрату` — ввести назву, кількість і ціну",
    hasItems ? "• `🗑 Видалити витрату` — прибрати зайву або помилкову позицію" : null,
    "• `🧾 Переглянути всі витрати` — повний облік витрат без непорозумінь",
    "• у загальному зведенні автоматично враховуються продукти з розділу харчування"
  ].filter(Boolean);

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("💸 ВИТРАТИ ПОХОДУ", trip.name),
      "",
      formatSectionHeader("🧭", "Що Тут Можна Зробити"),
      ...actions,
      "",
      "⚠️ Зверни увагу:",
      "• тут видно і прямі витрати, і продукти, і хто скільки покрив"
    ]),
    { parse_mode: "HTML", ...getTripExpensesMenuKeyboard(groupService, trip.id) }
  );
}

function showTripExpenses(ctx, groupService, userService) {
  const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
  if (!trip) {
    return null;
  }

  if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
    return replyRestrictedTripSection(ctx, trip);
  }

  const expenseSnapshot = groupService.getExpenseSnapshot(trip.id);
  const foodSnapshot = groupService.getFoodSnapshot(trip.id);
  const expenseSettlement = buildTripExpenseSettlementData(trip, expenseSnapshot, foodSnapshot, userService);
  const expenseItems = expenseSettlement.directExpenseItems;
  const foodTotal = expenseSettlement.foodTotal;

  if (!expenseItems.length && foodTotal === 0) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("💸 ВИТРАТИ ПОХОДУ", trip.name),
        "",
        "У поході поки немає витрат."
      ]),
      { parse_mode: "HTML", ...getTripExpensesMenuKeyboard(groupService, trip.id) }
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
  const directExpenses = expenseSettlement.directExpensesTotal;
  const foodByMember = (foodSnapshot?.byMember || [])
    .map((item) => formatTotalLine(resolveMemberDisplayName(userService, item.memberId, item.memberName), item.totalCost))
    .join("\n") || "немає";
  const combinedByMember = expenseSettlement.paidByMemberLines
    .map((item) => formatTotalLine(item.label, item.value))
    .join("\n") || "немає";
  const grandTotal = expenseSettlement.grandTotal;
  const includedMembersLabel = getTripMembersIncludedInCalculations(trip)
    .map((member) => resolveMemberDisplayName(userService, member.id, member.name))
    .join(", ");
  const excludedMembersLabel = expenseSettlement.excludedMembers
    .map((member) => member.memberName)
    .join(", ");
  const excludedPayersSection = expenseSettlement.excludedPayers.length
    ? [
        "",
        formatSectionHeader("↩️", "Повернення Тим, Хто Не Йде"),
        ...expenseSettlement.excludedPayers.map((item) => `• ${item.memberName} — повернути ${formatMoney(item.paid)}`)
      ]
    : [];

  return replyRichText(
    ctx,
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
      formatTotalLine("Частка 1 учасника", expenseSettlement.perPerson),
      `• У розрахунку беруть участь: ${expenseSettlement.participantCount}`,
      includedMembersLabel ? `• Учасники розрахунку: ${includedMembersLabel}` : null,
      ...(expenseSettlement.excludedMembers.length ? [`• У статусі \`👎 Не йду\`: ${excludedMembersLabel}`] : []),
      ...(expenseSettlement.excludedMembers.length ? ["• Учасники зі статусом `👎 Не йду` не включаються в поділ витрат"] : []),
      ...excludedPayersSection,
      "",
      formatSectionHeader("💱", "Баланс По Учасниках"),
      ...(expenseSettlement.memberSettlementLines.length
        ? expenseSettlement.memberSettlementLines
        : ["• немає"]),
      "",
      divider
    ]),
    { parse_mode: "HTML", ...getTripExpensesMenuKeyboard(groupService, trip.id) }
  );
}

function formatMemberAwardsMessage(trip, userService, member, awardSummary) {
  const safeSummary = awardSummary && typeof awardSummary === "object" ? awardSummary : {};
  const newAwardsList = Array.isArray(safeSummary.newAwards) ? safeSummary.newAwards.filter((award) => award && typeof award === "object") : [];
  const latestAwardsList = Array.isArray(safeSummary.latestAwards) ? safeSummary.latestAwards.filter((award) => award && typeof award === "object") : [];
  const stats = safeSummary.stats && typeof safeSummary.stats === "object" ? safeSummary.stats : {};
  const xpSummary = safeSummary.xp && typeof safeSummary.xp === "object" ? safeSummary.xp : {};
  const xpProgress = xpSummary.progress && typeof xpSummary.progress === "object" ? xpSummary.progress : {};
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
  const newAwards = newAwardsList.length
    ? newAwardsList.map((award) => `• ${formatAwardName(award)}`).join("\n")
    : hasTrackableRoute
      ? "• Цього разу нових відзнак не відкрито, але прогрес збережено."
      : "• Похід завершено без маршруту, тому прогрес і нагороди не були зараховані.";
  const latestAwards = latestAwardsList.length
    ? latestAwardsList.slice(0, 5).map((award) => `• ${formatAwardName(award)}`).join("\n")
    : "• Поки що немає нагород";
  const xpBonusLine = Number(xpSummary?.awardBonusXp) > 0 ? `• Бонус за нові нагороди: +${Number(xpSummary.awardBonusXp)} XP` : null;

  return joinRichLines([
    ...formatCardHeader("🎉 ВІТАЄМО І ДЯКУЄМО", userService.getDisplayName(member.id, member.name)),
    "",
    `Дякуємо за участь у поході <b>${escapeHtml(trip.name)}</b>.`,
    `Маршрут: ${escapeHtml(routeName)}`,
    "",
    formatSectionHeader("⭐", "XP За Похід"),
    hasTrackableRoute
      ? `• Ти отримав: +${Number(xpSummary.gainedXp) || 0} XP`
      : "• XP не нараховано, бо похід завершено без маршруту.",
    hasTrackableRoute && Number(xpSummary.previousLevel) !== Number(xpSummary.level)
      ? `• Рівень: ${Number(xpSummary.previousLevel) || 1} → ${Number(xpSummary.level) || 1}`
      : `• Рівень: ${Number(xpSummary.level) || 1}`,
    hasTrackableRoute
      ? (xpProgress.next
        ? `• Прогрес: ${Number(xpProgress.currentXp) || 0} / ${Number(xpProgress.nextTargetXp) || 0} XP`
        : `• Прогрес: ${Number(xpProgress.currentXp) || 0} XP`)
      : null,
    xpBonusLine,
    "",
    formatSectionHeader("🏆", "Нові Досягнення"),
    newAwards,
    "",
    formatSectionHeader("📈", "Твій Прогрес"),
    `• Походів: ${Number(stats.hikesCount) || 0}`,
    `• Кілометрів: ${Number(stats.totalKm || 0).toFixed(1)} км`,
    `• Ночівель: ${Number(stats.totalNights) || 0}`,
    "",
    formatSectionHeader("🎯", "Поточний Титул"),
    `• ${safeSummary.currentTitle || "ще не відкрито"}`,
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

  if (!canTripBeFinished(trip)) {
    return ctx.reply(
      "Завершити похід можна тільки після його початку. До старту ця дія недоступна.",
      { parse_mode: "HTML", ...getTripDetailsKeyboard(trip, String(ctx.from.id)) }
    );
  }

  const completionResult = groupService.completeGroup(trip.id);
  if (!completionResult?.ok) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("⚠️ ПОХІД ПОКИ НЕ МОЖНА ЗАВЕРШИТИ", trip.name),
        "",
        completionResult?.message || "Спочатку потрібно закрити всі активні позики спорядження.",
        "",
        "Що ще потрібно повернути:",
        ...buildOutstandingLoansSummaryLines(completionResult?.outstandingLoans || [])
      ]),
      { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from.id)) }
    );
  }

  const completed = completionResult.group;
  const awardResults = completed.members
    .filter(isMemberIncludedInCalculations)
    .map((member) => ({
      member,
      awards: userService.grantTripAwards({
        trip: completed,
        memberId: member.id,
        userName: member.name
      })
    }));
  if (typeof userService.store?.flush === "function") {
    await userService.store.flush();
  }
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

async function cancelTrip(ctx, groupService) {
  const trip = requireOwnerTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  if (!canTripBeCancelled(trip)) {
    return ctx.reply(
      "Скасувати похід можна тільки до його початку. Після старту ця дія недоступна.",
      { parse_mode: "HTML", ...getTripDetailsKeyboard(trip, String(ctx.from.id)) }
    );
  }

  const cancelResult = groupService.cancelGroup(trip.id);
  if (!cancelResult?.ok) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("⚠️ ПОХІД ПОКИ НЕ МОЖНА СКАСУВАТИ", trip.name),
        "",
        cancelResult?.message || "Спочатку потрібно закрити всі активні позики спорядження.",
        "",
        "Що ще потрібно повернути:",
        ...buildOutstandingLoansSummaryLines(cancelResult?.outstandingLoans || [])
      ]),
      { parse_mode: "HTML", ...getTripDetailsKeyboard(trip, String(ctx.from.id)) }
    );
  }

  clearFlow(String(ctx.from.id));

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader("🚫 ПОХІД СКАСОВАНО", cancelResult.group.name),
      "",
      "Похід перенесено в історію без нарахування досягнень і нагород.",
      "Фінальний звіт по витратах та спорядженню збережено."
    ]),
    { parse_mode: "HTML", ...getMainKeyboard(ctx) }
  );
}

function startFinishTripConfirm(ctx, groupService, action = "complete") {
  const trip = requireOwnerTrip(ctx, groupService);
  if (!trip) {
    return null;
  }

  if (action === "complete" && !canTripBeFinished(trip)) {
    return ctx.reply(
      "Завершити похід можна тільки після його початку. До старту ця дія недоступна.",
      { parse_mode: "HTML", ...getTripDetailsKeyboard(trip, String(ctx.from.id)) }
    );
  }

  if (action === "cancel" && !canTripBeCancelled(trip)) {
    return ctx.reply(
      "Скасувати похід можна тільки до його початку. Під час або після походу ця дія недоступна.",
      { parse_mode: "HTML", ...getTripDetailsKeyboard(trip, String(ctx.from.id)) }
    );
  }

  const outstandingLoans = groupService.getOutstandingGearLoans(trip.id);
  if (outstandingLoans.length > 0) {
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader(
          action === "cancel" ? "⚠️ ПОХІД ПОКИ НЕ МОЖНА СКАСУВАТИ" : "⚠️ ПОХІД ПОКИ НЕ МОЖНА ЗАВЕРШИТИ",
          trip.name
        ),
        "",
        action === "cancel"
          ? "Поки в поході є позичене спорядження, скасування недоступне."
          : "Поки в поході є позичене спорядження, завершення недоступне.",
        "",
        "Що ще не повернули:",
        ...buildOutstandingLoansSummaryLines(outstandingLoans),
        "",
        "Спочатку учасники мають повернути ці речі, а власники — підтвердити повернення."
      ]),
      { parse_mode: "HTML", ...getTripKeyboard(trip, String(ctx.from.id)) }
    );
  }

  setFlow(String(ctx.from.id), {
    type: "finish_trip_confirm",
    tripId: trip.id,
    step: "confirm",
    data: { action }
  });

  return ctx.reply(
    joinRichLines([
      ...formatCardHeader(action === "cancel" ? "🚫 СКАСУВАННЯ ПОХОДУ" : "✅ ЗАВЕРШЕННЯ ПОХОДУ", trip.name),
      "",
      ...(action === "cancel"
        ? [
            "Після підтвердження похід:",
            "• перестане бути активним",
            "• перейде в історію з фінальним підсумком по витратах і спорядженню",
            "• не дасть досягнень, XP і нагород"
          ]
        : [
            "Після підтвердження похід:",
            "• отримає статус `завершений`",
            "• перестане бути активним",
            "• перейде в історію з фінальним підсумком"
          ]),
      "",
      "⚠️ Зверни увагу:",
      action === "cancel"
        ? "• цю дію використовуй, якщо похід не відбувся"
        : "• ця дія має сенс, коли маршрут уже завершено"
    ]),
    { parse_mode: "HTML", ...FINISH_TRIP_CONFIRM_KEYBOARD }
  );
}

async function handleFinishTripConfirmFlow(ctx, flow, groupService, userService, telegram = null) {
  const message = ctx.message.text.trim();
  const action = flow?.data?.action === "cancel" ? "cancel" : "complete";

  if (message === FINISH_TRIP_NO_LABEL) {
    clearFlow(String(ctx.from.id));
    return showTripPassport(ctx, groupService, userService, telegram?.advisorService || null);
  }

  if (message === FINISH_TRIP_YES_LABEL) {
    return action === "cancel"
      ? cancelTrip(ctx, groupService)
      : finishTrip(ctx, groupService, userService, telegram);
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
  const meetingPoint = normalizeLocationLabel(trip.tripCard?.meetingPoint || "");
  const meetingDateTime = formatTripMeetingDateTime(trip.tripCard || {});
  const meetingLines = [];

  if (meetingPoint || meetingDateTime) {
    meetingLines.push("");
    meetingLines.push("🚆 Точка збору");
    if (meetingPoint) {
      meetingLines.push(`• ${meetingPoint}`);
    }
    if (meetingDateTime) {
      meetingLines.push(`• ${meetingDateTime}`);
    }
  }

  if (reminderKey === "d3") {
    return [
      `🔔 Нагадування: до походу "${trip.name}" залишилось 3 дні`,
      "",
      "Що перевірити зараз:",
      "• актуальну погоду по маршруту",
      `• готовність спорядження: ${readiness}`,
      `• активні запити на спорядження: ${trip.gearNeeds?.length || 0}`,
      ...meetingLines
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
      `• перевірити логістику старту: ${trip.routePlan?.from || "не вказано"}`,
      ...meetingLines
    ].join("\n");
  }

  return [
    `🏔 Сьогодні старт походу "${trip.name}"`,
    "",
    `Маршрут: ${formatRouteStatus(trip.routePlan)}`,
    `Готовність спорядження: ${readiness}`,
    `Безпека: ${safety.title}`,
    `Екстрені номери: ${safety.general.flatMap((item) => item.phones).join(" / ")}`,
    ...meetingLines,
    "Перед виходом ще раз перевір воду, заряд телефону і офлайн-трек."
  ].join("\n");
}

function buildBorrowedGearReminderMessage(trip, borrowedItems, daysAfterEnd) {
  const lines = [
    `🔔 Нагадування після походу "${trip.name}"`,
    "",
    daysAfterEnd === 1
      ? "Минув день після завершення походу. Якщо ці речі ще в тебе, саме час м'яко домовитися про повернення."
      : "Минуло вже два дні після завершення походу. Якщо ці речі ще в тебе, будь ласка, поверни їх власникам найближчим часом.",
    "",
    "Що ще потрібно повернути:"
  ];

  for (const [index, item] of borrowedItems.entries()) {
    lines.push(`${index + 1}. ${item.gearName} — ${item.quantity} шт.`);
    lines.push(`• Власник: ${item.ownerMemberName}`);
  }

  lines.push("");
  lines.push("Коли повернення відбудеться, власник підтвердить це в розділі `👥 Користуються`.");
  return lines.join("\n");
}

function startTripReminderLoop(bot, groupService, userService) {
  const sendDueReminders = async () => {
    const activeTrips = groupService.getActiveGroups();

    for (const trip of activeTrips) {
      const ownerMember = getTripOwnerMember(trip);
      let currentTrip = trip;

      const startDate = trip.tripCard?.startDate;
      const daysUntil = calculateDaysUntil(startDate);

      if (daysUntil !== null) {
        if (trip.remindersEnabled === true) {
          const reminderKey = daysUntil === 3 ? "d3" : daysUntil === 1 ? "d1" : daysUntil === 0 ? "d0" : null;
          if (reminderKey && !trip.reminderState?.[reminderKey]) {
            const text = buildAutoReminderMessage(trip, reminderKey);

            let delivered = false;
            for (const member of trip.members || []) {
              try {
                await sendRichText(bot.telegram, member.id, text, getTripKeyboard(trip, member.id));
                delivered = true;
              } catch {
                // Ignore users who haven't opened the bot or blocked it.
              }
            }

            if (delivered) {
              groupService.markReminderSent({ groupId: trip.id, reminderKey });
            }
          }
        }

        for (const member of currentTrip.members || []) {
          const memberId = String(member.id || "");
          if (!memberId) {
            continue;
          }

          if (member.role === "owner") {
            continue;
          }

          if (daysUntil === 8 && isAttendanceStatusPending(member.attendanceStatus)) {
            const attendanceReminderKey = `attendance_d8:${memberId}`;
            if (!trip.reminderState?.[attendanceReminderKey]) {
              try {
                await sendRichText(
                  bot.telegram,
                  member.id,
                  buildAttendanceReminderMessage(trip, member, userService),
                  getTripKeyboard(trip, memberId)
                );
                currentTrip = groupService.markReminderSent({ groupId: currentTrip.id, reminderKey: attendanceReminderKey });
              } catch {
                // Ignore users who haven't opened the bot or blocked it.
              }
            }
          }

          if (daysUntil <= 7 && isAttendanceStatusPending(member.attendanceStatus)) {
            const attendanceAutoDeclineKey = `attendance_d7:${memberId}`;
            if (!currentTrip.reminderState?.[attendanceAutoDeclineKey]) {
              const result = groupService.setMemberAttendanceStatusSystem({
                groupId: currentTrip.id,
                targetMemberId: memberId,
                status: "not_going",
                lockSelfChange: true
              });

              if (result.ok) {
                const updatedTrip = result.group;
                groupService.cancelActiveGearNeedsForMember({
                  groupId: updatedTrip.id,
                  memberId
                });
                currentTrip = groupService.getGroup(updatedTrip.id) || updatedTrip;
                const updatedMember = currentTrip.members.find((item) => String(item.id) === memberId) || member;

                try {
                  await sendRichText(
                    bot.telegram,
                    member.id,
                    buildAttendanceAutoDeclinedMessage(trip, member, userService),
                    getTripKeyboard(updatedTrip, memberId)
                  );
                } catch {
                  // Ignore users who haven't opened the bot or blocked it.
                }

                if (result.previousStatus !== updatedMember.attendanceStatus) {
                  void notifyTripMembers(
                    bot.telegram,
                    updatedTrip,
                    buildAttendanceStatusChangedNotification(
                      updatedTrip,
                      getMemberDisplayName(userService, updatedMember),
                      "",
                      result.previousStatus,
                      updatedMember.attendanceStatus,
                      { automatic: true }
                    )
                  );
                }

                currentTrip = groupService.markReminderSent({ groupId: currentTrip.id, reminderKey: attendanceAutoDeclineKey });
              }
            }
          }
        }

        if (daysUntil === 8 && ownerMember?.id && !currentTrip.reminderState?.attendance_d8_owner) {
          const pendingMembersForOwner = (currentTrip.members || []).filter(
            (member) => member.role !== "owner" && isAttendanceStatusPending(member.attendanceStatus)
          );

          if (pendingMembersForOwner.length) {
            try {
              await sendRichText(
                bot.telegram,
                ownerMember.id,
                buildOwnerPendingAttendanceMessage(currentTrip, pendingMembersForOwner, userService),
                getTripKeyboard(currentTrip, ownerMember.id)
              );
              currentTrip = groupService.markReminderSent({
                groupId: currentTrip.id,
                reminderKey: "attendance_d8_owner"
              });
            } catch {
              // Ignore users who haven't opened the bot or blocked it.
            }
          }
        }

        if (daysUntil <= 7 && ownerMember?.id && !currentTrip.reminderState?.attendance_d7_owner) {
          const autoDeclinedMembersForOwner = (currentTrip.members || []).filter(
            (member) =>
              member.role !== "owner" &&
              member.attendanceStatus === "not_going" &&
              member.attendanceSelfLocked === true
          );

          if (autoDeclinedMembersForOwner.length) {
            try {
              await sendRichText(
                bot.telegram,
                ownerMember.id,
                buildOwnerAutoDeclinedAttendanceMessage(currentTrip, autoDeclinedMembersForOwner, userService),
                getTripKeyboard(currentTrip, ownerMember.id)
              );
              currentTrip = groupService.markReminderSent({
                groupId: currentTrip.id,
                reminderKey: "attendance_d7_owner"
              });
            } catch {
              // Ignore users who haven't opened the bot or blocked it.
            }
          }
        }
      }

      if (trip.remindersEnabled !== true) {
        continue;
      }

      const endDate = trip.tripCard?.endDate;
      const daysUntilEnd = calculateDaysUntil(endDate);
      const returnReminderKeyBase = daysUntilEnd === -1 ? "return_d1" : daysUntilEnd === -2 ? "return_d2" : null;

      if (!returnReminderKeyBase) {
        continue;
      }

      for (const member of trip.members || []) {
        const memberId = String(member.id || "");
        if (!memberId) {
          continue;
        }

        const memberReminderKey = `${returnReminderKeyBase}:${memberId}`;
        if (trip.reminderState?.[memberReminderKey]) {
          continue;
        }

        const borrowedItems = groupService.getBorrowedGearForMember(trip.id, memberId);
        if (!borrowedItems.length) {
          continue;
        }

        try {
          await bot.telegram.sendMessage(
            member.id,
            buildBorrowedGearReminderMessage(trip, borrowedItems, Math.abs(daysUntilEnd)),
            getTripKeyboard(trip, memberId)
          );
          groupService.markReminderSent({ groupId: trip.id, reminderKey: memberReminderKey });
        } catch {
          // Ignore users who haven't opened the bot or blocked it.
        }
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
  routeService.advisorService = advisorService;
  bot.telegram.advisorService = advisorService;
  startTripReminderLoop(bot, groupService, userService);
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
    const validation = validateInviteCode(inviteCode);
    if (!validation.ok) {
      return ctx.reply(validation.error, getMainKeyboard(ctx));
    }

    const result = groupService.joinGroup(validation.value, {
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
    if (!isUserAuthorized(userService, String(ctx.from.id), getUserLabel(ctx))) {
      return showAuthorizationRequired(
        ctx,
        userService,
        inviteCode ? `• після підтвердження номера знову відкрий запрошення або введи код походу: \`${inviteCode}\`` : ""
      );
    }
    if (inviteCode) {
      return joinTripByInviteCode(ctx, inviteCode);
    }

    return sendHome(ctx, userService);
  });
  bot.help((ctx) => sendHelp(ctx));

  bot.on("contact", async (ctx) => {
    userService.ensureUserRecord({
      userId: String(ctx.from.id),
      userName: getUserLabel(ctx)
    });

    const contact = ctx.message?.contact;
    if (!contact) {
      return null;
    }

    if (String(contact.user_id || "") !== String(ctx.from.id)) {
      return ctx.reply(
        "Потрібно надіслати саме свій Telegram-контакт кнопкою нижче.",
        getAuthorizationKeyboard(userService.getAuthorizationState(String(ctx.from.id), getUserLabel(ctx)))
      );
    }

    userService.confirmOwnContact({
      userId: String(ctx.from.id),
      userName: getUserLabel(ctx),
      phone: contact.phone_number || ""
    });

    const authState = userService.getAuthorizationState(String(ctx.from.id), getUserLabel(ctx));
    if (authState.isAuthorized) {
      await ctx.reply(
        joinRichLines([
          ...formatCardHeader("✅", "КОНТАКТ ПІДТВЕРДЖЕНО"),
          "",
          "Номер підтверджено, доступ до бота відкрито."
        ]),
        { parse_mode: "HTML", ...getMainKeyboard(ctx) }
      );
      return sendHome(ctx, userService);
    }

    return showAuthorizationRequired(ctx, userService);
  });

  bot.use(async (ctx, next) => {
    const userId = String(ctx.from?.id || "");
    if (!userId) {
      return next();
    }

    userService.ensureUserRecord({
      userId,
      userName: getUserLabel(ctx)
    });

    if (isUserAuthorized(userService, userId, getUserLabel(ctx))) {
      return next();
    }

    const flow = getFlow(userId);
    if (isAuthExemptFlow(flow)) {
      return next();
    }

    if (ctx.message?.contact) {
      return next();
    }

    if (ctx.callbackQuery?.data && String(ctx.callbackQuery.data).startsWith("faqctx:")) {
      return next();
    }

    const text = String(ctx.message?.text || "").trim();
    if (isAuthExemptText(text) || text === "/help" || text === "/start") {
      return next();
    }

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery("Спочатку підтвердь свій номер.", { show_alert: true });
    }

    return showAuthorizationRequired(ctx, userService);
  });

  bot.command("newgroup", (ctx) => {
    const name = ctx.message.text.replace("/newgroup", "").trim();
    const activeTrip = groupService.findBlockingActiveGroupByMember(String(ctx.from.id));
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

  bot.command("mygroup", (ctx) => showTripPassport(ctx, groupService, userService, advisorService));
  bot.command("route", (ctx) => {
    const input = ctx.message.text.replace("/route", "").trim();
    if (!input) {
      return startRouteWizard(ctx, groupService, "search");
    }
    return showRouteSearch(ctx, groupService, routeService, input, advisorService);
  });
  bot.command("weather", (ctx) => showWeather(ctx, weatherService, ctx.message.text.replace("/weather", "").trim(), getMainKeyboard(ctx), advisorService));
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
    return showWeather(ctx, weatherService, region, getTripKeyboard(trip, String(ctx.from.id)), advisorService, { trip });
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
      return ctx.reply("Формат: `/addgear пальник;1;shared|personal|spare;так|ні`", { parse_mode: "Markdown", ...getCurrentTripGearKeyboard(ctx, groupService) });
    }
    const normalizedScope = String(scopeRaw || "shared").toLowerCase();
    const scope = ["personal", "spare"].includes(normalizedScope) ? normalizedScope : "shared";
    const shareable = scope === "spare" || ["так", "yes", "true", "1"].includes((shareableRaw || "").toLowerCase());
    const addedGear = groupService.addGear({
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
    const matchedNeeds = (scope === "shared" || scope === "spare" || addedGear.shareable)
      ? groupService.findNeedsMatchedByGear(trip.id, addedGear.name, { excludeMemberId: String(ctx.from.id) })
      : [];
    const actorName = userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx));

    if (matchedNeeds.length) {
      void notifyNeedOwnersAboutCoverage(bot.telegram, trip, addedGear, matchedNeeds, actorName);
    }

    return ctx.reply(
      joinRichLines([
        `✅ "${escapeHtml(name)}" додано в похід.`,
        ...(matchedNeeds.length
          ? [
              "",
              "🤝 Ця річ може допомогти закрити такі запити:",
              ...buildMatchedNeedsSummaryLines(matchedNeeds, userService, { availableQuantity: Number(addedGear.availableQuantity ?? addedGear.quantity) || 0 })
            ]
          : [])
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearKeyboard(ctx, groupService) }
    );
  });
  bot.command("needgear", (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
    if (!trip) {
      return null;
    }
    if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
      return ctx.reply(
        "Після автопереведення в `👎 Не йду` нові запити на спорядження вимкнені.",
        { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
      );
    }
    const [name, quantityRaw, note] = ctx.message.text.replace("/needgear", "").trim().split(";").map((part) => part?.trim());
    const nameValidation = validateGearItemName(name);
    const quantityValidation = validatePositiveInteger(quantityRaw);
    const noteValidation = !note || note === "-" ? { ok: true, value: note === "-" ? "" : "" } : validateLongProfileText(note);
    if (!nameValidation.ok || !quantityValidation.ok || !noteValidation.ok) {
      return ctx.reply("Формат: `/needgear кішки;1;не маю власних`", { parse_mode: "Markdown", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) });
    }
    const requesterName = userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx));
    const need = groupService.addGearNeed({
      groupId: trip.id,
      memberId: String(ctx.from.id),
      memberName: requesterName,
      need: { name: canonicalizeGearName(nameValidation.value), quantity: quantityValidation.value, note: noteValidation.value }
    });
    void notifyTripMembers(
      bot.telegram,
      trip,
      buildGearNeedCreatedNotification(trip, requesterName, need),
      { excludeMemberId: String(ctx.from.id) }
    );
    return ctx.reply(`📌 Запит "${name}" додано.`, getCurrentTripGearAccountingKeyboard(ctx, groupService));
  });
  bot.command("gear", (ctx) => showTripGear(ctx, groupService));
  bot.command("requestgear", (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
    if (!trip) {
      return null;
    }
    if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
      return ctx.reply(
        "Після автопереведення в `👎 Не йду` нові запити на позичання речей вимкнені.",
        { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
      );
    }
    const gearNameValidation = validateGearItemName(ctx.message.text.replace("/requestgear", "").trim());
    if (!gearNameValidation.ok) {
      return ctx.reply("Формат: `/requestgear намет`", { parse_mode: "Markdown", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) });
    }
    const gearName = canonicalizeGearName(gearNameValidation.value);
    const coverage = groupService.findGearCoverage(trip.id, gearName, {
      excludeMemberId: String(ctx.from.id),
      requestedQuantity: 1
    });
    if (!coverage.matches.length) {
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("🤝 ХТО МОЖЕ ДОПОМОГТИ", gearName),
          "",
          "Поки що бот не знайшов відповідного спорядження.",
          "",
          "Що потрібно зробити:",
          "• хтось із учасників має додати цю річ у спорядження походу",
          "• тип речі має бути <b>спільне</b> або <b>запасне / позичу</b>",
          "",
          "Після цього бот зможе показати, хто може допомогти."
        ]),
        { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
      );
    }
    return ctx.reply(
      joinRichLines([
        ...formatCardHeader("🤝 ХТО МОЖЕ ДОПОМОГТИ", gearName),
        "",
        formatGearCoverageNotice(coverage.matches),
        "",
        ...buildGearCoverageMatchLines(coverage.matches)
      ]),
      { parse_mode: "HTML", ...getCurrentTripGearAccountingKeyboard(ctx, groupService) }
    );
  });
  bot.command("myneeds", (ctx) => startMyNeedsWizard(ctx, groupService));
  bot.command("addfood", (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
    if (!trip) {
      return null;
    }
    if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
      return replyRestrictedTripSection(ctx, trip);
    }
    const [rawName, amountRaw, quantity, costRaw] = ctx.message.text.replace("/addfood", "").trim().split(";").map((part) => part?.trim());
    const nameValidation = validateGearItemName(rawName);
    const name = nameValidation.ok ? canonicalizeFoodName(nameValidation.value) : "";
    const amount = parseFoodAmountInput(amountRaw, inferFoodMeasureKind(name));
    const costValidation = validatePositiveMoney(String(costRaw || "").replace(",", "."));

    if (!nameValidation.ok || !amountRaw || !quantity || !costRaw || !amount || !costValidation.ok) {
      return ctx.reply("Формат: `/addfood гречка;800 г;2 пачки;180`", { parse_mode: "Markdown", ...getTripFoodMenuKeyboard(groupService, trip.id) });
    }

    groupService.addFood({
      groupId: trip.id,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      food: { name, amountLabel: amount.amountLabel, weightGrams: amount.weightGrams, quantity, cost: costValidation.value }
    });

    return ctx.reply(`✅ "${name}" додано в харчування походу.`, getTripFoodMenuKeyboard(groupService, trip.id));
  });
  bot.command("food", (ctx) => showTripFood(ctx, groupService, userService));
  bot.command("tripreminders", (ctx) => showTripReminders(ctx, groupService));
  bot.command("passport", (ctx) => showTripPassport(ctx, groupService, userService, advisorService));
  bot.action(/^faqctx:(.+)$/, async (ctx) => {
    const faqId = ctx.match?.[1] || "";
    await ctx.answerCbQuery();
    return ctx.reply(advisorService.getFaqAnswer(faqId));
  });
  bot.action("trip_sos_package", async (ctx) => {
    await ctx.answerCbQuery();
    return showTripSosPackage(ctx, groupService, userService);
  });
  bot.action("trip_safety_screen", async (ctx) => {
    await ctx.answerCbQuery();
    return showTripSafety(ctx, groupService);
  });
  bot.action(/^towner\|(a|d)\|([^|]+)$/, async (ctx) =>
    handleOrganizerTransferAction(ctx, groupService, userService, ctx.match?.[1] || "", ctx.match?.[2] || "")
  );
  bot.action(/^mtickets\|([^|]+)\|([^|]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const trip = groupService.getGroup(ctx.match?.[1] || "");
    if (!trip) {
      return ctx.reply("Активний похід не знайдено.", getMainKeyboard(ctx));
    }
    const member = trip.members.find((item) => String(item.id) === String(ctx.match?.[2] || ""));
    if (!member) {
      return ctx.reply("Учасника не знайдено в цьому поході.", getTripMembersKeyboard(trip, String(ctx.from.id)));
    }
    if (!canManageTripMemberTickets(trip, String(ctx.from.id), member.id)) {
      return ctx.reply("Тобі недоступні квитки цього учасника.");
    }
    return showTripMemberTickets(ctx, groupService, userService, trip, member.id);
  });
  bot.action(/^mtickets\|([^|]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const trip = groupService.findGroupByMember(String(ctx.from.id));
    if (!trip) {
      return ctx.reply("Активний похід не знайдено.", getMainKeyboard(ctx));
    }
    const member = trip.members.find((item) => String(item.id) === String(ctx.match?.[1] || ""));
    if (!member) {
      return ctx.reply("Учасника не знайдено в цьому поході.", getTripMembersKeyboard(trip, String(ctx.from.id)));
    }
    if (!canManageTripMemberTickets(trip, String(ctx.from.id), member.id)) {
      return ctx.reply("Тобі недоступні квитки цього учасника.");
    }
    return showTripMemberTickets(ctx, groupService, userService, trip, member.id);
  });
  bot.action(/^mstatus\|back$/, async (ctx) => handleTripMemberStatusBack(ctx, groupService, userService));
  bot.action(/^mstatus\|([^|]+)\|([^|]+)\|(going|thinking|not_going)$/, async (ctx) =>
    handleTripMemberStatusAction(ctx, groupService, userService, ctx.match?.[1] || "", ctx.match?.[2] || "", ctx.match?.[3] || "")
  );
  bot.action(/^mstatus\|([^|]+)\|(going|thinking|not_going)$/, async (ctx) => {
    const trip = groupService.findGroupByMember(String(ctx.from.id));
    if (!trip) {
      await ctx.answerCbQuery("Активний похід не знайдено.", { show_alert: true });
      return null;
    }
    return handleTripMemberStatusAction(ctx, groupService, userService, trip.id, ctx.match?.[1] || "", ctx.match?.[2] || "");
  }
  );
  bot.command("addexpense", (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null, String(ctx.from.id)));
    if (!trip) {
      return null;
    }
    if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
      return replyRestrictedTripSection(ctx, trip);
    }
    const [rawTitle, quantityRaw, priceRaw] = ctx.message.text.replace("/addexpense", "").trim().split(";").map((part) => part?.trim());
    const titleValidation = validateGearItemName(rawTitle);
    const title = titleValidation.ok ? canonicalizeExpenseTitle(titleValidation.value) : "";
    const quantityValidation = validatePositiveMoney(String(quantityRaw || "").replace(",", "."));
    const priceValidation = validatePositiveMoney(String(priceRaw || "").replace(",", "."));

    if (!titleValidation.ok || !quantityRaw || !priceRaw || !quantityValidation.ok || !priceValidation.ok) {
      return ctx.reply("Формат: `/addexpense Квиток Київ-Ворохта;1;450`", { parse_mode: "Markdown", ...getTripExpensesMenuKeyboard(groupService, trip.id) });
    }

    groupService.addExpense({
      groupId: trip.id,
      memberId: String(ctx.from.id),
      memberName: userService.getDisplayName(String(ctx.from.id), getUserLabel(ctx)),
      expense: {
        title,
        quantity: quantityValidation.value,
        price: priceValidation.value,
        amount: quantityValidation.value * priceValidation.value
      }
    });

    return ctx.reply(`✅ Витрату "${title}" додано.`, getTripExpensesMenuKeyboard(groupService, trip.id));
  });
  bot.command("expenses", (ctx) => showTripExpenses(ctx, groupService, userService));

  bot.hears("🌦 Погода", (ctx) => ctx.reply("Введи: `/weather Яремче`", { parse_mode: "Markdown", ...getMainKeyboard(ctx) }));
  bot.hears("🗺 Маршрути", (ctx) => showRoutesMenu(ctx));
  bot.hears("👥 Похід", (ctx) => showTripMenu(ctx, groupService));
  bot.hears(KEYBOARD_PLACEHOLDER, () => null);
  bot.hears(PROFILE_LABEL, (ctx) => showProfileMenu(ctx, userService));
  bot.hears(PROFILE_DASHBOARD_LABEL, (ctx) => showProfileDashboard(ctx, userService));
  bot.hears(PROFILE_ABOUT_LABEL, (ctx) => showProfileAbout(ctx, userService));
  bot.hears(PROFILE_MEDICAL_LABEL, (ctx) => showProfileMedicalCard(ctx, userService));
  bot.hears(PROFILE_AWARDS_LABEL, (ctx) => showProfileAwards(ctx, userService));
  bot.hears(PROFILE_EDIT_LABEL, (ctx) => startProfileEditWizard(ctx, userService));
  bot.hears(PROFILE_PHOTO_ALBUMS_LABEL, (ctx) => showProfilePhotoAlbumsMenu(ctx, groupService));
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
  bot.hears("📋 Деталі маршруту vpohid", (ctx) => showVpohidChosenRoute(ctx, routeService, vpohidLiveService));
  bot.hears("📍 Деталі маршруту vpohid", (ctx) => showVpohidChosenRoute(ctx, routeService, vpohidLiveService));
  bot.hears("🗺 Переглянути маршрут vpohid", (ctx) => showVpohidChosenRoute(ctx, routeService, vpohidLiveService));
  bot.hears("📄 GPX vpohid", (ctx) => sendVpohidRouteExport(ctx, routeService, vpohidLiveService, "gpx"));
  bot.hears("📄 KML vpohid", (ctx) => sendVpohidRouteExport(ctx, routeService, vpohidLiveService, "kml"));
  bot.hears("🔁 Змінити маршрут", (ctx) => {
    const selection = getVpohidSelection(ctx.from.id);
    const mode = selection?.mode || "routes";
    return mode === "trip" ? startVpohidSearchWizard(ctx, groupService, "trip") : startVpohidSearchWizard(ctx, groupService, "routes");
  });
  bot.hears(VPOHID_BACK_TO_TRIP_ROUTE_LABEL, (ctx) => showRouteMenu(ctx, groupService, advisorService));
  bot.hears(VPOHID_BACK_TO_ROUTES_LABEL, (ctx) => showRoutesMenu(ctx));
  bot.hears("👥 Учасники походу", (ctx) => showTripMembersMenu(ctx, groupService, userService));
  bot.hears("👤 Учасники походу", (ctx) => showTripMembersMenu(ctx, groupService, userService));
  bot.hears("📋 Список учасників", (ctx) => showTripMembers(ctx, groupService, userService));
  bot.hears(TRIP_SETTINGS_LABEL, (ctx) => showTripSettings(ctx, groupService));
  bot.hears(TRIP_TRANSFER_ORGANIZER_LABEL, (ctx) => startOrganizerTransferWizard(ctx, groupService, userService));
  bot.hears("✏️ Редагувати дані походу", (ctx) => handleTripDataAction(ctx, groupService));
  bot.hears(TRIP_DETAILS_BACK_LABEL, (ctx) => {
    const activeFlow = getFlow(String(ctx.from?.id));
    if (activeFlow?.type === "trip_member_ticket_manage") {
      return handleTripMemberTicketFlow(ctx, activeFlow, groupService, userService);
    }
    if (activeFlow?.type === "gear_edit") {
      return handleGearEditFlow(ctx, activeFlow, groupService, userService, bot.telegram);
    }
    if (activeFlow?.type === "my_gear_edit") {
      return handleMyGearEditFlow(ctx, activeFlow, userService);
    }
    if (activeFlow?.type === "borrowed_gear_manage") {
      return handleBorrowedGearManageFlow(ctx, activeFlow, groupService, userService, bot.telegram);
    }
    if (activeFlow?.type === "loaned_gear_manage") {
      return handleLoanedGearManageFlow(ctx, activeFlow, groupService, userService, bot.telegram);
    }
    if (activeFlow?.type === "trip_history") {
      return handleTripHistoryFlow(ctx, activeFlow, groupService, userService);
    }
    if (activeFlow?.type === "trip_hub") {
      return handleTripHubFlow(ctx, activeFlow, groupService, userService);
    }
    if (activeFlow?.type === "trip_member_list") {
      clearFlow(String(ctx.from.id));
      return showTripMembersMenu(ctx, groupService, userService);
    }
    if (getMenuContext(ctx.from?.id) === "trip-reminders") {
      return showTripSettings(ctx, groupService);
    }
    if (getMenuContext(ctx.from?.id) === "trip-settings") {
      return showTripMenu(ctx, groupService);
    }
    if (getMenuContext(ctx.from?.id) === "trip-gear-accounting") {
      clearFlow(String(ctx.from.id));
      return showTripGearMenu(ctx, groupService, advisorService);
    }
    if (getMenuContext(ctx.from?.id) === "trip-gear") {
      clearFlow(String(ctx.from.id));
      return showTripMenu(ctx, groupService);
    }
    if (getMenuContext(ctx.from?.id) === "trip_details") {
      return showTripMenu(ctx, groupService);
    }
    if (getMenuContext(ctx.from?.id) === "trip_details_linked") {
      return showTripMenu(ctx, groupService);
    }
    return null;
  });
  bot.hears("➕ Створити похід", (ctx) => {
    const activeTrip = groupService.findBlockingActiveGroupByMember(String(ctx.from.id));
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
  bot.hears("🗺 Маршрут походу", (ctx) => showRouteMenu(ctx, groupService, advisorService));
  bot.hears("📍 Маршрут походу", (ctx) => showRouteMenu(ctx, groupService, advisorService));
  bot.hears("📄 GPX трек", (ctx) => sendRouteExport(ctx, groupService, routeService, "gpx"));
  bot.hears("📄 KML трек", (ctx) => sendRouteExport(ctx, groupService, routeService, "kml"));
  bot.hears("🗺 HTML карта треку", (ctx) => sendRouteExport(ctx, groupService, routeService, "html"));
  bot.hears("🧭 HTML карта треку", (ctx) => sendRouteExport(ctx, groupService, routeService, "html"));
  bot.hears("🎒 Спорядження походу", (ctx) => showTripGearMenu(ctx, groupService, advisorService));
  bot.hears("🍲 Харчування походу", (ctx) => showTripFoodMenu(ctx, groupService));
  bot.hears(TRIP_PHOTOS_LABEL, (ctx) => showTripPhotosMenu(ctx, groupService));
  bot.hears(TRIP_PHOTOS_ADD_LABEL, (ctx) => startTripPhotoAddWizard(ctx, groupService));
  bot.hears(TRIP_PHOTO_ALBUM_LABEL, (ctx) => showTripPhotoAlbum(ctx, groupService, bot.telegram));
  bot.hears("💸 Витрати походу", (ctx) => showTripExpensesMenu(ctx, groupService));
  bot.hears(TRIP_DETAILS_LABEL, (ctx) => showTripPassport(ctx, groupService, userService, advisorService));
  bot.hears("🪪 Паспорт походу", (ctx) => showTripPassport(ctx, groupService, userService, advisorService));
  bot.hears("🔔 Нагадування", (ctx) => showTripReminders(ctx, groupService));
  bot.hears(TRIP_REMINDERS_ENABLE_LABEL, (ctx) => toggleTripReminders(ctx, groupService, true));
  bot.hears(TRIP_REMINDERS_DISABLE_LABEL, (ctx) => toggleTripReminders(ctx, groupService, false));
  bot.hears("🆘 Безпека походу", (ctx) => showTripSafety(ctx, groupService));
  bot.hears(TRIP_SOS_LABEL, (ctx) => showTripSosPackage(ctx, groupService, userService));
  bot.hears("🌦 Погода походу", (ctx) => {
    const trip = requireTrip(ctx, groupService, getTripKeyboard(null));
    if (!trip) {
      return null;
    }
    if (isTripMemberAutoExcluded(trip, String(ctx.from.id))) {
      return replyRestrictedTripSection(ctx, trip);
    }
    const settlements = getTripWeatherSettlements(trip);
    if (!settlements.length) {
      return ctx.reply("Для походу ще не задано регіон або маршрут.", getTripKeyboard(trip, String(ctx.from.id)));
    }
    if (settlements.length > 1) {
      return startTripWeatherSelection(ctx, groupService);
    }
    return showWeather(ctx, weatherService, settlements[0], getTripKeyboard(trip, String(ctx.from.id)), advisorService, { trip });
  });
  bot.hears("✅ Завершити похід", (ctx) => startFinishTripConfirm(ctx, groupService));
  bot.hears(CANCEL_TRIP_LABEL, (ctx) => startFinishTripConfirm(ctx, groupService, "cancel"));
  bot.hears(FINISH_TRIP_YES_LABEL, (ctx) => handleFinishTripConfirmFlow(ctx, getFlow(String(ctx.from.id)) || { type: "finish_trip_confirm" }, groupService, userService, bot.telegram));
  bot.hears(FINISH_TRIP_NO_LABEL, (ctx) => handleFinishTripConfirmFlow(ctx, getFlow(String(ctx.from.id)) || { type: "finish_trip_confirm" }, groupService, userService, bot.telegram));
  bot.hears("📌 Задати маршрут походу", (ctx) => startRouteWizard(ctx, groupService, "create"));
  bot.hears("🧭 Згенерувати власний маршрут", (ctx) => startRouteWizard(ctx, groupService, groupService.findGroupByMember(String(ctx.from.id))?.routePlan ? "edit" : "create"));
  bot.hears(ROUTE_CHANGE_LABEL, (ctx) => showTripRouteChangeMenu(ctx, groupService));
  bot.hears("✏️ Редагувати маршрут походу", (ctx) => showTripRouteChangeMenu(ctx, groupService));
  bot.hears("🗺 Переглянути маршрут походу", (ctx) => showRouteReport(ctx, groupService, routeService, vpohidLiveService));
  bot.hears("🧭 Переглянути маршрут походу", (ctx) => showRouteReport(ctx, groupService, routeService, vpohidLiveService));
  bot.hears("➕ Додати моє спорядження", (ctx) => startMyGearAddWizard(ctx));
  bot.hears("✏️ Редагувати моє спорядження", (ctx) => startMyGearEditWizard(ctx, userService));
  bot.hears("📦 Моє спорядження", (ctx) => showMyGear(ctx, userService));
  bot.hears("🫕 Додати спільне", (ctx) => startGearAddWizard(ctx, groupService, "shared"));
  bot.hears("🎒 Додати особисте", (ctx) => startGearAddWizard(ctx, groupService, "personal"));
  bot.hears("🧰 Додати запасне / позичу", (ctx) => startGearAddWizard(ctx, groupService, "spare"));
  bot.hears(GEAR_NEED_CREATE_LABEL, (ctx) => startGearNeedWizard(ctx, groupService));
  bot.hears(TRIP_GEAR_ADD_LABEL, (ctx) => showTripGearAddMenu(ctx, groupService));
  bot.hears(TRIP_GEAR_ADD_BACK_LABEL, (ctx) => {
    clearFlow(String(ctx.from.id));
    return showTripGearMenu(ctx, groupService, advisorService);
  });
  bot.hears(TRIP_GEAR_VIEW_ALL_LABEL, (ctx) => showTripGear(ctx, groupService));
  bot.hears("📦 Переглянути все", (ctx) => showTripGear(ctx, groupService));
  bot.hears(TRIP_GEAR_ACCOUNTING_LABEL, (ctx) => showTripGearAccountingMenu(ctx, groupService));
  bot.hears("📋 Запити та облік спорядження", (ctx) => showTripGearAccountingMenu(ctx, groupService));
  bot.hears(GEAR_MY_REQUESTS_LABEL, (ctx) => startMyNeedsWizard(ctx, groupService));
  bot.hears("📋 Мої запити", (ctx) => startMyNeedsWizard(ctx, groupService));
  bot.hears(GEAR_BORROWED_LABEL, (ctx) => showBorrowedGear(ctx, groupService));
  bot.hears(GEAR_LOANED_LABEL, (ctx) => showLoanedOutGear(ctx, groupService));
  bot.hears("✏️ Редагувати спорядження", (ctx) => startGearEditWizard(ctx, groupService));
  bot.hears("🥘 Додати продукт", (ctx) => startFoodAddWizard(ctx, groupService));
  bot.hears("🗑 Видалити продукт", (ctx) => startFoodDeleteWizard(ctx, groupService));
  bot.hears("🧾 Переглянути все харчування", (ctx) => showTripFood(ctx, groupService, userService));
  bot.hears("⚖️ Вага рюкзака", (ctx) => showBackpackWeight(ctx, groupService, userService));
  bot.hears("🎒 Вага рюкзака", (ctx) => showBackpackWeight(ctx, groupService, userService));
  bot.hears("💸 Додати витрату", (ctx) => startExpenseAddWizard(ctx, groupService));
  bot.hears("🗑 Видалити витрату", (ctx) => startExpenseDeleteWizard(ctx, groupService));
  bot.hears("🧾 Переглянути всі витрати", (ctx) => showTripExpenses(ctx, groupService, userService));
  bot.hears("⬅️ До походу", (ctx) => showTripMenu(ctx, groupService));
  bot.hears(TRIP_LIST_BACK_LABEL, (ctx) => showTripMenu(ctx, groupService));
  bot.hears("⬅️ Головне меню", (ctx) => {
    clearFlow(String(ctx.from.id));
    return sendHome(ctx, userService);
  });
  bot.hears("❌ Скасувати", async (ctx) => {
    const activeFlow = getFlow(String(ctx.from.id));
    const menuContext = getMenuContext(ctx.from.id);

    if (activeFlow?.type === "route") {
      return handleRouteFlow(ctx, activeFlow, groupService, routeService, userService, bot.telegram);
    }

    if (activeFlow?.type === "trip_card") {
      return handleTripCardFlow(ctx, activeFlow, groupService, userService, bot.telegram);
    }

    if (activeFlow?.type === "vpohid_search") {
      return handleVpohidSearchFlow(ctx, activeFlow, vpohidLiveService, routeService, groupService, userService, bot.telegram);
    }

    if (activeFlow?.type === "join_trip") {
      clearFlow(String(ctx.from.id));
      return sendHome(ctx, userService);
    }

    if (activeFlow?.type === "borrowed_gear_manage" && activeFlow.step === "action") {
      const trip = groupService.findGroupByMember(String(ctx.from.id));
      const items = trip
        ? groupService.getBorrowedGearForMember(trip.id, String(ctx.from.id)).map((item, index) => ({
            ...item,
            actionLabel: `${index + 1}. ${truncateButtonLabel(item.gearName, 20)}`
          }))
        : [];

      activeFlow.step = "pick";
      delete activeFlow.data.item;
      activeFlow.data.items = items;
      setFlow(String(ctx.from.id), activeFlow);

      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("🫴 В КОРИСТУВАННІ", trip?.name || "Похід"),
          "",
          "Обери річ, яку хочеш переглянути або повернути власнику."
        ]),
        { parse_mode: "HTML", ...getBorrowedGearItemsKeyboard(items) }
      );
    }

    if (activeFlow?.type === "gear_edit" && activeFlow.step === "delete_confirm" && activeFlow.data?.item) {
      activeFlow.step = "action";
      setFlow(String(ctx.from.id), activeFlow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("✏️ РЕДАГУВАТИ СПОРЯДЖЕННЯ", activeFlow.data.item.name),
          "",
          `Тип: ${getTripGearScopeLabel(activeFlow.data.item)}`,
          `Поточна кількість: ${activeFlow.data.item.quantity}`,
          activeFlow.data.item.memberName ? `Додав: ${activeFlow.data.item.memberName}` : null,
          "",
          "Що хочеш зробити з цією позицією?"
        ].filter(Boolean)),
        { parse_mode: "HTML", ...getTripGearEditActionKeyboard() }
      );
    }

    if (activeFlow?.type === "gear_edit" && ["quantity", "scope", "field"].includes(activeFlow.step)) {
      return handleGearEditFlow(ctx, activeFlow, groupService, userService, bot.telegram);
    }

    if (activeFlow?.type === "my_gear_edit" && activeFlow.step === "delete_confirm" && activeFlow.data?.item) {
      activeFlow.step = "action";
      setFlow(String(ctx.from.id), activeFlow);
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("✏️ РЕДАГУВАТИ МОЄ СПОРЯДЖЕННЯ", activeFlow.data.item.name),
          "",
          `Поточна кількість: ${activeFlow.data.item.quantity}`,
          "",
          "Що хочеш зробити з цією річчю?"
        ]),
        { parse_mode: "HTML", ...getTripGearEditActionKeyboard() }
      );
    }

    if (activeFlow?.type === "my_gear_edit" && ["quantity", "field"].includes(activeFlow.step)) {
      return handleMyGearEditFlow(ctx, activeFlow, userService);
    }

    if (activeFlow?.type === "gear_need_manage" && activeFlow.step === "cancel_confirm" && activeFlow.data?.need) {
      activeFlow.step = "action";
      setFlow(String(ctx.from.id), activeFlow);
      const matchState = getGearNeedMatchState(groupService, activeFlow.tripId, activeFlow.data.need, String(ctx.from.id));
      return ctx.reply(
        joinRichLines([
          ...formatCardHeader("📋 МОЇ ЗАПИТИ", activeFlow.data.need.name),
          "",
          ...formatGearNeedSummaryLines(activeFlow.data.need),
          "",
          ...buildGearNeedActionStatusLines(matchState),
          "",
          "Що хочеш зробити з цим запитом?"
        ]),
        { parse_mode: "HTML", ...getMyGearNeedActionKeyboard(activeFlow.data.need, matchState) }
      );
    }

    clearFlow(String(ctx.from.id));

    if (activeFlow?.type === "faq_menu") {
      return sendHome(ctx, userService);
    }

    if (activeFlow?.type === "help_menu") {
      return sendHome(ctx, userService);
    }

    if (activeFlow?.type === "profile_edit") {
      return handleProfileEditFlow(ctx, activeFlow, userService);
    }

    if (activeFlow?.type === "my_gear_add" || activeFlow?.type === "my_gear_edit") {
      return showMyGearMenu(ctx);
    }

    if (activeFlow?.type === "trip_member_list") {
      return showTripMembersMenu(ctx, groupService, userService);
    }

    if (activeFlow?.type === "grant_access") {
      return showTripSettings(ctx, groupService);
    }

    if (activeFlow?.type === "transfer_organizer") {
      return showTripSettings(ctx, groupService);
    }

    if (activeFlow?.type === "trip_photo_add") {
      return showTripPhotosMenu(ctx, groupService);
    }

    if (activeFlow?.type === "gear_need" || activeFlow?.type === "gear_need_manage") {
      return showTripGearAccountingMenu(ctx, groupService);
    }

    if (activeFlow?.type === "gear_add" || activeFlow?.type === "gear_edit" || activeFlow?.type === "gear_delete") {
      return ctx.reply("<b>❌ Дію скасовано</b>", { parse_mode: "HTML", ...getCurrentTripGearKeyboard(ctx, groupService) });
    }

    if (activeFlow?.type === "food_add" || activeFlow?.type === "food_delete") {
      return ctx.reply("<b>❌ Дію скасовано</b>", { parse_mode: "HTML", ...getTripFoodMenuKeyboard(groupService, activeFlow.tripId) });
    }

    if (activeFlow?.type === "expense_add" || activeFlow?.type === "expense_delete") {
      return ctx.reply("<b>❌ Дію скасовано</b>", { parse_mode: "HTML", ...getTripExpensesMenuKeyboard(groupService, activeFlow.tripId) });
    }

    if (menuContext === "trip-route-catalog") {
      return showRouteMenu(ctx, groupService, advisorService);
    }

    if (menuContext === "routes-catalog") {
      return showRoutesMenu(ctx);
    }

    if (menuContext === "trip-gear-accounting") {
      return showTripGearAccountingMenu(ctx, groupService);
    }

    if (menuContext === "trip-gear-add" || menuContext === "trip-gear") {
      return showTripGearMenu(ctx, groupService, advisorService);
    }

    if (menuContext === "trip-photos") {
      return showTripPhotosMenu(ctx, groupService);
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

  bot.on("photo", async (ctx) => {
    const flow = getFlow(String(ctx.from.id));
    if (flow?.type === "trip_member_ticket_manage" && flow.step === "upload") {
      await handleTripMemberTicketMedia(ctx, flow, groupService, userService);
      return;
    }
    if (flow?.type === "trip_photo_add") {
      await handleTripPhotoMessage(ctx, flow, groupService, userService, bot.telegram);
    }
  });

  bot.on("document", async (ctx) => {
    const flow = getFlow(String(ctx.from.id));
    if (flow?.type === "trip_member_ticket_manage" && flow.step === "upload") {
      await handleTripMemberTicketMedia(ctx, flow, groupService, userService);
    }
  });

  bot.catch(async (error, ctx) => {
    console.error("Unhandled error while processing", ctx?.update, error);

    try {
      const message = String(error?.message || "");
      if (message.toLowerCase().includes("message is too long")) {
        await ctx.reply(
          "Не вдалося показати все в одному повідомленні. Ми вже розбили довгі екрани безпечніше, спробуй ще раз.",
          getMainKeyboard(ctx)
        );
        return;
      }

      await ctx.reply(
        "Сталася помилка під час обробки дії. Спробуй ще раз.",
        getMainKeyboard(ctx)
      );
    } catch {
      // Ignore secondary reply errors inside catch handler.
    }
  });

  return bot;
}

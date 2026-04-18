import { canonicalizeFoodName } from "../data/foodCatalog.js";

const OCR_TIMEOUT_MS = 90000;
const OCR_PROCESS_BUDGET_MS = 30000;
const MAX_REASONABLE_RECEIPT_YEAR = new Date().getUTCFullYear() + 1;
const RECEIPT_ITEM_CANONICAL_RULES = [
  { pattern: /(ковбас|kovbac|kosaca|ko6aca|kobaca)/i, value: "Ковбаса" },
  { pattern: /(петруш|petru|tpyuk|leтpyuk|петрук)/i, value: "Петрушка" },
  { pattern: /(цибул|cибул|uibul|зелена78|зелена)/i, value: "Цибуля" },
  { pattern: /(моркв|mopkva|morkva)/i, value: "Морква" },
  { pattern: /(горош|opouok|gorow|гopoш)/i, value: "Горошок" },
  { pattern: /(яйц|яиц|яйчик|яицк|яцик)/i, value: "Яйця" },
  { pattern: /(консерв|koncepb|koncepb)/i, value: "Консерви" },
  { pattern: /(огір|orik|orir|or1pk|огipк)/i, value: "Огірки" },
  { pattern: /(прованс|provan|майонез)/i, value: "Провансаль" }
];

function normalizeLine(value = "") {
  return String(value || "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function extractLines(text = "") {
  return String(text || "")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter((line) => line.length >= 2);
}

function extractDate(text = "") {
  const patterns = [
    /\b(\d{2}[./-]\d{2}[./-]\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)\b/g,
    /\b(\d{4}[./-]\d{2}[./-]\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)\b/g
  ];

  let best = "";
  let bestScore = -Infinity;
  for (const pattern of patterns) {
    for (const match of String(text || "").matchAll(pattern)) {
      const candidate = normalizeReceiptDateCandidate(match[1]);
      const score = scoreReceiptDateCandidate(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }

  return bestScore > 0 ? best : "";
}

function normalizeReceiptDateCandidate(value = "") {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }

  const [datePart, timePart] = candidate.split(/\s+/, 2);
  const parts = datePart.split(/[./-]/);
  if (parts.length !== 3) {
    return candidate;
  }

  const normalizedParts = parts.map((part, index) => {
    let cleaned = String(part || "").replace(/[OoОоD]/g, "0").replace(/[Il|]/g, "1");
    if (index === 1) {
      const numeric = Number.parseInt(cleaned, 10);
      if (!Number.isFinite(numeric) || numeric < 1 || numeric > 12) {
        cleaned = cleaned.replace(/^[689]/, "0");
      }
    }
    if (index === 2 && cleaned.length === 4) {
      cleaned = normalizeReceiptYear(cleaned);
    }
    return cleaned;
  });

  const separator = datePart.includes(".") ? "." : datePart.includes("/") ? "/" : "-";
  return [normalizedParts.join(separator), timePart].filter(Boolean).join(" ").trim();
}

function normalizeReceiptYear(value = "") {
  let year = String(value || "").replace(/[OoОоD]/g, "0").replace(/[Il|]/g, "1");
  if (!/^\d{4}$/.test(year)) {
    return year;
  }

  const numeric = Number.parseInt(year, 10);
  if (numeric <= MAX_REASONABLE_RECEIPT_YEAR) {
    return year;
  }

  const chars = year.split("");
  if (chars[0] === "2" && ["6", "8", "9"].includes(chars[1])) {
    chars[1] = "0";
  } else if (chars[0] === "7") {
    chars[0] = "2";
  }

  const normalized = chars.join("");
  const normalizedNumeric = Number.parseInt(normalized, 10);
  return normalizedNumeric <= MAX_REASONABLE_RECEIPT_YEAR ? normalized : year;
}

function scoreReceiptDateCandidate(candidate = "") {
  const [datePart, timePart] = String(candidate || "").split(/\s+/, 2);
  const parts = datePart.split(/[./-]/).map((item) => Number.parseInt(item, 10));
  if (parts.length !== 3) {
    return -1000;
  }

  const dayFirst = /^\d{2}[./-]/.test(datePart);
  const [first, second, third] = parts;
  const day = dayFirst ? first : third;
  const month = second;
  const year = dayFirst ? third : first;
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return -1000;
  }

  let score = 0;
  if (year >= 2000 && year <= MAX_REASONABLE_RECEIPT_YEAR) {
    score += 120;
  } else if (year >= 1900 && year <= MAX_REASONABLE_RECEIPT_YEAR + 10) {
    score += 40;
  } else {
    score -= 100;
  }
  if (timePart && /\d{2}:\d{2}/.test(timePart)) {
    score += 40;
  }

  return score;
}

function parseMoneyCandidate(raw = "") {
  const normalized = String(raw || "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

function extractAllAmounts(lines = []) {
  const amounts = [];
  const amountPattern = /(\d{1,6}(?:[.,]\d{2}))/g;

  for (const line of lines) {
    const matches = line.match(amountPattern) || [];
    for (const match of matches) {
      const value = parseMoneyCandidate(match);
      if (value > 0) {
        amounts.push({ raw: match, value, line });
      }
    }
  }

  return amounts;
}

function extractTotal(lines = []) {
  const totalPattern = /(сума|разом|всього|до сплати|сплатити|итого|підсумок|total|sum)/i;
  const excludedAmountLine = /(готівка|решта|податку|пдв)/i;
  const amounts = extractAllAmounts(lines);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!totalPattern.test(line)) {
      continue;
    }

    const combined = [line, lines[index + 1], lines[index + 2]].filter(Boolean).join(" ");
    const directMatch = combined.match(/(?:сума|разом|всього|до сплати|сплатити|итого|підсумок|total|sum)[^\d]{0,30}(\d{1,6}(?:[.,]\d{2}))/i);
    if (directMatch?.[1]) {
      const directValue = parseMoneyCandidate(directMatch[1]);
      if (directValue > 0) {
        return directValue;
      }
    }

    const lineAmounts = (combined.match(/(\d{1,6}(?:[.,]\d{2}))/g) || [])
      .map((item) => parseMoneyCandidate(item))
      .filter((item) => item > 0);

    if (lineAmounts.length) {
      return lineAmounts[0];
    }
  }

  const cashChangeTotal = extractCashChangeTotal(lines);
  if (cashChangeTotal > 0) {
    return cashChangeTotal;
  }

  const tailAmounts = amounts
    .filter((item) => lines.slice(-12).includes(item.line))
    .filter((item) => !excludedAmountLine.test(item.line))
    .map((item) => item.value);
  if (tailAmounts.length) {
    return Math.max(...tailAmounts);
  }

  if (!amounts.length) {
    return 0;
  }

  return Math.max(...amounts.map((item) => item.value));
}

function extractCashChangeTotal(lines = []) {
  const cashLine = lines.find((line) => /готівка/i.test(line));
  const changeLine = lines.find((line) => /решта/i.test(line));
  if (!cashLine || !changeLine) {
    return 0;
  }

  const cash = Math.max(...((cashLine.match(/(\d{1,6}(?:[.,]\d{2}))/g) || []).map((item) => parseMoneyCandidate(item))), 0);
  const change = Math.max(...((changeLine.match(/(\d{1,6}(?:[.,]\d{2}))/g) || []).map((item) => parseMoneyCandidate(item))), 0);
  if (cash > 0 && change >= 0 && cash > change) {
    return Number((cash - change).toFixed(2));
  }

  return 0;
}

function extractVat(lines = []) {
  const results = [];

  for (let index = 0; index < lines.length; index += 1) {
    const combined = [lines[index], lines[index + 1]].filter(Boolean).join(" ");
    if (!/(?:\bпдв\b|\bvat\b|податк)/i.test(combined)) {
      continue;
    }

    const rateMatch = combined.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i);
    const amountMatches = [...combined.matchAll(/(\d{1,6}(?:[.,]\d{2}))/g)];
    const amount = amountMatches.length ? parseMoneyCandidate(amountMatches[amountMatches.length - 1][1]) : 0;
    const rate = rateMatch ? Number.parseFloat(rateMatch[1].replace(",", ".")) : 0;
    if (amount <= 0 || (!rate && amountMatches.length < 2)) {
      continue;
    }

    const key = `${rate || 0}:${amount.toFixed(2)}`;
    if (results.some((item) => `${item.rate || 0}:${item.amount.toFixed(2)}` === key)) {
      continue;
    }

    results.push({ rate, amount });
  }

  const total = Number(results.reduce((sum, item) => sum + (Number(item.amount) || 0), 0).toFixed(2));
  return {
    total,
    entries: results
  };
}

function sanitizeMerchant(value = "") {
  const sanitized = normalizeLine(value)
    .replace(/^[^A-Za-zА-Яа-яІіЇїЄєҐґ]+/, "")
    .replace(/[|\\/_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const trimmed = sanitized.split(/(?:вул\.?|вулиця|м\.|місто|адреса)/i)[0] || sanitized;
  return trimmed
    .replace(/\s+[A-Za-zА-Яа-яІіЇїЄєҐґ]$/, "")
    .trim();
}

function normalizeOcrMerchantKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[|'"`’"]/g, "")
    .replace(/0/g, "о")
    .replace(/3/g, "з")
    .replace(/6/g, "б")
    .replace(/8/g, "в")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function extractKnownMerchant(lines = []) {
  const joined = normalizeOcrMerchantKey(lines.slice(0, 8).join(" "));
  if (joined.includes("кишен")) {
    return "Велика Кишеня";
  }

  const knownPatterns = [
    { pattern: /велик[а-яіїєґ]*кишен/, value: "Велика Кишеня" },
    { pattern: /сільп[о0]/, value: "Сільпо" },
    { pattern: /атб/, value: "АТБ" },
    { pattern: /novus|новус/, value: "NOVUS" },
    { pattern: /ашан|auchan/, value: "Ашан" },
    { pattern: /metro|метро/, value: "METRO" }
  ];

  const matched = knownPatterns.find((item) => item.pattern.test(joined));
  return matched?.value || "";
}

function scoreMerchantLine(value = "") {
  const sanitized = sanitizeMerchant(value);
  if (!sanitized) {
    return -1000;
  }

  const letters = (sanitized.match(/[A-Za-zА-Яа-яІіЇїЄєҐґ]/g) || []).length;
  const digits = (sanitized.match(/\d/g) || []).length;
  const weird = (sanitized.match(/[^A-Za-zА-Яа-яІіЇїЄєҐґ\d\s"'().,-]/g) || []).length;

  let score = letters * 3 - digits * 4 - weird * 5;
  if (/тов|магаз|маркет|сільпо|атб|кишен/i.test(sanitized)) {
    score += 25;
  }
  if (letters < 5) {
    score -= 20;
  }

  return score;
}

function extractMerchant(lines = []) {
  const knownMerchant = extractKnownMerchant(lines);
  if (knownMerchant) {
    return knownMerchant;
  }

  const excluded = /(сума|разом|всього|чек|касир|термінал|терминал|дата|час|рн|єдрпоу|фн|зн|пдв|subtotal|total|готівка|решта)/i;
  const topLines = lines.slice(0, 6)
    .map((line) => sanitizeMerchant(line))
    .filter((line) => line && !excluded.test(line) && !/\d{5,}/.test(line));

  const candidates = [];
  for (const line of topLines) {
    candidates.push({ value: line, score: scoreMerchantLine(line) });
  }
  for (let index = 0; index < topLines.length - 1; index += 1) {
    const merged = sanitizeMerchant(`${topLines[index]} ${topLines[index + 1]}`);
    candidates.push({ value: merged, score: scoreMerchantLine(merged) - 5 });
  }

  const best = candidates.sort((left, right) => right.score - left.score)[0];
  return best?.score > 0 ? best.value : "";
}

function sanitizePositionTitle(value = "") {
  return normalizeLine(value)
    .replace(/^\d{4,}[-.: ]+/, "")
    .replace(/^[A-Za-zА-Яа-яІіЇїЄєҐґ]{0,2}\d{2,}[-.: ]+/u, "")
    .replace(/^\d+[.,]\d+\s*[xх×]\s*/iu, "")
    .replace(/\s+\d{1,6}(?:[.,]\d{2})\s*[AА]?$/u, "")
    .replace(/\s*[AА]$/u, "")
    .replace(/[|]+/g, " ")
    .trim();
}

function normalizeReceiptItemKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[|'"`’"]/g, "")
    .replace(/0/g, "о")
    .replace(/3/g, "з")
    .replace(/6/g, "б")
    .replace(/8/g, "в")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function cleanupReceiptItemTitle(value = "") {
  const cleaned = sanitizePositionTitle(value)
    .replace(/\b\d{1,4}\s*(?:г|гр|kg|кг|ml|мл|л|шт)\b/giu, "")
    .replace(/\b[ABCDАВСD]\b/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  const key = normalizeReceiptItemKey(cleaned);
  const byRule = RECEIPT_ITEM_CANONICAL_RULES.find((item) => item.pattern.test(key));
  if (byRule) {
    return byRule.value;
  }

  const foodCanonical = canonicalizeFoodName(cleaned);
  if (foodCanonical && foodCanonical !== cleaned && !/\d/.test(foodCanonical) && foodCanonical.length <= cleaned.length + 8) {
    return foodCanonical;
  }

  return cleaned;
}

function extractTrailingAmount(line = "") {
  const matches = [...String(line || "").matchAll(/(\d{1,6}(?:[.,]\d{2}))/g)];
  if (!matches.length) {
    return null;
  }

  const match = matches[matches.length - 1];
  const amount = parseMoneyCandidate(match[1]);
  if (amount <= 0) {
    return null;
  }

  return {
    amount,
    raw: match[1],
    index: Number(match.index) || String(line || "").lastIndexOf(match[1])
  };
}

function isLikelyPositionTitle(value = "") {
  const title = sanitizePositionTitle(value);
  const letters = (title.match(/[A-Za-zА-Яа-яІіЇїЄєҐґ]/g) || []).length;
  const digits = (title.match(/\d/g) || []).length;
  const weird = (title.match(/[^A-Za-zА-Яа-яІіЇїЄєҐґ\d\s"'().,%/-]/g) || []).length;
  if (letters < 5) {
    return false;
  }
  if (weird > Math.max(2, Math.floor(letters / 3))) {
    return false;
  }
  if (digits > letters) {
    return false;
  }
  if (/(сума|разом|всього|до сплати|итого|total|sum|готівка|решта|пдв|податку|знижк|кас[а-я]*|kacc|касса|касир|чек|вул|героїв|дніпра|тов|пн\.?|звертай|безкоштов|мартинов|володим|артикул)/i.test(title)) {
    return false;
  }
  return true;
}

function mergePositionCandidates(items = [], limit = 12) {
  const bestByKey = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const title = cleanupReceiptItemTitle(item?.title || "");
    const amount = Number(item?.amount) || 0;
    if (!title || amount <= 0 || !isLikelyPositionTitle(title)) {
      continue;
    }

    const key = `${title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}::${amount.toFixed(2)}`;
    const words = title.split(/\s+/).filter(Boolean);
    const mixedWords = words.filter((word) => /[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(word) && /\d/.test(word)).length;
    const shortWords = words.filter((word) => word.length <= 2).length;
    const quality =
      title.length * 2 +
      ((title.match(/[А-Яа-яІіЇїЄєҐґ]/g) || []).length * 2) -
      ((title.match(/[^A-Za-zА-Яа-яІіЇїЄєҐґ\d\s"'().,%/-]/g) || []).length * 8) -
      mixedWords * 10 -
      shortWords * 3 -
      (/(кас[а-я]*|kacc|касса|касир|чек|вул|героїв|дніпра|тов|пн\.?|звертай|безкоштов|мартинов|володим|артикул)/i.test(title) ? 80 : 0);
    const current = bestByKey.get(key);

    if (!current || quality > current.quality) {
      bestByKey.set(key, {
        title,
        amount,
        quality
      });
    }
  }

  return Array.from(bestByKey.values())
    .sort((left, right) => right.quality - left.quality || right.amount - left.amount)
    .slice(0, limit)
    .map(({ title, amount }) => ({ title, amount }));
}

function extractPositions(lines = []) {
  const result = [];
  const consumedIndexes = new Set();
  const linePattern = /^(.+?)\s+(\d{1,6}(?:[.,]\d{2}))\s*[AА]?$/u;

  for (let index = 0; index < lines.length; index += 1) {
    if (consumedIndexes.has(index)) {
      continue;
    }
    const line = normalizeLine(lines[index]);

    const quantityAmountMatch = line.match(/^(\d+[.,]\d+\s*[xх×]|[xх×]\s*\d+[.,]\d+).*?(\d{1,6}(?:[.,]\d{2}))\s*[AА]?$/iu);
    const nextLine = normalizeLine(lines[index + 1] || "");
    if (quantityAmountMatch && nextLine && isLikelyPositionTitle(nextLine)) {
      const title = sanitizePositionTitle(nextLine);
      const normalizedTitle = cleanupReceiptItemTitle(title);
      const amount = parseMoneyCandidate(quantityAmountMatch[2]);
      if (amount > 0) {
        result.push({ title: normalizedTitle || title, amount });
        consumedIndexes.add(index + 1);
        if (result.length >= 8) {
          break;
        }
      }
      continue;
    }

    const trailingAmount = extractTrailingAmount(line);
    const previousLine = normalizeLine(lines[index - 1] || "");
    if (trailingAmount && trailingAmount.index >= Math.floor(line.length * 0.45)) {
      const ownTitle = sanitizePositionTitle(line.slice(0, trailingAmount.index));
      const previousLooksLikeTitle = previousLine && isLikelyPositionTitle(previousLine);
      const previousHasTooManyDigits = ((previousLine.match(/\d/g) || []).length) > 4;
      const ownLooksStrong =
        ownTitle &&
        !/^\d+[A-Za-zА-Яа-яІіЇїЄєҐґ]{0,3}$/u.test(ownTitle) &&
        isLikelyPositionTitle(ownTitle);

      if (ownLooksStrong) {
        result.push({ title: cleanupReceiptItemTitle(ownTitle) || ownTitle, amount: trailingAmount.amount });
        continue;
      }

      if (previousLooksLikeTitle && !previousHasTooManyDigits && ownTitle.length <= 12) {
        const mergedTitle = sanitizePositionTitle([previousLine, ownTitle].filter(Boolean).join(" "));
        if (isLikelyPositionTitle(mergedTitle)) {
          result.push({ title: cleanupReceiptItemTitle(mergedTitle) || mergedTitle, amount: trailingAmount.amount });
          consumedIndexes.add(index - 1);
          continue;
        }
      }
    }

    const nextTrailingAmount = extractTrailingAmount(nextLine);
    if (nextTrailingAmount && isLikelyPositionTitle(line)) {
      const nextPrefix = sanitizePositionTitle(nextLine.slice(0, nextTrailingAmount.index));
      const mergedTitle = sanitizePositionTitle([line, nextPrefix.length <= 12 ? nextPrefix : ""].filter(Boolean).join(" "));
      if (isLikelyPositionTitle(mergedTitle)) {
        result.push({ title: cleanupReceiptItemTitle(mergedTitle) || mergedTitle, amount: nextTrailingAmount.amount });
        consumedIndexes.add(index + 1);
        if (result.length >= 8) {
          break;
        }
        continue;
      }
    }

    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const title = sanitizePositionTitle(match[1]);
    const amount = parseMoneyCandidate(match[2]);
    if (!title || amount <= 0 || !isLikelyPositionTitle(title)) {
      continue;
    }

    result.push({ title: cleanupReceiptItemTitle(title) || title, amount });
    if (result.length >= 8) {
      break;
    }
  }

  return mergePositionCandidates(result);
}

function scoreResult(result = {}) {
  const rawText = String(result.rawText || "").toLowerCase();
  const merchant = String(result.merchant || "");
  let score = 0;

  score += Math.round(Number(result.confidence) || 0);

  if (result.total > 0) {
    score += 60;
  }
  if (result.total >= 50) {
    score += 30;
  }
  if (result.date) {
    score += 20;
  }
  if (merchant.replace(/[^A-Za-zА-Яа-яІіЇїЄєҐґ]/g, "").length >= 8) {
    score += 35;
  }
  score += (Array.isArray(result.positions) ? result.positions.length : 0) * 12;

  if (rawText.includes("сума")) {
    score += 25;
  }
  if (rawText.includes("чек")) {
    score += 10;
  }

  return score;
}

async function buildReceiptVariants(filePath) {
  const sharp = await loadSharp();
  const prepared = sharp(filePath, { failOn: "none" }).rotate().trim();
  const metadata = await prepared.metadata();
  const targetWidth = Math.max(Number(metadata.width) || 0, 1200);
  const base = prepared.resize({ width: targetWidth, withoutEnlargement: false });

  return [
    {
      name: "normalized",
      input: await renderReceiptVariant(base, "normalized")
    }
  ];
}

async function buildReceiptZoneVariants(filePath) {
  const sharp = await loadSharp();
  const prepared = sharp(filePath, { failOn: "none" }).rotate().trim();
  const metadata = await prepared.metadata();
  const width = Number(metadata.width) || 0;
  const height = Number(metadata.height) || 0;

  const buildZoneBase = async ({ topRatio, heightRatio, widthPx }) =>
    prepared
      .clone()
      .extract({
        left: 0,
        top: Math.max(0, Math.floor(height * topRatio)),
        width,
        height: Math.max(1, Math.floor(height * heightRatio))
      })
      .resize({ width: widthPx, withoutEnlargement: false });

  return {
    top: [
      {
        name: "top-normalized",
        input: await renderReceiptVariant(await buildZoneBase({
          topRatio: 0,
          heightRatio: 0.22,
          widthPx: 1200
        }), "normalized")
      }
    ],
    middle: [
      {
        name: "middle-normalized",
        input: await renderReceiptVariant(await buildZoneBase({
          topRatio: 0.16,
          heightRatio: 0.54,
          widthPx: 1600
        }), "normalized")
      }
    ],
    bottom: [
      {
        name: "bottom-threshold-188",
        input: await renderReceiptVariant(await buildZoneBase({
          topRatio: 0.72,
          heightRatio: 0.28,
          widthPx: 1400
        }), "threshold-188")
      }
    ]
  };
}

async function renderReceiptVariant(baseImage, preset = "normalized") {
  let image = baseImage
    .clone()
    .grayscale()
    .normalize();

  if (preset === "contrast-strong") {
    image = image.linear(1.22, -18).sharpen();
  } else if (preset === "threshold-172") {
    image = image.blur(0.35).linear(1.18, -10).threshold(172);
  } else if (preset === "threshold-188") {
    image = image.blur(0.35).linear(1.16, -8).threshold(188);
  } else if (preset === "threshold-204") {
    image = image.blur(0.45).linear(1.14, -6).threshold(204);
  } else if (preset === "inverted-bw") {
    image = image.negate().linear(1.12, -8).threshold(176).negate();
  } else {
    image = image.linear(1.08, -6).sharpen();
  }

  return image.png().toBuffer();
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("ocr_timeout")), timeoutMs);
    })
  ]);
}

function createDeadline(timeoutMs) {
  const startedAt = Date.now();
  return {
    remainingMs() {
      return Math.max(0, timeoutMs - (Date.now() - startedAt));
    },
    isExpired() {
      return this.remainingMs() <= 0;
    },
    throwIfExpired() {
      if (this.isExpired()) {
        throw new Error("ocr_timeout");
      }
    }
  };
}

let sharpModulePromise = null;
let tesseractModulePromise = null;

async function loadSharp() {
  if (!sharpModulePromise) {
    sharpModulePromise = import("sharp").then((module) => module.default || module);
  }
  return sharpModulePromise;
}

async function loadTesseract() {
  if (!tesseractModulePromise) {
    tesseractModulePromise = import("tesseract.js").then((module) => module.default || module);
  }
  return tesseractModulePromise;
}

export class ReceiptOcrService {
  async recognizeReceipt(filePath) {
    return withTimeout(this.#recognizeReceiptInternal(filePath), OCR_TIMEOUT_MS);
  }

  async #recognizeReceiptInternal(filePath) {
    const Tesseract = await loadTesseract();
    const deadline = createDeadline(Math.min(OCR_TIMEOUT_MS - 5000, OCR_PROCESS_BUDGET_MS));
    const variants = await buildReceiptVariants(filePath);
    const zoneVariants = await buildReceiptZoneVariants(filePath);
    const worker = await Tesseract.createWorker("ukr+eng", 1, {
      logger: () => {}
    });
    const merchantPsms = [Tesseract.PSM.SINGLE_BLOCK];
    const detailPsms = [Tesseract.PSM.SINGLE_BLOCK];
    const positionPsms = [Tesseract.PSM.SINGLE_BLOCK];

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });

      let timedOut = false;
      const safeRecognize = async (input) => {
        if (timedOut || deadline.isExpired()) {
          timedOut = true;
          return null;
        }

        try {
          return await withTimeout(
            worker.recognize(input),
            Math.max(6000, Math.min(20000, deadline.remainingMs()))
          );
        } catch (error) {
          if (String(error?.message || error) === "ocr_timeout") {
            timedOut = true;
            return null;
          }
          throw error;
        }
      };

      let best = null;

      for (const variant of variants) {
        if (best && deadline.isExpired()) {
          break;
        }
        const recognition = await safeRecognize(variant.input);
        if (!recognition) {
          break;
        }
        const { data } = recognition;
        const rawText = String(data?.text || "").trim();
        const lines = extractLines(rawText);
        const candidate = {
          rawText,
          lines,
          merchant: extractMerchant(lines),
          date: extractDate(rawText),
          total: extractTotal(lines),
          positions: extractPositions(lines),
          suggestedTitle: extractMerchant(lines) || "Чек",
          confidence: Number(data?.confidence) || 0,
          variant: variant.name
        };
        candidate.score = scoreResult(candidate);

        if (!best || candidate.score > best.score) {
          best = candidate;
        }

        if (best && best.score >= 230 && best.total > 0 && best.date && best.merchant && best.positions.length >= 3) {
          break;
        }
      }

      if (!best) {
        throw new Error("ocr_timeout");
      }

      const needsMerchantRefine = !best?.merchant || best.score < 170;
      const needsBottomRefine = !best?.total || !best?.date;
      const needsPositionRefine = (best?.positions || []).length < 2;

      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });

      let topMerchant = best?.merchant || "";
      let topMerchantScore = -Infinity;
      if (needsMerchantRefine) {
        for (const topVariant of zoneVariants.top) {
          for (const psm of merchantPsms) {
            if (deadline.isExpired()) {
              break;
            }
            await worker.setParameters({
              tessedit_pageseg_mode: psm,
              preserve_interword_spaces: "1",
              user_defined_dpi: "300"
            });
            const recognition = await safeRecognize(topVariant.input);
            if (!recognition) {
              break;
            }
            const { data } = recognition;
            const lines = extractLines(String(data?.text || "").trim());
            const knownMerchant = extractKnownMerchant(lines);
            const merchant = knownMerchant || extractMerchant(lines);
            const merchantScore =
              scoreMerchantLine(merchant) +
              (merchant ? 25 : 0) +
              (knownMerchant ? 240 : 0) +
              Math.round(Number(data?.confidence) || 0);
            if (merchantScore > topMerchantScore) {
              topMerchantScore = merchantScore;
              topMerchant = merchant;
            }
          }
          if (deadline.isExpired()) {
            break;
          }
        }
      }

      let bottomTotal = best?.total || 0;
      let bottomTotalScore = -Infinity;
      let bottomDate = best?.date || "";
      let bottomDateScore = -Infinity;
      let vat = extractVat(best?.lines || []);
      let vatScore = -Infinity;
      if (needsBottomRefine || vat.entries.length === 0) {
        for (const bottomVariant of zoneVariants.bottom) {
          for (const psm of detailPsms) {
            if (deadline.isExpired()) {
              break;
            }
            await worker.setParameters({
              tessedit_pageseg_mode: psm,
              preserve_interword_spaces: "1",
              user_defined_dpi: "300"
            });
            const recognition = await safeRecognize(bottomVariant.input);
            if (!recognition) {
              break;
            }
            const { data } = recognition;
            const rawText = String(data?.text || "").trim();
            const lines = extractLines(rawText);
            const cashChangeTotal = extractCashChangeTotal(lines);
            const total = cashChangeTotal || extractTotal(lines);
            const date = extractDate(rawText);
            const vatCandidate = extractVat(lines);
            const confidence = Math.round(Number(data?.confidence) || 0);
            const hasTime = /\d{2}:\d{2}/.test(date);
            const totalScore =
              (/(сума|разом|всього|до сплати|підсумок)/i.test(rawText) ? 120 : 0) +
              (cashChangeTotal > 0 ? 180 : 0) +
              (total > 0 ? 80 : 0) +
              confidence;
            const dateScore =
              (hasTime ? 120 : 0) +
              (date ? 60 : 0) +
              scoreReceiptDateCandidate(date) +
              confidence;
            const vatCandidateScore =
              (vatCandidate.total > 0 ? 90 : 0) +
              vatCandidate.entries.length * 30 +
              confidence;

            if (totalScore > bottomTotalScore) {
              bottomTotalScore = totalScore;
              bottomTotal = total;
            }
            if (dateScore > bottomDateScore) {
              bottomDateScore = dateScore;
              bottomDate = date;
            }
            if (vatCandidateScore > vatScore) {
              vatScore = vatCandidateScore;
              vat = vatCandidate;
            }
          }
          if (deadline.isExpired()) {
            break;
          }
        }
      }

      let middlePositions = best?.positions || [];
      let middlePositionScore = -Infinity;
      if (needsPositionRefine) {
        for (const middleVariant of zoneVariants.middle) {
          for (const psm of positionPsms) {
            if (deadline.isExpired()) {
              break;
            }
            await worker.setParameters({
              tessedit_pageseg_mode: psm,
              preserve_interword_spaces: "1",
              user_defined_dpi: "300"
            });
            const recognition = await safeRecognize(middleVariant.input);
            if (!recognition) {
              break;
            }
            const { data } = recognition;
            const lines = extractLines(String(data?.text || "").trim());
            const positions = extractPositions(lines);
            const score = positions.length * 40 + Math.round(Number(data?.confidence) || 0);
            if (score > middlePositionScore) {
              middlePositionScore = score;
              middlePositions = positions;
            }
          }
          if (deadline.isExpired()) {
            break;
          }
        }
      }

      const finalMerchant = extractKnownMerchant(best?.lines || []) || topMerchant || best?.merchant || "";

      return {
        rawText: best?.rawText || "",
        lines: best?.lines || [],
        merchant: finalMerchant,
        date: bottomDate || best?.date || "",
        total: bottomTotal || best?.total || 0,
        vat,
        positions: middlePositions.length ? middlePositions : (best?.positions || []),
        suggestedTitle: finalMerchant || best?.suggestedTitle || "Чек",
        confidence: Number(best?.confidence) || 0,
        variant: best?.variant || "",
        score: best?.score || 0
      };
    } finally {
      await worker.terminate();
    }
  }
}

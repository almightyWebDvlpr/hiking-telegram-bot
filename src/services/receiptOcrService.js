import fs from "node:fs/promises";

const OCR_TIMEOUT_MS = 90000;
const OPENAI_RECEIPT_TIMEOUT_MS = 45000;
const OPENAI_RECEIPT_MODEL = process.env.OPENAI_RECEIPT_OCR_MODEL || "gpt-4.1";

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

function sanitizeOpenAiPositions(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      title: sanitizePositionTitle(item?.title || ""),
      amount: Number(item?.amount) || 0
    }))
    .filter((item) => item.title && item.amount > 0 && isLikelyPositionTitle(item.title))
    .slice(0, 20);
}

function extractDate(text = "") {
  const patterns = [
    /\b(\d{2}[./-]\d{2}[./-]\d{4})\b/,
    /\b(\d{4}[./-]\d{2}[./-]\d{2})\b/,
    /\b(\d{2}[./-]\d{2}[./-]\d{4}\s+\d{2}:\d{2}(?::\d{2})?)\b/
  ];

  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match?.[1]) {
      const candidate = normalizeReceiptDateCandidate(match[1]);
      const datePart = candidate.split(/\s+/)[0];
      const parts = datePart.split(/[./-]/).map((item) => Number.parseInt(item, 10));
      if (parts.length === 3) {
        const [first, second, third] = parts;
        const dayFirst = datePart.match(/^\d{2}[./-]/);
        const day = dayFirst ? first : third;
        const month = second;
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          return candidate;
        }
      }
    }
  }

  return "";
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
    return cleaned;
  });

  const separator = datePart.includes(".") ? "." : datePart.includes("/") ? "/" : "-";
  return [normalizedParts.join(separator), timePart].filter(Boolean).join(" ").trim();
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
  if (/(сума|разом|всього|до сплати|итого|total|sum|готівка|решта|пдв|податку|знижк)/i.test(title)) {
    return false;
  }
  return true;
}

function extractPositions(lines = []) {
  const result = [];
  const seen = new Set();
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
      const amount = parseMoneyCandidate(quantityAmountMatch[2]);
      const key = `${title.toLowerCase()}::${amount}`;
      if (!seen.has(key) && amount > 0) {
        seen.add(key);
        result.push({ title, amount });
        consumedIndexes.add(index + 1);
        if (result.length >= 8) {
          break;
        }
      }
      continue;
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

    const key = `${title.toLowerCase()}::${amount}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ title, amount });
    if (result.length >= 8) {
      break;
    }
  }

  return result;
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
  const targetWidth = Math.max(Number(metadata.width) || 0, 1800);
  const base = prepared
    .resize({ width: targetWidth, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen();

  return [
    {
      name: "normalized",
      input: await base.clone().png().toBuffer()
    },
    {
      name: "threshold-176",
      input: await base.clone().threshold(176).png().toBuffer()
    },
    {
      name: "threshold-196",
      input: await base.clone().threshold(196).png().toBuffer()
    }
  ];
}

async function buildReceiptZoneVariants(filePath) {
  const sharp = await loadSharp();
  const prepared = sharp(filePath, { failOn: "none" }).rotate().trim();
  const metadata = await prepared.metadata();
  const width = Number(metadata.width) || 0;
  const height = Number(metadata.height) || 0;

  const buildZone = async ({ topRatio, heightRatio, widthPx, threshold = null, name }) => {
    let image = prepared
      .clone()
      .extract({
        left: 0,
        top: Math.max(0, Math.floor(height * topRatio)),
        width,
        height: Math.max(1, Math.floor(height * heightRatio))
      })
      .resize({ width: widthPx, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen();

    if (threshold) {
      image = image.threshold(threshold);
    }

    return {
      name,
      input: await image.png().toBuffer()
    };
  };

  return {
    top: await buildZone({
      topRatio: 0,
      heightRatio: 0.22,
      widthPx: 1800,
      threshold: 176,
      name: "top-threshold-176"
    }),
    middle: await buildZone({
      topRatio: 0.16,
      heightRatio: 0.54,
      widthPx: 2600,
      threshold: null,
      name: "middle-normalized"
    }),
    bottom: await buildZone({
      topRatio: 0.72,
      heightRatio: 0.28,
      widthPx: 2200,
      threshold: null,
      name: "bottom-normalized"
    })
  };
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("ocr_timeout")), timeoutMs);
    })
  ]);
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

async function buildOpenAiReceiptInputs(filePath) {
  const originalBuffer = await fs.readFile(filePath);
  const originalMimeType = guessReceiptMimeType(filePath);
  const inputs = [
    {
      type: "input_image",
      image_url: `data:${originalMimeType};base64,${originalBuffer.toString("base64")}`
    }
  ];

  try {
    const sharp = await loadSharp();
    const prepared = sharp(filePath, { failOn: "none" }).rotate().trim();
    const metadata = await prepared.metadata();
    const width = Number(metadata.width) || 0;
    const height = Number(metadata.height) || 0;

    const normalized = await prepared
      .clone()
      .resize({ width: Math.max(width, 2200), withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();

    inputs.push({
      type: "input_image",
      image_url: `data:image/png;base64,${normalized.toString("base64")}`
    });

    if (width > 0 && height > 0) {
      const zoneSpecs = [
        { topRatio: 0, heightRatio: 0.22, widthPx: 1800 },
        { topRatio: 0.16, heightRatio: 0.54, widthPx: 2600 },
        { topRatio: 0.72, heightRatio: 0.28, widthPx: 2200 }
      ];

      for (const zone of zoneSpecs) {
        const zoneBuffer = await prepared
          .clone()
          .extract({
            left: 0,
            top: Math.max(0, Math.floor(height * zone.topRatio)),
            width,
            height: Math.max(1, Math.floor(height * zone.heightRatio))
          })
          .resize({ width: zone.widthPx, withoutEnlargement: false })
          .grayscale()
          .normalize()
          .sharpen()
          .png()
          .toBuffer();

        inputs.push({
          type: "input_image",
          image_url: `data:image/png;base64,${zoneBuffer.toString("base64")}`
        });
      }
    }
  } catch {
    // Original image is enough for the fallback vision request.
  }

  return inputs;
}

function guessReceiptMimeType(filePath = "") {
  const lower = String(filePath || "").toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".heic")) {
    return "image/heic";
  }
  return "image/jpeg";
}

async function callOpenAiReceiptVision(filePath) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }

  const inputImages = await buildOpenAiReceiptInputs(filePath);
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      merchant: { type: "string" },
      date: { type: "string" },
      total: { type: "number" },
      positions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            amount: { type: "number" }
          },
          required: ["title", "amount"]
        }
      }
    },
    required: ["merchant", "date", "total", "positions"]
  };

  const response = await withTimeout(
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_RECEIPT_MODEL,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Extract this receipt as accurately as possible.",
                  "Return the real store name, the printed receipt date, the real total amount paid, and as many line items as you can read confidently.",
                  "Use DD-MM-YYYY for date.",
                  "If the receipt shows both cash given and change, total must be cash minus change, not the cash value.",
                  "Normalize obvious Ukrainian grocery chain names when the logo/text clearly identifies them.",
                  "Do not hallucinate. If a line item is unreadable, omit it."
                ].join(" ")
              },
              ...inputImages
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "receipt_extraction",
            strict: true,
            schema
          }
        }
      })
    }),
    OPENAI_RECEIPT_TIMEOUT_MS
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`openai_receipt_http_${response.status}:${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  const rawText = String(payload?.output_text || "").trim();
  if (!rawText) {
    throw new Error("openai_receipt_empty");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("openai_receipt_invalid_json");
  }

  return {
    rawText,
    lines: [],
    merchant: extractKnownMerchant([String(parsed?.merchant || "")]) || sanitizeMerchant(parsed?.merchant || ""),
    date: extractDate(String(parsed?.date || "")) || normalizeReceiptDateCandidate(String(parsed?.date || "")),
    total: Number(parsed?.total) || 0,
    positions: sanitizeOpenAiPositions(parsed?.positions),
    suggestedTitle: extractKnownMerchant([String(parsed?.merchant || "")]) || sanitizeMerchant(parsed?.merchant || "") || "Чек",
    confidence: 100,
    variant: "openai-vision",
    score: 1000
  };
}

export class ReceiptOcrService {
  async recognizeReceipt(filePath) {
    try {
      const openAiResult = await callOpenAiReceiptVision(filePath);
      if (openAiResult?.merchant || openAiResult?.total || openAiResult?.positions?.length) {
        return openAiResult;
      }
    } catch {
      // Fall back to local OCR when vision OCR is unavailable or fails.
    }

    return withTimeout(this.#recognizeReceiptInternal(filePath), OCR_TIMEOUT_MS);
  }

  async #recognizeReceiptInternal(filePath) {
    const Tesseract = await loadTesseract();
    const variants = await buildReceiptVariants(filePath);
    const zoneVariants = await buildReceiptZoneVariants(filePath);
    const worker = await Tesseract.createWorker("ukr+eng", 1, {
      logger: () => {}
    });
    const zonePsms = [
      Tesseract.PSM.AUTO,
      Tesseract.PSM.SINGLE_BLOCK,
      Tesseract.PSM.SINGLE_COLUMN,
      Tesseract.PSM.SPARSE_TEXT
    ];

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });

      let best = null;

      for (const variant of variants) {
        const { data } = await worker.recognize(variant.input);
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
      }

      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });

      let topMerchant = "";
      let topMerchantScore = -Infinity;
      for (const psm of zonePsms) {
        await worker.setParameters({
          tessedit_pageseg_mode: psm,
          preserve_interword_spaces: "1",
          user_defined_dpi: "300"
        });
        const { data } = await worker.recognize(zoneVariants.top.input);
        const lines = extractLines(String(data?.text || "").trim());
        const merchant = extractMerchant(lines);
        const merchantScore = scoreMerchantLine(merchant) + (merchant ? 25 : 0);
        if (merchantScore > topMerchantScore) {
          topMerchantScore = merchantScore;
          topMerchant = merchant;
        }
      }

      let bottomTotal = 0;
      let bottomTotalScore = -Infinity;
      let bottomDate = "";
      let bottomDateScore = -Infinity;
      for (const psm of zonePsms) {
        await worker.setParameters({
          tessedit_pageseg_mode: psm,
          preserve_interword_spaces: "1",
          user_defined_dpi: "300"
        });
        const { data } = await worker.recognize(zoneVariants.bottom.input);
        const rawText = String(data?.text || "").trim();
        const lines = extractLines(rawText);
        const cashChangeTotal = extractCashChangeTotal(lines);
        const total = cashChangeTotal || extractTotal(lines);
        const date = extractDate(rawText);
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
          confidence;

        if (totalScore > bottomTotalScore) {
          bottomTotalScore = totalScore;
          bottomTotal = total;
        }
        if (dateScore > bottomDateScore) {
          bottomDateScore = dateScore;
          bottomDate = date;
        }
      }

      let middlePositions = [];
      let middlePositionScore = -Infinity;
      for (const psm of [Tesseract.PSM.AUTO, Tesseract.PSM.SINGLE_BLOCK, Tesseract.PSM.SINGLE_COLUMN]) {
        await worker.setParameters({
          tessedit_pageseg_mode: psm,
          preserve_interword_spaces: "1",
          user_defined_dpi: "300"
        });
        const { data } = await worker.recognize(zoneVariants.middle.input);
        const lines = extractLines(String(data?.text || "").trim());
        const positions = extractPositions(lines);
        const score = positions.length * 40 + Math.round(Number(data?.confidence) || 0);
        if (score > middlePositionScore) {
          middlePositionScore = score;
          middlePositions = positions;
        }
      }

      return {
        rawText: best?.rawText || "",
        lines: best?.lines || [],
        merchant: topMerchant || best?.merchant || "",
        date: bottomDate || best?.date || "",
        total: bottomTotal || best?.total || 0,
        positions: middlePositions.length ? middlePositions : (best?.positions || []),
        suggestedTitle: topMerchant || best?.suggestedTitle || "Чек",
        confidence: Number(best?.confidence) || 0,
        variant: best?.variant || "",
        score: best?.score || 0
      };
    } finally {
      await worker.terminate();
    }
  }
}

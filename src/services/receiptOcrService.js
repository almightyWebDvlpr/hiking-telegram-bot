import Tesseract from "tesseract.js";

const OCR_TIMEOUT_MS = 90000;

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
    /\b(\d{2}[./-]\d{2}[./-]\d{4})\b/,
    /\b(\d{4}[./-]\d{2}[./-]\d{2})\b/
  ];

  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

function parseMoneyCandidate(raw = "") {
  const normalized = String(raw || "").replace(/\s+/g, "").replace(",", ".");
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
  const totalPattern = /(сума|разом|всього|до сплати|сплатити|итого|total|sum)/i;
  const amounts = extractAllAmounts(lines);

  for (const line of lines) {
    if (!totalPattern.test(line)) {
      continue;
    }
    const lineAmounts = (line.match(/(\d{1,6}(?:[.,]\d{2}))/g) || [])
      .map((item) => parseMoneyCandidate(item))
      .filter((item) => item > 0);
    if (lineAmounts.length) {
      return Math.max(...lineAmounts);
    }
  }

  if (!amounts.length) {
    return 0;
  }

  return Math.max(...amounts.map((item) => item.value));
}

function extractMerchant(lines = []) {
  const excluded = /(сума|разом|всього|чек|касир|термінал|терминал|дата|час|рн|єдрпоу|фн|зн|пдв|subtotal|total)/i;

  for (const line of lines.slice(0, 8)) {
    if (excluded.test(line)) {
      continue;
    }
    if (/\d{5,}/.test(line)) {
      continue;
    }
    if (!/[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(line)) {
      continue;
    }
    return line;
  }

  return "";
}

function extractPositions(lines = []) {
  const result = [];
  const seen = new Set();
  const linePattern = /^(.+?)\s+(\d{1,6}(?:[.,]\d{2}))$/;

  for (const line of lines) {
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const title = normalizeLine(match[1]);
    const amount = parseMoneyCandidate(match[2]);
    if (!title || amount <= 0) {
      continue;
    }
    if (/(сума|разом|всього|до сплати|итого|total)/i.test(title)) {
      continue;
    }

    const key = `${title.toLowerCase()}::${amount}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ title, amount });
    if (result.length >= 6) {
      break;
    }
  }

  return result;
}

export class ReceiptOcrService {
  async recognizeReceipt(filePath) {
    const { data } = await Promise.race([
      Tesseract.recognize(filePath, "ukr+eng", {
        logger: () => {}
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("ocr_timeout")), OCR_TIMEOUT_MS);
      })
    ]);

    const rawText = String(data?.text || "").trim();
    const lines = extractLines(rawText);
    const total = extractTotal(lines);
    const merchant = extractMerchant(lines);
    const date = extractDate(rawText);
    const positions = extractPositions(lines);

    return {
      rawText,
      lines,
      merchant,
      date,
      total,
      positions,
      suggestedTitle: merchant || "Чек",
      confidence: Number(data?.confidence) || 0
    };
  }
}

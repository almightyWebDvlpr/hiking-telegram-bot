import sharp from "sharp";
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
      const candidate = match[1];
      const parts = candidate.split(/[./-]/).map((item) => Number.parseInt(item, 10));
      if (parts.length === 3) {
        const [first, second, third] = parts;
        const dayFirst = candidate.match(/^\d{2}[./-]/);
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
  const amounts = extractAllAmounts(lines);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!totalPattern.test(line)) {
      continue;
    }

    const combined = [line, lines[index + 1], lines[index + 2]].filter(Boolean).join(" ");
    const lineAmounts = (combined.match(/(\d{1,6}(?:[.,]\d{2}))/g) || [])
      .map((item) => parseMoneyCandidate(item))
      .filter((item) => item > 0);

    if (lineAmounts.length) {
      return Math.max(...lineAmounts);
    }
  }

  const tailAmounts = amounts
    .filter((item) => lines.slice(-12).includes(item.line))
    .map((item) => item.value);
  if (tailAmounts.length) {
    return Math.max(...tailAmounts);
  }

  if (!amounts.length) {
    return 0;
  }

  return Math.max(...amounts.map((item) => item.value));
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
    if (/(сума|разом|всього|до сплати|итого|total|sum|готівка|решта)/i.test(title)) {
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
  const metadata = await sharp(filePath, { failOn: "none" }).metadata();
  const targetWidth = Math.max(Number(metadata.width) || 0, 1800);
  const base = sharp(filePath, { failOn: "none" })
    .rotate()
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
  const metadata = await sharp(filePath, { failOn: "none" }).metadata();
  const width = Number(metadata.width) || 0;
  const height = Number(metadata.height) || 0;

  const buildZone = async ({ topRatio, heightRatio, widthPx, threshold = null, name }) => {
    let image = sharp(filePath, { failOn: "none" })
      .rotate()
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
      heightRatio: 0.24,
      widthPx: 1800,
      threshold: 176,
      name: "top-threshold-176"
    }),
    bottom: await buildZone({
      topRatio: 0.58,
      heightRatio: 0.42,
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

export class ReceiptOcrService {
  async recognizeReceipt(filePath) {
    return withTimeout(this.#recognizeReceiptInternal(filePath), OCR_TIMEOUT_MS);
  }

  async #recognizeReceiptInternal(filePath) {
    const variants = await buildReceiptVariants(filePath);
    const zoneVariants = await buildReceiptZoneVariants(filePath);
    const worker = await Tesseract.createWorker("ukr+eng", 1, {
      logger: () => {}
    });

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

      const { data: topData } = await worker.recognize(zoneVariants.top.input);
      const topLines = extractLines(String(topData?.text || "").trim());
      const topMerchant = extractMerchant(topLines);

      const { data: bottomData } = await worker.recognize(zoneVariants.bottom.input);
      const bottomRawText = String(bottomData?.text || "").trim();
      const bottomLines = extractLines(bottomRawText);
      const bottomTotal = extractTotal(bottomLines);
      const bottomDate = extractDate(bottomRawText);

      return {
        rawText: best?.rawText || "",
        lines: best?.lines || [],
        merchant: topMerchant || best?.merchant || "",
        date: bottomDate || best?.date || "",
        total: bottomTotal || best?.total || 0,
        positions: best?.positions || [],
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

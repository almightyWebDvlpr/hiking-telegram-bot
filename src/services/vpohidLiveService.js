import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VPOHID_BASE_URL = "https://vpohid.com.ua";
const VPOHID_ROUTE_URL = (id) => `${VPOHID_BASE_URL}/routes/v/route/${id}/`;
const VPOHID_MAP_ITEMS_URL = `${VPOHID_BASE_URL}/json/map/v/items/`;
const VPOHID_MAX_ROUTE_ID = 120;
const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const DETAIL_TTL_MS = 30 * 60 * 1000;
const MAP_ITEMS_TTL_MS = 60 * 60 * 1000;
const FETCH_HEADERS = {
  "User-Agent": "hiking-telegram-bot/0.1",
  "Accept-Language": "uk,en;q=0.8"
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ARCHIVE_PATH = path.resolve(__dirname, "../../data/vpohidArchive.json");
const SEARCH_STOPWORDS = new Set([
  "на",
  "з",
  "із",
  "і",
  "та",
  "до",
  "через",
  "г",
  "с"
]);

const REGION_BBOXES = {
  chornohora: {
    zoom: 13,
    bounds: {
      boundNorthEastLat: 48.20271028869975,
      boundSouthWestLat: 48.092527845402735,
      boundNorthEastLng: 24.643020629882812,
      boundSouthWestLng: 24.452819824218754
    }
  },
  chornohoraCore: {
    zoom: 14,
    bounds: {
      boundNorthEastLat: 48.17512961661139,
      boundSouthWestLat: 48.12003833505862,
      boundNorthEastLng: 24.595556259155277,
      boundSouthWestLng: 24.500455856323246
    }
  }
};

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cloneJson(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function stripHtmlToLines(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(br|\/p|\/div|\/section|\/article|\/li|\/ul|\/ol|\/h1|\/h2|\/h3|\/h4|\/table|\/tr|\/td)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeValue(value) {
  return decodeEntities(String(value || ""))
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/прехід/gu, "перехід")
    .replace(/свидівець/gu, "свидовець")
    .replace(/свидівц(я|ю|і|ем|ях|ями)/gu, "свидовец$1")
    .replace(/свидів(ець|ця|цю|цем|цях|цями)/gu, "свидов$1")
    .replace(/\bг\.\s*/g, "гора ")
    .replace(/\bг\s+/g, "гора ")
    .replace(/\bс\.\s*/g, "")
    .replace(/\bс\s+/g, "")
    .replace(/\bоз\.\s*/g, "озеро ")
    .replace(/\bоз\s+/g, "озеро ")
    .replace(/\bпол\.\s*/g, "полонина ")
    .replace(/\bпол\s+/g, "полонина ")
    .replace(/[^a-z0-9а-яіїєґ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeValue(value)
    .split(" ")
    .filter((token) => token && token.length >= 3 && !SEARCH_STOPWORDS.has(token));
}

function normalizeSearchStem(token) {
  let value = String(token || "");
  if (!value) {
    return "";
  }

  value = value
    .replace(/(ському|ськими|ського|ською|ський|ська|ське|ські)$/u, "ськ")
    .replace(/(ому|ему|ими|ого|ому|аго|ами|ями)$/u, "")
    .replace(/(ий|ій|ій|а|я|е|є|у|ю|і|и|о)$/u, "");

  return value.length >= 4 ? value : String(token || "");
}

function getEditDistanceWithinLimit(left, right, limit = 2) {
  const a = String(left || "");
  const b = String(right || "");
  if (!a || !b) {
    return Number.POSITIVE_INFINITY;
  }
  if (Math.abs(a.length - b.length) > limit) {
    return Number.POSITIVE_INFINITY;
  }

  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Number.POSITIVE_INFINITY;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      rowMin = Math.min(rowMin, dp[i][j]);
    }
    if (rowMin > limit) {
      return Number.POSITIVE_INFINITY;
    }
  }

  return dp[a.length][b.length];
}

function extractRouteId(routeUrl = "") {
  const match = String(routeUrl).match(/\/route\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

function normalizeKind(value) {
  return String(value || "").trim().toLowerCase();
}

function extractHeading(html, tagName) {
  const match = String(html || "").match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : "";
}

function extractLineValue(lines, prefix) {
  const normalizedPrefix = normalizeValue(prefix);
  const line = lines.find((item) => normalizeValue(item).startsWith(normalizedPrefix));
  if (!line) {
    return "";
  }
  return line.slice(line.indexOf(":") + 1).trim();
}

function splitListValue(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueNormalizedStrings(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const cleaned = normalizePointLabel(value);
    if (!cleaned) {
      continue;
    }
    const key = normalizeValue(cleaned);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function extractListSectionFromHtml(html, label, stopLabels = []) {
  const source = String(html || "");
  if (!source) {
    return [];
  }

  const stopPattern = stopLabels.length
    ? `(?=${stopLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`
    : "$";

  const labelPattern = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${labelPattern}\\s*:<\\/[^>]+>([\\s\\S]*?)${stopPattern}`, "i"));
  if (!match) {
    return [];
  }

  return decodeEntities(match[1].replace(/<[^>]+>/g, " "))
    .split(/[;,]/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractAnchorsFromSection(html, sectionClass) {
  const source = String(html || "");
  if (!source) {
    return [];
  }

  const match = source.match(new RegExp(`<div class="row\\s+${sectionClass}"[^>]*>[\\s\\S]*?<div class="col-xs-12">([\\s\\S]*?)<\\/div>\\s*<\\/div>`, "i"));
  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/<a [^>]*>([\s\S]*?)<\/a>/gi)]
    .map((item) => decodeEntities(item[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

function extractWeatherSettlementsFromHtml(html) {
  const source = String(html || "");
  if (!source) {
    return [];
  }

  const match = source.match(/<div class="row routeweather"[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);
  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/<li>[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi)]
    .map((item) => decodeEntities(item[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

function extractDescription(lines) {
  const anchorIndex = lines.findIndex((line) => /я пройшов цей маршрут/i.test(line));
  if (anchorIndex === -1) {
    return "";
  }

  const descriptionLines = [];
  for (let index = anchorIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^(Гіди на цьому маршруті|Підтримайте проект|Download for|DONATE|Шукаємо Спонсора)/i.test(line)) {
      break;
    }
    if (line.length >= 20) {
      descriptionLines.push(line);
    }
    if (descriptionLines.length >= 3) {
      break;
    }
  }

  return descriptionLines.join(" ");
}

function extractWeatherSettlements(lines) {
  const anchorIndex = lines.findIndex((line) => /Прогноз погоди в населених пунктах/i.test(line));
  if (anchorIndex === -1) {
    return [];
  }

  const settlements = [];
  for (let index = anchorIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^(Маршрут вихідного дня|Я пройшов цей маршрут|Гіди на цьому маршруті)/i.test(line)) {
      break;
    }
    if (/^(Селище міського типу|Село|смт|місто)\s+/i.test(line)) {
      settlements.push(line.replace(/^(Селище міського типу|Село|смт|місто)\s+/i, "").trim());
    }
  }

  return settlements;
}

function parseStartFinish(lines, subtitle = "") {
  const line = lines.find((item) => /Вихід з:|Вихід із:|Старт з населеного пункту:/i.test(item)) || "";
  const combined = [subtitle, line].filter(Boolean).join(" | ");

  const roundTripMatch = combined.match(/^\s*(.+?)\s*-\s*(.+?)\s*-\s*\1\s*$/i);
  if (roundTripMatch) {
    return {
      start: roundTripMatch[1].trim(),
      finish: roundTripMatch[1].trim()
    };
  }

  const explicitMatch = combined.match(/(?:Вихід з:|Вихід із:)\s*(.+?)\s*-\s*(?:Фініш в:|Фініш у:)\s*(.+?)(?:\||$)/i);
  if (explicitMatch) {
    return {
      start: explicitMatch[1].trim(),
      finish: explicitMatch[2].trim()
    };
  }

  const subtitleMatch = subtitle.match(/\bз\s+(.+?)\s+до\s+(.+?)(?:$|,)/i);
  if (subtitleMatch) {
    return {
      start: subtitleMatch[1].trim(),
      finish: subtitleMatch[2].trim()
    };
  }

  const startOnlyMatch = combined.match(/(?:Старт з населеного пункту:|Вихід з:|Вихід із:)\s*(.+?)(?:\||$)/i);
  if (startOnlyMatch) {
    return {
      start: startOnlyMatch[1].trim(),
      finish: ""
    };
  }

  return { start: "", finish: "" };
}

function extractStartFinishFromHtml(html) {
  const startMatch = String(html || "").match(/(?:Вихід з:|Вихід із:|Старт з населеного пункту:)\s*<\/span>\s*<a [^>]*>([^<]+)<\/a>/i);
  const finishMatch = String(html || "").match(/(?:Фініш в:|Фініш у:)\s*<\/span>\s*<a [^>]*>([^<]+)<\/a>/i);

  return {
    start: startMatch ? decodeEntities(startMatch[1]).trim() : "",
    finish: finishMatch ? decodeEntities(finishMatch[1]).trim() : ""
  };
}

function extractRouteGeometryCoordinates(html) {
  return [...String(html || "").matchAll(/list\.push\(\{\s*lat:\s*([0-9.]+)\s*,\s*lng:\s*([0-9.]+)\s*\}\)/g)]
    .map((match) => [Number(match[2]), Number(match[1])])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function normalizePointLabel(value) {
  return decodeEntities(String(value || ""))
    .replace(/\bоз\.\s*/gi, "озеро ")
    .replace(/\bо\.\s*/gi, "озеро ")
    .replace(/\bпол\.\s*/gi, "полонина ")
    .replace(/\bг\.\s*/gi, "гора ")
    .replace(/\bс\.\s*/gi, "")
    .replace(/\bКПП\b/gi, "КПП")
    .replace(/\s+/g, " ")
    .trim();
}

function titleToCanonicalPoint(title, kind = "") {
  const cleanedTitle = normalizePointLabel(title);
  const normalizedKind = normalizeKind(kind);
  const normalizedTitle = normalizeValue(cleanedTitle);

  if (!cleanedTitle) {
    return "";
  }

  if (normalizedTitle.startsWith("гора ") || normalizedTitle.startsWith("озеро ") || normalizedTitle.startsWith("полонина ") || normalizedTitle.startsWith("кпп ")) {
    return cleanedTitle;
  }

  if (normalizedKind === "mount") {
    return `гора ${cleanedTitle}`;
  }

  if (normalizedKind === "lake" || normalizedKind === "water" || normalizedKind === "waterbody") {
    return `озеро ${cleanedTitle}`;
  }

  return cleanedTitle;
}

function splitRouteSegments(value) {
  return String(value || "")
    .split(/\s*[-–—]\s*/)
    .map(normalizePointLabel)
    .filter(Boolean);
}

function isLikelyRoutePoint(value) {
  const normalized = normalizePointLabel(value);
  if (!normalized) {
    return false;
  }

  return (
    /^(гора|озеро|полонина|кпп|урочище)/i.test(normalized)
    || normalized.split(" ").length <= 3
  );
}

function deriveRoutePoints(detail) {
  const titleSegments = splitRouteSegments(detail.title);
  const subtitleSegments = splitRouteSegments(detail.subtitle).filter(isLikelyRoutePoint);
  const peaks = (detail.peaks || []).map(normalizePointLabel).filter(Boolean);
  const interestPoints = (detail.interesting || [])
    .map(normalizePointLabel)
    .filter((item) => /^(озеро|полонина|гора|КПП|урочище)/i.test(item));

  const points = [];
  const append = (value) => {
    const normalized = normalizePointLabel(value);
    if (!normalized) {
      return;
    }
    if (!points.some((item) => normalizeValue(item) === normalizeValue(normalized))) {
      points.push(normalized);
    }
  };

  if (subtitleSegments.length >= 3) {
    subtitleSegments.forEach(append);
  } else if (titleSegments.length >= 2) {
    titleSegments.forEach(append);
  } else {
    append(detail.start);
    peaks.slice(0, 4).forEach(append);
    interestPoints.slice(0, 2).forEach(append);
    append(detail.finish);
  }

  if (points.length === 1 && detail.finish && normalizeValue(detail.finish) !== normalizeValue(points[0])) {
    append(detail.finish);
  }

  return points.filter(Boolean);
}

function buildRoutePointCandidates(detail) {
  const titleSegments = splitRouteSegments(detail.title);
  const subtitleSegments = splitRouteSegments(detail.subtitle).filter(isLikelyRoutePoint);
  const fallbackPoints = Array.isArray(detail.points) ? detail.points.map(normalizePointLabel).filter(Boolean) : [];
  const points = [];

  const append = (value) => {
    const normalized = normalizePointLabel(value);
    if (!normalized) {
      return;
    }
    if (!points.some((item) => normalizeValue(item) === normalizeValue(normalized))) {
      points.push(normalized);
    }
  };

  if (titleSegments.length >= 2) {
    append(titleSegments[0]);
    subtitleSegments.forEach(append);
    append(titleSegments[titleSegments.length - 1]);
  } else if (subtitleSegments.length >= 2) {
    subtitleSegments.forEach(append);
  } else {
    fallbackPoints.forEach(append);
  }

  return points;
}

function inferRegions(detail) {
  const haystack = normalizeValue([
    detail.title,
    detail.subtitle,
    detail.start,
    detail.finish,
    ...(detail.peaks || []),
    ...(detail.interesting || [])
  ].filter(Boolean).join(" "));

  if (/(заросляк|говерла|несамовите|бребенескул|туркул|данцер|пожижевська|ребра|піп іван|чорногора)/i.test(haystack)) {
    return ["chornohora", "chornohoraCore"];
  }

  return ["chornohora"];
}

function scoreMapItemForPoint(item, point) {
  const normalizedPoint = normalizeValue(point);
  const itemTitle = normalizeValue(item.title);
  const canonicalTitle = normalizeValue(titleToCanonicalPoint(item.title, item.kind));
  let score = 0;

  if (canonicalTitle === normalizedPoint) {
    score += 20;
  } else if (itemTitle === normalizedPoint) {
    score += 16;
  } else if (canonicalTitle.includes(normalizedPoint) || normalizedPoint.includes(canonicalTitle)) {
    score += 10;
  } else if (itemTitle.includes(normalizedPoint) || normalizedPoint.includes(itemTitle)) {
    score += 8;
  }

  const kind = normalizeKind(item.kind);
  if (normalizedPoint.startsWith("гора ") && kind === "mount") {
    score += 4;
  }
  if (normalizedPoint.startsWith("озеро ") && /^(lake|water|waterbody)$/.test(kind)) {
    score += 4;
  }
  if (normalizedPoint.startsWith("кпп ") && /(placeofinterest|camp|campplace|kampplace)/.test(kind)) {
    score += 1;
  }

  return score;
}

function normalizeMapItem(item) {
  return {
    id: String(item.id || ""),
    title: decodeEntities(item.title || "").trim(),
    kind: normalizeKind(item.kind),
    lat: Number(item.latitude),
    lon: Number(item.longitude),
    viewurl: item.viewurl ? `${VPOHID_BASE_URL}${item.viewurl}` : "",
    raw: item
  };
}

function getDirectDistanceMeters(from, to) {
  const earthRadius = 6371000;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function getPointToRouteDistanceMeters(lon, lat, coordinates) {
  const point = { lat, lon };
  let minDistance = Number.POSITIVE_INFINITY;

  for (const coordinate of coordinates) {
    const routePoint = { lat: coordinate[1], lon: coordinate[0] };
    minDistance = Math.min(minDistance, getDirectDistanceMeters(point, routePoint));
  }

  return minDistance;
}

function classifyVpohidMapItem(item) {
  const label = decodeEntities(item.title || "").trim();
  const kind = normalizeKind(item.kind);

  if (!label) {
    return null;
  }

  if (kind === "watersource") {
    return { type: "water", label };
  }

  if (kind === "kampplace") {
    return { type: "camp", label };
  }

  if (kind === "usefulbuilding") {
    return { type: "shelter", label };
  }

  if (kind === "dangerplace") {
    return { type: "warning", label };
  }

  if (kind === "rescuepost") {
    return { type: "warning", label: label || "рятувальний пост" };
  }

  return null;
}

function getBoundingBoxFromCoordinates(coordinates) {
  const lons = coordinates.map(([lon]) => lon);
  const lats = coordinates.map(([, lat]) => lat);

  return {
    south: Math.min(...lats),
    west: Math.min(...lons),
    north: Math.max(...lats),
    east: Math.max(...lons)
  };
}

function padBounds(bounds, paddingLat = 0.01, paddingLon = 0.01) {
  return {
    boundSouthWestLat: bounds.south - paddingLat,
    boundSouthWestLng: bounds.west - paddingLon,
    boundNorthEastLat: bounds.north + paddingLat,
    boundNorthEastLng: bounds.east + paddingLon
  };
}

function boxesIntersect(left, right) {
  return !(
    left.east < right.boundSouthWestLng ||
    left.west > right.boundNorthEastLng ||
    left.north < right.boundSouthWestLat ||
    left.south > right.boundNorthEastLat
  );
}

function parseRouteDetail(html, routeUrl) {
  const lines = stripHtmlToLines(html);
  const title = extractHeading(html, "h1") || extractHeading(html, "h2") || lines[0] || `Маршрут ${extractRouteId(routeUrl)}`;
  const titleIndex = lines.findIndex((line) => normalizeValue(line) === normalizeValue(title));
  const subtitle = titleIndex >= 0
    ? (lines.slice(titleIndex + 1).find((line) => !/^\d+([.,]\d+)?\s*(км|годин|дні)/i.test(line) && !/^Рівень:/i.test(line)) || "")
    : "";
  const distance = lines.find((line) => /^\d+([.,]\d+)?\s*км$/i.test(line)) || "";
  const duration = lines.find((line) => /^\d+\s*(годин|дні\(в\)|дні|год)$/.test(line)) || "";
  const level = extractLineValue(lines, "Рівень");
  const peaks = splitListValue(extractLineValue(lines, "Вершини на маршруті"));
  const interesting = splitListValue(extractLineValue(lines, "Цікаве на маршруті"));
  const htmlPeaks = extractListSectionFromHtml(html, "Вершини на маршруті", [
    "Цікаве на маршруті",
    "Прогноз погоди в населених пунктах",
    "Я пройшов цей маршрут"
  ]);
  const htmlInteresting = extractListSectionFromHtml(html, "Цікаве на маршруті", [
    "Прогноз погоди в населених пунктах",
    "Я пройшов цей маршрут"
  ]);
  const sectionPeaks = extractAnchorsFromSection(html, "routemounts");
  const sectionInteresting = extractAnchorsFromSection(html, "routeinterestingplaces");
  const weatherSettlements = uniqueNormalizedStrings([
    ...extractWeatherSettlements(lines),
    ...extractWeatherSettlementsFromHtml(html)
  ]);
  const description = extractDescription(lines);
  const subtitleSegments = splitRouteSegments(subtitle).filter(isLikelyRoutePoint);
  const parsedStartFinish = parseStartFinish(lines, subtitle);
  const htmlStartFinish = extractStartFinishFromHtml(html);
  const resolvedPeaks = uniqueNormalizedStrings([...peaks, ...htmlPeaks, ...sectionPeaks]);
  const resolvedInteresting = uniqueNormalizedStrings([...interesting, ...htmlInteresting, ...sectionInteresting]);
  const startFinish = {
    start: parsedStartFinish.start || htmlStartFinish.start,
    finish: parsedStartFinish.finish || htmlStartFinish.finish
  };
  const derivedPoints = deriveRoutePoints({
    title,
    subtitle,
    start: startFinish.start,
    finish: startFinish.finish,
    peaks: resolvedPeaks,
    interesting: resolvedInteresting
  });
  const geometryCoordinates = extractRouteGeometryCoordinates(html);

  const derivedStart = startFinish.start || subtitleSegments[0] || "";
  const derivedFinish = startFinish.finish || (subtitleSegments.length >= 2 ? subtitleSegments[subtitleSegments.length - 1] : "");

  return {
    id: extractRouteId(routeUrl),
    url: routeUrl,
    title,
    subtitle,
    distance,
    duration,
    level,
    start: derivedStart,
    finish: derivedFinish,
    peaks: resolvedPeaks,
    interesting: resolvedInteresting,
    weatherSettlements,
    description,
    points: derivedPoints,
    geometryCoordinates
  };
}

function buildSearchHaystack(detail) {
  return [
    detail.title,
    detail.subtitle,
    detail.start,
    detail.finish,
    ...(detail.peaks || []),
    ...(detail.interesting || []),
    ...(detail.weatherSettlements || []),
    detail.description
  ].filter(Boolean);
}

function scoreRouteMatch(detail, query) {
  const normalizedQuery = normalizeValue(query);
  const queryTokens = tokenize(query);
  const haystack = buildSearchHaystack(detail).map(normalizeValue);
  const normalizedQueryStem = normalizeSearchStem(normalizedQuery);
  const title = normalizeValue(detail.title);
  const subtitle = normalizeValue(detail.subtitle);
  const titleWords = title.split(" ").filter(Boolean);
  const subtitleWords = subtitle.split(" ").filter(Boolean);
  const titleAndSubtitleWords = [...titleWords, ...subtitleWords];
  let score = 0;
  let matchedMeaningfulToken = false;

  if (title === normalizedQuery) {
    score += 30;
    matchedMeaningfulToken = true;
  } else if (title.includes(normalizedQuery)) {
    score += 22;
    matchedMeaningfulToken = true;
  } else if (normalizedQueryStem && normalizedQueryStem.length >= 4 && title.includes(normalizedQueryStem)) {
    score += 18;
    matchedMeaningfulToken = true;
  }

  if (queryTokens.length === 1) {
    const [singleToken] = queryTokens;
    const singleStem = normalizeSearchStem(singleToken);

    if (titleWords.some((word) => word === singleToken)) {
      score += 18;
      matchedMeaningfulToken = true;
    } else if (titleWords.some((word) => word.startsWith(singleToken) || singleToken.startsWith(word))) {
      score += 14;
      matchedMeaningfulToken = true;
    } else if (
      singleStem &&
      singleStem.length >= 4 &&
      titleWords.some((word) => {
        const wordStem = normalizeSearchStem(word);
        return wordStem && (wordStem.includes(singleStem) || singleStem.includes(wordStem));
      })
    ) {
      score += 12;
      matchedMeaningfulToken = true;
    }

    if (subtitleWords.some((word) => word === singleToken)) {
      score += 9;
      matchedMeaningfulToken = true;
    } else if (subtitleWords.some((word) => word.startsWith(singleToken) || singleToken.startsWith(word))) {
      score += 7;
      matchedMeaningfulToken = true;
    } else if (
      singleToken.length >= 5 &&
      titleAndSubtitleWords.some((word) => word.length >= 5 && getEditDistanceWithinLimit(singleToken, word, 2) <= 2)
    ) {
      score += 8;
      matchedMeaningfulToken = true;
    }
  }

  if (subtitle === normalizedQuery) {
    score += 18;
    matchedMeaningfulToken = true;
  } else if (subtitle.includes(normalizedQuery)) {
    score += 14;
    matchedMeaningfulToken = true;
  } else if (normalizedQueryStem && normalizedQueryStem.length >= 4 && subtitle.includes(normalizedQueryStem)) {
    score += 11;
    matchedMeaningfulToken = true;
  }

  for (const item of haystack) {
    if (item === normalizedQuery) {
      score += 16;
    } else if (item.includes(normalizedQuery)) {
      score += 10;
    } else if (
      normalizedQueryStem &&
      normalizedQueryStem.length >= 4 &&
      item.includes(normalizedQueryStem)
    ) {
      score += 8;
    }

    for (const token of queryTokens) {
      const tokenStem = normalizeSearchStem(token);
      if (title === token) {
        score += 12;
        matchedMeaningfulToken = true;
      } else if (title.includes(token)) {
        score += 9;
        matchedMeaningfulToken = true;
      } else if (tokenStem && tokenStem.length >= 4 && title.includes(tokenStem)) {
        score += 8;
        matchedMeaningfulToken = true;
      } else if (
        token.length >= 5 &&
        titleWords.some((word) => word.length >= 5 && getEditDistanceWithinLimit(token, word, 2) <= 2)
      ) {
        score += 8;
        matchedMeaningfulToken = true;
      }

      if (subtitle === token) {
        score += 7;
        matchedMeaningfulToken = true;
      } else if (subtitle.includes(token)) {
        score += 5;
        matchedMeaningfulToken = true;
      } else if (tokenStem && tokenStem.length >= 4 && subtitle.includes(tokenStem)) {
        score += 4;
        matchedMeaningfulToken = true;
      } else if (
        token.length >= 5 &&
        subtitleWords.some((word) => word.length >= 5 && getEditDistanceWithinLimit(token, word, 2) <= 2)
      ) {
        score += 5;
        matchedMeaningfulToken = true;
      }

      if (item === token) {
        score += 5;
        matchedMeaningfulToken = true;
      } else if (item.includes(token)) {
        score += 3;
        matchedMeaningfulToken = true;
      } else if (tokenStem && tokenStem.length >= 4 && item.includes(tokenStem)) {
        score += 3;
        matchedMeaningfulToken = true;
      } else {
        const itemWords = item.split(" ").filter(Boolean);
        if (itemWords.some((word) => {
          const wordStem = normalizeSearchStem(word);
          if (word.includes(token) || token.includes(word)) {
            return true;
          }
          if (
            tokenStem && tokenStem.length >= 4 &&
            wordStem && wordStem.length >= 4 &&
            (wordStem.includes(tokenStem) || tokenStem.includes(wordStem))
          ) {
            return true;
          }
          if (token.length >= 5 && word.length >= 5) {
            return getEditDistanceWithinLimit(token, word, 2) <= 2;
          }
          return false;
        })) {
          score += 2;
          matchedMeaningfulToken = true;
        }
      }
    }
  }

  if (queryTokens.length > 0 && !matchedMeaningfulToken && score < 10) {
    return 0;
  }

  return score;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: FETCH_HEADERS
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      ...FETCH_HEADERS,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

export class VpohidLiveService {
  constructor({ maxRouteId = VPOHID_MAX_ROUTE_ID, archivePath = DEFAULT_ARCHIVE_PATH } = {}) {
    this.maxRouteId = maxRouteId;
    this.archivePath = archivePath;
    this.indexCache = null;
    this.indexBuiltAt = 0;
    this.detailCache = new Map();
    this.mapItemsCache = new Map();
    this.archiveLoaded = false;
    this.archive = {
      version: 1,
      savedAt: null,
      routes: {}
    };
    this.persistTimer = null;
    this.syncPromise = null;
  }

  async ensureArchiveLoaded() {
    if (this.archiveLoaded) {
      return;
    }

    try {
      const content = await fs.readFile(this.archivePath, "utf8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && parsed.routes && typeof parsed.routes === "object") {
        this.archive = {
          version: parsed.version || 1,
          savedAt: parsed.savedAt || null,
          routes: parsed.routes
        };
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }

    this.archiveLoaded = true;
  }

  getArchivedDetail(routeId) {
    const archived = this.archive.routes?.[String(routeId)];
    return archived ? cloneJson(archived) : null;
  }

  setArchivedDetail(detail) {
    if (!detail?.id) {
      return;
    }

    const routeId = String(detail.id);
    const existing = this.archive.routes?.[routeId] || {};
    this.archive.routes[routeId] = {
      ...existing,
      ...cloneJson(detail),
      id: detail.id,
      archivedAt: new Date().toISOString()
    };
    this.archive.savedAt = new Date().toISOString();
    this.scheduleArchivePersist();
  }

  scheduleArchivePersist() {
    if (this.persistTimer) {
      return;
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistArchive().catch(() => {});
    }, 250);
  }

  async persistArchive() {
    await this.ensureArchiveLoaded();
    await fs.mkdir(path.dirname(this.archivePath), { recursive: true });
    await fs.writeFile(this.archivePath, JSON.stringify(this.archive, null, 2), "utf8");
  }

  async buildIndex() {
    await this.ensureArchiveLoaded();
    const now = Date.now();
    if (this.indexCache && now - this.indexBuiltAt < INDEX_TTL_MS) {
      return this.indexCache;
    }

    const routeIds = Array.from({ length: this.maxRouteId }, (_, index) => index + 1);
    const concurrency = 6;
    const results = [];

    for (let index = 0; index < routeIds.length; index += concurrency) {
      const chunk = routeIds.slice(index, index + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(async (routeId) => {
          try {
            const detail = await this.getRouteDetail(routeId, { forceRefresh: false });
            return detail;
          } catch {
            return null;
          }
        })
      );
      results.push(...chunkResults.filter(Boolean));
    }

    const seenIds = new Set(results.map((item) => String(item.id)));
    const archivedRoutes = Object.values(this.archive.routes || {})
      .filter(Boolean)
      .filter((item) => !seenIds.has(String(item.id)));

    this.indexCache = [...results, ...archivedRoutes];
    this.indexBuiltAt = now;
    return this.indexCache;
  }

  async searchRoutes(query) {
    const routes = await this.buildIndex();

    return routes
      .map((detail) => ({ ...detail, score: scoreRouteMatch(detail, query) }))
      .filter((detail) => detail.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "uk"));
  }

  async getRouteDetail(routeIdOrUrl, { forceRefresh = false } = {}) {
    await this.ensureArchiveLoaded();
    const routeId = typeof routeIdOrUrl === "number" ? routeIdOrUrl : extractRouteId(routeIdOrUrl);
    if (!routeId) {
      throw new Error("Не вдалося визначити id маршруту vpohid.");
    }

    const cacheKey = String(routeId);
    const cached = this.detailCache.get(cacheKey);
    const now = Date.now();
    if (!forceRefresh && cached && now - cached.fetchedAt < DETAIL_TTL_MS) {
      return cached.detail;
    }

    try {
      const routeUrl = VPOHID_ROUTE_URL(routeId);
      const html = await fetchHtml(routeUrl);
      const detail = parseRouteDetail(html, routeUrl);

      this.detailCache.set(cacheKey, {
        detail,
        fetchedAt: now
      });
      this.setArchivedDetail(detail);

      return detail;
    } catch (error) {
      const archived = this.getArchivedDetail(routeId);
      if (archived) {
        this.detailCache.set(cacheKey, {
          detail: archived,
          fetchedAt: now
        });
        return archived;
      }
      throw error;
    }
  }

  async getMapItems(regionKey) {
    const region = REGION_BBOXES[regionKey];
    if (!region) {
      return [];
    }

    const cacheKey = `${regionKey}:${region.zoom}`;
    const cached = this.mapItemsCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < MAP_ITEMS_TTL_MS) {
      return cached.items;
    }

    const url = new URL(VPOHID_MAP_ITEMS_URL);
    url.searchParams.append("kind[]", "all");
    url.searchParams.set("zoom", String(region.zoom));

    for (const [key, value] of Object.entries(region.bounds)) {
      url.searchParams.set(`bounds[${key}]`, String(value));
    }

    const payload = await fetchJson(url);
    const items = Array.isArray(payload?.response?.items)
      ? payload.response.items.map(normalizeMapItem).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon) && item.title)
      : [];

    this.mapItemsCache.set(cacheKey, {
      items,
      fetchedAt: now
    });

    return items;
  }

  async getMapItemsByBounds(bounds, zoom = 13) {
    const roundedBounds = Object.fromEntries(
      Object.entries(bounds).map(([key, value]) => [key, Number(value).toFixed(5)])
    );
    const cacheKey = `bounds:${zoom}:${roundedBounds.boundSouthWestLat}:${roundedBounds.boundSouthWestLng}:${roundedBounds.boundNorthEastLat}:${roundedBounds.boundNorthEastLng}`;
    const cached = this.mapItemsCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < MAP_ITEMS_TTL_MS) {
      return cached.items;
    }

    const url = new URL(VPOHID_MAP_ITEMS_URL);
    url.searchParams.append("kind[]", "all");
    url.searchParams.set("zoom", String(zoom));

    for (const [key, value] of Object.entries(bounds)) {
      url.searchParams.set(`bounds[${key}]`, String(value));
    }

    const payload = await fetchJson(url);
    const items = Array.isArray(payload?.response?.items)
      ? payload.response.items.map(normalizeMapItem).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon) && item.title)
      : [];

    this.mapItemsCache.set(cacheKey, {
      items,
      fetchedAt: now
    });

    return items;
  }

  getRegionKeysForCoordinates(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return [];
    }

    const bbox = getBoundingBoxFromCoordinates(coordinates);
    return Object.entries(REGION_BBOXES)
      .filter(([, region]) => boxesIntersect(bbox, region.bounds))
      .map(([key]) => key);
  }

  async resolveRoutePoints(detail) {
    const candidatePoints = buildRoutePointCandidates(detail);
    if (candidatePoints.length < 2) {
      return { points: [], places: [] };
    }

    const regionKeys = inferRegions(detail);
    const itemSets = await Promise.all(regionKeys.map((regionKey) => this.getMapItems(regionKey).catch(() => [])));
    const items = itemSets.flat();

    const resolved = candidatePoints.map((point, index) => {
        const matches = items
          .map((item) => ({ item, score: scoreMapItemForPoint(item, point) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score);

        const bestMatch = matches[0]?.item;
        if (!bestMatch) {
          return {
            point,
            place: null,
            matched: false,
            endpoint: index === 0 || index === candidatePoints.length - 1
          };
        }

        const label = titleToCanonicalPoint(bestMatch.title, bestMatch.kind) || point;
        return {
          point: label,
          place: {
            label,
            lat: bestMatch.lat,
            lon: bestMatch.lon,
            display_name: `${label}, Карпати, Україна`,
            address: {
              region: "Карпати",
              country: "Україна"
            },
            source: "vpohid-map-items",
            itemId: bestMatch.id,
            itemKind: bestMatch.kind,
            itemUrl: bestMatch.viewurl
          },
          matched: true,
          endpoint: index === 0 || index === candidatePoints.length - 1
        };
      })

      // keep endpoints always; keep intermediates only if vpohid map actually recognized them
      .filter((item) => item.endpoint || item.matched);

    return {
      points: resolved.map((item) => item.point),
      places: resolved.map((item) => item.place)
    };
  }

  async getRouteFeatures(detail, coordinates) {
    return this.getRouteFeaturesForCoordinates(coordinates, detail);
  }

  async getRouteFeaturesForCoordinates(coordinates, detail = null) {
    await this.ensureArchiveLoaded();
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return [];
    }

    const routeBounds = padBounds(getBoundingBoxFromCoordinates(coordinates), 0.015, 0.02);
    let items = [];

    try {
      const itemSets = await Promise.all([
        this.getMapItemsByBounds(routeBounds, 13).catch(() => []),
        this.getMapItemsByBounds(routeBounds, 14).catch(() => [])
      ]);
      items = itemSets.flat();
    } catch {
      items = [];
    }

    if (!items.length) {
      if (Array.isArray(detail?.routeFeatures) && detail.routeFeatures.length) {
        return cloneJson(detail.routeFeatures);
      }
      const regionKeys = detail ? inferRegions(detail) : this.getRegionKeysForCoordinates(coordinates);
      if (!regionKeys.length) {
        return [];
      }
      const itemSets = await Promise.all(regionKeys.map((regionKey) => this.getMapItems(regionKey).catch(() => [])));
      items = itemSets.flat();
    }

    const features = [];

    for (const item of items) {
      const classified = classifyVpohidMapItem(item);
      if (!classified) {
        continue;
      }

      const distanceToRoute = getPointToRouteDistanceMeters(item.lon, item.lat, coordinates);
      const threshold =
        classified.type === "water" ? 180 :
        classified.type === "camp" ? 220 :
        classified.type === "shelter" ? 220 : 160;

      if (distanceToRoute > threshold) {
        continue;
      }

      features.push({
        type: classified.type,
        source: "vpohid",
        label: classified.label,
        note: `≈ ${Math.round(distanceToRoute)} м від треку`,
        lat: item.lat,
        lon: item.lon,
        distanceToRoute,
        itemUrl: item.viewurl
      });
    }

    const deduped = new Map();
    for (const item of features.sort((a, b) => (a.distanceToRoute || 0) - (b.distanceToRoute || 0))) {
      const key = `${item.type}:${normalizeValue(item.label)}`;
      if (!deduped.has(key)) {
        deduped.set(key, item);
      }
    }

    const limits = {
      water: 5,
      camp: 4,
      shelter: 4,
      warning: 3,
      exit: 2
    };
    const counters = new Map();

    const limited = [...deduped.values()].filter((item) => {
      const nextCount = (counters.get(item.type) || 0) + 1;
      counters.set(item.type, nextCount);
      return nextCount <= (limits[item.type] || 3);
    });

    if (detail?.id && limited.length) {
      this.setArchivedDetail({
        ...detail,
        routeFeatures: limited
      });
    }

    return limited;
  }

  async syncArchive({ maxRouteId = this.maxRouteId } = {}) {
    if (this.syncPromise) {
      return this.syncPromise;
    }

    this.syncPromise = this.#runArchiveSync({ maxRouteId });
    try {
      return await this.syncPromise;
    } finally {
      this.syncPromise = null;
    }
  }

  async #runArchiveSync({ maxRouteId = this.maxRouteId } = {}) {
    await this.ensureArchiveLoaded();

    const summary = {
      ok: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    for (let routeId = 1; routeId <= maxRouteId; routeId += 1) {
      try {
        const detail = await this.getRouteDetail(routeId, { forceRefresh: true });
        if (!detail?.id) {
          summary.skipped += 1;
          continue;
        }

        let archivedDetail = detail;
        if (Array.isArray(detail.geometryCoordinates) && detail.geometryCoordinates.length >= 2) {
          const routeFeatures = await this.getRouteFeaturesForCoordinates(detail.geometryCoordinates, detail);
          archivedDetail = {
            ...detail,
            routeFeatures
          };
        }

        this.setArchivedDetail(archivedDetail);
        summary.ok += 1;
      } catch (error) {
        summary.failed += 1;
        summary.errors.push({
          routeId,
          error: error?.message || String(error)
        });
      }
    }

    await this.persistArchive();
    return summary;
  }
}

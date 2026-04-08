import Fuse from "fuse.js";
import { CURATED_ROUTES } from "../data/curatedRoutes.js";
import { CARPATHIAN_PLACE_ALIASES, CARPATHIAN_WAYPOINT_SUGGESTIONS } from "../data/carpathianCatalog.js";
import { VpohidLiveService } from "./vpohidLiveService.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_URL = "https://router.project-osrm.org/route/v1/foot";
const OPENROUTESERVICE_URL = "https://api.openrouteservice.org/v2/directions/foot-hiking/geojson";
const GRAPHHOPPER_URL = "https://graphhopper.com/api/1/route";
const ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";
const OSM_TILE_URL = "https://tile.openstreetmap.org";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CARPATHIAN_VIEWBOX = {
  left: 22.5,
  top: 49.25,
  right: 25.95,
  bottom: 47.55
};
const LOCAL_PLACE_ALIASES = CARPATHIAN_PLACE_ALIASES;
const LOCAL_WAYPOINT_SUGGESTIONS = CARPATHIAN_WAYPOINT_SUGGESTIONS;
const PLACE_KIND_HINTS = {
  peak: ["гора", "г ", "піп", "поп", "вершина", "mount"],
  lake: ["озеро", "оз ", "lake"],
  meadow: ["полонина", "пол ", "meadow"],
  checkpoint: ["кпп", "checkpoint"],
  waterfall: ["водоспад", "fall"],
  village: ["село", "смт", "місто", "village"]
};

const MANEUVER_LABELS = {
  depart: "Стартуй",
  arrive: "Фініш",
  turn: "Поверни",
  continue: "Рухайся далі",
  new_name: "Продовжуй",
  merge: "Тримайся напрямку",
  ramp: "Вийди на відгалуження",
  on_ramp: "Зайди на відгалуження",
  off_ramp: "Зійди з відгалуження",
  fork: "На розвилці тримайся",
  end_of_road: "В кінці дороги поверни",
  use_lane: "Тримай смугу",
  roundabout: "На кільці",
  rotary: "На кільцевому русі",
  roundabout_turn: "На кільці поверни",
  notification: "Орієнтуйся",
  exit_roundabout: "Вийди з кільця",
  exit_rotary: "Вийди з кільцевого руху"
};

const MODIFIER_LABELS = {
  uturn: "розворот",
  "sharp right": "різко праворуч",
  right: "праворуч",
  "slight right": "трохи праворуч",
  straight: "прямо",
  "slight left": "трохи ліворуч",
  left: "ліворуч",
  "sharp left": "різко ліворуч"
};

const ORS_STEP_TYPE_TO_MANEUVER = {
  0: { type: "turn", modifier: "left" },
  1: { type: "turn", modifier: "right" },
  4: { type: "turn", modifier: "slight left" },
  5: { type: "turn", modifier: "slight right" },
  6: { type: "continue", modifier: "straight" },
  10: { type: "arrive", modifier: "straight" },
  11: { type: "depart", modifier: "straight" },
  12: { type: "fork", modifier: "slight left" },
  13: { type: "fork", modifier: "slight right" }
};

function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} м`;
  }

  return `${(meters / 1000).toFixed(1)} км`;
}

function formatHeight(meters) {
  return `${Math.round(meters)} м`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  let minutes = Math.round((seconds % 3600) / 60);
  let normalizedHours = hours;

  if (minutes === 60) {
    normalizedHours += 1;
    minutes = 0;
  }

  if (normalizedHours === 0) {
    return `${minutes} хв`;
  }

  if (minutes === 0) {
    return `${normalizedHours} год`;
  }

  return `${normalizedHours} год ${minutes} хв`;
}

function roundCoordinate(value) {
  return Number(value).toFixed(5);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function normalizePlaceLabel(place) {
  const parts = [
    place.display_name?.split(",")[0]?.trim() || place.name || place.address?.city || place.address?.town || place.address?.village || place.address?.hamlet,
    place.address?.city || place.address?.town || place.address?.village || place.address?.hamlet,
    place.address?.state,
    place.address?.country
  ].filter(Boolean);

  return [...new Set(parts)].join(", ");
}

function normalizeLookupValue(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\bг\.\s*/g, "гора ")
    .replace(/\bг\s+/g, "гора ")
    .replace(/\bпол\.\s*/g, "полонина ")
    .replace(/\bпол\s+/g, "полонина ")
    .replace(/\bоз\.\s*/g, "озеро ")
    .replace(/\bоз\s+/g, "озеро ")
    .replace(/[’'`"]/g, "")
    .replace(/[^a-z0-9а-яіїєґ]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function splitLookupTokens(value) {
  return normalizeLookupValue(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

const ROUTE_LOOKUP_RECORDS = [
  ...Object.keys(LOCAL_PLACE_ALIASES).map((key) => ({
    type: "place_alias",
    lookup: normalizeLookupValue(key),
    value: key
  })),
  ...CURATED_ROUTES.flatMap((route) => ([
    route.from.label,
    route.to.label,
    ...(route.from.aliases || []),
    ...(route.to.aliases || []),
    ...(route.requestAliases || []).flatMap((item) => [...item.from, ...item.to])
  ].map((value) => ({
    type: "curated",
    lookup: normalizeLookupValue(value),
    value
  })))),
  ...LOCAL_WAYPOINT_SUGGESTIONS.flatMap((item) => ([item.label, ...(item.aliases || []), ...(item.keywords || [])].map((value) => ({
    type: "waypoint",
    lookup: normalizeLookupValue(value),
    value,
    label: item.label
  }))))
].filter((item) => item.lookup);

const ROUTE_LOOKUP_FUSE = new Fuse(ROUTE_LOOKUP_RECORDS, {
  includeScore: true,
  threshold: 0.32,
  ignoreLocation: true,
  minMatchCharLength: 3,
  keys: [{ name: "lookup", weight: 1 }]
});

function findFuzzyRouteLookup(query, allowedTypes = null) {
  const normalized = normalizeLookupValue(query);
  if (!normalized || normalized.length < 3) {
    return null;
  }

  const normalizedAllowedTypes = Array.isArray(allowedTypes) && allowedTypes.length
    ? new Set(allowedTypes)
    : null;
  const matches = ROUTE_LOOKUP_FUSE.search(normalized, { limit: 5 });
  const match = matches.find((item) => !normalizedAllowedTypes || normalizedAllowedTypes.has(item.item.type));
  if (!match?.item || (match.score ?? 1) > 0.32) {
    return null;
  }

  return match.item;
}

function normalizeWaypointKey(value) {
  return normalizeLookupValue(value)
    .replace(/^(гора|полонина|озеро|кпп|урочище)\s+/i, "")
    .trim();
}

function formatWaypointSuggestionLabel(label) {
  const normalized = normalizeLookupValue(label);

  if (
    normalized.startsWith("гора ") ||
    normalized.startsWith("полонина ") ||
    normalized.startsWith("озеро ") ||
    normalized.startsWith("кпп ") ||
    normalized.startsWith("урочище ")
  ) {
    return label;
  }

  const mountainNames = new Set([
    "говерла",
    "петрос",
    "кукул",
    "близниця",
    "піп іван чорногірський",
    "піп іван",
    "поп іван",
    "смотрич",
    "ігровець",
    "висока",
    "паренки",
    "грофа",
    "аршиця",
    "маковиця",
    "явірник горган",
    "синяк",
    "хом як",
    "хомяк",
    "парашка",
    "тростян",
    "темнатик",
    "гимба",
    "високий верх",
    "стій"
  ]);

  if (mountainNames.has(normalized)) {
    return `гора ${label}`;
  }

  return label;
}

function formatRouteFeatures(routeFeatures = []) {
  if (!Array.isArray(routeFeatures) || !routeFeatures.length) {
    return [];
  }

  const sections = [
    { title: "💧 Вода", type: "water" },
    { title: "⛺ Місця під намет", type: "camp" },
    { title: "🏚 Колиби / укриття", type: "shelter" },
    { title: "⚠️ Важливо", type: "warning" },
    { title: "↘️ Варіанти сходу", type: "exit" }
  ];
  const lines = ["На маршруті:"];

  for (const section of sections) {
    const items = routeFeatures.filter((item) => item.type === section.type);
    if (!items.length) {
      continue;
    }

    lines.push(section.title);
    lines.push(
      ...items.map((item) => {
        if (item.source === "osm" || item.source === "vpohid") {
          const note = item.note.replace(/^OSM-позначка біля маршруту,?\s*/i, "").trim();
          return `✅ ${item.label}${note ? ` ${note}` : ""}`;
        }

        const parts = [item.label];
        if (item.source === "library") {
          parts.push("[перевірено в бібліотеці]");
        } else if (item.source === "fallback") {
          parts.push("[орієнтовно]");
        }
        if (item.note) {
          parts.push(item.note);
        }
        return `• ${parts.join(" — ")}`;
      })
    );
    lines.push("");
  }

  while (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function dedupeRouteFeatures(routeFeatures = []) {
  const deduped = new Map();

  for (const item of routeFeatures) {
    if (!item?.type || !item?.label) {
      continue;
    }

    const key = `${item.type}:${normalizeLookupValue(item.label)}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()];
}

function buildFallbackRouteFeatures({ distance = 0, ascentGain = 0, stops = [] } = {}) {
  const features = [
    {
      type: "water",
      source: "fallback",
      label: "підтверджені джерела не позначені",
      note: distance >= 8000 || ascentGain >= 500
        ? "воду краще мати зі старту з запасом"
        : "воду краще набрати на старті або уточнити локально"
    },
    {
      type: "shelter",
      source: "fallback",
      label: "підтверджені колиби / укриття не позначені",
      note: "не закладай укриття в план без додаткової перевірки"
    },
    {
      type: "warning",
      source: "fallback",
      label: "маршрут згенеровано автоматично",
      note: "воду, табір і укриття перед виходом краще перевірити окремо"
    }
  ];

  if (distance >= 10000 || stops.length > 0) {
    features.unshift({
      type: "camp",
      source: "fallback",
      label: "місце під намет треба обирати на місці",
      note: "дивись рівні ділянки на полонинах або в безпечних відкритих місцях"
    });
  }

  if (distance >= 12000 || ascentGain >= 700) {
    features.push({
      type: "exit",
      source: "fallback",
      label: "запасний схід",
      note: "плануй через найближче село, дорогу або точку повернення по своєму треку"
    });
  }

  return features;
}

function resolveRouteFeatures({ routeFeatures = [], distance = 0, ascentGain = 0, stops = [] } = {}) {
  const known = dedupeRouteFeatures(routeFeatures).map((item) => ({
    ...item,
    source: item.source || "library"
  }));
  if (known.length) {
    return known;
  }

  return buildFallbackRouteFeatures({ distance, ascentGain, stops });
}

function buildGeneratedSafetyNotes({ distance = 0, ascentGain = 0, stops = [], routeFeatures = [], reliable = true } = {}) {
  const notes = [];
  const warningLabels = routeFeatures
    .filter((item) => item.type === "warning")
    .map((item) => normalizeLookupValue(item.label));
  const hasWindExposure = warningLabels.some((label) =>
    label.includes("вітер") || label.includes("гроза") || label.includes("відкрита")
  );
  const hasCamp = routeFeatures.some((item) => item.type === "camp");
  const hasWater = routeFeatures.some((item) => item.type === "water" && item.source !== "fallback");

  if (ascentGain >= 1200) {
    notes.push("• Рано виходь, бо довгий підйом і пізній вихід швидко з'їдають запас часу.");
  } else if (distance >= 14000) {
    notes.push("• Рано виходь, щоб мати запас часу на привали, орієнтування і безпечний спуск.");
  } else {
    notes.push("• Перед виходом перевір прогноз і тримай запас часу на зміну погоди.");
  }

  if (hasWindExposure || ascentGain >= 900) {
    notes.push("• На відкритих ділянках візьми вітрозахист і дощовик, погода в горах змінюється швидко.");
  }

  if (!hasWater || ascentGain >= 700 || distance >= 10000) {
    notes.push("• Воду набирай на старті або на підтверджених точках по шляху, не розраховуй на випадкові потоки.");
  }

  if (hasCamp || stops.length > 0) {
    notes.push("• Місце під намет перевіряй до темряви: рівна ділянка, безпечний відступ від стежки і захист від вітру.");
  }

  if (!reliable) {
    notes.push("• Перед виходом ще раз звір маршрут з офлайн-треком, бо частина ділянок потребує додаткової перевірки.");
  }

  return [...new Set(notes)].slice(0, 4);
}


function getBoundingBox(coordinates, padding = 0.01) {
  const lons = coordinates.map(([lon]) => lon);
  const lats = coordinates.map(([, lat]) => lat);

  return {
    south: Math.min(...lats) - padding,
    west: Math.min(...lons) - padding,
    north: Math.max(...lats) + padding,
    east: Math.max(...lons) + padding
  };
}

function getPointToRouteDistanceMeters(lon, lat, coordinates) {
  const point = { lat, lon };
  let minDistance = Number.POSITIVE_INFINITY;

  for (const coordinate of downsampleCoordinates(coordinates, 80)) {
    const routePoint = { lat: coordinate[1], lon: coordinate[0] };
    minDistance = Math.min(minDistance, getDirectDistanceMeters(point, routePoint));
  }

  return minDistance;
}

function classifyOsmRoutePoi(tags = {}) {
  const tourism = tags.tourism || "";
  const amenity = tags.amenity || "";
  const natural = tags.natural || "";
  const manMade = tags.man_made || "";
  const drinkingWater = tags.drinking_water || "";
  const name = tags.name || "";
  const normalizedName = normalizeLookupValue(name);
  const shelterType = tags.shelter_type || "";

  if (
    normalizedName.includes("точка порятунку") ||
    normalizedName.includes("інформаційно туристичний центр") ||
    normalizedName.includes("екологічний пункт") ||
    normalizedName.includes("біостаціонар") ||
    normalizedName.includes("visitor center") ||
    normalizedName.includes("rescue point")
  ) {
    return null;
  }

  if (drinkingWater === "no") {
    return null;
  }

  if (natural === "spring") {
    return {
      type: "water",
      source: "osm",
      label: name || "джерело",
      note: tags.seasonal === "yes" ? "може бути сезонним" : "OSM-позначка біля маршруту"
    };
  }

  if (amenity === "drinking_water" || manMade === "water_tap" || manMade === "water_well") {
    return {
      type: "water",
      source: "osm",
      label: name || (manMade === "water_well" ? "криниця" : "питна вода"),
      note: "OSM-позначка біля маршруту"
    };
  }

  if (tourism === "wilderness_hut") {
    return {
      type: "shelter",
      source: "osm",
      label: name || "колиба",
      note: "OSM-позначка біля маршруту"
    };
  }

  if (tourism === "alpine_hut") {
    return {
      type: "shelter",
      source: "osm",
      label: name || "притулок",
      note: "OSM-позначка біля маршруту"
    };
  }

  if (amenity === "shelter") {
    if (["basic_hut", "lean_to", "weather_shelter", "public_transport"].includes(shelterType) === false && shelterType) {
      return null;
    }

    return {
      type: "shelter",
      source: "osm",
      label: name || "укриття",
      note: shelterType ? `тип: ${shelterType}` : "OSM-позначка біля маршруту"
    };
  }

  if (tourism === "camp_site" || tourism === "camp_pitch" || amenity === "tent_ground") {
    return {
      type: "camp",
      source: "osm",
      label: name || "місце під намет",
      note: "OSM-позначка біля маршруту"
    };
  }

  return null;
}

function getLocalPlaceAlias(place) {
  const key = normalizeLookupValue(place);
  if (LOCAL_PLACE_ALIASES[key]) {
    return LOCAL_PLACE_ALIASES[key];
  }

  const fuzzy = findFuzzyRouteLookup(place, ["place_alias"]);
  if (fuzzy?.type === "place_alias") {
    return LOCAL_PLACE_ALIASES[fuzzy.value] || null;
  }

  return null;
}

function detectPlaceKindHint(query) {
  const normalized = normalizeLookupValue(query);

  for (const [kind, hints] of Object.entries(PLACE_KIND_HINTS)) {
    if (hints.some((hint) => normalized.includes(normalizeLookupValue(hint)))) {
      return kind;
    }
  }

  const mountainKeywords = [
    "говерла",
    "петрос",
    "кукул",
    "близниця",
    "піп іван",
    "смотрич",
    "ігровець",
    "висока",
    "грофа",
    "паренки",
    "аршиця",
    "маковиця",
    "парашка",
    "тростян",
    "темнатик",
    "гимба",
    "стій"
  ];

  if (mountainKeywords.some((item) => normalized.includes(item))) {
    return "peak";
  }

  return null;
}

function isCarpathianCoordinate(place) {
  const lat = Number(place?.lat);
  const lon = Number(place?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }

  return (
    lon >= CARPATHIAN_VIEWBOX.left &&
    lon <= CARPATHIAN_VIEWBOX.right &&
    lat >= CARPATHIAN_VIEWBOX.bottom &&
    lat <= CARPATHIAN_VIEWBOX.top
  );
}

function looksLikeCarpathianQuery(query) {
  const normalized = normalizeLookupValue(query);

  if (findFuzzyRouteLookup(query, ["place_alias", "curated", "waypoint"])) {
    return true;
  }

  if (Object.keys(LOCAL_PLACE_ALIASES).some((key) => normalized.includes(key) || key.includes(normalized))) {
    return true;
  }

  for (const route of CURATED_ROUTES) {
    const values = [
      route.from.label,
      route.to.label,
      ...(route.from.aliases || []),
      ...(route.to.aliases || []),
      ...(route.requestAliases || []).flatMap((item) => [...item.from, ...item.to])
    ];
    if (values.some((value) => {
      const key = normalizeLookupValue(value);
      return normalized.includes(key) || key.includes(normalized);
    })) {
      return true;
    }
  }

  return LOCAL_WAYPOINT_SUGGESTIONS.some((item) =>
    [item.label, ...(item.aliases || []), ...(item.keywords || [])].some((value) => {
      const key = normalizeLookupValue(value);
      return normalized.includes(key) || key.includes(normalized);
    })
  );
}

function getCanonicalCarpathianQuery(query) {
  const normalized = normalizeLookupValue(query);
  let best = null;

  for (const item of LOCAL_WAYPOINT_SUGGESTIONS) {
    const variants = [item.label, ...(item.aliases || [])];
    let score = 0;

    for (const variant of variants) {
      const key = normalizeLookupValue(variant);
      if (key === normalized) {
        score = Math.max(score, 10);
      } else if (normalized.includes(key) || key.includes(normalized)) {
        score = Math.max(score, 7);
      }
    }

    if (!score) {
      continue;
    }

    const candidate = formatWaypointSuggestionLabel(item.label);
    if (!best || score > best.score || (score === best.score && candidate.length > best.label.length)) {
      best = { label: candidate, score };
    }
  }

  if (best) {
    return best.label;
  }

  const fuzzy = findFuzzyRouteLookup(query, ["waypoint", "curated", "place_alias"]);
  if (fuzzy?.type === "waypoint" && fuzzy.label) {
    return formatWaypointSuggestionLabel(fuzzy.label);
  }
  if (fuzzy?.type === "curated" || fuzzy?.type === "place_alias") {
    return humanizePlaceLabel(fuzzy.value);
  }

  for (const route of CURATED_ROUTES) {
    for (const endpoint of [route.from, route.to]) {
      const variants = [endpoint.label, ...(endpoint.aliases || [])];
      if (variants.some((variant) => {
        const key = normalizeLookupValue(variant);
        return key === normalized || normalized.includes(key) || key.includes(normalized);
      })) {
        return endpoint.label;
      }
    }
  }

  return null;
}

function humanizePlaceLabel(value) {
  return String(value || "")
    .trim()
    .replaceAll(/\s+/g, " ")
    .split(" ")
    .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : "")
    .join(" ");
}

function getCuratedPlaceAlias(place) {
  const key = normalizeLookupValue(place);

  for (const route of CURATED_ROUTES) {
    const fromAliases = route.from.aliases.map(normalizeLookupValue);
    if (fromAliases.includes(key) || normalizeLookupValue(route.from.label) === key) {
      const [lon, lat] = route.coordinates[0];
      return {
        lat,
        lon,
        display_name: `${route.from.label}, ${route.region}, Україна`,
        address: {
          peak: route.from.label,
          state: route.region,
          country: "Україна"
        }
      };
    }

    const toAliases = route.to.aliases.map(normalizeLookupValue);
    if (toAliases.includes(key) || normalizeLookupValue(route.to.label) === key) {
      const [lon, lat] = route.coordinates[route.coordinates.length - 1];
      return {
        lat,
        lon,
        display_name: `${route.to.label}, ${route.region}, Україна`,
        address: {
          peak: route.to.label,
          state: route.region,
          country: "Україна"
        }
      };
    }
  }

  return null;
}

function isLikelyUkrainianPlace(place) {
  const country = normalizeLookupValue(place?.address?.country || "");
  const state = normalizeLookupValue(place?.address?.state || "");
  const display = normalizeLookupValue(place?.display_name || "");

  return (
    country.includes("україна") ||
    country.includes("ukraine") ||
    state.includes("івано франків") ||
    state.includes("закарпат") ||
    state.includes("львів") ||
    state.includes("черніве") ||
    display.includes("україна") ||
    display.includes("ukraine")
  );
}

function scoreGeocodeResult(query, place, kindHint = null) {
  const normalizedQuery = normalizeLookupValue(query);
  const display = normalizeLookupValue(place?.display_name || "");
  const name = normalizeLookupValue(place?.name || "");
  const city = normalizeLookupValue(
    place?.address?.city ||
    place?.address?.town ||
    place?.address?.village ||
    place?.address?.hamlet ||
    ""
  );

  let score = 0;

  if (name === normalizedQuery) {
    score += 8;
  } else if (name.includes(normalizedQuery) || normalizedQuery.includes(name)) {
    score += 5;
  }

  if (city === normalizedQuery) {
    score += 7;
  } else if (city.includes(normalizedQuery) || normalizedQuery.includes(city)) {
    score += 4;
  }

  if (display.includes(normalizedQuery)) {
    score += 3;
  }

  if (isLikelyUkrainianPlace(place)) {
    score += 10;
  }

  if (isCarpathianCoordinate(place)) {
    score += 8;
  }

  if (kindHint === "peak") {
    if (
      normalizeLookupValue(place?.address?.peak || "") ||
      display.includes("гора") ||
      display.includes("вершина")
    ) {
      score += 10;
    }
    if (normalizeLookupValue(place?.address?.village || "") || normalizeLookupValue(place?.address?.town || "")) {
      score -= 4;
    }
  }

  if (kindHint === "lake" && (display.includes("озеро") || normalizeLookupValue(place?.address?.natural || "").includes("озеро"))) {
    score += 10;
  }

  if (kindHint === "meadow" && display.includes("полонина")) {
    score += 9;
  }

  if (kindHint === "checkpoint" && (display.includes("кпп") || display.includes("checkpoint"))) {
    score += 8;
  }

  return score;
}

function makePoint(label, coordinate, region) {
  return {
    lat: coordinate[1],
    lon: coordinate[0],
    display_name: `${label}, ${region}, Україна`,
    address: {
      state: region,
      country: "Україна"
    }
  };
}

function getDirectDistanceMeters(fromPlace, toPlace) {
  const lat1 = Number(fromPlace.lat);
  const lon1 = Number(fromPlace.lon);
  const lat2 = Number(toPlace.lat);
  const lon2 = Number(toPlace.lon);
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

function getPolylineDistanceMeters(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return 0;
  }

  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += getDirectDistanceMeters(
      { lat: coordinates[index - 1][1], lon: coordinates[index - 1][0] },
      { lat: coordinates[index][1], lon: coordinates[index][0] }
    );
  }

  return total;
}

function parseDistanceToMeters(value) {
  const match = String(value || "").match(/(\d+(?:[.,]\d+)?)\s*(км|м)\b/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount)) {
    return null;
  }

  return match[2].toLowerCase() === "км" ? amount * 1000 : amount;
}

function parseDurationToSeconds(value) {
  const normalized = String(value || "").toLowerCase();
  if (!normalized) {
    return null;
  }

  if (/\bдн|дні|день\b/i.test(normalized)) {
    return null;
  }

  const hoursMatch = normalized.match(/(\d+)\s*(год|годин|h)\b/i);
  const minutesMatch = normalized.match(/(\d+)\s*(хв|min)\b/i);
  const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;

  if (!hours && !minutes) {
    return null;
  }

  return hours * 3600 + minutes * 60;
}

function estimateHikingDuration(distanceMeters, ascentGain = 0) {
  const flatHours = distanceMeters / 1000 / 4;
  const ascentHours = ascentGain / 600;

  return Math.round((flatHours + ascentHours) * 3600);
}

function getDifficulty(distanceMeters, hikingDuration, ascentGain = 0) {
  if (distanceMeters >= 18000 || hikingDuration >= 7 * 3600 || ascentGain >= 1000) {
    return "висока";
  }

  if (distanceMeters >= 10000 || hikingDuration >= 4 * 3600 || ascentGain >= 600) {
    return "середня";
  }

  return "помірна";
}

function getDifficultyEmoji(difficulty) {
  if (difficulty === "висока") {
    return "🔴";
  }

  if (difficulty === "середня") {
    return "🟡";
  }

  return "🟢";
}

function getTrailBrief(distanceMeters, hikingDuration, ascentGain = 0) {
  const difficulty = getDifficulty(distanceMeters, hikingDuration, ascentGain);

  if (difficulty === "висока") {
    return "Маршрут фізично вимогливий. Плануй ранній старт, запас води, їжі, офлайн-трек і резерв часу на спуск.";
  }

  if (difficulty === "середня") {
    return "Маршрут середньої складності. Тримай стабільний темп, перевір погоду, офлайн-карту і джерела води по дорозі.";
  }

  return "Маршрут відносно простий, але для гір усе одно тримай запас одягу, води і резервний сценарій спуску.";
}

function getRouteConfidence({ averageSpeed, snappedStart, snappedFinish, routeToDirectRatio, provider }) {
  const reasons = [];

  if (averageSpeed > 7) {
    reasons.push("сервіс дав нетипово високий пішохідний темп");
  }

  if (snappedStart > 500) {
    reasons.push("старт далеко від найближчої дороги або стежки");
  }

  if (snappedFinish > 500) {
    reasons.push("фініш далеко від найближчої дороги або стежки");
  }

  if (routeToDirectRatio > 2.7) {
    reasons.push("маршрут непропорційно довгий відносно прямої відстані");
  }

  if ((provider === "openrouteservice" || provider === "graphhopper" || provider === "graphhopper-foot") && reasons.length === 0) {
    return { label: "висока", reasons: ["маршрут побудовано hiking-профілем"] };
  }

  if (reasons.length >= 2) {
    return { label: "низька", reasons };
  }

  if (reasons.length === 1) {
    return { label: "середня", reasons };
  }

  return { label: "висока", reasons: ["точки добре прив'язані до маршрутній мережі"] };
}

function isTrailFeature(place) {
  const raw = [
    place.category,
    place.type,
    place.class,
    place.addresstype,
    place.display_name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return [
    "peak",
    "mountain",
    "ridge",
    "summit",
    "hill",
    "natural",
    "camp_site",
    "alpine_hut",
    "wilderness_hut",
    "polonyna",
    "полони",
    "гора",
    "mount"
  ].some((token) => raw.includes(token));
}

function buildCheckpoints(steps, totalDistance) {
  if (!steps.length || totalDistance <= 0) {
    return [];
  }

  const thresholds = [0.25, 0.5, 0.75].map((part) => totalDistance * part);
  const checkpoints = [];
  let cumulative = 0;

  for (const step of steps) {
    cumulative += step.distance;

    while (thresholds.length && cumulative >= thresholds[0]) {
      const current = thresholds.shift();
      const percentage = Math.round((current / totalDistance) * 100);
      checkpoints.push(step.name ? `≈ ${percentage}% біля ${step.name}` : `≈ ${percentage}% маршруту`);
    }

    if (!thresholds.length) {
      break;
    }
  }

  return checkpoints;
}

function formatRouteFlags({ trackQuality, provider, reliable }) {
  const flags = [];

  if (trackQuality === "verified") {
    flags.push("• Трек: верифікований GPX/KML доступний");
  } else if (trackQuality === "router-generated") {
    flags.push("• Трек: згенерований hiking-профілем, доступний GPX/KML");
  } else {
    flags.push("• Трек: точний GPX/KML поки недоступний");
  }

  if (provider === "curated-library") {
    flags.push("• Джерело: перевірена бібліотека маршрутів");
  } else if (provider === "openrouteservice" || provider === "graphhopper" || provider === "graphhopper-foot") {
    flags.push("• Побудова: hiking-профіль маршрутизації");
  } else if (provider) {
    flags.push("• Побудова: допоміжний routing-сервіс");
  }

  flags.push(`• Статус маршруту: ${reliable ? "виглядає надійно" : "потрібна додаткова перевірка"}`);

  return flags;
}

function formatCheckpointHints(checkpoints) {
  if (!checkpoints.length) {
    return "• немає виразних проміжних орієнтирів";
  }

  return checkpoints
    .map((item) => item.replace(/^≈ \d+% біля /, "• ").replace(/^≈ \d+% маршруту$/, "• проміжна ділянка без чіткої назви"))
    .join("\n");
}

function formatManeuver(step, index) {
  const maneuverType = step.maneuver?.type || "continue";
  const modifier = step.maneuver?.modifier;
  const action = MANEUVER_LABELS[maneuverType] || "Рухайся";
  const direction = modifier ? MODIFIER_LABELS[modifier] || modifier : "";
  const stepName = step.name ? ` на ${step.name}` : "";
  const distance = formatDistance(step.distance);

  if (maneuverType === "arrive") {
    return `${index + 1}. Фініш. Ще ${distance}.`;
  }

  if (maneuverType === "depart") {
    return `${index + 1}. Стартуй${stepName}. Перший відрізок ${distance}.`;
  }

  return `${index + 1}. ${action} ${direction}${stepName}. Відрізок ${distance}.`.replace(/\s+/g, " ").trim();
}

function sanitizeStepName(name) {
  const value = String(name || "").trim();
  return value === "-" ? "" : value;
}

function downsampleCoordinates(coordinates, limit = 100) {
  if (coordinates.length <= limit) {
    return coordinates;
  }

  const sampled = [];
  for (let index = 0; index < limit; index += 1) {
    const position = Math.round((index * (coordinates.length - 1)) / (limit - 1));
    sampled.push(coordinates[position]);
  }

  return sampled;
}

function calculateElevationStats(elevations) {
  if (!Array.isArray(elevations) || elevations.length < 2) {
    return {
      min: null,
      max: null,
      ascentGain: 0,
      descentGain: 0
    };
  }

  let ascentGain = 0;
  let descentGain = 0;

  for (let index = 1; index < elevations.length; index += 1) {
    const diff = elevations[index] - elevations[index - 1];
    if (diff > 0) {
      ascentGain += diff;
    } else {
      descentGain += Math.abs(diff);
    }
  }

  return {
    min: Math.min(...elevations),
    max: Math.max(...elevations),
    ascentGain,
    descentGain
  };
}

function calculateSmoothedElevationStats(elevations, minStep = 12) {
  if (!Array.isArray(elevations) || elevations.length < 2) {
    return {
      min: null,
      max: null,
      ascentGain: 0,
      descentGain: 0
    };
  }

  let ascentGain = 0;
  let descentGain = 0;
  let previous = elevations[0];

  for (let index = 1; index < elevations.length; index += 1) {
    const current = elevations[index];
    const diff = current - previous;

    if (Math.abs(diff) < minStep) {
      continue;
    }

    if (diff > 0) {
      ascentGain += diff;
    } else {
      descentGain += Math.abs(diff);
    }

    previous = current;
  }

  return {
    min: Math.min(...elevations),
    max: Math.max(...elevations),
    ascentGain,
    descentGain
  };
}

function getElevationStatsFromCoordinates(coordinates) {
  const elevations = coordinates.map((item) => item[2]).filter((value) => Number.isFinite(value));

  if (elevations.length < 2) {
    return null;
  }

  return calculateElevationStats(elevations);
}

function getSmoothedElevationStatsFromCoordinates(coordinates, minStep = 12) {
  const elevations = coordinates.map((item) => item[2]).filter((value) => Number.isFinite(value));

  if (elevations.length < 2) {
    return null;
  }

  return calculateSmoothedElevationStats(elevations, minStep);
}

function sanitizeFileName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "route";
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildMapLinks(fromPlace, toPlace) {
  const routeParam = `${fromPlace.lat},${fromPlace.lon};${toPlace.lat},${toPlace.lon}`;
  const googleUrl = new URL("https://www.google.com/maps/dir/");
  googleUrl.searchParams.set("api", "1");
  googleUrl.searchParams.set("origin", `${fromPlace.lat},${fromPlace.lon}`);
  googleUrl.searchParams.set("destination", `${toPlace.lat},${toPlace.lon}`);
  googleUrl.searchParams.set("travelmode", "walking");

  return {
    osmDirections: `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${encodeURIComponent(routeParam)}`,
    googleDirections: googleUrl.toString(),
    osmStart: `https://www.openstreetmap.org/?mlat=${fromPlace.lat}&mlon=${fromPlace.lon}#map=14/${fromPlace.lat}/${fromPlace.lon}`,
    osmFinish: `https://www.openstreetmap.org/?mlat=${toPlace.lat}&mlon=${toPlace.lon}#map=14/${toPlace.lat}/${toPlace.lon}`
  };
}

function buildMapLinksForPlaces(places) {
  const validPlaces = places.filter((place) => place?.lat && place?.lon);
  if (validPlaces.length < 2) {
    return null;
  }

  const routeParam = validPlaces.map((place) => `${place.lat},${place.lon}`).join(";");
  const first = validPlaces[0];
  const last = validPlaces[validPlaces.length - 1];
  const googleUrl = new URL("https://www.google.com/maps/dir/");
  googleUrl.searchParams.set("api", "1");
  googleUrl.searchParams.set("origin", `${first.lat},${first.lon}`);
  googleUrl.searchParams.set("destination", `${last.lat},${last.lon}`);
  if (validPlaces.length > 2) {
    googleUrl.searchParams.set(
      "waypoints",
      validPlaces
        .slice(1, -1)
        .map((place) => `${place.lat},${place.lon}`)
        .join("|")
    );
  }
  googleUrl.searchParams.set("travelmode", "walking");

  return {
    osmDirections: `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${encodeURIComponent(routeParam)}`,
    googleDirections: googleUrl.toString(),
    osmStart: `https://www.openstreetmap.org/?mlat=${first.lat}&mlon=${first.lon}#map=14/${first.lat}/${first.lon}`,
    osmFinish: `https://www.openstreetmap.org/?mlat=${last.lat}&mlon=${last.lon}#map=14/${last.lat}/${last.lon}`
  };
}

function buildMapLinksFromCoordinates(startCoordinate, finishCoordinate) {
  return buildMapLinks(
    { lat: startCoordinate[1], lon: startCoordinate[0] },
    { lat: finishCoordinate[1], lon: finishCoordinate[0] }
  );
}

function dedupeJoinedCoordinates(segments) {
  return segments.flatMap((segment, index) => {
    if (!Array.isArray(segment)) {
      return [];
    }
    return index === 0 ? segment : segment.slice(1);
  });
}

function makeCoordinateFromPlace(place, elevation = null) {
  return [
    Number(place.lon),
    Number(place.lat),
    Number.isFinite(elevation) ? Number(elevation) : undefined
  ].filter((value) => value !== undefined);
}

function buildGpx({ name, fromLabel, toLabel, coordinates, routeFeatures = [] }) {
  const trackPoints = coordinates
    .map((coord) => {
      const ele = Number.isFinite(coord[2]) ? `\n        <ele>${Number(coord[2]).toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${coord[1]}" lon="${coord[0]}">${ele}\n      </trkpt>`;
    })
    .join("\n");
  const waypoints = routeFeatures
    .filter((feature) => Number.isFinite(feature.lat) && Number.isFinite(feature.lon))
    .map((feature) => {
      const note = feature.note ? `\n    <desc>${xmlEscape(feature.note)}</desc>` : "";
      const type = feature.type ? `\n    <type>${xmlEscape(feature.type)}</type>` : "";
      return `  <wpt lat="${feature.lat}" lon="${feature.lon}">
    <name>${xmlEscape(feature.label)}</name>${note}${type}
  </wpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="hiking-telegram-bot" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${xmlEscape(name)}</name>
    <desc>${xmlEscape(`${fromLabel} -> ${toLabel}`)}</desc>
  </metadata>
${waypoints ? `${waypoints}\n` : ""}  <trk>
    <name>${xmlEscape(name)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

function buildKml({ name, fromLabel, toLabel, coordinates, routeFeatures = [] }) {
  const pathCoordinates = coordinates
    .map((coord) => `${coord[0]},${coord[1]},${Number.isFinite(coord[2]) ? Number(coord[2]).toFixed(1) : 0}`)
    .join(" ");
  const placemarks = routeFeatures
    .filter((feature) => Number.isFinite(feature.lat) && Number.isFinite(feature.lon))
    .map((feature) => `    <Placemark>
      <name>${xmlEscape(feature.label)}</name>
      <description>${xmlEscape(feature.note || feature.type || "")}</description>
      <Point>
        <coordinates>${feature.lon},${feature.lat},0</coordinates>
      </Point>
    </Placemark>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xmlEscape(name)}</name>
    <description>${xmlEscape(`${fromLabel} -> ${toLabel}`)}</description>
${placemarks ? `${placemarks}\n` : ""}    <Placemark>
      <name>${xmlEscape(name)}</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${pathCoordinates}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
}

function buildHtmlMap({ name, svgMarkup, coordinates }) {
  const inlineSvg = String(svgMarkup).replace(/^\s*<\?xml[^>]*>\s*/i, "");
  const routePoints = Array.isArray(coordinates) ? coordinates : [];
  return `<!DOCTYPE html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${xmlEscape(name)}</title>
    <style>
      * { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; }
      body {
        background: #eef3e8;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: hidden;
      }
      .wrap {
        min-height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .frame {
        width: min(100%, 1400px);
        height: min(100vh - 32px, 900px);
        background: white;
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18);
        position: relative;
      }
      .viewport {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #eef3e8;
        touch-action: none;
        cursor: grab;
      }
      .layer {
        position: absolute;
        inset: 0;
      }
      .viewport.dragging {
        cursor: grabbing;
      }
      .fallback-image {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        user-select: none;
        -webkit-user-drag: none;
        pointer-events: none;
        opacity: 1;
        transition: opacity 180ms ease;
      }
      .fallback-image svg {
        display: block;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      .fallback-image.hidden {
        opacity: 0;
      }
      .tiles-layer {
        background: #eef3e8;
      }
      .tiles-layer img {
        position: absolute;
        width: 256px;
        height: 256px;
        image-rendering: auto;
        user-select: none;
        -webkit-user-drag: none;
      }
      .route-overlay {
        pointer-events: none;
      }
      .route-overlay svg {
        display: block;
        width: 100%;
        height: 100%;
      }
      .controls {
        position: absolute;
        top: 16px;
        right: 16px;
        z-index: 2;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .controls button {
        border: 0;
        border-radius: 10px;
        background: rgba(255,255,255,0.94);
        color: #0f172a;
        padding: 10px 12px;
        font-size: 16px;
        font-weight: 700;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
        cursor: pointer;
      }
      .controls button:hover {
        background: white;
      }
      .hint {
        position: absolute;
        right: 16px;
        bottom: 16px;
        z-index: 2;
        background: rgba(255,255,255,0.9);
        color: #334155;
        padding: 8px 10px;
        border-radius: 10px;
        font-size: 12px;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="frame">
        <div class="controls">
          <button type="button" data-zoom-in>+</button>
          <button type="button" data-zoom-out>-</button>
          <button type="button" data-reset>100%</button>
        </div>
        <div class="hint">Колесо миші: zoom. Перетягування: pan.</div>
        <div class="viewport" data-viewport>
          <div class="layer tiles-layer" data-tiles-layer></div>
          <div class="layer route-overlay" data-route-overlay></div>
          <div class="fallback-image" data-fallback-image aria-label="${xmlEscape(name)}">${inlineSvg}</div>
        </div>
      </div>
    </div>
    <script>
      const viewport = document.querySelector('[data-viewport]');
      const tilesLayer = document.querySelector('[data-tiles-layer]');
      const routeOverlay = document.querySelector('[data-route-overlay]');
      const fallbackImage = document.querySelector('[data-fallback-image]');
      const zoomInButton = document.querySelector('[data-zoom-in]');
      const zoomOutButton = document.querySelector('[data-zoom-out]');
      const resetButton = document.querySelector('[data-reset]');
      const routePoints = ${JSON.stringify(routePoints)};

      let zoom = 12;
      let centerX = 0;
      let centerY = 0;
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let startCenterX = 0;
      let startCenterY = 0;
      let wheelAccumulator = 0;

      function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
      }

      function lonToWorldX(lon, level) {
        const scale = 256 * Math.pow(2, level);
        return ((lon + 180) / 360) * scale;
      }

      function latToWorldY(lat, level) {
        const scale = 256 * Math.pow(2, level);
        const rad = (lat * Math.PI) / 180;
        const merc = Math.log(Math.tan(Math.PI / 4 + rad / 2));
        return (0.5 - merc / (2 * Math.PI)) * scale;
      }

      function worldToScreen(worldX, worldY) {
        const rect = viewport.getBoundingClientRect();
        return [
          worldX - centerX + rect.width / 2,
          worldY - centerY + rect.height / 2
        ];
      }

      function renderTiles() {
        const rect = viewport.getBoundingClientRect();
        const tileMinX = Math.floor((centerX - rect.width / 2) / 256);
        const tileMaxX = Math.floor((centerX + rect.width / 2) / 256);
        const tileMinY = Math.floor((centerY - rect.height / 2) / 256);
        const tileMaxY = Math.floor((centerY + rect.height / 2) / 256);
        const maxTileIndex = Math.pow(2, zoom) - 1;
        const fragments = [];

        for (let tileX = tileMinX; tileX <= tileMaxX; tileX += 1) {
          for (let tileY = tileMinY; tileY <= tileMaxY; tileY += 1) {
            if (tileY < 0 || tileY > maxTileIndex) {
              continue;
            }
            const wrappedX = ((tileX % (maxTileIndex + 1)) + (maxTileIndex + 1)) % (maxTileIndex + 1);
            const [screenX, screenY] = worldToScreen(tileX * 256, tileY * 256);
            fragments.push(
              '<img src="https://tile.openstreetmap.org/' + zoom + '/' + wrappedX + '/' + tileY + '.png" ' +
              'style="left:' + Math.round(screenX) + 'px;top:' + Math.round(screenY) + 'px" />'
            );
          }
        }

        tilesLayer.innerHTML = fragments.join('');
      }

      function renderRoute() {
        const rect = viewport.getBoundingClientRect();
        const points = routePoints
          .map(([lon, lat]) => {
            const [x, y] = worldToScreen(lonToWorldX(lon, zoom), latToWorldY(lat, zoom));
            return x.toFixed(1) + ',' + y.toFixed(1);
          })
          .join(' ');

        if (!points) {
          routeOverlay.innerHTML = '';
          return;
        }

        const [startLon, startLat] = routePoints[0];
        const [finishLon, finishLat] = routePoints[routePoints.length - 1];
        const [startX, startY] = worldToScreen(lonToWorldX(startLon, zoom), latToWorldY(startLat, zoom));
        const [finishX, finishY] = worldToScreen(lonToWorldX(finishLon, zoom), latToWorldY(finishLat, zoom));

        routeOverlay.innerHTML =
          '<svg viewBox="0 0 ' + rect.width + ' ' + rect.height + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
            '<polyline points="' + points + '" fill="none" stroke="#e8590c" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<circle cx="' + startX.toFixed(1) + '" cy="' + startY.toFixed(1) + '" r="10" fill="#0b7285" stroke="white" stroke-width="3"/>' +
            '<circle cx="' + finishX.toFixed(1) + '" cy="' + finishY.toFixed(1) + '" r="10" fill="#2b8a3e" stroke="white" stroke-width="3"/>' +
          '</svg>';
      }

      function renderAll() {
        renderTiles();
        renderRoute();
      }

      function fitToRoute() {
        const rect = viewport.getBoundingClientRect();
        let fittedZoom = 14;

        for (let candidate = 15; candidate >= 9; candidate -= 1) {
          const xs = routePoints.map(([lon]) => lonToWorldX(lon, candidate));
          const ys = routePoints.map(([, lat]) => latToWorldY(lat, candidate));
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const widthSpan = maxX - minX;
          const heightSpan = maxY - minY;

          if (widthSpan <= rect.width * 0.72 && heightSpan <= rect.height * 0.72) {
            fittedZoom = candidate;
            break;
          }
        }

        zoom = fittedZoom;
        const xs = routePoints.map(([lon]) => lonToWorldX(lon, zoom));
        const ys = routePoints.map(([, lat]) => latToWorldY(lat, zoom));
        centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
        centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
        renderAll();
      }

      function setZoom(nextZoom, anchorX, anchorY) {
        const rect = viewport.getBoundingClientRect();
        const clampedZoom = clamp(nextZoom, 9, 17);
        const worldX = centerX + anchorX - rect.width / 2;
        const worldY = centerY + anchorY - rect.height / 2;
        const scaleRatio = Math.pow(2, clampedZoom - zoom);
        centerX = worldX * scaleRatio - anchorX + rect.width / 2;
        centerY = worldY * scaleRatio - anchorY + rect.height / 2;
        zoom = clampedZoom;
        renderAll();
      }

      viewport.addEventListener('wheel', (event) => {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        wheelAccumulator += event.deltaY;
        const threshold = 120;

        if (Math.abs(wheelAccumulator) < threshold) {
          return;
        }

        const direction = wheelAccumulator < 0 ? 1 : -1;
        wheelAccumulator = 0;
        setZoom(direction === 1 ? zoom + 1 : zoom - 1, event.clientX - rect.left, event.clientY - rect.top);
      }, { passive: false });

      viewport.addEventListener('pointerdown', (event) => {
        dragging = true;
        viewport.classList.add('dragging');
        startX = event.clientX;
        startY = event.clientY;
        startCenterX = centerX;
        startCenterY = centerY;
      });

      window.addEventListener('pointermove', (event) => {
        if (!dragging) {
          return;
        }
        centerX = startCenterX - (event.clientX - startX);
        centerY = startCenterY - (event.clientY - startY);
        renderAll();
      });

      window.addEventListener('pointerup', () => {
        dragging = false;
        viewport.classList.remove('dragging');
      });

      zoomInButton.addEventListener('click', () => {
        const rect = viewport.getBoundingClientRect();
        setZoom(zoom + 1, rect.width / 2, rect.height / 2);
      });

      zoomOutButton.addEventListener('click', () => {
        const rect = viewport.getBoundingClientRect();
        setZoom(zoom - 1, rect.width / 2, rect.height / 2);
      });

      resetButton.addEventListener('click', () => {
        fitToRoute();
      });

      tilesLayer.addEventListener('load', () => {
        fallbackImage.classList.add('hidden');
      }, true);

      window.addEventListener('resize', fitToRoute);
      fitToRoute();
    </script>
  </body>
</html>`;
}

function buildSvgPreview({ name, coordinates }) {
  const width = 1400;
  const height = 900;
  const sidePadding = 120;
  const bottomPadding = 110;
  const topInfoHeight = 210;
  const lons = coordinates.map((coord) => coord[0]);
  const lats = coordinates.map((coord) => coord[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lonSpan = Math.max(maxLon - minLon, 0.0001);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const usableWidth = width - sidePadding * 2;
  const usableHeight = height - topInfoHeight - bottomPadding;
  const scale = Math.min(usableWidth / lonSpan, usableHeight / latSpan);
  const drawWidth = lonSpan * scale;
  const drawHeight = latSpan * scale;
  const offsetX = sidePadding + (usableWidth - drawWidth) / 2;
  const offsetY = topInfoHeight + (usableHeight - drawHeight) / 2;

  const points = coordinates.map((coord) => {
    const x = offsetX + (coord[0] - minLon) * scale;
    const y = offsetY + drawHeight - (coord[1] - minLat) * scale;
    return [x.toFixed(1), y.toFixed(1)];
  });

  const polyline = points.map((point) => point.join(",")).join(" ");
  const start = points[0];
  const finish = points[points.length - 1];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#f5f1e8"/>
      <stop offset="100%" stop-color="#e7efe2"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <g opacity="0.16" stroke="#6b7c5a" stroke-width="2">
    <path d="M0 180 C260 120 460 220 700 170 S1120 100 1400 160" fill="none"/>
    <path d="M0 520 C230 460 470 560 760 500 S1110 420 1400 520" fill="none"/>
    <path d="M0 760 C220 700 460 800 760 740 S1140 680 1400 760" fill="none"/>
  </g>
  <polyline points="${polyline}" fill="none" stroke="#d9480f" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${start[0]}" cy="${start[1]}" r="16" fill="#0b7285"/>
  <circle cx="${finish[0]}" cy="${finish[1]}" r="16" fill="#2b8a3e"/>
  <rect x="48" y="36" width="760" height="126" rx="22" fill="rgba(255,255,255,0.90)"/>
  <text x="68" y="84" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#1f2933">${xmlEscape(name)}</text>
  <text x="68" y="122" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#334155">Точне прев’ю лінії треку без перебудови маршруту сторонніми картами.</text>
</svg>`;
}

function lonToWorldX(lon, zoom) {
  const scale = 256 * 2 ** zoom;
  return ((lon + 180) / 360) * scale;
}

function latToWorldY(lat, zoom) {
  const scale = 256 * 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  const merc = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return (0.5 - merc / (2 * Math.PI)) * scale;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeExportMeta({ from, to, provider, coordinates, fromPlace, toPlace }) {
  const name = `${from} - ${to}`;
  const baseFileName = sanitizeFileName(`${from}-${to}`);

  return {
    provider,
    geometry: {
      coordinates
    },
    mapLinks: buildMapLinks(fromPlace, toPlace),
    fileBaseName: baseFileName,
    labels: {
      name,
      from: normalizePlaceLabel(fromPlace),
      to: normalizePlaceLabel(toPlace)
    }
  };
}

function findCuratedRoute(from, to) {
  const fromKey = normalizeLookupValue(from);
  const toKey = normalizeLookupValue(to);
  const fuzzyFrom = normalizeLookupValue(getCanonicalCarpathianQuery(from) || from);
  const fuzzyTo = normalizeLookupValue(getCanonicalCarpathianQuery(to) || to);

  for (const route of CURATED_ROUTES) {
    const fromAliases = route.from.aliases.map(normalizeLookupValue);
    const toAliases = route.to.aliases.map(normalizeLookupValue);

    if ((fromAliases.includes(fromKey) || fromAliases.includes(fuzzyFrom)) && (toAliases.includes(toKey) || toAliases.includes(fuzzyTo))) {
      return {
        route,
        requestedAliasNote: null
      };
    }

    for (const alias of route.requestAliases || []) {
      const aliasFrom = alias.from.map(normalizeLookupValue);
      const aliasTo = alias.to.map(normalizeLookupValue);
      if ((aliasFrom.includes(fromKey) || aliasFrom.includes(fuzzyFrom)) && (aliasTo.includes(toKey) || aliasTo.includes(fuzzyTo))) {
        return {
          route,
          requestedAliasNote: alias.note || null
        };
      }
    }

    if ((toAliases.includes(fromKey) || toAliases.includes(fuzzyFrom)) && (fromAliases.includes(toKey) || fromAliases.includes(fuzzyTo))) {
      return {
        route: {
          ...route,
          id: `${route.id}-reverse`,
          from: route.to,
          to: route.from,
          coordinates: [...route.coordinates].reverse(),
          ascentGainMeters: route.descentGainMeters,
          descentGainMeters: route.ascentGainMeters,
          brief: `Зворотний варіант маршруту ${route.to.label} -> ${route.from.label}.`
        },
        requestedAliasNote: "Маршрут побудовано на основі перевіреного маршруту у зворотному напрямку."
      };
    }
  }

  return null;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchBuffer(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export class RouteService {
  constructor(options = {}) {
    this.openRouteServiceApiKey = options.openRouteServiceApiKey || "";
    this.graphHopperApiKey = options.graphHopperApiKey || "";
    this.vpohidLiveService = options.vpohidLiveService || new VpohidLiveService();
  }

  async geocode(place) {
    const localAlias = getLocalPlaceAlias(place);
    if (localAlias) {
      return localAlias;
    }

    const curatedAlias = getCuratedPlaceAlias(place);
    if (curatedAlias) {
      return curatedAlias;
    }

    const kindHint = detectPlaceKindHint(place);
    const canonicalCarpathianQuery = getCanonicalCarpathianQuery(place);
    const boundedCarpathian = looksLikeCarpathianQuery(place);
    const tryQueries = [];
    const candidates = [
      canonicalCarpathianQuery,
      place,
      canonicalCarpathianQuery ? `${canonicalCarpathianQuery}, Україна` : null,
      `${place}, Україна`
    ].filter(Boolean);

    for (const query of [...new Set(candidates)]) {
      tryQueries.push({ q: query, countrycodes: "ua", bounded: boundedCarpathian });
      tryQueries.push({ q: query, countrycodes: "ua", bounded: false });
    }

    tryQueries.push({ q: place, countrycodes: "", bounded: boundedCarpathian });

    let bestResult = null;
    let bestScore = -Infinity;

    for (const attempt of tryQueries) {
      const url = new URL(NOMINATIM_URL);
      url.searchParams.set("q", attempt.q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "5");
      url.searchParams.set("addressdetails", "1");

      if (attempt.countrycodes) {
        url.searchParams.set("countrycodes", attempt.countrycodes);
      }

      if (attempt.bounded) {
        url.searchParams.set(
          "viewbox",
          `${CARPATHIAN_VIEWBOX.left},${CARPATHIAN_VIEWBOX.top},${CARPATHIAN_VIEWBOX.right},${CARPATHIAN_VIEWBOX.bottom}`
        );
        url.searchParams.set("bounded", "1");
      }

      const results = await fetchJson(url, {
        headers: {
          "Accept-Language": "uk",
          "User-Agent": "hiking-telegram-bot/0.1"
        }
      });

      for (const result of results) {
        const score = scoreGeocodeResult(canonicalCarpathianQuery || place, result, kindHint);
        if (score > bestScore) {
          bestScore = score;
          bestResult = result;
        }
      }

      if (bestResult && isLikelyUkrainianPlace(bestResult) && (!boundedCarpathian || isCarpathianCoordinate(bestResult))) {
        break;
      }
    }

    return bestResult || null;
  }

  async getElevationStats(routeCoordinates) {
    const sampled = downsampleCoordinates(routeCoordinates);
    const url = new URL(ELEVATION_URL);
    url.searchParams.set("latitude", sampled.map((item) => item[1]).join(","));
    url.searchParams.set("longitude", sampled.map((item) => item[0]).join(","));

    const data = await fetchJson(url, {
      headers: {
        "User-Agent": "hiking-telegram-bot/0.1"
      }
    });

    return calculateElevationStats(data.elevation || []);
  }

  async getPointElevations(places) {
    const url = new URL(ELEVATION_URL);
    url.searchParams.set("latitude", places.map((item) => item.lat).join(","));
    url.searchParams.set("longitude", places.map((item) => item.lon).join(","));

    const data = await fetchJson(url, {
      headers: {
        "User-Agent": "hiking-telegram-bot/0.1"
      }
    });

    return Array.isArray(data.elevation) ? data.elevation : [];
  }

  async getRoutePois(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return [];
    }

    const bbox = getBoundingBox(coordinates);
    const query = [
      "[out:json][timeout:25];",
      "(",
      `  nwr["natural"="spring"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});`,
      `  nwr["amenity"="drinking_water"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});`,
      `  nwr["man_made"~"water_tap|water_well"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});`,
      `  nwr["tourism"~"wilderness_hut|alpine_hut|camp_site|camp_pitch"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});`,
      `  nwr["amenity"~"shelter|tent_ground"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});`,
      ");",
      "out center tags;"
    ].join("\n");

    let osmElements = [];
    try {
      const data = await fetchJson(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "hiking-telegram-bot/0.1"
        },
        body: new URLSearchParams({ data: query }).toString()
      });
      osmElements = data.elements || [];
    } catch {
      osmElements = [];
    }

    const features = [];

    for (const element of osmElements) {
      const tags = element.tags || {};
      const poi = classifyOsmRoutePoi(tags);
      if (!poi) {
        continue;
      }

      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }

      const distanceToRoute = getPointToRouteDistanceMeters(lon, lat, coordinates);
      const threshold =
        poi.type === "water" ? 150 :
        poi.type === "shelter" ? 180 :
        poi.type === "camp" ? 180 : 180;

      if (distanceToRoute > threshold) {
        continue;
      }

      features.push({
        ...poi,
        lat,
        lon,
        distanceToRoute,
        note: poi.note ? `${poi.note}, ≈ ${Math.round(distanceToRoute)} м від треку` : `≈ ${Math.round(distanceToRoute)} м від треку`
      });
    }

    try {
      const vpohidFeatures = await this.vpohidLiveService.getRouteFeaturesForCoordinates(coordinates);
      features.unshift(...vpohidFeatures);
    } catch {
      // keep OSM-derived features only
    }

    const deduped = dedupeRouteFeatures(features)
      .sort((left, right) => (left.distanceToRoute || 0) - (right.distanceToRoute || 0));

    const limits = {
      water: 4,
      camp: 3,
      shelter: 3,
      warning: 2,
      exit: 2
    };
    const counters = new Map();

    return deduped.filter((item) => {
      const nextCount = (counters.get(item.type) || 0) + 1;
      counters.set(item.type, nextCount);
      return nextCount <= (limits[item.type] || 3);
    });
  }

  async buildTrackPreviewSvg(routeMeta) {
    const coordinates = routeMeta?.geometry?.coordinates;
    const name = routeMeta?.labels?.name || "Hiking route";

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return buildSvgPreview({ name, coordinates: coordinates || [[24.5, 48.2], [24.6, 48.3]] });
    }

    const width = 1400;
    const height = 900;
    const framePadding = 90;
    const usableWidth = width - framePadding * 2;
    const usableHeight = height - framePadding * 2;
    const lons = coordinates.map((coord) => coord[0]);
    const lats = coordinates.map((coord) => coord[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const lonPad = Math.max((maxLon - minLon) * 0.24, 0.02);
    const latPad = Math.max((maxLat - minLat) * 0.24, 0.02);
    const paddedMinLon = minLon - lonPad;
    const paddedMaxLon = maxLon + lonPad;
    const paddedMinLat = minLat - latPad;
    const paddedMaxLat = maxLat + latPad;

    let zoom = 12;
    for (let candidate = 15; candidate >= 9; candidate -= 1) {
      const spanX = lonToWorldX(paddedMaxLon, candidate) - lonToWorldX(paddedMinLon, candidate);
      const spanY = latToWorldY(paddedMinLat, candidate) - latToWorldY(paddedMaxLat, candidate);
      if (spanX <= usableWidth && spanY <= usableHeight) {
        zoom = candidate;
        break;
      }
    }

    const routeMinWorldX = lonToWorldX(paddedMinLon, zoom);
    const routeMaxWorldX = lonToWorldX(paddedMaxLon, zoom);
    const routeMinWorldY = latToWorldY(paddedMaxLat, zoom);
    const routeMaxWorldY = latToWorldY(paddedMinLat, zoom);
    const routeWidth = Math.max(routeMaxWorldX - routeMinWorldX, 1);
    const routeHeight = Math.max(routeMaxWorldY - routeMinWorldY, 1);
    const scale = Math.min(usableWidth / routeWidth, usableHeight / routeHeight);
    const routeCenterWorldX = (routeMinWorldX + routeMaxWorldX) / 2;
    const routeCenterWorldY = (routeMinWorldY + routeMaxWorldY) / 2;
    const viewportMinWorldX = routeCenterWorldX - width / (2 * scale);
    const viewportMinWorldY = routeCenterWorldY - height / (2 * scale);
    const viewportMaxWorldX = viewportMinWorldX + width / scale;
    const viewportMaxWorldY = viewportMinWorldY + height / scale;

    const tileMinX = Math.floor(viewportMinWorldX / 256);
    const tileMaxX = Math.floor(viewportMaxWorldX / 256);
    const tileMinY = Math.floor(viewportMinWorldY / 256);
    const tileMaxY = Math.floor(viewportMaxWorldY / 256);
    const maxTileIndex = 2 ** zoom - 1;
    const tileEntries = [];

    for (let tileX = tileMinX; tileX <= tileMaxX; tileX += 1) {
      for (let tileY = tileMinY; tileY <= tileMaxY; tileY += 1) {
        const clampedX = clamp(tileX, 0, maxTileIndex);
        const clampedY = clamp(tileY, 0, maxTileIndex);
        const tileUrl = `${OSM_TILE_URL}/${zoom}/${clampedX}/${clampedY}.png`;
        try {
          const tileBuffer = await fetchBuffer(tileUrl, {
            headers: {
              "User-Agent": "hiking-telegram-bot/0.1"
            }
          });
          const worldX = clampedX * 256;
          const worldY = clampedY * 256;
          const x = (worldX - viewportMinWorldX) * scale;
          const y = (worldY - viewportMinWorldY) * scale;
          tileEntries.push({
            href: `data:image/png;base64,${tileBuffer.toString("base64")}`,
            x: x.toFixed(2),
            y: y.toFixed(2),
            size: (256 * scale).toFixed(2)
          });
        } catch {
          return buildSvgPreview({ name, coordinates });
        }
      }
    }

    const points = coordinates.map((coord) => {
      const x = (lonToWorldX(coord[0], zoom) - viewportMinWorldX) * scale;
      const y = (latToWorldY(coord[1], zoom) - viewportMinWorldY) * scale;
      return [x.toFixed(1), y.toFixed(1)];
    });

    const polyline = points.map((point) => point.join(",")).join(" ");
    const start = points[0];
    const finish = points[points.length - 1];
    const tiles = tileEntries
      .map((tile) => `<image href="${tile.href}" x="${tile.x}" y="${tile.y}" width="${tile.size}" height="${tile.size}"/>`)
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#eef3e8"/>
  <g>${tiles}</g>
  <rect x="36" y="28" width="760" height="138" rx="22" fill="rgba(255,255,255,0.92)"/>
  <text x="58" y="76" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="#111827">${xmlEscape(name)}</text>
  <text x="58" y="106" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#1f2937">Точний перегляд згенерованого треку.</text>
  <text x="58" y="132" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#1f2937">Карта не перебудовує маршрут, а лише відображає лінію треку.</text>
  <text x="58" y="154" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#475569">Увесь трек автоматично вписано в кадр без стороннього rerouting.</text>
  <polyline points="${polyline}" fill="none" stroke="#e8590c" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${start[0]}" cy="${start[1]}" r="10" fill="#0b7285" stroke="white" stroke-width="3"/>
  <circle cx="${finish[0]}" cy="${finish[1]}" r="10" fill="#2b8a3e" stroke="white" stroke-width="3"/>
</svg>`;
  }

  async getHikingRouteFromOpenRouteService(coordinates) {
    if (!this.openRouteServiceApiKey) {
      return null;
    }

    const data = await fetchJson(OPENROUTESERVICE_URL, {
      method: "POST",
      headers: {
        Authorization: this.openRouteServiceApiKey,
        "Content-Type": "application/json",
        Accept: "application/json, application/geo+json",
        "User-Agent": "hiking-telegram-bot/0.1"
      },
      body: JSON.stringify({
        coordinates,
        elevation: true,
        instructions: true,
        units: "m"
      })
    });

    const feature = data.features?.[0];
    if (!feature?.geometry?.coordinates?.length) {
      throw new Error("OpenRouteService не повернув геометрію маршруту");
    }

    const steps = (feature.properties?.segments || []).flatMap((segment) =>
      (segment.steps || []).map((step) => ({
        distance: step.distance || 0,
        name: sanitizeStepName(step.name),
        maneuver: ORS_STEP_TYPE_TO_MANEUVER[step.type] || { type: "continue", modifier: "straight" }
      }))
    );
    const summary = feature.properties?.summary || {};

    return {
      provider: "openrouteservice",
      distance: summary.distance || 0,
      duration: summary.duration || 0,
      geometry: feature.geometry,
      steps,
      snappedStart: 0,
      snappedFinish: 0
    };
  }

  async getHikingRouteFromGraphHopper(fromPlace, toPlace) {
    if (!this.graphHopperApiKey) {
      return null;
    }

    const places = Array.isArray(fromPlace) ? fromPlace : [fromPlace, toPlace];
    const profiles = ["hike", "foot"];
    const errors = [];

    for (const profile of profiles) {
      try {
        const url = new URL(GRAPHHOPPER_URL);
        for (const place of places) {
          url.searchParams.append("point", `${place.lat},${place.lon}`);
        }
        url.searchParams.set("profile", profile);
        url.searchParams.set("locale", "uk");
        url.searchParams.set("instructions", "true");
        url.searchParams.set("points_encoded", "false");
        url.searchParams.set("elevation", "true");
        url.searchParams.append("details", "surface");
        url.searchParams.append("details", "smoothness");
        if (profile === "hike") {
          url.searchParams.append("details", "hike_rating");
        }
        url.searchParams.set("key", this.graphHopperApiKey);

        const data = await fetchJson(url, {
          headers: {
            Accept: "application/json",
            "Accept-Language": "uk",
            "User-Agent": "hiking-telegram-bot/0.1"
          }
        });

        const path = data.paths?.[0];
        if (!path?.points?.coordinates?.length) {
          throw new Error("GraphHopper не повернув геометрію маршруту");
        }

        const steps = (path.instructions || []).map((instruction) => ({
          distance: instruction.distance || 0,
          name: instruction.street_name || instruction.text || "",
          maneuver: {
            type: instruction.sign === 4 ? "arrive" : instruction.sign === 0 ? "continue" : "turn",
            modifier: instruction.sign < 0 ? "left" : instruction.sign > 0 ? "right" : "straight"
          }
        }));

        return {
          provider: profile === "hike" ? "graphhopper" : "graphhopper-foot",
          distance: path.distance || 0,
          duration: (path.time || 0) / 1000,
          geometry: path.points,
          steps,
          snappedStart: 0,
          snappedFinish: 0
        };
      } catch (error) {
        errors.push(`${profile}: ${error.message}`);
      }
    }

    throw new Error(errors.join(" | "));
  }

  async getPreferredHikingRoute(places) {
    const providerErrors = [];

    if (this.openRouteServiceApiKey) {
      try {
        const route = await this.getHikingRouteFromOpenRouteService(
          places.map((place) => [Number(place.lon), Number(place.lat)])
        );
        return { route, providerNote: "" };
      } catch (error) {
        providerErrors.push(`openrouteservice foot-hiking: ${error.message}`);
      }
    }

    if (this.graphHopperApiKey) {
      try {
        const route = await this.getHikingRouteFromGraphHopper(places);
        return {
          route,
          providerNote: providerErrors.length
            ? `OpenRouteService недоступний, використано ${route.provider === "graphhopper-foot" ? "GraphHopper foot" : "GraphHopper hike"}. Причина ORS: ${providerErrors[0]}.`
            : ""
        };
      } catch (error) {
        providerErrors.push(`GraphHopper hike: ${error.message}`);
      }
    }

    return {
      route: null,
      providerNote: providerErrors.length
        ? `Не вдалося отримати hiking-маршрут: ${providerErrors.join(" | ")}`
        : "Не задано hiking API key, тому точний гірський роутинг недоступний."
    };
  }

  async getFallbackRouteFromOsrm(fromPlace, toPlace) {
    const coordinates = `${fromPlace.lon},${fromPlace.lat};${toPlace.lon},${toPlace.lat}`;
    const routeUrl = new URL(`${OSRM_URL}/${coordinates}`);
    routeUrl.searchParams.set("steps", "true");
    routeUrl.searchParams.set("overview", "full");
    routeUrl.searchParams.set("geometries", "geojson");

    const routeData = await fetchJson(routeUrl, {
      headers: {
        "User-Agent": "hiking-telegram-bot/0.1"
      }
    });

    if (routeData.code !== "Ok" || !routeData.routes?.length) {
      throw new Error("OSRM не повернув маршрут");
    }

    const route = routeData.routes[0];

    return {
      provider: "osrm",
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry,
      steps: route.legs.flatMap((leg) => leg.steps || []),
      snappedStart: routeData.waypoints?.[0]?.distance ?? 0,
      snappedFinish: routeData.waypoints?.[1]?.distance ?? 0
    };
  }

  async buildRouteArtifacts(routeMeta) {
    const coordinates = routeMeta?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || !coordinates.length) {
      throw new Error("Для маршруту немає геометрії");
    }

    if (!["verified", "router-generated"].includes(routeMeta?.trackQuality)) {
      throw new Error("Для цього маршруту немає придатного треку для експорту");
    }

    const name = routeMeta.labels?.name || "Hiking route";
    const fromLabel = routeMeta.labels?.from || "Start";
    const toLabel = routeMeta.labels?.to || "Finish";
    const routeFeatures = (routeMeta.routeFeatures || [])
      .map((feature) => {
        if (Number.isFinite(feature.lat) && Number.isFinite(feature.lon)) {
          return feature;
        }

        const itemUrl = String(feature.itemUrl || "");
        const rawLat = feature.raw?.latitude ?? feature.latitude;
        const rawLon = feature.raw?.longitude ?? feature.longitude;
        if (Number.isFinite(Number(rawLat)) && Number.isFinite(Number(rawLon))) {
          return {
            ...feature,
            lat: Number(rawLat),
            lon: Number(rawLon)
          };
        }

        if (itemUrl) {
          const latMatch = itemUrl.match(/mlat=([0-9.]+)/i);
          const lonMatch = itemUrl.match(/mlon=([0-9.]+)/i);
          if (latMatch && lonMatch) {
            return {
              ...feature,
              lat: Number(latMatch[1]),
              lon: Number(lonMatch[1])
            };
          }
        }

        return feature;
      })
      .filter((feature) => Number.isFinite(feature.lat) && Number.isFinite(feature.lon));
    const svg = await this.buildTrackPreviewSvg(routeMeta);

    return {
      gpx: buildGpx({ name, fromLabel, toLabel, coordinates, routeFeatures }),
      kml: buildKml({ name, fromLabel, toLabel, coordinates, routeFeatures }),
      html: buildHtmlMap({ name, svgMarkup: svg, coordinates }),
      svg,
      fileBaseName: routeMeta.fileBaseName || sanitizeFileName(name)
    };
  }

  async buildImportedGeometryReport({ title, points = [], detail = {}, coordinates = [], provider = "vpohid", routeFeatures: importedRouteFeatures = null } = {}) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return {
        ok: false,
        reliable: false,
        summary: "Для цього маршруту немає повної геометрії треку."
      };
    }

    let elevationStats =
      getSmoothedElevationStatsFromCoordinates(coordinates, 20) ||
      getElevationStatsFromCoordinates(coordinates) || {
        min: null,
        max: null,
        ascentGain: 0,
        descentGain: 0
      };

    if (elevationStats.min === null) {
      try {
        elevationStats = await this.getElevationStats(coordinates);
      } catch {
        elevationStats = {
          min: null,
          max: null,
          ascentGain: 0,
          descentGain: 0
        };
      }
    }

    const startCoordinate = coordinates[0];
    const finishCoordinate = coordinates[coordinates.length - 1];
    const fromLabel = points[0] || detail.start || "Старт";
    const toLabel = points[points.length - 1] || detail.finish || "Фініш";
    const stopLabels = points.slice(1, -1);
    const polylineDistance = getPolylineDistanceMeters(coordinates);
    const distanceMeters = parseDistanceToMeters(detail.distance) || polylineDistance;
    const sourceDuration = parseDurationToSeconds(detail.duration);
    const estimatedHikingTime = sourceDuration || estimateHikingDuration(distanceMeters, elevationStats.ascentGain);
    const difficulty = getDifficulty(distanceMeters, estimatedHikingTime, elevationStats.ascentGain);
    const difficultyEmoji = getDifficultyEmoji(difficulty);
    const directDistance = getDirectDistanceMeters(
      { lat: startCoordinate[1], lon: startCoordinate[0] },
      { lat: finishCoordinate[1], lon: finishCoordinate[0] }
    );
    const mapLinks = buildMapLinksFromCoordinates(startCoordinate, finishCoordinate);
    let routeFeatures = Array.isArray(importedRouteFeatures) ? importedRouteFeatures : [];

    if (!Array.isArray(importedRouteFeatures)) {
      try {
        routeFeatures = await this.getRoutePois(coordinates);
      } catch {
        routeFeatures = [];
      }
    }

    routeFeatures = resolveRouteFeatures({
      routeFeatures,
      distance: distanceMeters,
      ascentGain: elevationStats.ascentGain,
      stops: stopLabels
    });
    const routeFeaturesLines = formatRouteFeatures(routeFeatures);
    const safetyNotes = buildGeneratedSafetyNotes({
      distance: distanceMeters,
      ascentGain: elevationStats.ascentGain,
      stops: stopLabels,
      routeFeatures,
      reliable: true
    });

    return {
      ok: true,
      reliable: true,
      summary: [
        `🗺 Маршрут: ${title || points.join(" -> ") || `${fromLabel} -> ${toLabel}`}`,
        "",
        "Загальна інформація:",
        `📏 Відстань: ${formatDistance(distanceMeters)}`,
        `⏱️ Час: ${formatDuration(estimatedHikingTime)} в один бік`,
        `📈 Орієнтовний набір висоти: +${formatHeight(elevationStats.ascentGain)}`,
        `${difficultyEmoji} Складність: ${difficulty}`,
        stopLabels.length ? `📍 Проміжні точки: ${stopLabels.join(" • ")}` : null,
        "",
        "Оцінка маршруту:",
        "Трек взято безпосередньо зі сторінки маршруту vpohid.com.ua і не перебудовувався стороннім роутером.",
        ...(routeFeaturesLines.length ? ["", ...routeFeaturesLines] : []),
        ...(safetyNotes.length ? ["", "Безпека:", ...safetyNotes] : []),
        "",
        `Координати: старт ${roundCoordinate(startCoordinate[1])}, ${roundCoordinate(startCoordinate[0])} | фініш ${roundCoordinate(finishCoordinate[1])}, ${roundCoordinate(finishCoordinate[0])}`
      ].filter(Boolean).join("\n"),
      meta: {
        from: fromLabel,
        to: toLabel,
        stops: stopLabels,
        points,
        directDistance,
        distance: distanceMeters,
        duration: estimatedHikingTime,
        estimatedHikingTime,
        ascentGain: elevationStats.ascentGain,
        descentGain: elevationStats.descentGain,
        minElevation: elevationStats.min,
        maxElevation: elevationStats.max,
        difficulty,
        confidence: "висока",
        provider,
        trackQuality: "verified",
        geometry: { coordinates },
        mapLinks,
        fileBaseName: sanitizeFileName(title || points.join("-") || `${fromLabel}-${toLabel}`),
        labels: {
          name: title || `${fromLabel} - ${toLabel}`,
          from: fromLabel,
          to: toLabel
        },
        routeFeatures,
        vpohidDetail: {
          title: detail.title || title || "",
          subtitle: detail.subtitle || "",
          distance: detail.distance || "",
          duration: detail.duration || "",
          level: detail.level || "",
          start: detail.start || fromLabel,
          finish: detail.finish || toLabel,
          peaks: Array.isArray(detail.peaks) ? detail.peaks : [],
          interesting: Array.isArray(detail.interesting) ? detail.interesting : [],
          weatherSettlements: Array.isArray(detail.weatherSettlements) ? detail.weatherSettlements : [],
          description: detail.description || "",
          url: detail.url || "",
          points: Array.isArray(detail.points) ? detail.points : points
        }
      }
    };
  }

  getSuggestedWaypoints({ from, to }) {
    const fromKey = normalizeLookupValue(from);
    const toKey = normalizeLookupValue(to);
    const corridorText = `${fromKey} ${toKey}`.trim();
    const routeTokens = new Set([
      ...splitLookupTokens(from),
      ...splitLookupTokens(to)
    ]);
    const candidates = new Map();

    for (const route of CURATED_ROUTES) {
      const routeFromAliases = route.from.aliases.map(normalizeLookupValue);
      const routeToAliases = route.to.aliases.map(normalizeLookupValue);
      const labels = [route.from.label, route.to.label];

      let score = 0;
      if (routeFromAliases.includes(fromKey) || routeToAliases.includes(fromKey)) {
        score += 3;
      }
      if (routeFromAliases.includes(toKey) || routeToAliases.includes(toKey)) {
        score += 3;
      }
      if (!score) {
        continue;
      }

      for (const label of labels) {
        const normalized = normalizeLookupValue(label);
        if (!normalized || normalized === fromKey || normalized === toKey) {
          continue;
        }

        const current = candidates.get(label) || { label, score: 0 };
        current.score += score;
        candidates.set(label, current);
      }
    }

    for (const waypoint of LOCAL_WAYPOINT_SUGGESTIONS) {
      let score = 0;
      const phrases = [waypoint.label, ...(waypoint.aliases || []), ...(waypoint.keywords || [])]
        .map(normalizeLookupValue)
        .filter(Boolean);

      for (const phrase of phrases) {
        if (corridorText.includes(phrase)) {
          score += phrase.includes(" ") ? 4 : 3;
          continue;
        }

        const phraseTokens = splitLookupTokens(phrase);
        const matchedTokens = phraseTokens.filter((token) => routeTokens.has(token)).length;

        if (matchedTokens === phraseTokens.length && phraseTokens.length > 0) {
          score += 3;
          continue;
        }

        if (matchedTokens > 0) {
          score += matchedTokens;
        }
      }

      if (!score) {
        continue;
      }

      const normalized = normalizeLookupValue(waypoint.label);
      if (
        normalized === fromKey ||
        normalized === toKey ||
        fromKey.includes(normalized) ||
        toKey.includes(normalized)
      ) {
        continue;
      }

      const current = candidates.get(waypoint.label) || { label: waypoint.label, score: 0 };
      current.score += score;
      candidates.set(waypoint.label, current);
    }

    const deduped = new Map();

    for (const candidate of candidates.values()) {
      const normalizedLabel = normalizeWaypointKey(candidate.label);
      const current = deduped.get(normalizedLabel);

      if (
        !current ||
        candidate.score > current.score ||
        (candidate.score === current.score && candidate.label.length > current.label.length)
      ) {
        deduped.set(normalizedLabel, candidate);
      }
    }

    return [...deduped.values()]
      .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label, "uk"))
      .map((item) => formatWaypointSuggestionLabel(item.label))
      .slice(0, 6);
  }

  buildCuratedRouteReport(route, requestedFrom, requestedTo, requestedAliasNote = null, geometryOverride = null) {
    const coordinates = geometryOverride?.route?.geometry?.coordinates || route.coordinates;
    const startCoordinate = coordinates[0];
    const finishCoordinate = coordinates[coordinates.length - 1];
    const fromPlace = makePoint(route.from.label, startCoordinate, route.region);
    const toPlace = makePoint(route.to.label, finishCoordinate, route.region);
    const mapLinks = buildMapLinksFromCoordinates(startCoordinate, finishCoordinate);
    const directDistance = getDirectDistanceMeters(fromPlace, toPlace);
    const confidence = "висока";
    const difficulty = route.difficulty;
    const difficultyEmoji = getDifficultyEmoji(difficulty);
    const trackQuality = geometryOverride?.route ? "router-generated" : (route.trackQuality || "verified");
    const provider = geometryOverride?.route?.provider || "curated-library";
    const distanceMeters = geometryOverride?.route?.distance || route.distanceMeters;
    const durationSeconds = geometryOverride?.route?.duration || route.estimatedHikingTimeSeconds;
    const ascentGainMeters = geometryOverride?.elevationStats?.ascentGain || route.ascentGainMeters;
    const descentGainMeters = geometryOverride?.elevationStats?.descentGain || route.descentGainMeters;
    const minElevationMeters = geometryOverride?.elevationStats?.minElevation ?? route.minElevationMeters;
    const maxElevationMeters = geometryOverride?.elevationStats?.maxElevation ?? route.maxElevationMeters;
    const safetyNotes = route.safetyNotes.map((note) => `• ${note}`).join("\n");
    const checkpoints = route.checkpoints.map((item) => `• ${item}`).join("\n");
    const routeFeatures = formatRouteFeatures(route.routeFeatures);

    return {
      ok: true,
      reliable: true,
      summary: [
        `🧭 Бібліотечний маршрут: ${route.from.label} -> ${route.to.label}`,
        "",
        "Загальна інформація:",
        `📏 Відстань: ~${formatDistance(distanceMeters)}`,
        `⏱️ Час: ${formatDuration(durationSeconds)} в один бік`,
        `📈 Набір висоти: ~+${formatHeight(ascentGainMeters)}`,
        `${difficultyEmoji} Складність: ${difficulty}`,
        "",
        "Оцінка маршруту:",
        route.brief,
        ...(requestedAliasNote ? ["", `Уточнення: ${requestedAliasNote}`] : []),
        "",
        "Орієнтири по шляху:",
        checkpoints,
        ...(routeFeatures.length ? ["", ...routeFeatures] : []),
        "",
        "Безпека:",
        safetyNotes,
        "",
        "Індикатори маршруту:",
        ...formatRouteFlags({ trackQuality, provider, reliable: true }),
        "• Перегляд: `HTML карта треку` з меню маршруту",
        "",
        "Технічні деталі:",
        `• Джерело: бібліотека перевірених маршрутів${geometryOverride?.route ? " + точна геометрія hiking-профілю" : ""}`,
        `• Пряма відстань: ${formatDistance(directDistance)}`,
        `• Мін/макс висота: ${formatHeight(minElevationMeters)} / ${formatHeight(maxElevationMeters)}`,
        `• Набір / скид висоти: +${formatHeight(ascentGainMeters)} / -${formatHeight(descentGainMeters)}`,
        `• Оцінка маршруту: ${confidence}`,
        ...(geometryOverride?.providerNote ? [`• Примітка сервісу: ${geometryOverride.providerNote}`] : []),
        "",
        `Координати: старт ${roundCoordinate(startCoordinate[1])}, ${roundCoordinate(startCoordinate[0])} | фініш ${roundCoordinate(finishCoordinate[1])}, ${roundCoordinate(finishCoordinate[0])}`
      ].join("\n"),
      meta: {
        from: requestedFrom,
        to: requestedTo,
        directDistance,
        distance: distanceMeters,
        duration: durationSeconds,
        estimatedHikingTime: durationSeconds,
        ascentGain: ascentGainMeters,
        descentGain: descentGainMeters,
        minElevation: minElevationMeters,
        maxElevation: maxElevationMeters,
        difficulty,
        confidence,
        provider,
        trackQuality,
        libraryRouteId: route.id,
        geometry: {
          coordinates
        },
        mapLinks,
        fileBaseName: sanitizeFileName(`${route.from.label}-${route.to.label}`),
        labels: {
          name: `${route.from.label} - ${route.to.label}`,
          from: route.from.label,
          to: route.to.label
        },
        routeFeatures: route.routeFeatures || []
      }
    };
  }

  buildMultiPointRouteReport({ points, legReports }) {
    const metas = legReports.map((report) => report.meta || {});
    const geometrySegments = metas.map((meta) => meta.geometry?.coordinates).filter(Array.isArray);
    const coordinates = dedupeJoinedCoordinates(geometrySegments);
    const totalDistance = metas.reduce((sum, meta) => sum + (meta.distance || 0), 0);
    const totalDuration = metas.reduce((sum, meta) => sum + (meta.duration || 0), 0);
    const totalEstimatedHikingTime = metas.reduce((sum, meta) => sum + (meta.estimatedHikingTime || 0), 0);
    const totalAscent = metas.reduce((sum, meta) => sum + (meta.ascentGain || 0), 0);
    const totalDescent = metas.reduce((sum, meta) => sum + (meta.descentGain || 0), 0);
    const minElevation = metas.map((meta) => meta.minElevation).filter(Number.isFinite);
    const maxElevation = metas.map((meta) => meta.maxElevation).filter(Number.isFinite);
    const reliable = legReports.every((report) => report.reliable);
    const difficulty = getDifficulty(totalDistance, totalEstimatedHikingTime, totalAscent);
    const difficultyEmoji = getDifficultyEmoji(difficulty);
    const directDistance = metas.reduce((sum, meta) => sum + (meta.directDistance || 0), 0);
    const startCoordinate = coordinates[0];
    const finishCoordinate = coordinates[coordinates.length - 1];
    const waypointPlaces = [];

    for (const meta of metas) {
      const legCoordinates = meta.geometry?.coordinates;
      if (!Array.isArray(legCoordinates) || !legCoordinates.length) {
        continue;
      }
      if (!waypointPlaces.length) {
        waypointPlaces.push({ lat: legCoordinates[0][1], lon: legCoordinates[0][0] });
      }
      const last = legCoordinates[legCoordinates.length - 1];
      waypointPlaces.push({ lat: last[1], lon: last[0] });
    }

    const mapLinks = waypointPlaces.length >= 2
      ? buildMapLinksForPlaces(waypointPlaces)
      : startCoordinate && finishCoordinate
        ? buildMapLinksFromCoordinates(startCoordinate, finishCoordinate)
        : null;
    const stopLabels = points.slice(1, -1);
    const routeFeatures = resolveRouteFeatures({
      routeFeatures: metas.flatMap((meta) => meta.routeFeatures || []),
      distance: totalDistance,
      ascentGain: totalAscent,
      stops: stopLabels
    });
    const routeFeaturesLines = formatRouteFeatures(routeFeatures);
    const legSummaries = legReports
      .map((report, index) => {
        const legFrom = points[index];
        const legTo = points[index + 1];
        const legMeta = report.meta || {};
        return `• ${legFrom} -> ${legTo}: ${formatDistance(legMeta.distance || 0)} | ${formatDuration(legMeta.estimatedHikingTime || legMeta.duration || 0)} | ${report.reliable ? "надійно" : "чернетка"}`;
      })
      .join("\n");

    return {
      ok: true,
      reliable,
      summary: [
        `🗺 Маршрут: ${points.join(" -> ")}`,
        "",
        "Загальна інформація:",
        `📏 Відстань: ${formatDistance(totalDistance)}`,
        `⏱️ Час: ${formatDuration(totalEstimatedHikingTime)} в один бік`,
        `📈 Набір висоти: +${formatHeight(totalAscent)}`,
        `${difficultyEmoji} Складність: ${difficulty}`,
        stopLabels.length ? `📍 Проміжні точки: ${stopLabels.join(" • ")}` : "📍 Проміжні точки: немає",
        "",
        "Переходи по маршруту:",
        legSummaries,
        "",
        "Маршрутний бриф:",
        getTrailBrief(totalDistance, totalEstimatedHikingTime, totalAscent),
        reliable
          ? "Маршрут по переходах виглядає цілісно і придатний для планування."
          : "Частину переходів краще додатково перевірити перед виходом.",
        ...(routeFeaturesLines.length ? ["", ...routeFeaturesLines] : []),
        ...(mapLinks
          ? [
              "",
              "Індикатори маршруту:",
              ...formatRouteFlags({
                trackQuality: metas.every((meta) => meta.trackQuality === "verified") ? "verified" : "estimated",
                provider: "multi-leg",
                reliable
              }),
              "• Перегляд: `HTML карта треку` з меню маршруту"
            ]
          : []),
        "",
        "Орієнтири:",
        formatCheckpointHints([]),
        "",
        "Технічні деталі:",
        `• Переходів: ${legReports.length}`,
        `• Пряма відстань по відрізках: ${formatDistance(directDistance)}`,
        ...(minElevation.length && maxElevation.length
          ? [
              `• Мін/макс висота: ${formatHeight(Math.min(...minElevation))} / ${formatHeight(Math.max(...maxElevation))}`,
              `• Набір / скид висоти: +${formatHeight(totalAscent)} / -${formatHeight(totalDescent)}`
            ]
          : []),
        ...(startCoordinate && finishCoordinate
          ? [
              "",
              `Координати: старт ${roundCoordinate(startCoordinate[1])}, ${roundCoordinate(startCoordinate[0])} | фініш ${roundCoordinate(finishCoordinate[1])}, ${roundCoordinate(finishCoordinate[0])}`
            ]
          : [])
      ].join("\n"),
      meta: {
        from: points[0],
        to: points[points.length - 1],
        stops: stopLabels,
        points,
        directDistance,
        distance: totalDistance,
        duration: totalDuration,
        estimatedHikingTime: totalEstimatedHikingTime,
        ascentGain: totalAscent,
        descentGain: totalDescent,
        minElevation: minElevation.length ? Math.min(...minElevation) : null,
        maxElevation: maxElevation.length ? Math.max(...maxElevation) : null,
        difficulty,
        confidence: reliable ? "висока" : "середня",
        provider: "multi-leg",
        trackQuality: metas.every((meta) => meta.trackQuality === "verified") ? "verified" : "estimated",
        geometry: coordinates.length ? { coordinates } : null,
        mapLinks,
        fileBaseName: sanitizeFileName(points.join("-")),
        labels: {
          name: points.join(" - "),
          from: points[0],
          to: points[points.length - 1]
        },
        legs: metas,
        routeFeatures
      }
    };
  }

  async buildWaypointDraftReport(points) {
    const places = await Promise.all(points.map((point) => this.geocode(point)));

    if (places.some((place) => !place)) {
      return {
        ok: false,
        reliable: false,
        summary: "Не вдалося точно знайти всі точки маршруту. Спробуй точніші назви проміжних точок."
      };
    }

    let elevations = [];
    try {
      elevations = await this.getPointElevations(places);
    } catch {
      elevations = [];
    }

    const coordinates = places.map((place, index) => makeCoordinateFromPlace(place, elevations[index]));
    const legs = [];
    let totalDistance = 0;
    let totalAscent = 0;
    let totalDescent = 0;

    for (let index = 0; index < places.length - 1; index += 1) {
      const directDistance = getDirectDistanceMeters(places[index], places[index + 1]);
      const elevationDiff = (elevations[index + 1] || 0) - (elevations[index] || 0);
      const ascent = elevationDiff > 0 ? elevationDiff : 0;
      const descent = elevationDiff < 0 ? Math.abs(elevationDiff) : 0;

      totalDistance += directDistance;
      totalAscent += ascent;
      totalDescent += descent;
      legs.push({
        from: points[index],
        to: points[index + 1],
        directDistance,
        estimatedHikingTime: estimateHikingDuration(directDistance, ascent),
        ascent,
        descent
      });
    }

    const estimatedHikingTime = estimateHikingDuration(totalDistance, totalAscent);
    const difficulty = getDifficulty(totalDistance, estimatedHikingTime, totalAscent);
    const difficultyEmoji = getDifficultyEmoji(difficulty);
    const stopLabels = points.slice(1, -1);
    const mapLinks = buildMapLinksForPlaces(places);
    let routeFeatures = [];
    try {
      routeFeatures = await this.getRoutePois(coordinates);
    } catch {
      routeFeatures = [];
    }

    routeFeatures = resolveRouteFeatures({
      routeFeatures,
      distance: totalDistance,
      ascentGain: totalAscent,
      stops: stopLabels
    });
    const routeFeaturesLines = formatRouteFeatures(routeFeatures);
    const safetyNotes = buildGeneratedSafetyNotes({
      distance: totalDistance,
      ascentGain: totalAscent,
      stops: stopLabels,
      routeFeatures,
      reliable: false
    });
    const resolvedPoints = places
      .map((place, index) => `• ${points[index]} -> ${normalizePlaceLabel(place)}`)
      .join("\n");

    return {
      ok: true,
      reliable: false,
      summary: [
        `🗺 Чернетка маршруту: ${points.join(" -> ")}`,
        "",
        "Загальна інформація:",
        `📏 Орієнтовна відстань між точками: ~${formatDistance(totalDistance)}`,
        `⏱️ Орієнтовний час за waypoint-планом: ${formatDuration(estimatedHikingTime)} в один бік`,
        `📈 Орієнтовний набір висоти між точками: +${formatHeight(totalAscent)}`,
        `${difficultyEmoji} Складність: ${difficulty}`,
        stopLabels.length ? `📍 Проміжні точки: ${stopLabels.join(" • ")}` : "📍 Проміжні точки: немає",
        "",
        "Розпізнані точки:",
        resolvedPoints,
        "",
        "Переходи по точках:",
        ...legs.map((leg) => `• ${leg.from} -> ${leg.to}: ~${formatDistance(leg.directDistance)} | ~${formatDuration(leg.estimatedHikingTime)}`),
        "",
        "Що це означає:",
        "Точний hiking-трек для частини переходів не знайдено, але точки маршруту збережені як план походу.",
        "Такий варіант підходить для планування, але перед виходом маршрут треба звірити з офлайн-картою або GPX.",
        ...(routeFeaturesLines.length ? ["", ...routeFeaturesLines] : []),
        ...(safetyNotes.length ? ["", "Безпека:", ...safetyNotes] : []),
        "",
        "Карта та трек:",
        "• Зовнішні directions-карти вимкнені для цього варіанту, щоб не спотворювати трек.",
        "• Якщо з'явиться верифікований або router-generated трек, відкривай `HTML карта треку` з меню маршруту.",
        "• Верифікованого GPX/KML для цього варіанту немає. Це лише чернетка по waypoint-ах.",
        "",
        "Технічні деталі:",
        `• Формат: waypoint-чернетка`,
        `• Переходів: ${legs.length}`,
        `• Набір / скид висоти між точками: +${formatHeight(totalAscent)} / -${formatHeight(totalDescent)}`,
        "",
        `Координати: старт ${roundCoordinate(coordinates[0][1])}, ${roundCoordinate(coordinates[0][0])} | фініш ${roundCoordinate(coordinates[coordinates.length - 1][1])}, ${roundCoordinate(coordinates[coordinates.length - 1][0])}`
      ].join("\n"),
      meta: {
        from: points[0],
        to: points[points.length - 1],
        stops: stopLabels,
        points,
        directDistance: totalDistance,
        distance: totalDistance,
        duration: estimatedHikingTime,
        estimatedHikingTime,
        ascentGain: totalAscent,
        descentGain: totalDescent,
        minElevation: elevations.length ? Math.min(...elevations.filter(Number.isFinite)) : null,
        maxElevation: elevations.length ? Math.max(...elevations.filter(Number.isFinite)) : null,
        difficulty,
        confidence: "середня",
        provider: "waypoint-draft",
        trackQuality: "draft",
        geometry: { coordinates },
        mapLinks,
        fileBaseName: sanitizeFileName(points.join("-")),
        labels: {
          name: points.join(" - "),
          from: normalizePlaceLabel(places[0]),
          to: normalizePlaceLabel(places[places.length - 1])
        },
        legs,
        routeFeatures
      }
    };
  }

  async buildGeneratedMultiPointReport(points, places, hikingRoute, providerNote = "") {
    const coordinates = hikingRoute.geometry?.coordinates || [];
    const steps = hikingRoute.steps || [];
    const meaningfulSteps = steps.filter((step) => step.distance >= 30 || step.maneuver?.type === "arrive");
    const previewSteps = meaningfulSteps.slice(0, 8).map(formatManeuver);
    const checkpoints = buildCheckpoints(meaningfulSteps, hikingRoute.distance);
    const averageSpeed = hikingRoute.duration > 0 ? (hikingRoute.distance / hikingRoute.duration) * 3.6 : 0;
    const directDistance = places.slice(0, -1).reduce(
      (sum, place, index) => sum + getDirectDistanceMeters(place, places[index + 1]),
      0
    );
    const routeToDirectRatio = directDistance > 0 ? hikingRoute.distance / directDistance : 1;
    const confidence = getRouteConfidence({
      averageSpeed,
      snappedStart: hikingRoute.snappedStart,
      snappedFinish: hikingRoute.snappedFinish,
      routeToDirectRatio,
      provider: hikingRoute.provider
    });

    let elevationStats =
      getElevationStatsFromCoordinates(coordinates) || {
        min: null,
        max: null,
        ascentGain: 0,
        descentGain: 0
      };

    if (elevationStats.min === null && coordinates.length) {
      try {
        elevationStats = await this.getElevationStats(coordinates);
      } catch {
        elevationStats = {
          min: null,
          max: null,
          ascentGain: 0,
          descentGain: 0
        };
      }
    }

    const estimatedHikingTime = estimateHikingDuration(hikingRoute.distance, elevationStats.ascentGain);
    const difficulty = getDifficulty(hikingRoute.distance, estimatedHikingTime, elevationStats.ascentGain);
    const difficultyEmoji = getDifficultyEmoji(difficulty);
    const mapLinks = buildMapLinksForPlaces(places);
    let routeFeatures = [];
    try {
      routeFeatures = await this.getRoutePois(coordinates);
    } catch {
      routeFeatures = [];
    }

    routeFeatures = resolveRouteFeatures({
      routeFeatures,
      distance: hikingRoute.distance,
      ascentGain: elevationStats.ascentGain,
      stops: points.slice(1, -1)
    });
    const routeFeaturesLines = formatRouteFeatures(routeFeatures);
    const safetyNotes = buildGeneratedSafetyNotes({
      distance: hikingRoute.distance,
      ascentGain: elevationStats.ascentGain,
      stops: points.slice(1, -1),
      routeFeatures,
      reliable: confidence.label !== "низька"
    });

    return {
      ok: true,
      reliable: confidence.label !== "низька",
      summary: [
        `🗺 Маршрут: ${points.join(" -> ")}`,
        "",
        "Загальна інформація:",
        `📏 Відстань: ${formatDistance(hikingRoute.distance)}`,
        `⏱️ Час: ${formatDuration(estimatedHikingTime)} в один бік`,
        `📈 Набір висоти: +${formatHeight(elevationStats.ascentGain)}`,
        `${difficultyEmoji} Складність: ${difficulty}`,
        points.length > 2 ? `📍 Проміжні точки: ${points.slice(1, -1).join(" • ")}` : null,
        "",
        "Індикатори маршруту:",
        ...formatRouteFlags({ trackQuality: "router-generated", provider: hikingRoute.provider, reliable: confidence.label !== "низька" }),
        "• Перегляд: `HTML карта треку` з меню маршруту",
        "",
        "Маршрутний бриф:",
        getTrailBrief(hikingRoute.distance, estimatedHikingTime, elevationStats.ascentGain),
        confidence.reasons.join("; ") ? `Що варто врахувати: ${confidence.reasons.join("; ")}.` : "Маршрут виглядає стабільно для планування.",
        ...(routeFeaturesLines.length ? ["", ...routeFeaturesLines] : []),
        ...(safetyNotes.length ? ["", "Безпека:", ...safetyNotes] : []),
        "",
        "Орієнтири:",
        formatCheckpointHints(checkpoints),
        "",
        "Перші ключові маневри:",
        previewSteps.length ? previewSteps.join("\n") : "Покрокові інструкції недоступні для цієї ділянки.",
        meaningfulSteps.length > previewSteps.length
          ? `…і ще ${meaningfulSteps.length - previewSteps.length} кроків по маршруту.`
          : "Це повний список ключових кроків для цієї короткої ділянки.",
        "",
        `Координати: старт ${roundCoordinate(places[0].lat)}, ${roundCoordinate(places[0].lon)} | фініш ${roundCoordinate(places[places.length - 1].lat)}, ${roundCoordinate(places[places.length - 1].lon)}`,
        ...(providerNote ? ["", `Примітка сервісу: ${providerNote}`] : [])
      ].filter(Boolean).join("\n"),
      meta: {
        from: points[0],
        to: points[points.length - 1],
        stops: points.slice(1, -1),
        points,
        directDistance,
        distance: hikingRoute.distance,
        duration: hikingRoute.duration,
        estimatedHikingTime,
        ascentGain: elevationStats.ascentGain,
        descentGain: elevationStats.descentGain,
        minElevation: elevationStats.min,
        maxElevation: elevationStats.max,
        difficulty,
        confidence: confidence.label,
        provider: hikingRoute.provider,
        trackQuality: "router-generated",
        geometry: { coordinates },
        mapLinks,
        fileBaseName: sanitizeFileName(points.join("-")),
        labels: {
          name: points.join(" - "),
          from: normalizePlaceLabel(places[0]),
          to: normalizePlaceLabel(places[places.length - 1])
        },
        routeFeatures
      }
    };
  }

  async getRouteReport({ from, to, points, places } = {}) {
    try {
      const routePoints = Array.isArray(points) && points.length
        ? points.map((point) => String(point).trim()).filter(Boolean)
        : [from, to].filter(Boolean);
      const startPoint = routePoints[0];
      const endPoint = routePoints[routePoints.length - 1];
      const providedPlaces = Array.isArray(places) && places.length === routePoints.length
        ? places.map((place, index) => {
            if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) {
              return null;
            }

            return {
              lat: Number(place.lat),
              lon: Number(place.lon),
              display_name: place.display_name || routePoints[index],
              address: place.address || {},
              source: place.source || "external"
            };
          })
        : null;

      if (routePoints.length >= 3) {
        if (this.graphHopperApiKey || this.openRouteServiceApiKey) {
          const multiPlaces = providedPlaces
            ? await Promise.all(routePoints.map((point, index) => providedPlaces[index] || this.geocode(point)))
            : await Promise.all(routePoints.map((point) => this.geocode(point)));
          if (multiPlaces.every(Boolean)) {
            const { route: hikingRoute, providerNote } = await this.getPreferredHikingRoute(multiPlaces);

            if (hikingRoute) {
              return this.buildGeneratedMultiPointReport(routePoints, multiPlaces, hikingRoute, providerNote);
            }
          }
        }

        const legReports = [];

        for (let index = 0; index < routePoints.length - 1; index += 1) {
          const legReport = await this.getRouteReport({
            from: routePoints[index],
            to: routePoints[index + 1]
          });

          if (!legReport.ok) {
            return this.buildWaypointDraftReport(routePoints);
          }

          legReports.push(legReport);
        }

        return this.buildMultiPointRouteReport({
          points: routePoints,
          legReports
        });
      }

      const curatedMatch = findCuratedRoute(startPoint, endPoint);
      if (curatedMatch) {
        let geometryOverride = null;

        if (this.graphHopperApiKey || this.openRouteServiceApiKey) {
          try {
            const [fromPlace, toPlace] = await Promise.all([
              this.geocode(curatedMatch.route.from.label),
              this.geocode(curatedMatch.route.to.label)
            ]);

            if (fromPlace && toPlace) {
              const { route: hikingRoute, providerNote } = await this.getPreferredHikingRoute([fromPlace, toPlace]);

              if (hikingRoute?.geometry?.coordinates?.length) {
                let elevationStats = null;
                try {
                  elevationStats = await this.getElevationStats(hikingRoute.geometry.coordinates);
                } catch {
                  elevationStats = null;
                }

                geometryOverride = {
                  route: hikingRoute,
                  providerNote,
                  elevationStats
                };
              }
            }
          } catch {
            geometryOverride = null;
          }
        }

        return this.buildCuratedRouteReport(
          curatedMatch.route,
          startPoint,
          endPoint,
          curatedMatch.requestedAliasNote,
          geometryOverride
        );
      }

      const [fromPlace, toPlace] = providedPlaces
        ? await Promise.all([
            providedPlaces[0] || this.geocode(startPoint),
            providedPlaces[providedPlaces.length - 1] || this.geocode(endPoint)
          ])
        : await Promise.all([this.geocode(startPoint), this.geocode(endPoint)]);

      if (!fromPlace || !toPlace) {
        return {
          ok: false,
          reliable: false,
          summary: "Не вдалося точно знайти старт або фініш. Спробуй точніші назви, наприклад: `Заросляк -> Говерла`."
        };
      }

      if (!isLikelyUkrainianPlace(fromPlace) || !isLikelyUkrainianPlace(toPlace)) {
        return {
          ok: false,
          reliable: false,
          summary: [
            `Не вдалося надійно знайти українські точки для маршруту ${startPoint} -> ${endPoint}.`,
            "Сервіс геокодування повернув нерелевантний результат поза Україною.",
            "Що можна зробити:",
            "• ввести точнішу назву з областю, наприклад `Стара Гута, Івано-Франківська область`",
            "• або вказати старт/фініш точніше: село, КПП, паркінг, притулок"
          ].join("\n")
        };
      }

      const directDistanceBetweenPlaces = getDirectDistanceMeters(fromPlace, toPlace);
      if (
        normalizeLookupValue(startPoint) !== normalizeLookupValue(endPoint) &&
        directDistanceBetweenPlaces < 50
      ) {
        return {
          ok: false,
          reliable: false,
          summary: [
            `Не вдалося коректно розрізнити точки ${startPoint} і ${endPoint}.`,
            "Сервіс геокодування прив'язав старт і фініш майже до одного місця, тому маршрут виглядає недостовірно.",
            "Що можна зробити:",
            "• додати область або район до назви",
            "• або вказати точнішу стартову і фінішну точку"
          ].join("\n")
        };
      }

      const targetLooksLikeTrailFeature = isTrailFeature(toPlace);
      let { route: hikingRoute, providerNote } = await this.getPreferredHikingRoute([fromPlace, toPlace]);

      if (!hikingRoute) {
        if (targetLooksLikeTrailFeature) {
          return {
            ok: false,
            reliable: false,
            summary: [
              `Не вдалося побудувати точний гірський маршрут ${from} -> ${to}.`,
              `Не вдалося побудувати точний гірський маршрут ${startPoint} -> ${endPoint}.`,
              "Для вершин, полонин і стежок я більше не використовую дорожній fallback, бо він дає недостовірні треки.",
              "Що можна зробити:",
              "• додати цей маршрут у бібліотеку перевірених маршрутів",
              "• або підключити hiking API: GraphHopper `hike` чи openrouteservice `foot-hiking`",
              "• або задати точніший trailhead: КПП, паркінг, притулок, полонину"
            ].join("\n")
          };
        }
        hikingRoute = await this.getFallbackRouteFromOsrm(fromPlace, toPlace);
        if (!providerNote) {
          providerNote = "Використано дорожній fallback-маршрутизатор OSRM.";
        }
      }

      const coordinates = hikingRoute.geometry?.coordinates || [];
      const steps = hikingRoute.steps || [];
      const meaningfulSteps = steps.filter((step) => step.distance >= 30 || step.maneuver?.type === "arrive");
      const previewSteps = meaningfulSteps.slice(0, 8).map(formatManeuver);
      const checkpoints = buildCheckpoints(meaningfulSteps, hikingRoute.distance);
      const averageSpeed = hikingRoute.duration > 0 ? (hikingRoute.distance / hikingRoute.duration) * 3.6 : 0;
      const directDistance = getDirectDistanceMeters(fromPlace, toPlace);
      const routeToDirectRatio = directDistance > 0 ? hikingRoute.distance / directDistance : 1;
      const confidence = getRouteConfidence({
        averageSpeed,
        snappedStart: hikingRoute.snappedStart,
        snappedFinish: hikingRoute.snappedFinish,
        routeToDirectRatio,
        provider: hikingRoute.provider
      });
      const routeLooksUnreliable =
        confidence.label === "низька" ||
        averageSpeed > 7 ||
        hikingRoute.snappedFinish > 400 ||
        routeToDirectRatio > 2.7;

      let elevationStats =
        getElevationStatsFromCoordinates(coordinates) || {
          min: null,
          max: null,
          ascentGain: 0,
          descentGain: 0
        };

      if (elevationStats.min === null && coordinates.length) {
        try {
          elevationStats = await this.getElevationStats(coordinates);
        } catch {
          elevationStats = {
            min: null,
            max: null,
            ascentGain: 0,
            descentGain: 0
          };
        }
      }

      const estimatedHikingTime = estimateHikingDuration(hikingRoute.distance, elevationStats.ascentGain);
      const difficulty = getDifficulty(hikingRoute.distance, estimatedHikingTime, elevationStats.ascentGain);
      const difficultyEmoji = getDifficultyEmoji(difficulty);
      const mapLinks = buildMapLinks(fromPlace, toPlace);
      let routeFeatures = [];
      try {
        routeFeatures = await this.getRoutePois(coordinates);
      } catch {
        routeFeatures = [];
      }

      routeFeatures = resolveRouteFeatures({
        routeFeatures,
        distance: hikingRoute.distance,
        ascentGain: elevationStats.ascentGain
      });
      const routeFeaturesLines = formatRouteFeatures(routeFeatures);
      const exportMeta = makeExportMeta({
        from: startPoint,
        to: endPoint,
        provider: hikingRoute.provider,
        coordinates,
        fromPlace,
        toPlace
      });

      const overviewLines = [
        `🗺 Маршрут: ${normalizePlaceLabel(fromPlace)} -> ${normalizePlaceLabel(toPlace)}`,
        "",
        "Загальна інформація:",
        `📏 Відстань: ${formatDistance(hikingRoute.distance)}`,
        `⏱️ Час: ${formatDuration(estimatedHikingTime)} в один бік`,
        `📈 Набір висоти: +${formatHeight(elevationStats.ascentGain)}`,
        `${difficultyEmoji} Складність: ${difficulty}`
      ];

      const techLines = [
        "",
        "Деталі маршруту:",
        `• Провайдер маршруту: ${
          hikingRoute.provider === "graphhopper"
            ? "GraphHopper hike"
            : hikingRoute.provider === "graphhopper-foot"
              ? "GraphHopper foot"
            : hikingRoute.provider === "openrouteservice"
              ? "openrouteservice foot-hiking"
              : "OSRM foot fallback"
        }`,
        `• Пряма відстань: ${formatDistance(directDistance)}`,
        `• Час від routing-сервісу: ${formatDuration(hikingRoute.duration)}`,
        `• Середній темп: ${averageSpeed.toFixed(1)} км/год`,
        `• Якість маршруту: ${confidence.label}`
      ];

      if (hikingRoute.snappedStart || hikingRoute.snappedFinish) {
        techLines.push(
          `• Прив'язка до стежки/дороги: старт ${formatDistance(hikingRoute.snappedStart)}, фініш ${formatDistance(hikingRoute.snappedFinish)}`
        );
      }

      if (elevationStats.min !== null) {
        techLines.push(
          `• Мін/макс висота: ${formatHeight(elevationStats.min)} / ${formatHeight(elevationStats.max)}`,
          `• Набір / скид висоти: +${formatHeight(elevationStats.ascentGain)} / -${formatHeight(elevationStats.descentGain)}`
        );
      }

      const mapLines = [
        "",
        "Індикатори маршруту:",
        ...formatRouteFlags({ trackQuality: "router-generated", provider: hikingRoute.provider, reliable: confidence.label !== "низька" }),
        "• Перегляд: `HTML карта треку` з меню маршруту",
        "• Експорт: GPX і KML з меню маршруту походу"
      ];
      const safetyNotes = buildGeneratedSafetyNotes({
        distance: hikingRoute.distance,
        ascentGain: elevationStats.ascentGain,
        stops: [],
        routeFeatures,
        reliable: confidence.label !== "низька"
      });

      const sharedTail = [
        "",
        "Маршрутний бриф:",
        getTrailBrief(hikingRoute.distance, estimatedHikingTime, elevationStats.ascentGain),
        confidence.reasons.join("; ") ? `Що варто врахувати: ${confidence.reasons.join("; ")}.` : "Маршрут виглядає стабільно для планування.",
        ...(routeFeaturesLines.length ? ["", ...routeFeaturesLines] : []),
        ...(safetyNotes.length ? ["", "Безпека:", ...safetyNotes] : []),
        "",
        "Орієнтири:",
        formatCheckpointHints(checkpoints),
        "",
        "Перші ключові маневри:",
        previewSteps.length ? previewSteps.join("\n") : "Покрокові інструкції недоступні для цієї ділянки.",
        meaningfulSteps.length > previewSteps.length
          ? `…і ще ${meaningfulSteps.length - previewSteps.length} кроків по маршруту.`
          : "Це повний список ключових кроків для цієї короткої ділянки.",
        "",
        `Координати: старт ${roundCoordinate(fromPlace.lat)}, ${roundCoordinate(fromPlace.lon)} | фініш ${roundCoordinate(toPlace.lat)}, ${roundCoordinate(toPlace.lon)}`
      ];

      if (providerNote) {
        sharedTail.push("", `Примітка сервісу: ${providerNote}`);
      }

      const meta = {
        from,
        to,
        directDistance,
        distance: hikingRoute.distance,
        duration: hikingRoute.duration,
        estimatedHikingTime,
        ascentGain: elevationStats.ascentGain,
        descentGain: elevationStats.descentGain,
        minElevation: elevationStats.min,
        maxElevation: elevationStats.max,
        difficulty,
        confidence: confidence.label,
        provider: hikingRoute.provider,
        trackQuality:
          hikingRoute.provider === "graphhopper" ||
          hikingRoute.provider === "graphhopper-foot" ||
          hikingRoute.provider === "openrouteservice"
            ? "router-generated"
            : "draft",
        ...exportMeta,
        routeFeatures
      };

      if (targetLooksLikeTrailFeature && routeLooksUnreliable && hikingRoute.provider !== "openrouteservice") {
        return {
          ok: true,
          reliable: false,
          summary: [
            ...overviewLines,
            ...techLines,
            "",
            "Автоматичний розрахунок виглядає недостовірним для гірського маршруту.",
            `• Причини: ${confidence.reasons.join("; ")}; маршрут у ${routeToDirectRatio.toFixed(1)} рази довший за пряму відстань.`,
            "",
            "Що це означає:",
            "Fallback-маршрутизація веде по дорогах і не бачить гірську логіку маршруту так, як її бачить хайкер.",
            "Маршрут можна зберегти як чернетку, але не як точний трек.",
            "",
            "Як задати маршрут точніше:",
            "• використовуй точку старту стежки, а не лише назву селища",
            "• використовуй КПП, паркінг, притулок, полонину або старт trailhead",
            ...mapLines,
            ...sharedTail
          ].join("\n"),
          meta
        };
      }

      return {
        ok: true,
        reliable: true,
        summary: [...overviewLines, ...techLines, ...mapLines, ...sharedTail].join("\n"),
        meta
      };
    } catch (error) {
      return {
        ok: false,
        reliable: false,
        summary: [
          `Не вдалося отримати маршрут ${from} -> ${to}.`,
          "Маршрутний сервіс тимчасово недоступний або немає доступу до мережі.",
          `Технічна причина: ${error.message}`
        ].join("\n")
      };
    }
  }

  async getRouteSummary({ from, to }) {
    const report = await this.getRouteReport({ from, to });
    return report.summary;
  }
}

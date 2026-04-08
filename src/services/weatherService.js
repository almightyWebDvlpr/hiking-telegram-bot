import { CARPATHIAN_PLACE_ALIASES } from "../data/carpathianCatalog.js";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const WEATHER_CODES = {
  0: "ясно",
  1: "переважно ясно",
  2: "мінлива хмарність",
  3: "похмуро",
  45: "туман",
  48: "паморозевий туман",
  51: "слабка мряка",
  53: "помірна мряка",
  55: "сильна мряка",
  56: "слабка крижана мряка",
  57: "сильна крижана мряка",
  61: "невеликий дощ",
  63: "помірний дощ",
  65: "сильний дощ",
  66: "слабкий крижаний дощ",
  67: "сильний крижаний дощ",
  71: "слабкий сніг",
  73: "помірний сніг",
  75: "сильний сніг",
  77: "снігові зерна",
  80: "короткочасні слабкі зливи",
  81: "короткочасні помірні зливи",
  82: "короткочасні сильні зливи",
  85: "слабкі снігові заряди",
  86: "сильні снігові заряди",
  95: "гроза",
  96: "гроза зі слабким градом",
  99: "гроза з сильним градом"
};

function describeWeatherCode(code) {
  return WEATHER_CODES[code] || "умови уточнюються";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDailyLine(label, daily, index) {
  return [
    `${label}: ${describeWeatherCode(daily.weather_code[index])}.`,
    `Температура ${Math.round(daily.temperature_2m_min[index])}..${Math.round(daily.temperature_2m_max[index])}°C.`,
    `Опади ${daily.precipitation_sum[index]} мм.`,
    `Вітер до ${Math.round(daily.wind_speed_10m_max[index])} км/год.`
  ].join(" ");
}

function isThunderstormCode(code) {
  return [95, 96, 99].includes(Number(code));
}

function isRainRiskCode(code) {
  return [61, 63, 65, 80, 81, 82, 66, 67].includes(Number(code));
}

function buildWeatherWarnings(current, daily) {
  const warnings = [];
  const currentWind = Number(current?.wind_speed_10m) || 0;
  const maxWind = Math.max(
    currentWind,
    ...(Array.isArray(daily?.wind_speed_10m_max) ? daily.wind_speed_10m_max.map((value) => Number(value) || 0) : [0])
  );
  const minTemp = Math.min(
    ...(Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min.map((value) => Number(value) || 99) : [99])
  );
  const maxPrecip = Math.max(
    ...(Array.isArray(daily?.precipitation_sum) ? daily.precipitation_sum.map((value) => Number(value) || 0) : [0])
  );
  const currentCode = Number(current?.weather_code);
  const dailyCodes = Array.isArray(daily?.weather_code) ? daily.weather_code.map((value) => Number(value)) : [];

  if (maxWind >= 35) {
    warnings.push(`сильний вітер: до ${Math.round(maxWind)} км/год, на відкритому хребті відчуватиметься жорсткіше`);
  }

  if (isThunderstormCode(currentCode) || dailyCodes.some((code) => isThunderstormCode(code))) {
    warnings.push("ризик грози: відкриті вершини і хребет краще проходити якомога раніше");
  }

  if (minTemp <= 0) {
    warnings.push(`ризик заморозку: вночі або зранку температура може опускатися до ${Math.round(minTemp)}°C`);
  }

  if (maxPrecip >= 5 || isRainRiskCode(currentCode) || dailyCodes.some((code) => isRainRiskCode(code))) {
    warnings.push("дощовий ризик на хребті: заклади дощовик, сухий шар одягу і запас часу на спуск");
  }

  return warnings;
}

function buildWeatherConclusions(current, daily) {
  const conclusions = [];
  const currentWind = Number(current?.wind_speed_10m) || 0;
  const maxWind = Math.max(
    currentWind,
    ...(Array.isArray(daily?.wind_speed_10m_max) ? daily.wind_speed_10m_max.map((value) => Number(value) || 0) : [0])
  );
  const minTemp = Math.min(
    ...(Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min.map((value) => Number(value) || 99) : [99])
  );
  const maxPrecip = Math.max(
    ...(Array.isArray(daily?.precipitation_sum) ? daily.precipitation_sum.map((value) => Number(value) || 0) : [0])
  );
  const currentCode = Number(current?.weather_code);
  const dailyCodes = Array.isArray(daily?.weather_code) ? daily.weather_code.map((value) => Number(value)) : [];
  const hasThunder = isThunderstormCode(currentCode) || dailyCodes.some((code) => isThunderstormCode(code));
  const hasRainRisk = maxPrecip >= 5 || isRainRiskCode(currentCode) || dailyCodes.some((code) => isRainRiskCode(code));

  if (hasThunder) {
    conclusions.push("плануй ранній вихід і тримай готовий нижчий або коротший запасний варіант замість відкритого хребта");
  }

  if (maxWind >= 35) {
    conclusions.push(`на відкритому рельєфі маршрут відчуватиметься жорсткіше через вітер до ${Math.round(maxWind)} км/год`);
  }

  if (hasRainRisk) {
    conclusions.push("заклади дощовик, гермозахист для сухих речей і запас часу на повільніший спуск");
  }

  if (minTemp <= 2) {
    conclusions.push(`на ранок і вечір може бути холодно, бо мінімум опускається до ${Math.round(minTemp)}°C`);
  }

  if (!conclusions.length) {
    conclusions.push("погода виглядає робочою, але перед виходом усе одно перевір ранкове оновлення прогнозу");
  }

  return conclusions.slice(0, 4);
}

const STATIC_WEATHER_LOCATION_ALIASES = new Map([
  ["міжгір'я", { latitude: 48.52458, longitude: 23.50444, name: "Міжгір’я", admin1: "Закарпатська область", country: "Україна" }],
  ["міжгіря", { latitude: 48.52458, longitude: 23.50444, name: "Міжгір’я", admin1: "Закарпатська область", country: "Україна" }],
  ["воловець", { latitude: 48.71029, longitude: 23.18584, name: "Воловець", admin1: "Закарпатська область", country: "Україна" }],
  ["стара гута", { latitude: 48.628575, longitude: 24.2080875, name: "Стара Гута", admin1: "Івано-Франківська область", country: "Україна" }],
  ["осмолода", { latitude: 48.6669, longitude: 24.0374, name: "Осмолода", admin1: "Івано-Франківська область", country: "Україна" }],
  ["бистриця", { latitude: 48.4625425, longitude: 24.2507741, name: "Бистриця", admin1: "Івано-Франківська область", country: "Україна" }],
  ["ворохта", { latitude: 48.2929828, longitude: 24.5635786, name: "Ворохта", admin1: "Івано-Франківська область", country: "Україна" }],
  ["вороненко", { latitude: 48.2794592, longitude: 24.5081492, name: "Вороненко", admin1: "Івано-Франківська область", country: "Україна" }],
  ["кваси", { latitude: 48.14957, longitude: 24.28551, name: "Кваси", admin1: "Закарпатська область", country: "Україна" }],
  ["ясіня", { latitude: 48.27681, longitude: 24.36056, name: "Ясіня", admin1: "Закарпатська область", country: "Україна" }]
]);

function buildWeatherLocationAliases() {
  const aliases = new Map(STATIC_WEATHER_LOCATION_ALIASES);

  for (const [key, place] of Object.entries(CARPATHIAN_PLACE_ALIASES)) {
    const address = place?.address || {};
    const settlementName = address.city || address.town || address.village || address.hamlet || address.locality || "";
    const displayName = String(place?.display_name || "").trim();
    if (!settlementName || !displayName) {
      continue;
    }

    const resolvedPlace = {
      latitude: Number(place.lat),
      longitude: Number(place.lon),
      name: settlementName,
      admin1: address.state || "",
      country: address.country || "Україна",
      display_name: displayName
    };

    aliases.set(normalizeLocation(settlementName), resolvedPlace);
    aliases.set(normalizeLocation(key), resolvedPlace);
  }

  return aliases;
}

const WEATHER_LOCATION_ALIASES = buildWeatherLocationAliases();

function normalizeLocation(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export class WeatherService {
  async getWeatherSummary(location) {
    try {
      const normalizedLocation = normalizeLocation(location);
      const alias = WEATHER_LOCATION_ALIASES.get(normalizedLocation);
      const baseLocation = String(location || "").trim();
      let place = alias && Number.isFinite(alias.latitude) && Number.isFinite(alias.longitude)
        ? { ...alias }
        : null;
      const candidates = [
        typeof alias?.display_name === "string" ? alias.display_name : null,
        typeof alias === "string" ? alias : null,
        baseLocation,
        baseLocation.replace(/'/g, "’").trim(),
        baseLocation.replace(/’/g, "'").trim(),
        baseLocation.replace(/[’']/g, "").trim(),
        `${baseLocation}, Україна`,
        `${baseLocation.replace(/[’']/g, "").trim()}, Україна`
      ].filter(Boolean);

      for (const candidate of [...new Set(candidates)]) {
        if (place) {
          break;
        }

        const geoUrl = new URL(GEOCODING_URL);
        geoUrl.searchParams.set("name", candidate);
        geoUrl.searchParams.set("count", "10");
        geoUrl.searchParams.set("language", "uk");
        geoUrl.searchParams.set("format", "json");

        const geoResponse = await fetch(geoUrl);
        if (!geoResponse.ok) {
          throw new Error(`Geocoding failed with status ${geoResponse.status}`);
        }

        const geoData = await geoResponse.json();
        const results = Array.isArray(geoData.results) ? geoData.results : [];
        place = results.find((item) => String(item.country_code || "").toUpperCase() === "UA")
          || results.find((item) => String(item.country || "").toLowerCase().includes("укра"))
          || results[0]
          || null;
      }

      if (!place) {
        return `Не вдалося знайти локацію "${location}". Спробуй точнішу назву, наприклад: Яремче, Hoverla, Vorokhta.`;
      }

      const forecastUrl = new URL(FORECAST_URL);
      forecastUrl.searchParams.set("latitude", String(place.latitude));
      forecastUrl.searchParams.set("longitude", String(place.longitude));
      forecastUrl.searchParams.set(
        "current",
        "temperature_2m,apparent_temperature,weather_code,wind_speed_10m"
      );
      forecastUrl.searchParams.set(
        "daily",
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max"
      );
      forecastUrl.searchParams.set("forecast_days", "3");
      forecastUrl.searchParams.set("timezone", "auto");

      const forecastResponse = await fetch(forecastUrl);
      if (!forecastResponse.ok) {
        throw new Error(`Forecast failed with status ${forecastResponse.status}`);
      }

      const forecast = await forecastResponse.json();
      const current = forecast.current;
      const daily = forecast.daily;
      const area = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
      const warnings = buildWeatherWarnings(current, daily);
      const conclusions = buildWeatherConclusions(current, daily);

      const lines = [
        `<b>🌦 Погода</b>`,
        escapeHtml(area),
        "",
        "<b>🌡 Зараз</b>",
        `• ${escapeHtml(describeWeatherCode(current.weather_code))}, ${Math.round(current.temperature_2m)}°C, відчувається як ${Math.round(current.apparent_temperature)}°C`,
        `• вітер ${Math.round(current.wind_speed_10m)} км/год`,
        "",
        "<b>📅 Прогноз</b>",
        escapeHtml(formatDailyLine("Сьогодні", daily, 0)),
        escapeHtml(formatDailyLine("Завтра", daily, 1)),
        "",
        "<b>🧭 Що це означає для походу</b>",
        ...conclusions.map((item) => `• ${escapeHtml(item)}`),
        "",
        "<b>⚠️ Зверни увагу</b>",
        "• для гір перевір також силу вітру, опади і запасний маршрут перед виходом"
      ];

      if (warnings.length) {
        lines.push("", "<b>⚠️ Погодні попередження</b>");
        lines.push(...warnings.map((item) => `• ${escapeHtml(item)}`));
      }

      return lines.join("\n");
    } catch (error) {
      return [
        `Не вдалося отримати погоду для "${location}".`,
        "Сервіс погоди тимчасово недоступний або немає доступу до мережі.",
        `Технічна причина: ${error.message}`
      ].join("\n");
    }
  }
}

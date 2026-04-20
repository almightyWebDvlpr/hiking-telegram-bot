const APP_TIME_ZONE = "Europe/Kiev";

let dateFns = {};
let dateFnsTz = {};

try {
  dateFns = await import("date-fns");
} catch {
  dateFns = {};
}

try {
  dateFnsTz = await import("date-fns-tz");
} catch {
  dateFnsTz = {};
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  if (typeof dateFns.parseISO === "function") {
    const parsed = dateFns.parseISO(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatInAppTimeZone(date, pattern) {
  if (!date) {
    return "";
  }

  if (typeof dateFnsTz.formatInTimeZone === "function") {
    try {
      return dateFnsTz.formatInTimeZone(date, APP_TIME_ZONE, pattern);
    } catch {
      // fall through to standard formatter
    }
  }

  if (typeof dateFns.format === "function") {
    try {
      return dateFns.format(date, pattern);
    } catch {
      // fall through to locale formatter
    }
  }

  return date.toLocaleString("uk-UA");
}

function getTodayDateStringInZone() {
  const now = new Date();
  if (typeof dateFnsTz.formatInTimeZone === "function") {
    try {
      return dateFnsTz.formatInTimeZone(now, APP_TIME_ZONE, "yyyy-MM-dd");
    } catch {
      // fall through
    }
  }

  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function getAppTimeZone() {
  return APP_TIME_ZONE;
}

export function nowIso() {
  return new Date().toISOString();
}

export function calculateDaysUntilDateString(dateString) {
  const targetRaw = String(dateString || "").trim();
  if (!targetRaw) {
    return null;
  }

  const target = parseDateInput(`${targetRaw}T00:00:00Z`);
  const today = parseDateInput(`${getTodayDateStringInZone()}T00:00:00Z`);
  if (!target || !today) {
    return null;
  }

  if (typeof dateFns.differenceInCalendarDays === "function") {
    try {
      return dateFns.differenceInCalendarDays(target, today);
    } catch {
      // fall through
    }
  }

  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function formatIsoDateTimeShort(value = "") {
  const date = parseDateInput(value);
  if (!date) {
    return "не вказано";
  }

  return formatInAppTimeZone(date, "dd.MM.yyyy HH:mm");
}

export function formatDateTimeForAudit(value = "") {
  const date = parseDateInput(value);
  if (!date) {
    return "невідомо";
  }

  return formatInAppTimeZone(date, "dd.MM.yyyy HH:mm");
}

export function formatDateOnly(value = "", fallback = "") {
  const date = parseDateInput(value);
  if (!date) {
    return fallback;
  }

  return formatInAppTimeZone(date, "yyyy-MM-dd");
}

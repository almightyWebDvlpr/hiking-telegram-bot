let phoneRuntime = {};

try {
  phoneRuntime = await import("libphonenumber-js/min");
} catch {
  phoneRuntime = {};
}

const FALLBACK_PHONE_REGEX = /^\+?[0-9()\-\s]{8,20}$/;

function sanitizePhone(value = "") {
  return String(value || "").trim();
}

export function normalizePhone(value = "", defaultCountry = "UA") {
  const raw = sanitizePhone(value);
  if (!raw) {
    return "";
  }

  if (typeof phoneRuntime.parsePhoneNumberFromString === "function") {
    const parsed = phoneRuntime.parsePhoneNumberFromString(raw, defaultCountry);
    if (parsed?.isValid?.()) {
      return parsed.number || raw;
    }
  }

  const compact = raw.replace(/[^\d+]/g, "");
  if (compact.startsWith("+")) {
    return compact;
  }

  if (compact.startsWith("380") && compact.length === 12) {
    return `+${compact}`;
  }

  if (compact.startsWith("0") && compact.length === 10) {
    return `+38${compact}`;
  }

  return compact || raw;
}

export function formatPhoneForDisplay(value = "", defaultCountry = "UA") {
  const normalized = normalizePhone(value, defaultCountry);
  if (!normalized) {
    return "";
  }

  if (typeof phoneRuntime.parsePhoneNumberFromString === "function") {
    const parsed = phoneRuntime.parsePhoneNumberFromString(normalized, defaultCountry);
    if (parsed?.isValid?.()) {
      return parsed.formatInternational();
    }
  }

  return normalized;
}

export function validatePhoneInput(value = "", defaultCountry = "UA") {
  const raw = sanitizePhone(value);
  if (!raw) {
    return {
      ok: false,
      error: "Введи телефон у зрозумілому форматі, наприклад +380671234567."
    };
  }

  if (typeof phoneRuntime.parsePhoneNumberFromString === "function") {
    const parsed = phoneRuntime.parsePhoneNumberFromString(raw, defaultCountry);
    if (parsed?.isValid?.()) {
      return {
        ok: true,
        value: parsed.number || raw,
        normalized: parsed.number || raw,
        display: parsed.formatInternational?.() || parsed.number || raw
      };
    }
  }

  if (!FALLBACK_PHONE_REGEX.test(raw)) {
    return {
      ok: false,
      error: "Введи телефон у зрозумілому форматі, наприклад +380671234567."
    };
  }

  const normalized = normalizePhone(raw, defaultCountry);
  return {
    ok: true,
    value: normalized,
    normalized,
    display: normalized
  };
}

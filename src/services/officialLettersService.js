import crypto from "node:crypto";
import { resolveSafetyProfile } from "../data/safetyContacts.js";
import { resolveBorderAuthorityForTrip } from "../data/borderContacts.js";
import { formatPhoneForDisplay } from "../utils/phone.js";

function escapeRtf(value = "") {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\par\n")
    .replace(/[^\x00-\x7F]/g, (character) => {
      const codePoint = character.charCodeAt(0);
      const signedValue = codePoint > 32767 ? codePoint - 65536 : codePoint;
      return `\\u${signedValue}?`;
    });
}

function buildRtfDocument(title, sections = []) {
  const body = [
    "{\\rtf1\\ansi\\deff0",
    "{\\fonttbl{\\f0 Arial;}}",
    "\\viewkind4\\uc1\\pard\\sa180\\sl276\\slmult1\\f0\\fs24",
    `\\b ${escapeRtf(title)}\\b0\\par`,
    "\\par"
  ];

  for (const section of sections) {
    if (!section) {
      continue;
    }

    if (section.type === "heading") {
      body.push(`\\b ${escapeRtf(section.text)}\\b0\\par`);
      continue;
    }

    if (section.type === "paragraph") {
      body.push(`${escapeRtf(section.text)}\\par`);
      continue;
    }

    if (section.type === "bullet") {
      body.push(`\\tab - ${escapeRtf(section.text)}\\par`);
      continue;
    }

    if (section.type === "blank") {
      body.push("\\par");
    }
  }

  body.push("}");
  return Buffer.from(body.join("\n"), "utf8");
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeDate(value) {
  return normalizeText(value) || "не вказано";
}

function buildRouteLine(trip) {
  const routePlan = trip?.routePlan || {};
  if (routePlan.source === "vpohid" && routePlan.sourceTitle) {
    return routePlan.sourceTitle;
  }

  const points = Array.isArray(routePlan.points) && routePlan.points.length
    ? routePlan.points
    : [routePlan.from, ...(routePlan.stops || []), routePlan.to].filter(Boolean);

  if (!points.length) {
    return "Маршрут ще не задано";
  }

  return points.join(" -> ");
}

function buildMeetingLine(trip) {
  const tripCard = trip?.tripCard || {};
  const meetingPoint = normalizeText(tripCard.meetingPoint);
  const meetingDate = normalizeText(tripCard.meetingDate || tripCard.startDate);
  const meetingTime = normalizeText(tripCard.meetingTime);
  const chunks = [];

  if (meetingPoint) {
    chunks.push(meetingPoint);
  }
  if (meetingDate) {
    chunks.push(meetingTime ? `${meetingDate} о ${meetingTime}` : meetingDate);
  }

  return chunks.join(" | ");
}

function getProfileData(userService, member) {
  const profileSnapshot = userService.getProfile(String(member.id), member.name || "");
  return profileSnapshot?.profile || {};
}

function getDisplayName(userService, member) {
  return userService.getDisplayName(String(member.id), member.name || "Учасник");
}

function getRelevantMembers(trip = {}) {
  const members = Array.isArray(trip.members) ? trip.members : [];
  const filtered = members.filter((member) => String(member?.attendanceStatus || "") !== "not_going");
  return filtered.length ? filtered : members;
}

function buildParticipantRows(trip, userService) {
  return getRelevantMembers(trip).map((member, index) => {
    const profile = getProfileData(userService, member);
    const fullName = normalizeText(profile.fullName || member.name || "Учасник");
    const phone = formatPhoneForDisplay(profile.phone) || normalizeText(profile.phone) || "не вказано";
    const city = normalizeText(profile.city);
    const birthDate = safeDate(profile.birthDate);
    const passportNumber = normalizeText(profile.passportNumber || "");
    const passportIssuedBy = normalizeText(profile.passportIssuedBy || "");
    const residenceAddress = normalizeText(profile.residenceAddress || city || "");

    return {
      index: index + 1,
      memberId: String(member.id || ""),
      fullName,
      birthDate,
      phone,
      city,
      passportNumber: passportNumber || "[внеси вручну]",
      passportIssuedBy: passportIssuedBy || "[внеси вручну]",
      residenceAddress: residenceAddress || "[внеси вручну]",
      missingCore: [
        !fullName ? "ПІБ" : "",
        birthDate === "не вказано" ? "дата народження" : "",
        phone === "не вказано" ? "телефон" : ""
      ].filter(Boolean)
    };
  });
}

function buildLeaderData(trip, userService) {
  const leader = (trip.members || []).find((member) => String(member.role || "") === "owner")
    || getRelevantMembers(trip)[0]
    || null;

  if (!leader) {
    return {
      fullName: "Організатор не знайдений",
      phone: "не вказано",
      city: "не вказано",
      birthDate: "не вказано",
      residenceAddress: "[внеси вручну]",
      passportNumber: "[внеси вручну]",
      passportIssuedBy: "[внеси вручну]"
    };
  }

  const profile = getProfileData(userService, leader);
  return {
    fullName: normalizeText(profile.fullName || leader.name || "Організатор"),
    phone: formatPhoneForDisplay(profile.phone) || normalizeText(profile.phone) || "не вказано",
    city: normalizeText(profile.city) || "не вказано",
    birthDate: safeDate(profile.birthDate),
    residenceAddress: normalizeText(profile.residenceAddress || profile.city) || "[внеси вручну]",
    passportNumber: normalizeText(profile.passportNumber) || "[внеси вручну]",
    passportIssuedBy: normalizeText(profile.passportIssuedBy) || "[внеси вручну]"
  };
}

function buildMissingDataSummary(participants = []) {
  const rows = [];

  for (const participant of participants) {
    if (!participant.missingCore.length) {
      continue;
    }

    rows.push(`${participant.fullName}: ${participant.missingCore.join(", ")}`);
  }

  return rows;
}

function formatDateRange(trip) {
  const startDate = safeDate(trip?.tripCard?.startDate);
  const endDate = safeDate(trip?.tripCard?.endDate);
  return `${startDate} -> ${endDate}`;
}

function slugifyFileName(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || crypto.randomUUID();
}

export function buildBorderGuardLetter(trip, userService) {
  const authority = resolveBorderAuthorityForTrip(trip);
  if (!authority) {
    return null;
  }

  const leader = buildLeaderData(trip, userService);
  const participants = buildParticipantRows(trip, userService);
  const missingSummary = buildMissingDataSummary(participants);
  const routeLine = buildRouteLine(trip);
  const dateRange = formatDateRange(trip);
  const meetingLine = buildMeetingLine(trip);

  const sections = [
    { type: "paragraph", text: `Начальнику ${authority.detachmentName}` },
    { type: "paragraph", text: `${authority.commanderRank} ${authority.commanderName}` },
    { type: "paragraph", text: `${authority.address}` },
    { type: "blank" },
    { type: "paragraph", text: `Від керівника туристичної групи: ${leader.fullName}` },
    { type: "paragraph", text: `Телефон: ${leader.phone}` },
    { type: "paragraph", text: `Місце проживання: ${leader.residenceAddress}` },
    { type: "paragraph", text: `Паспорт / документ: ${leader.passportNumber}` },
    { type: "paragraph", text: `Ким і коли виданий: ${leader.passportIssuedBy}` },
    { type: "blank" },
    { type: "heading", text: "ЗАЯВА" },
    { type: "paragraph", text: `Прошу врахувати перебування туристичної групи у прикордонному районі в період ${dateRange}.` },
    { type: "paragraph", text: `Плановий маршрут: ${routeLine}.` },
    meetingLine ? { type: "paragraph", text: `Точка / час збору: ${meetingLine}.` } : null,
    { type: "paragraph", text: `Орієнтовний район проходження: ${authority.areaLabel}.` },
    { type: "paragraph", text: "Просимо повідомити про можливі обмеження режиму, додаткові вимоги до перепусток або документів, якщо вони потрібні для проходження маршруту." },
    { type: "blank" },
    { type: "heading", text: "Склад групи" },
    ...participants.flatMap((participant) => ([
      {
        type: "paragraph",
        text: `${participant.index}. ${participant.fullName}, ${participant.birthDate}, документ: ${participant.passportNumber}, виданий: ${participant.passportIssuedBy}, адреса: ${participant.residenceAddress}, телефон: ${participant.phone}`
      }
    ])),
    { type: "blank" },
    { type: "paragraph", text: `Контакт для уточнень: ${leader.fullName}, ${leader.phone}.` },
    { type: "paragraph", text: "Дата формування чернетки: ____________________" },
    { type: "paragraph", text: "Підпис керівника групи: ____________________" },
    { type: "blank" },
    { type: "heading", text: "Примітка" },
    { type: "paragraph", text: "Це чернетка, згенерована ботом. Паспортні реквізити та повні адреси проживання, якщо їх немає в профілях, потрібно доповнити вручну перед надсиланням." },
    { type: "paragraph", text: "Під час воєнного стану правила доступу до прикордонної смуги можуть змінюватися. Перед поданням листа обов'язково перевір актуальний режим у підрозділу." },
    { type: "paragraph", text: `Контакти підрозділу: ${authority.email}; ${authority.phones.join(" / ")}.` },
    { type: "paragraph", text: `${authority.checkpointLabel}: ${authority.checkpointPhones.join(" / ")}.` },
    { type: "paragraph", text: authority.checkpointNote }
  ].filter(Boolean);

  return {
    authority,
    participants,
    missingSummary,
    caption: `🛂 Чернетка листа для ${authority.label}`,
    fileName: `${slugifyFileName(trip?.name || "trip")}-prikordonnyky.rtf`,
    buffer: buildRtfDocument(`Лист до ${authority.label}`, sections)
  };
}

export function buildRescueLetter(trip, userService) {
  const safety = resolveSafetyProfile(trip);
  const leader = buildLeaderData(trip, userService);
  const participants = buildParticipantRows(trip, userService);
  const routeLine = buildRouteLine(trip);
  const dateRange = formatDateRange(trip);
  const meetingLine = buildMeetingLine(trip);
  const missingSummary = buildMissingDataSummary(participants);
  const localContacts = (safety.contacts || []).map((item) => `${item.label}: ${item.phones.join(" / ")}`);

  const sections = [
    { type: "paragraph", text: `До гірського пошуково-рятувального підрозділу регіону ${safety.title}` },
    { type: "blank" },
    { type: "heading", text: "ПОВІДОМЛЕННЯ ПРО МАРШРУТ ГРУПИ" },
    { type: "paragraph", text: `Керівник групи: ${leader.fullName}` },
    { type: "paragraph", text: `Контактний телефон: ${leader.phone}` },
    { type: "paragraph", text: `Місто / адреса: ${leader.residenceAddress}` },
    { type: "blank" },
    { type: "paragraph", text: `Повідомляємо про планований похід у період ${dateRange}.` },
    { type: "paragraph", text: `Район походу: ${trip?.region || safety.title}.` },
    { type: "paragraph", text: `Маршрут: ${routeLine}.` },
    meetingLine ? { type: "paragraph", text: `Старт / точка збору: ${meetingLine}.` } : null,
    { type: "paragraph", text: `Кількість учасників: ${participants.length}.` },
    { type: "blank" },
    { type: "heading", text: "Склад групи" },
    ...participants.map((participant) => ({
      type: "paragraph",
      text: `${participant.index}. ${participant.fullName}, дата народження: ${participant.birthDate}, телефон: ${participant.phone}, місто: ${participant.city || "не вказано"}`
    })),
    { type: "blank" },
    { type: "heading", text: "Контакти рятувальників у регіоні" },
    ...(localContacts.length
      ? localContacts.map((item) => ({ type: "bullet", text: item }))
      : [{ type: "bullet", text: "Локальний контакт не визначено автоматично, у разі потреби телефонуй 101 або 112." }]),
    { type: "blank" },
    { type: "paragraph", text: "Просимо врахувати маршрут групи та, за можливості, повідомити про актуальні обмеження, погодні або безпекові ризики на заявленому напрямку." },
    { type: "paragraph", text: "Дата формування чернетки: ____________________" },
    { type: "paragraph", text: "Підпис керівника групи: ____________________" },
    { type: "blank" },
    { type: "heading", text: "Примітка" },
    { type: "paragraph", text: "Це інформаційна чернетка повідомлення, згенерована ботом. За потреби доповни її спорядженням, контрольними строками виходу на зв'язок та резервним планом сходу з маршруту." }
  ].filter(Boolean);

  return {
    safety,
    participants,
    missingSummary,
    caption: `🚑 Чернетка повідомлення для рятувальників регіону ${safety.title}`,
    fileName: `${slugifyFileName(trip?.name || "trip")}-riatuvalnyky.rtf`,
    buffer: buildRtfDocument(`Повідомлення для рятувальників — ${trip?.name || "Похід"}`, sections)
  };
}

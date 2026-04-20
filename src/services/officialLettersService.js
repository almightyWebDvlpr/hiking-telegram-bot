import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSafetyProfile } from "../data/safetyContacts.js";
import { resolveBorderAuthorityForTrip } from "../data/borderContacts.js";
import { formatPhoneForDisplay } from "../utils/phone.js";
import { createStoredZip } from "../utils/zip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BORDER_TEMPLATE_ROOT = path.resolve(__dirname, "../../assets/templates/kordon_zajava");
const DOCX_STATIC_FILES = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/_rels/document.xml.rels",
  "word/fontTable.xml",
  "word/numbering.xml",
  "word/settings.xml",
  "word/styles.xml",
  "word/theme/theme1.xml"
];

let borderTemplateCache = null;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeDate(value) {
  return normalizeText(value) || "не вказано";
}

function escapeXml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugifyFileName(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || crypto.randomUUID();
}

async function loadBorderTemplateFiles() {
  if (borderTemplateCache) {
    return borderTemplateCache;
  }

  const loadedEntries = await Promise.all(
    DOCX_STATIC_FILES.map(async (fileName) => ({
      name: fileName,
      data: await fs.readFile(path.join(BORDER_TEMPLATE_ROOT, fileName))
    }))
  );

  borderTemplateCache = loadedEntries;
  return borderTemplateCache;
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
    const passportNumber = normalizeText(profile.passportNumber);
    const passportIssuedBy = normalizeText(profile.passportIssuedBy);
    const residenceAddress = normalizeText(profile.residenceAddress || city);

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
      ].filter(Boolean),
      missingBorder: [
        !passportNumber ? "серія та номер документа" : "",
        !passportIssuedBy ? "ким і коли виданий документ" : "",
        !residenceAddress ? "адреса проживання" : ""
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

function buildMissingDataSummary(participants = [], options = {}) {
  const rows = [];
  const includeBorderFields = Boolean(options.includeBorderFields);

  for (const participant of participants) {
    const issues = [
      ...participant.missingCore,
      ...(includeBorderFields ? participant.missingBorder : [])
    ];

    if (!issues.length) {
      continue;
    }

    rows.push(`${participant.fullName}: ${issues.join(", ")}`);
  }

  return rows;
}

function formatDateRange(trip) {
  const startDate = safeDate(trip?.tripCard?.startDate);
  const endDate = safeDate(trip?.tripCard?.endDate);
  return `${startDate} -> ${endDate}`;
}

function xmlRun(text = "", options = {}) {
  const escapedText = escapeXml(text);
  const colorXml = options.color ? `<w:color w:val="${escapeXml(options.color)}"/>` : "";
  const underlineXml = options.underline ? "<w:u w:val=\"single\"/>" : "";
  const italicXml = options.italic ? "<w:i w:val=\"1\"/>" : "";

  return `<w:r><w:rPr>${italicXml}${colorXml}${underlineXml}<w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">${escapedText}</w:t></w:r>`;
}

function xmlParagraph(runs = "", options = {}) {
  const alignment = options.align ? `<w:jc w:val="${options.align}"/>` : "";
  const italicXml = options.italic ? "<w:i w:val=\"1\"/>" : "";
  const colorXml = options.color ? `<w:color w:val="${escapeXml(options.color)}"/>` : "";

  return `<w:p><w:pPr>${alignment}<w:rPr>${italicXml}${colorXml}</w:rPr></w:pPr>${runs}</w:p>`;
}

function xmlTextParagraph(text = "", options = {}) {
  return xmlParagraph(xmlRun(text, options), options);
}

function xmlCell(text = "") {
  return `<w:tc><w:tcPr><w:shd w:fill="auto" w:val="clear"/><w:tcMar><w:top w:w="100.0" w:type="dxa"/><w:left w:w="100.0" w:type="dxa"/><w:bottom w:w="100.0" w:type="dxa"/><w:right w:w="100.0" w:type="dxa"/></w:tcMar><w:vAlign w:val="top"/></w:tcPr><w:p><w:pPr><w:keepNext w:val="0"/><w:keepLines w:val="0"/><w:widowControl w:val="0"/><w:pBdr><w:top w:space="0" w:sz="0" w:val="nil"/><w:left w:space="0" w:sz="0" w:val="nil"/><w:bottom w:space="0" w:sz="0" w:val="nil"/><w:right w:space="0" w:sz="0" w:val="nil"/><w:between w:space="0" w:sz="0" w:val="nil"/></w:pBdr><w:shd w:fill="auto" w:val="clear"/><w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="left"/><w:rPr/></w:pPr>${text ? xmlRun(text) : "<w:r><w:rPr><w:rtl w:val=\"0\"/></w:rPr></w:r>"}</w:p></w:tc>`;
}

function xmlTable(rows = []) {
  return `<w:tbl><w:tblPr><w:tblStyle w:val="Table1"/><w:tblW w:w="9029.0" w:type="dxa"/><w:jc w:val="left"/><w:tblInd w:w="100.0" w:type="pct"/><w:tblBorders><w:top w:color="000000" w:space="0" w:sz="8" w:val="single"/><w:left w:color="000000" w:space="0" w:sz="8" w:val="single"/><w:bottom w:color="000000" w:space="0" w:sz="8" w:val="single"/><w:right w:color="000000" w:space="0" w:sz="8" w:val="single"/><w:insideH w:color="000000" w:space="0" w:sz="8" w:val="single"/><w:insideV w:color="000000" w:space="0" w:sz="8" w:val="single"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblLook w:val="0600"/></w:tblPr><w:tblGrid><w:gridCol w:w="1829"/><w:gridCol w:w="1425"/><w:gridCol w:w="1515"/><w:gridCol w:w="2175"/><w:gridCol w:w="2085"/></w:tblGrid>${rows.join("")}</w:tbl>`;
}

function xmlTableRow(cells = []) {
  return `<w:tr>${cells.join("")}</w:tr>`;
}

function buildBorderDocXml(trip, authority, leader, participants) {
  const meetingLine = buildMeetingLine(trip);
  const routeLine = buildRouteLine(trip);
  const dateRange = formatDateRange(trip);
  const today = new Date().toISOString().slice(0, 10);

  const rightAlignedHeader = [
    xmlTextParagraph(`Начальнику ${authority.detachmentName}`, { align: "right" }),
    xmlParagraph(
      `${xmlRun(`${authority.commanderRank} ${authority.commanderName}`, { italic: true, color: "666666" })}`,
      { align: "right", italic: true }
    ),
    xmlTextParagraph("керівника туристичної групи", { align: "right" }),
    xmlTextParagraph(leader.fullName, { align: "right", italic: true, color: "666666" }),
    xmlParagraph(
      `${xmlRun("паспорт ", {})}${xmlRun(leader.passportNumber, { italic: true, color: "666666" })}`,
      { align: "right" }
    ),
    xmlTextParagraph(leader.passportIssuedBy, { align: "right", italic: true, color: "666666" }),
    xmlParagraph(
      `${xmlRun("проживає ", {})}${xmlRun(leader.residenceAddress, { italic: true, color: "666666" })}`,
      { align: "right" }
    ),
    xmlTextParagraph(`телефон ${leader.phone}`, { align: "right" }),
    xmlTextParagraph("", {})
  ];

  const introParagraphs = [
    xmlTextParagraph(
      `Прошу надати дозволу на знаходження групи туристів в прикордонній зоні ${authority.zoneLabel || authority.region} з ${safeDate(trip?.tripCard?.startDate)} по ${safeDate(trip?.tripCard?.endDate)}, яка проходитиме туристичний маршрут: ${routeLine}`
    ),
    meetingLine ? xmlTextParagraph(`Точка збору / старт: ${meetingLine}`) : "",
    xmlTextParagraph("Склад групи:")
  ].filter(Boolean);

  const tableHeader = xmlTableRow([
    xmlCell("ПІБ"),
    xmlCell("Дата народження"),
    xmlCell("Серія, номер паспорта"),
    xmlCell("Ким і коли виданий"),
    xmlCell("Адреса, телефон")
  ]);

  const tableRows = participants.map((participant) =>
    xmlTableRow([
      xmlCell(participant.fullName),
      xmlCell(participant.birthDate),
      xmlCell(participant.passportNumber),
      xmlCell(participant.passportIssuedBy),
      xmlCell(`${participant.residenceAddress}; ${participant.phone}`)
    ])
  );

  const footer = [
    xmlTextParagraph(""),
    xmlParagraph(
      `${xmlRun(today, { italic: true, color: "666666" })}${xmlRun("                                                                 ", {})}${xmlRun(leader.fullName, { italic: true, color: "666666" })}`
    )
  ];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:sl="http://schemas.openxmlformats.org/schemaLibrary/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:lc="http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
<w:body>
${rightAlignedHeader.join("")}
${introParagraphs.join("")}
${xmlTable([tableHeader, ...tableRows])}
${footer.join("")}
<w:sectPr><w:pgSz w:h="16834" w:w="11909" w:orient="portrait"/><w:pgMar w:bottom="1440" w:top="1440" w:left="1440" w:right="1440" w:header="720" w:footer="720"/><w:pgNumType w:start="1"/></w:sectPr>
</w:body></w:document>`;
}

function buildRescueDocXml(trip, safety, leader, participants) {
  const routeLine = buildRouteLine(trip);
  const dateRange = formatDateRange(trip);
  const meetingLine = buildMeetingLine(trip);
  const rescuers = (safety.contacts || []).map((item) => `${item.label}: ${item.phones.join(" / ")}`);

  const paragraphs = [
    xmlTextParagraph(`Гірським пошуково-рятувальним підрозділам регіону ${safety.title}`, { align: "right" }),
    xmlTextParagraph(`Керівник групи: ${leader.fullName}`, { align: "right" }),
    xmlTextParagraph(`Телефон: ${leader.phone}`, { align: "right" }),
    xmlTextParagraph(""),
    xmlTextParagraph("ПОВІДОМЛЕННЯ ПРО ПЛАНОВАНИЙ ПОХІД"),
    xmlTextParagraph(`Повідомляємо про планований похід у період ${dateRange}.`),
    xmlTextParagraph(`Маршрут: ${routeLine}.`),
    xmlTextParagraph(`Регіон: ${trip?.region || safety.title}.`),
    meetingLine ? xmlTextParagraph(`Точка збору / старт: ${meetingLine}.`) : "",
    xmlTextParagraph(`Кількість учасників: ${participants.length}.`),
    xmlTextParagraph(""),
    xmlTextParagraph("Склад групи:")
  ].filter(Boolean);

  const tableHeader = xmlTableRow([
    xmlCell("ПІБ"),
    xmlCell("Дата народження"),
    xmlCell("Телефон"),
    xmlCell("Місто"),
    xmlCell("Додатково")
  ]);

  const tableRows = participants.map((participant) =>
    xmlTableRow([
      xmlCell(participant.fullName),
      xmlCell(participant.birthDate),
      xmlCell(participant.phone),
      xmlCell(participant.city || "не вказано"),
      xmlCell("Контакт через керівника групи")
    ])
  );

  const footerParagraphs = [
    xmlTextParagraph(""),
    xmlTextParagraph("Контакти рятувальників у регіоні:"),
    ...(rescuers.length ? rescuers.map((item) => xmlTextParagraph(`• ${item}`)) : [xmlTextParagraph("• Використовуй 101 або 112, якщо локальний підрозділ не визначено автоматично.")]),
    xmlTextParagraph(""),
    xmlTextParagraph("Дата формування: ____________________"),
    xmlTextParagraph(`Підпис керівника групи: ${leader.fullName}`)
  ];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:sl="http://schemas.openxmlformats.org/schemaLibrary/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:lc="http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
<w:body>
${paragraphs.join("")}
${xmlTable([tableHeader, ...tableRows])}
${footerParagraphs.join("")}
<w:sectPr><w:pgSz w:h="16834" w:w="11909" w:orient="portrait"/><w:pgMar w:bottom="1440" w:top="1440" w:left="1440" w:right="1440" w:header="720" w:footer="720"/><w:pgNumType w:start="1"/></w:sectPr>
</w:body></w:document>`;
}

async function buildDocxBuffer(documentXml) {
  const staticFiles = await loadBorderTemplateFiles();
  return createStoredZip([
    ...staticFiles,
    {
      name: "word/document.xml",
      data: Buffer.from(documentXml, "utf8")
    }
  ]);
}

export async function buildBorderGuardLetter(trip, userService) {
  const authority = resolveBorderAuthorityForTrip(trip);
  if (!authority) {
    return null;
  }

  const leader = buildLeaderData(trip, userService);
  const participants = buildParticipantRows(trip, userService);
  const missingSummary = buildMissingDataSummary(participants, { includeBorderFields: true });
  const documentXml = buildBorderDocXml(trip, authority, leader, participants);

  return {
    authority,
    participants,
    missingSummary,
    caption: `🛂 Чернетка листа для ${authority.label}`,
    fileName: `${slugifyFileName(trip?.name || "trip")}-prikordonnyky.docx`,
    buffer: await buildDocxBuffer(documentXml)
  };
}

export async function buildRescueLetter(trip, userService) {
  const safety = resolveSafetyProfile(trip);
  const leader = buildLeaderData(trip, userService);
  const participants = buildParticipantRows(trip, userService);
  const missingSummary = buildMissingDataSummary(participants);
  const documentXml = buildRescueDocXml(trip, safety, leader, participants);

  return {
    safety,
    participants,
    missingSummary,
    caption: `🚑 Чернетка повідомлення для рятувальників регіону ${safety.title}`,
    fileName: `${slugifyFileName(trip?.name || "trip")}-riatuvalnyky.docx`,
    buffer: await buildDocxBuffer(documentXml)
  };
}

const BORDER_AUTHORITIES = [
  {
    id: "mukachevo-detachment",
    label: "Мукачівський прикордонний загін",
    region: "Закарпатська область",
    areaLabel: "Мармароси / Ділове / Богдан / Рахівський прикордонний район",
    commanderRank: "полковнику",
    commanderName: "Ринькову Костянтину Ігоровичу",
    detachmentName: "Мукачівського прикордонного загону",
    zoneLabel: "Закарпатської області",
    address: "вул. Недецеї, 45, м. Мукачеве, Закарпатська обл., 89600",
    email: "mukachevo_zagin@dpsu.gov.ua",
    phones: ["+38 (03131) 2-12-61"],
    checkpointLabel: "Відділ прикордонної служби у с. Ділове",
    checkpointPhones: ["+38 (03132) 3-24-45"],
    checkpointNote: "Перед виходом на маршрут зазвичай потрібно звернутися на заставу в Діловому з копією листа та документами учасників.",
    commanderSourceUrl: "https://dpsu.gov.ua/uk/26-prikordonnij-zagin",
    contactSourceUrl: "https://vpohid.com.ua/en/pages/borderinfo/",
    keywords: [
      "мармарос",
      "мармароськ",
      "піп іван мармароський",
      "поп іван мармароський",
      "ділове",
      "делове",
      "богдан",
      "рахів",
      "луги",
      "берлебашка",
      "межипотоки",
      "полонина лисича",
      "стіг",
      "стог",
      "мукачеве",
      "мукачево"
    ]
  },
  {
    id: "chernivtsi-detachment",
    label: "31 прикордонний загін імені генерал-хорунжого Олександра Пилькевича",
    region: "Чернівецька / Івано-Франківська область",
    areaLabel: "Чивчини / Гриняви / Шибене / східніше гори Стіг",
    commanderRank: "полковнику",
    commanderName: "Бабичу Євгенію Юрійовичу",
    detachmentName: "31 прикордонного загону імені генерал-хорунжого Олександра Пилькевича",
    zoneLabel: "Чернівецької та Івано-Франківської областей",
    address: "вул. Герцена, 2А, м. Чернівці, 58022",
    email: "chernivci_zagin@dpsu.gov.ua",
    phones: ["+38 (0372) 59-19-00"],
    checkpointLabel: "Застава в с. Зелене / присілок Шибене",
    checkpointPhones: ["+38 (0372) 59-19-58"],
    checkpointNote: "Для Чивчинів і Гринявських гір перед стартом маршрут часто додатково уточнюють через заставу в районі Шибеного.",
    commanderSourceUrl: "https://dpsu.gov.ua/uk/31-prikordonnij-zagin-imeni-general-horunzhogo-oleksandra-pilkevicha",
    contactSourceUrl: "https://vpohid.com.ua/en/pages/borderinfo/",
    keywords: [
      "чивчин",
      "чивчини",
      "гриняв",
      "шибене",
      "зелене",
      "перкалаб",
      "буркут",
      "сарата",
      "томнатик",
      "палениця",
      "полонина смотрицька",
      "усть путила",
      "усть путила",
      "путила",
      "черемош",
      "піп іван мармароський зі шибеного",
      "поп іван мармароський зі шибеного",
      "чернівці",
      "чернівці область"
    ]
  }
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[`'"’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectTripText(trip) {
  const routePoints = Array.isArray(trip?.routePlan?.points)
    ? trip.routePlan.points
    : [trip?.routePlan?.from, ...(trip?.routePlan?.stops || []), trip?.routePlan?.to].filter(Boolean);

  return [
    trip?.region,
    trip?.name,
    trip?.routePlan?.sourceTitle,
    trip?.routePlan?.summary,
    ...routePoints
  ]
    .filter(Boolean)
    .map((item) => normalizeText(item));
}

export function resolveBorderAuthorityForTrip(trip) {
  const haystacks = collectTripText(trip);

  let bestMatch = null;
  let bestScore = 0;

  for (const authority of BORDER_AUTHORITIES) {
    const score = authority.keywords.reduce((sum, keyword) => {
      const normalizedKeyword = normalizeText(keyword);
      return sum + (haystacks.some((item) => item.includes(normalizedKeyword)) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestMatch = authority;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

export function isLikelyBorderAreaTrip(trip) {
  return Boolean(resolveBorderAuthorityForTrip(trip));
}

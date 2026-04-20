import crypto from "node:crypto";
import { canonicalizeGearName, enrichGearItem } from "../data/gearCatalog.js";
import { formatPhoneForDisplay, normalizePhone } from "../utils/phone.js";
import {
  BADGE_SERIES,
  ONE_TIME_AWARDS,
  formatAwardName,
  getCurrentTitle,
  getTierMeta,
  getXpLevel,
  getXpProgress,
  XP_COMBO_BONUSES,
  XP_TIER_BONUSES
} from "../data/awardsCatalog.js";

function withUsers(data) {
  return {
    ...data,
    users: Array.isArray(data.users) ? data.users : []
  };
}

function ensureUser(users, userId, fallbackName = "") {
  let user = users.find((item) => item.id === userId);

  if (!user) {
    user = {
      id: userId,
      name: fallbackName,
      profile: {},
      personalGear: [],
      awards: [],
      xpHistory: []
    };
    users.push(user);
  }

  if (!Array.isArray(user.personalGear)) {
    user.personalGear = [];
  }

  if (!user.profile || typeof user.profile !== "object") {
    user.profile = {};
  }

  if (!Array.isArray(user.awards)) {
    user.awards = [];
  }

  if (!Array.isArray(user.xpHistory)) {
    user.xpHistory = [];
  }

  if (fallbackName && !user.name) {
    user.name = fallbackName;
  }

  return user;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function buildProfileSnapshot(user, userName = "") {
  const profile = user?.profile && typeof user.profile === "object" ? user.profile : {};
  return {
    fullName: normalizeText(profile.fullName || user?.name || userName),
    birthDate: normalizeText(profile.birthDate),
    age: calculateAge(profile.birthDate),
    gender: normalizeText(profile.gender),
    bloodType: normalizeText(profile.bloodType),
    allergies: normalizeText(profile.allergies),
    medications: normalizeText(profile.medications),
    healthNotes: normalizeText(profile.healthNotes || profile.chronicConditions || profile.medicalNotes),
    phone: normalizePhone(profile.phone),
    emergencyContactName: normalizeText(profile.emergencyContactName),
    emergencyContactPhone: normalizePhone(profile.emergencyContactPhone),
    emergencyContactRelation: normalizeText(profile.emergencyContactRelation),
    experienceLevel: normalizeText(profile.experienceLevel),
    city: normalizeText(profile.city),
    contactVerifiedAt: normalizeText(profile.contactVerifiedAt)
  };
}

function hasVerifiedContact(profile = {}) {
  return Boolean(normalizeText(profile.contactVerifiedAt));
}

function hasFilledProfile(profile = {}) {
  return Boolean(
    normalizeText(profile.fullName) ||
    normalizeText(profile.city) ||
    normalizeText(profile.birthDate) ||
    normalizeText(profile.gender) ||
    normalizeText(profile.bloodType) ||
    normalizeText(profile.phone)
  );
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function calculateAge(birthDate) {
  if (!isValidDate(birthDate)) {
    return null;
  }

  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birth.getUTCMonth();
  const dayDelta = now.getUTCDate() - birth.getUTCDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function getRouteDistanceKm(routePlan) {
  const distance = Number(routePlan?.meta?.distance) || 0;
  return distance > 0 ? distance / 1000 : 0;
}

function getTripDays(trip) {
  if (Number.isFinite(Number(trip?.tripCard?.nights))) {
    return Number(trip.tripCard.nights) + 1;
  }

  return 0;
}

function getTripCost(trip) {
  if (Number.isFinite(Number(trip?.finalSummary?.totalCost))) {
    return Number(trip.finalSummary.totalCost);
  }

  const food = Array.isArray(trip?.food)
    ? trip.food.reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
    : 0;
  const expenses = Array.isArray(trip?.expenses)
    ? trip.expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    : 0;

  return food + expenses;
}

function tripHasMember(trip, userId) {
  const normalizedUserId = String(userId || "");
  if (!normalizedUserId) {
    return false;
  }

  if (Array.isArray(trip?.members) && trip.members.some((member) => String(member?.id || "") === normalizedUserId)) {
    return true;
  }

  return Array.isArray(trip?.finalSummary?.members)
    && trip.finalSummary.members.some((member) => String(member?.id || "") === normalizedUserId);
}

function tripHasParticipatingMember(trip, userId) {
  const normalizedUserId = String(userId || "");
  if (!normalizedUserId) {
    return false;
  }

  if (
    Array.isArray(trip?.members) &&
    trip.members.some((member) =>
      String(member?.id || "") === normalizedUserId &&
      String(member?.attendanceStatus || "") === "going"
    )
  ) {
    return true;
  }

  return Array.isArray(trip?.finalSummary?.members)
    && trip.finalSummary.members.some((member) =>
      String(member?.id || "") === normalizedUserId &&
      String(member?.attendanceStatus || "") === "going"
    );
}
function getRouteAscent(routePlan) {
  return Number(routePlan?.meta?.ascentGain) || 0;
}

function getWeatherAlerts(trip) {
  return Array.isArray(trip?.routePlan?.meta?.weatherAlerts)
    ? trip.routePlan.meta.weatherAlerts.map((item) => String(item || "").toLowerCase())
    : [];
}

function hasFreezeRisk(trip) {
  return getWeatherAlerts(trip).some((item) => item.includes("замороз") || item.includes("мороз"));
}

function hasStormRisk(trip) {
  return getWeatherAlerts(trip).some((item) =>
    item.includes("сильний вітер") || item.includes("гроз") || item.includes("дощов") || item.includes("злива")
  );
}

function hasWeatherWarnings(trip) {
  return getWeatherAlerts(trip).length > 0;
}

function hasTrackableRoute(trip) {
  if (!trip?.routePlan) {
    return false;
  }

  if (trip.routePlan.source === "vpohid") {
    return Boolean(
      trip.routePlan.sourceTitle ||
      trip.routePlan.sourceRouteId ||
      trip.routePlan.from ||
      trip.routePlan.to
    );
  }

  if (Array.isArray(trip.routePlan.points) && trip.routePlan.points.length >= 2) {
    return true;
  }

  return Boolean(trip.routePlan.from || trip.routePlan.to || Number(trip.routePlan?.meta?.distance) > 0);
}

function getCompletedTrips(groups, userId) {
  return groups.filter((trip) =>
    hasTrackableRoute(trip) &&
    (trip.status === "completed" || trip.status === "archived") &&
    String(trip.closeReason || "") !== "cancelled" &&
    tripHasParticipatingMember(trip, userId)
  );
}

function getLifetimeStats(groups, userId) {
  const passedTrips = getCompletedTrips(groups, userId);
  const longestDistance = passedTrips.reduce((maxDistance, trip) => Math.max(maxDistance, getRouteDistanceKm(trip.routePlan)), 0);
  const longestOneDayDistance = passedTrips.reduce((maxDistance, trip) => {
    if ((Number(trip?.tripCard?.nights) || 0) > 0) {
      return maxDistance;
    }
    return Math.max(maxDistance, getRouteDistanceKm(trip.routePlan));
  }, 0);

  return {
    hikesCount: passedTrips.length,
    totalKm: passedTrips.reduce((sum, trip) => sum + getRouteDistanceKm(trip.routePlan), 0),
    totalDays: passedTrips.reduce((sum, trip) => sum + getTripDays(trip), 0),
    totalNights: passedTrips.reduce((sum, trip) => sum + (Number(trip?.tripCard?.nights) || 0), 0),
    totalCost: passedTrips.reduce((sum, trip) => sum + getTripCost(trip), 0),
    organizedTrips: passedTrips.filter((trip) => String(trip.ownerId || "") === String(userId || "")).length,
    totalAscent: passedTrips.reduce((sum, trip) => sum + getRouteAscent(trip.routePlan), 0),
    weatherTrips: passedTrips.filter((trip) => hasWeatherWarnings(trip)).length,
    stormTrips: passedTrips.filter((trip) => hasStormRisk(trip)).length,
    freezeTrips: passedTrips.filter((trip) => hasFreezeRisk(trip)).length,
    longestDistance,
    longestOneDayDistance,
    openSkyNights: passedTrips.reduce((sum, trip) => sum + (Number(trip?.tripCard?.nights) || 0), 0),
    foodTrips: passedTrips.filter((trip) => Array.isArray(trip.food) && trip.food.some((item) => String(item.memberId || "") === String(userId || ""))).length,
    sharedGearTrips: passedTrips.filter((trip) =>
      Array.isArray(trip.gear) &&
      trip.gear.some((item) => String(item.memberId || "") === String(userId || "") && (item.scope === "shared" || item.scope === "spare" || item.shareable))
    ).length,
    safetyTrips: passedTrips.filter((trip) =>
      Array.isArray(trip.gear) &&
      trip.gear.some((item) =>
        String(item.memberId || "") === String(userId || "") &&
        (item.categoryKey === "safety" || String(item.name || "").toLowerCase().includes("аптеч"))
      )
    ).length,
    expenseTrips: passedTrips.filter((trip) => Array.isArray(trip.expenses) && trip.expenses.some((item) => String(item.memberId || "") === String(userId || ""))).length
  };
}

function getLifetimeStatsWithoutTrip(groups, userId, tripIdToExclude) {
  const filteredGroups = groups.filter((trip) => trip.id !== tripIdToExclude);
  return getLifetimeStats(filteredGroups, userId);
}

function hasMeaningfulValue(value) {
  return String(value || "").trim().length > 0;
}

function isProfilePrepared(profile, personalGearCount = 0) {
  return Boolean(
    hasMeaningfulValue(profile.fullName) &&
    hasMeaningfulValue(profile.phone) &&
    hasMeaningfulValue(profile.bloodType) &&
    hasMeaningfulValue(profile.emergencyContactName) &&
    hasMeaningfulValue(profile.emergencyContactPhone) &&
    personalGearCount > 0
  );
}

function isRecentIsoDate(value, days) {
  if (!value) {
    return false;
  }
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) {
    return false;
  }
  return Date.now() - parsed <= days * 24 * 60 * 60 * 1000;
}

function getPreparedProfileLevel(user, profile, personalGearCount = 0) {
  const hasBasicProfile = Boolean(
    hasMeaningfulValue(profile.fullName) &&
    hasMeaningfulValue(profile.phone) &&
    hasMeaningfulValue(profile.city)
  );
  const hasEnoughGear = personalGearCount >= 5;
  const hasMedicalCore = Boolean(
    hasMeaningfulValue(profile.bloodType) &&
    hasMeaningfulValue(profile.emergencyContactName) &&
    hasMeaningfulValue(profile.emergencyContactPhone) &&
    (
      hasMeaningfulValue(profile.allergies) ||
      hasMeaningfulValue(profile.medications) ||
      hasMeaningfulValue(profile.healthNotes)
    )
  );
  const hasRecentProfileRefresh = isRecentIsoDate(user?.profileUpdatedAt, 183);
  const isFullyEquipped = Boolean(
    hasBasicProfile &&
    hasEnoughGear &&
    hasMedicalCore &&
    hasRecentProfileRefresh &&
    hasMeaningfulValue(profile.birthDate) &&
    hasMeaningfulValue(profile.gender) &&
    hasMeaningfulValue(profile.experienceLevel)
  );

  if (isFullyEquipped) {
    return 5;
  }
  if (hasRecentProfileRefresh && hasMedicalCore && hasEnoughGear && hasBasicProfile) {
    return 4;
  }
  if (hasMedicalCore && hasEnoughGear && hasBasicProfile) {
    return 3;
  }
  if (hasEnoughGear && hasBasicProfile) {
    return 2;
  }
  if (hasBasicProfile) {
    return 1;
  }
  return 0;
}

function hasAward(user, key) {
  return (Array.isArray(user?.awards) ? user.awards : []).some((award) => award && award.key === key);
}

function pushAward(user, award) {
  if (hasAward(user, award.key)) {
    return false;
  }

  user.awards.push(award);
  return true;
}

function getAwardMilestoneThreshold(user, seriesKey, milestones = []) {
  const awardedIndexes = (Array.isArray(user?.awards) ? user.awards : [])
    .filter((award) => award && typeof award === "object")
    .filter((award) => String(award.key || "").startsWith(`${seriesKey}_`))
    .map((award) => milestones.findIndex((item) => item.tier === award.tier))
    .filter((index) => index >= 0);

  if (!awardedIndexes.length) {
    return 0;
  }

  const maxIndex = Math.max(...awardedIndexes);
  return milestones[maxIndex]?.threshold || 0;
}

function isVisibleAward(award) {
  const key = String(award?.key || "");
  const title = String(award?.title || "");

  if (key.startsWith("trip_participant_")) {
    return false;
  }

  if (title === "Підготовлений учасник") {
    return false;
  }

  return true;
}

function getVisibleAwardsList(user) {
  return (Array.isArray(user?.awards) ? user.awards : [])
    .filter((award) => award && typeof award === "object")
    .filter(isVisibleAward)
    .sort((left, right) => String(right?.earnedAt || "").localeCompare(String(left?.earnedAt || "")));
}

function sumAwardXp(user) {
  return (Array.isArray(user?.awards) ? user.awards : []).reduce((sum, award) => {
    if (!award || typeof award !== "object") {
      return sum;
    }
    if (award?.tier && XP_TIER_BONUSES[award.tier]) {
      return sum + XP_TIER_BONUSES[award.tier];
    }
    if (award?.key && XP_COMBO_BONUSES[award.key]) {
      return sum + XP_COMBO_BONUSES[award.key];
    }
    return sum;
  }, 0);
}

function calculateTripXp(trip, memberId) {
  const distanceKm = getRouteDistanceKm(trip?.routePlan);
  const ascentGain = getRouteAscent(trip?.routePlan);
  const nights = Number(trip?.tripCard?.nights) || 0;
  const normalizedMemberId = String(memberId || "");
  const member = Array.isArray(trip?.members)
    ? trip.members.find((item) => String(item?.id || "") === normalizedMemberId)
    : null;
  const isNavigator = String(trip?.ownerId || "") === normalizedMemberId || Boolean(member?.canManage);
  const foodContributions = Array.isArray(trip?.food)
    ? trip.food.filter((item) => String(item.memberId || "") === normalizedMemberId).length
    : 0;
  const sharedGearContributions = Array.isArray(trip?.gear)
    ? trip.gear.filter((item) => String(item.memberId || "") === normalizedMemberId && (item.scope === "shared" || item.scope === "spare" || item.shareable)).length
    : 0;
  const safetyGearContributions = Array.isArray(trip?.gear)
    ? trip.gear.filter((item) =>
      String(item.memberId || "") === normalizedMemberId &&
      (item.categoryKey === "safety" || String(item.name || "").toLowerCase().includes("аптеч"))
    ).length
    : 0;
  const expensesContributions = Array.isArray(trip?.expenses)
    ? trip.expenses.filter((item) => String(item.memberId || "") === normalizedMemberId).length
    : 0;

  const components = [
    { key: "base", label: "Завершений похід", xp: 100 },
    { key: "distance", label: "Дистанція", xp: Math.floor(distanceKm * 5) },
    { key: "ascent", label: "Набір висоти", xp: Math.floor(ascentGain / 100) },
    { key: "nights", label: "Ночівлі", xp: nights * 30 },
    { key: "weather", label: "Погодні попередження", xp: hasWeatherWarnings(trip) ? 20 : 0 },
    { key: "storm", label: "Штормовий ризик", xp: hasStormRisk(trip) ? 20 : 0 },
    { key: "freeze", label: "Мороз / заморозок", xp: hasFreezeRisk(trip) ? 20 : 0 },
    { key: "navigator", label: "Навігатор / організатор", xp: isNavigator ? 40 : 0 },
    { key: "chef", label: "Шеф кухні", xp: foodContributions > 0 ? 25 : 0 },
    { key: "survival", label: "Майстер виживання", xp: sharedGearContributions > 0 ? 25 : 0 },
    { key: "rescuer", label: "Рятівник", xp: safetyGearContributions > 0 ? 30 : 0 },
    { key: "responsible", label: "Відповідальний за витрати", xp: expensesContributions > 0 ? 20 : 0 }
  ];

  return {
    totalXp: components.reduce((sum, item) => sum + item.xp, 0),
    components: components.filter((item) => item.xp > 0)
  };
}

function buildXpSummary(stats, user, tripXp = 0, newAwards = []) {
  const currentAwardXp = sumAwardXp(user);
  const previousAwardXp = newAwards.reduce((sum, award) => {
    if (award?.tier && XP_TIER_BONUSES[award.tier]) {
      return sum + XP_TIER_BONUSES[award.tier];
    }
    if (award?.key && XP_COMBO_BONUSES[award.key]) {
      return sum + XP_COMBO_BONUSES[award.key];
    }
    return sum;
  }, 0);
  const totalXp = Math.max(0, Math.round(
    stats.hikesCount * 100 +
    Math.floor(stats.totalKm * 5) +
    Math.floor(stats.totalAscent / 100) +
    stats.totalNights * 30 +
    stats.weatherTrips * 20 +
    stats.stormTrips * 20 +
    stats.freezeTrips * 20 +
    stats.organizedTrips * 40 +
    stats.foodTrips * 25 +
    stats.sharedGearTrips * 25 +
    stats.safetyTrips * 30 +
    stats.expenseTrips * 20 +
    currentAwardXp
  ));
  const previousTotalXp = Math.max(0, totalXp - tripXp - previousAwardXp);
  const currentLevel = getXpLevel(totalXp);
  const previousLevel = getXpLevel(previousTotalXp);

  return {
    totalXp,
    gainedXp: tripXp + previousAwardXp,
    level: currentLevel.level,
    previousLevel: previousLevel.level,
    progress: getXpProgress(totalXp),
    previousProgress: getXpProgress(previousTotalXp),
    awardBonusXp: previousAwardXp
  };
}

export class UserService {
  constructor(store) {
    this.store = store;
  }

  ensureUserRecord({ userId, userName = "" }) {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, userId, userName);
    this.store.write(data);
    return user;
  }

  addPersonalGear({ userId, userName, gear }) {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, userId, userName);

    user.personalGear.push(enrichGearItem({
      id: crypto.randomUUID(),
      name: canonicalizeGearName(gear.name),
      quantity: gear.quantity,
      attributes: gear.attributes || {},
      note: gear.note || "",
      details: gear.details || "",
      season: gear.season || "",
      weightGrams: Number(gear.weightGrams) || 0
    }));

    this.store.write(data);
    return user.personalGear;
  }

  updatePersonalGear({ userId, userName, gearId, patch = {} }) {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, userId, userName);
    const item = user.personalGear.find((gear) => gear.id === gearId);

    if (!item) {
      throw new Error("Personal gear not found");
    }

    item.name = canonicalizeGearName(patch.name ?? item.name);
    item.quantity = Number(patch.quantity ?? item.quantity) || item.quantity;
    if (patch.attributes && typeof patch.attributes === "object") {
      item.attributes = { ...patch.attributes };
    }
    item.note = normalizeText(patch.note ?? item.note);
    item.details = normalizeText(patch.details ?? item.details);
    item.season = normalizeText(patch.season ?? item.season);
    item.weightGrams = Number(patch.weightGrams ?? item.weightGrams) || 0;
    Object.assign(item, enrichGearItem({
      ...item,
      attributes: item.attributes || {}
    }));

    this.store.write(data);
    return item;
  }

  deletePersonalGear({ userId, userName, gearId }) {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, userId, userName);
    const index = user.personalGear.findIndex((gear) => gear.id === gearId);

    if (index < 0) {
      throw new Error("Personal gear not found");
    }

    const [removed] = user.personalGear.splice(index, 1);
    this.store.write(data);
    return removed;
  }

  getPersonalGear(userId, userName = "") {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, userId, userName);
    this.store.write(data);
    return user.personalGear.map((item) => enrichGearItem(item));
  }

  getProfile(userId, userName = "") {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, userId, userName);
    this.store.write(data);

    return {
      id: user.id,
      name: user.name || userName || "",
      profile: buildProfileSnapshot(user, userName),
      personalGear: user.personalGear,
      awards: [...user.awards]
        .filter((award) => award && typeof award === "object")
        .sort((left, right) => String(right?.earnedAt || "").localeCompare(String(left?.earnedAt || "")))
    };
  }

  updateProfile({ userId, userName = "", patch = {} }) {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, userId, userName);
    const nextProfile = {
      ...user.profile
    };

    for (const [key, value] of Object.entries(patch || {})) {
      nextProfile[key] = key === "phone" ? normalizePhone(value) : normalizeText(value);
    }

    if (Object.prototype.hasOwnProperty.call(patch || {}, "phone")) {
      const previousPhone = normalizePhone(user.profile.phone);
      const nextPhone = normalizePhone(nextProfile.phone);
      if (previousPhone !== nextPhone) {
        nextProfile.contactVerifiedAt = "";
      }
    }

    user.profile = nextProfile;
    user.profileUpdatedAt = new Date().toISOString();
    if (normalizeText(nextProfile.fullName)) {
      user.name = normalizeText(nextProfile.fullName);
    } else if (userName) {
      user.name = userName;
    }

    this.store.write(data);
    return this.getProfile(userId, userName);
  }

  confirmOwnContact({ userId, userName = "", phone = "" }) {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, userId, userName);
    const normalizedPhone = normalizePhone(phone);

    user.profile = {
      ...user.profile,
      phone: normalizedPhone,
      contactVerifiedAt: normalizedPhone ? new Date().toISOString() : ""
    };
    user.profileUpdatedAt = new Date().toISOString();

    this.store.write(data);
    return this.getProfile(userId, userName);
  }

  getAuthorizationState(userId, userName = "") {
    const profileData = this.getProfile(userId, userName);
    const profile = profileData.profile || {};
    const contactVerified = hasVerifiedContact(profile);
    const missing = contactVerified ? [] : ["підтвердження номера телефону"];

    return {
      isAuthorized: contactVerified,
      missing,
      contactVerified,
      profile
    };
  }

  getDisplayName(userId, fallbackName = "") {
    const profile = this.getProfile(userId, fallbackName);
    return normalizeText(profile.profile.fullName || profile.name || fallbackName || "Учасник");
  }

  getTripMemberView(member, viewerCanManage = false) {
    const profile = this.getProfile(member.id, member.name);
    const fullName = profile.profile.fullName || profile.name || member.name || "Учасник";
    const phone = formatPhoneForDisplay(profile.profile.phone) || "не вказано";

    if (!viewerCanManage) {
      return {
        title: `${fullName} — ${phone}`,
        details: []
      };
    }

    const details = [
      profile.profile.birthDate ? `• Дата народження: ${profile.profile.birthDate}` : null,
      Number.isFinite(profile.profile.age) ? `• Вік: ${profile.profile.age}` : null,
      profile.profile.gender ? `• Стать: ${profile.profile.gender}` : null,
      profile.profile.bloodType ? `• Група крові: ${profile.profile.bloodType}` : null,
      profile.profile.allergies ? `• Алергії: ${profile.profile.allergies}` : null,
      profile.profile.medications ? `• Ліки: ${profile.profile.medications}` : null,
      profile.profile.healthNotes ? `• Важливо для походу: ${profile.profile.healthNotes}` : null,
      `• Телефон: ${phone}`,
      profile.profile.emergencyContactName
        ? `• Екстрений контакт: ${profile.profile.emergencyContactName}${profile.profile.emergencyContactRelation ? ` (${profile.profile.emergencyContactRelation})` : ""}`
        : null,
      profile.profile.emergencyContactPhone ? `• Телефон контакту: ${formatPhoneForDisplay(profile.profile.emergencyContactPhone) || profile.profile.emergencyContactPhone}` : null,
    ].filter(Boolean);

    return {
      title: `${fullName} — ${phone}`,
      details
    };
  }

  getDashboard(userId, userName = "") {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, userId, userName);
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const visibleAwards = getVisibleAwardsList(user);
    const relatedTrips = groups.filter((trip) => tripHasMember(trip, userId));
    const stats = getLifetimeStats(groups, userId);

    return {
      fullName: user.profile.fullName || user.name || userName || "Мандрівник",
      hikesCount: stats.hikesCount,
      totalKm: stats.totalKm,
      totalAscent: stats.totalAscent,
      totalDays: stats.totalDays,
      totalNights: stats.totalNights,
      totalCost: stats.totalCost,
      activeTrips: relatedTrips.filter((trip) => trip.status === "active").length,
      archivedTrips: relatedTrips.filter((trip) => trip.status === "archived").length,
      personalGearCount: user.personalGear.length,
      organizedTrips: stats.organizedTrips,
      awardsCount: visibleAwards.length,
      latestAwards: visibleAwards.slice(0, 5),
      currentTitle: getCurrentTitle(stats),
      xp: buildXpSummary(stats, user)
    };
  }

  getXpProfile(userId, userName = "") {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, userId, userName);
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const stats = getLifetimeStats(groups, userId);
    const xp = buildXpSummary(stats, user);

    this.store.write(data);

    return {
      fullName: user.profile.fullName || user.name || userName || "Мандрівник",
      title: getCurrentTitle(stats),
      xp,
      stats,
      history: [...user.xpHistory]
        .filter((item) => item && typeof item === "object")
        .sort((left, right) => String(right?.earnedAt || "").localeCompare(String(left?.earnedAt || "")))
        .slice(0, 10)
    };
  }

  getAwards(userId, userName = "") {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, userId, userName);
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const stats = getLifetimeStats(groups, userId);

    this.store.write(data);

    return {
      fullName: user.profile.fullName || user.name || userName || "Мандрівник",
      title: getCurrentTitle(stats),
      awards: getVisibleAwardsList(user),
      history: [...user.xpHistory]
        .filter((item) => item && typeof item === "object")
        .sort((left, right) => String(right?.earnedAt || "").localeCompare(String(left?.earnedAt || "")))
        .slice(0, 10),
      stats,
      xp: buildXpSummary(stats, user)
    };
  }

  getBotUsageReport() {
    const data = withUsers(this.store.read());
    const users = Array.isArray(data.users) ? data.users : [];
    const groups = Array.isArray(data.groups) ? data.groups : [];

    const tripSummary = groups.reduce((summary, trip) => {
      if (trip?.status === "active") {
        summary.active += 1;
      } else if (trip?.status === "completed") {
        summary.completed += 1;
      } else if (trip?.status === "archived") {
        summary.archived += 1;
      }

      if (String(trip?.closeReason || "") === "cancelled") {
        summary.cancelled += 1;
      }

      return summary;
    }, {
      active: 0,
      completed: 0,
      archived: 0,
      cancelled: 0
    });

    const entries = users.map((user) => {
      const profile = buildProfileSnapshot(user, user?.name || "");
      const relatedTrips = groups.filter((trip) => tripHasMember(trip, user.id));
      const participatingTrips = groups.filter((trip) => tripHasParticipatingMember(trip, user.id));
      const activeTrips = relatedTrips.filter((trip) => trip.status === "active").length;
      const completedTrips = relatedTrips.filter((trip) => trip.status === "completed").length;
      const archivedTrips = relatedTrips.filter((trip) => trip.status === "archived").length;
      const organizedTrips = groups.filter((trip) => String(trip?.ownerId || "") === String(user.id || "")).length;
      const awards = getVisibleAwardsList(user);
      const verified = hasVerifiedContact(profile);
      const profileFilled = hasFilledProfile(profile);
      const lastActivityAt = normalizeText(
        user.profileUpdatedAt ||
        profile.contactVerifiedAt ||
        awards[0]?.earnedAt ||
        user?.xpHistory?.[0]?.earnedAt
      );

      return {
        id: String(user.id || ""),
        fullName: profile.fullName || user.name || "Користувач",
        verified,
        profileFilled,
        phone: profile.phone,
        city: profile.city,
        activeTrips,
        completedTrips,
        archivedTrips,
        tripsCount: relatedTrips.length,
        participatingTripsCount: participatingTrips.length,
        organizedTrips,
        personalGearCount: Array.isArray(user.personalGear) ? user.personalGear.length : 0,
        awardsCount: awards.length,
        xpHistoryCount: Array.isArray(user.xpHistory) ? user.xpHistory.length : 0,
        lastActivityAt
      };
    }).sort((left, right) => {
      const scoreLeft = (left.activeTrips * 1000) + (left.completedTrips * 100) + (left.awardsCount * 10) + (left.verified ? 1 : 0);
      const scoreRight = (right.activeTrips * 1000) + (right.completedTrips * 100) + (right.awardsCount * 10) + (right.verified ? 1 : 0);
      if (scoreLeft !== scoreRight) {
        return scoreRight - scoreLeft;
      }

      return String(right.lastActivityAt || "").localeCompare(String(left.lastActivityAt || ""));
    });

    return {
      usersTotal: users.length,
      verifiedUsers: entries.filter((item) => item.verified).length,
      profileFilledUsers: entries.filter((item) => item.profileFilled).length,
      usersWithTrips: entries.filter((item) => item.tripsCount > 0).length,
      usersWithActiveTrips: entries.filter((item) => item.activeTrips > 0).length,
      usersWithAwards: entries.filter((item) => item.awardsCount > 0).length,
      usersWithGear: entries.filter((item) => item.personalGearCount > 0).length,
      tripSummary,
      entries
    };
  }

  grantTripAwards({ trip, memberId, userName = "" }) {
    const data = withUsers(this.store.read());
    const user = ensureUser(data.users, memberId, userName);
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const stats = getLifetimeStats(groups, memberId);
    const previousStats = getLifetimeStatsWithoutTrip(groups, memberId, trip.id);
    const member = Array.isArray(trip.members)
      ? trip.members.find((item) => String(item?.id || "") === String(memberId || ""))
      : null;
    if (!member || String(member.attendanceStatus || "") !== "going") {
      this.store.write(data);
      return {
        fullName: user.profile.fullName || user.name || userName || "Мандрівник",
        newAwards: [],
        allAwards: getVisibleAwardsList(user),
        stats,
        currentTitle: getCurrentTitle(stats),
        xp: buildXpSummary(stats, user, 0, []),
        latestAwards: getVisibleAwardsList(user).slice(0, 5),
        formattedNewAwards: []
      };
    }
    const profile = buildProfileSnapshot(user, userName);
    const personalGearCount = user.personalGear.length;
    const preparedLevel = getPreparedProfileLevel(user, profile, personalGearCount);

    const tripXpBase = calculateTripXp(trip, memberId);
    const newAwards = [];
    const earnedAt = new Date().toISOString();
    const tripId = trip.id;

    if (!hasTrackableRoute(trip)) {
      this.store.write(data);
      return {
        fullName: user.profile.fullName || user.name || userName || "Мандрівник",
        newAwards: [],
        allAwards: getVisibleAwardsList(user),
        stats,
        currentTitle: getCurrentTitle(stats),
        xp: buildXpSummary(stats, user, 0, []),
        latestAwards: getVisibleAwardsList(user).slice(0, 5),
        formattedNewAwards: []
      };
    }

    const tryAward = (key, icon, title, description, extra = {}) => {
      const created = pushAward(user, {
        key,
        icon,
        title,
        description,
        earnedAt,
        tripId,
        ...extra
      });

      if (created) {
        newAwards.push({
          key,
          icon,
          title,
          description,
          earnedAt,
          tripId,
          ...extra
        });
      }
    };

    BADGE_SERIES.forEach((series) => {
      const value =
        series.key === "hikes" ? stats.hikesCount
          : series.key === "distance" ? stats.totalKm
            : series.key === "nights" ? stats.totalNights
              : series.key === "ascent" ? stats.totalAscent
                : series.key === "weatheredTrips" ? stats.weatherTrips
                  : series.key === "stormTrips" ? stats.stormTrips
                    : series.key === "freezeTrips" ? stats.freezeTrips
                      : series.key === "longestDistance" ? stats.longestDistance
                        : series.key === "longestOneDayDistance" ? stats.longestOneDayDistance
                          : series.key === "openSkyNights" ? stats.openSkyNights
                            : series.key === "organizer" ? stats.organizedTrips
                              : series.key === "preparedLevel" ? preparedLevel
                                : series.key === "foodTrips" ? stats.foodTrips
                                  : series.key === "sharedGearTrips" ? stats.sharedGearTrips
                                    : series.key === "safetyTrips" ? stats.safetyTrips
                                      : series.key === "expenseTrips" ? stats.expenseTrips
                                        : 0;
      const previousValue =
        series.key === "hikes" ? previousStats.hikesCount
          : series.key === "distance" ? previousStats.totalKm
            : series.key === "nights" ? previousStats.totalNights
              : series.key === "ascent" ? previousStats.totalAscent
                : series.key === "weatheredTrips" ? previousStats.weatherTrips
                  : series.key === "stormTrips" ? previousStats.stormTrips
                    : series.key === "freezeTrips" ? previousStats.freezeTrips
                      : series.key === "longestDistance" ? previousStats.longestDistance
                        : series.key === "longestOneDayDistance" ? previousStats.longestOneDayDistance
                          : series.key === "openSkyNights" ? previousStats.openSkyNights
                            : series.key === "organizer" ? previousStats.organizedTrips
                              : series.key === "preparedLevel"
                                ? getAwardMilestoneThreshold(user, series.key, series.milestones)
                                : series.key === "foodTrips" ? previousStats.foodTrips
                                  : series.key === "sharedGearTrips" ? previousStats.sharedGearTrips
                                    : series.key === "safetyTrips" ? previousStats.safetyTrips
                                      : series.key === "expenseTrips" ? previousStats.expenseTrips
                                        : 0;

      let reachedIndex = -1;
      series.milestones.forEach((milestone, index) => {
        if (previousValue < milestone.threshold && value >= milestone.threshold) {
          reachedIndex = index;
        }
      });

      if (reachedIndex >= 0) {
        const milestone = series.milestones[reachedIndex];
        const tierMeta = getTierMeta(milestone.tier);
        tryAward(
          `${series.key}_${milestone.tier}`,
          series.icon,
          `${series.title} — ${tierMeta.label}`,
          milestone.description,
          { tier: milestone.tier }
        );
      }
    });

    tryAward(
      `trip_participant_${tripId}`,
      ONE_TIME_AWARDS.trip_participant.icon,
      ONE_TIME_AWARDS.trip_participant.title,
      ONE_TIME_AWARDS.trip_participant.description
    );

    if (previousStats.hikesCount < 1 && stats.hikesCount >= 1) {
      tryAward("first_hike", ONE_TIME_AWARDS.first_hike.icon, ONE_TIME_AWARDS.first_hike.title, ONE_TIME_AWARDS.first_hike.description);
    }
    if (previousStats.hikesCount < 3 && stats.hikesCount >= 3) {
      tryAward("explorer", ONE_TIME_AWARDS.explorer.icon, ONE_TIME_AWARDS.explorer.title, ONE_TIME_AWARDS.explorer.description);
    }
    const hadRealTouristCombo = previousStats.hikesCount >= 5 && previousStats.totalKm >= 50 && previousStats.totalNights >= 5;
    const hasRealTouristCombo = stats.hikesCount >= 5 && stats.totalKm >= 50 && stats.totalNights >= 5;
    if (!hadRealTouristCombo && hasRealTouristCombo) {
      tryAward("real_tourist", ONE_TIME_AWARDS.real_tourist.icon, ONE_TIME_AWARDS.real_tourist.title, ONE_TIME_AWARDS.real_tourist.description);
    }
    const hadNatureCombo = previousStats.hikesCount >= 15 && previousStats.totalNights >= 20;
    const hasNatureCombo = stats.hikesCount >= 15 && stats.totalNights >= 20;
    if (!hadNatureCombo && hasNatureCombo) {
      tryAward("lives_by_nature", ONE_TIME_AWARDS.lives_by_nature.icon, ONE_TIME_AWARDS.lives_by_nature.title, ONE_TIME_AWARDS.lives_by_nature.description);
    }
    const hadPreviousSupportRole = previousStats.foodTrips > 0 || previousStats.sharedGearTrips > 0 || previousStats.safetyTrips > 0 || previousStats.expenseTrips > 0;
    const hasCurrentSupportRole = stats.foodTrips > 0 || stats.sharedGearTrips > 0 || stats.safetyTrips > 0 || stats.expenseTrips > 0;
    const hadFullCycle = previousStats.hikesCount >= 1 && previousStats.organizedTrips >= 1 && hadPreviousSupportRole;
    const hasFullCycle = stats.hikesCount >= 1 && stats.organizedTrips >= 1 && hasCurrentSupportRole;
    if (!hadFullCycle && hasFullCycle) {
      tryAward("full_cycle", ONE_TIME_AWARDS.full_cycle.icon, ONE_TIME_AWARDS.full_cycle.title, ONE_TIME_AWARDS.full_cycle.description);
    }

    const xp = buildXpSummary(stats, user, tripXpBase.totalXp, newAwards);
    user.xpHistory = (Array.isArray(user.xpHistory) ? user.xpHistory : [])
      .filter((item) => item.tripId !== tripId);

    if (xp.gainedXp > 0) {
      user.xpHistory.unshift({
        tripId,
        tripName: trip.name || "Похід",
        routeName: trip.finalSummary?.routeName || trip.routePlan?.sourceTitle || [trip.routePlan?.from, trip.routePlan?.to].filter(Boolean).join(" -> ") || "маршрут не задано",
        earnedAt,
        gainedXp: xp.gainedXp,
        baseXp: tripXpBase.totalXp,
        awardBonusXp: xp.awardBonusXp,
        levelBefore: xp.previousLevel,
        levelAfter: xp.level,
        totalXpAfter: xp.totalXp,
        components: tripXpBase.components
      });
    }

    const visibleNewAwards = newAwards.filter(isVisibleAward);

    this.store.write(data);

    return {
      fullName: user.profile.fullName || user.name || userName || "Мандрівник",
      newAwards: visibleNewAwards,
      allAwards: getVisibleAwardsList(user),
      stats,
      currentTitle: getCurrentTitle(stats),
      xp,
      tripXp: {
        baseXp: tripXpBase.totalXp,
        components: tripXpBase.components
      },
      latestAwards: getVisibleAwardsList(user).slice(0, 5),
      formattedNewAwards: visibleNewAwards.map((award) => formatAwardName(award))
    };
  }
}

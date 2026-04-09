import crypto from "node:crypto";
import { canonicalizeGearName, categorizeGearName, enrichGearItem, resolveGearProfile, resolveGearSynonymGroup } from "../data/gearCatalog.js";
import { canonicalizeFoodName, categorizeFoodName } from "../data/foodCatalog.js";
import { canonicalizeExpenseTitle, categorizeExpenseTitle } from "../data/expenseCatalog.js";

function createInviteCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function normalizeGearLoan(loan = {}) {
  return {
    id: loan.id || crypto.randomUUID(),
    needId: loan.needId || "",
    borrowerMemberId: loan.borrowerMemberId || "",
    borrowerMemberName: loan.borrowerMemberName || "",
    quantity: Math.max(1, Number(loan.quantity) || 1),
    createdAt: loan.createdAt || new Date().toISOString(),
    returnRequestStatus: loan.returnRequestStatus === "pending" ? "pending" : "",
    returnRequestedAt: loan.returnRequestedAt || null
  };
}

const TRIP_PHOTO_MOMENT_RULES = [
  {
    key: "start",
    label: "Старт і дорога",
    keywords: ["старт", "виїзд", "збір", "вокзал", "дорога", "електричка", "поїзд", "автобус"]
  },
  {
    key: "camp",
    label: "Табір і ночівля",
    keywords: ["табір", "намет", "нічліг", "ночівл", "вечір", "ранок", "вогонь", "вогнище", "казанок"]
  },
  {
    key: "summit",
    label: "Вершини і краєвиди",
    keywords: ["вершин", "пік", "гора", "хребет", "полонин", "панорама", "краєвид", "вид"]
  },
  {
    key: "finish",
    label: "Фініш і повернення",
    keywords: ["фініш", "повернен", "додому", "завершення", "назад", "кінець"]
  }
];

function normalizeTripPhotoCaption(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function detectTripPhotoMoment(caption = "") {
  const haystack = normalizeTripPhotoCaption(caption).toLowerCase();
  if (!haystack) {
    return {
      key: "route",
      label: "Маршрут і команда"
    };
  }

  for (const rule of TRIP_PHOTO_MOMENT_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return {
        key: rule.key,
        label: rule.label
      };
    }
  }

  return {
    key: "route",
    label: "Маршрут і команда"
  };
}

function normalizeTripPhotoEntry(entry = {}) {
  const moment = detectTripPhotoMoment(entry.caption || entry.momentLabel || "");

  return {
    id: entry.id || crypto.randomUUID(),
    authorMemberId: entry.authorMemberId || "",
    authorMemberName: entry.authorMemberName || "",
    fileId: entry.fileId || "",
    caption: normalizeTripPhotoCaption(entry.caption),
    momentKey: entry.momentKey || moment.key,
    momentLabel: entry.momentLabel || moment.label,
    createdAt: entry.createdAt || new Date().toISOString()
  };
}

function enrichTripGearItem(item = {}) {
  const enriched = enrichGearItem(item);
  const loans = Array.isArray(enriched.loans)
    ? enriched.loans.map((loan) => normalizeGearLoan(loan)).filter((loan) => loan.quantity > 0)
    : [];
  const quantity = Math.max(0, Number(enriched.quantity) || 0);
  const inUseQuantity = loans.reduce((sum, loan) => sum + (Number(loan.quantity) || 0), 0);
  const availableQuantity = Math.max(0, quantity - inUseQuantity);

  return {
    ...enriched,
    loans,
    inUseQuantity,
    availableQuantity
  };
}

function isActiveGearNeedStatus(status = "") {
  return status === "open" || status === "matched";
}

function normalizeGearNeed(need = {}) {
  const status = ["matched", "fulfilled", "cancelled"].includes(need.status) ? need.status : "open";
  return {
    id: need.id || crypto.randomUUID(),
    memberId: need.memberId || "",
    memberName: need.memberName || "",
    name: canonicalizeGearName(need.name || ""),
    quantity: Number(need.quantity) || 1,
    note: need.note || "",
    status,
    createdAt: need.createdAt || new Date().toISOString(),
    updatedAt: need.updatedAt || need.createdAt || new Date().toISOString(),
    matchedByMemberId: need.matchedByMemberId || "",
    matchedByMemberName: need.matchedByMemberName || "",
    matchedGearId: need.matchedGearId || "",
    matchedGearName: need.matchedGearName || "",
    matchedAt: need.matchedAt || null,
    loanRequestStatus: ["pending", "approved"].includes(need.loanRequestStatus) ? need.loanRequestStatus : "",
    loanRequestedAt: need.loanRequestedAt || null,
    loanApprovedAt: need.loanApprovedAt || null,
    fulfilledAt: need.fulfilledAt || null,
    cancelledAt: need.cancelledAt || null
  };
}

function normalizeGearSearchValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

function extractSearchTokens(value = "") {
  return normalizeGearSearchValue(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

function buildGearIdentity(name = "") {
  const canonicalName = canonicalizeGearName(name);
  const category = categorizeGearName(canonicalName);
  const profile = resolveGearProfile(canonicalName);
  return {
    normalized: normalizeGearSearchValue(canonicalName),
    canonicalName,
    categoryKey: category.key,
    profileKey: profile.key,
    synonymGroup: resolveGearSynonymGroup(canonicalName),
    tokens: extractSearchTokens(canonicalName)
  };
}

function gearNamesMatch(left = "", right = "") {
  const leftIdentity = buildGearIdentity(left);
  const rightIdentity = buildGearIdentity(right);
  const leftValue = leftIdentity.normalized;
  const rightValue = rightIdentity.normalized;

  if (!leftValue || !rightValue) {
    return false;
  }

  if (leftValue === rightValue) {
    return true;
  }

  if (
    leftIdentity.synonymGroup &&
    rightIdentity.synonymGroup &&
    leftIdentity.synonymGroup === rightIdentity.synonymGroup
  ) {
    return true;
  }

  const sharedTokens = leftIdentity.tokens.filter((item) => rightIdentity.tokens.includes(item));

  if (
    leftIdentity.profileKey !== "generic" &&
    rightIdentity.profileKey !== "generic" &&
    leftIdentity.profileKey === rightIdentity.profileKey &&
    (sharedTokens.length > 0 || leftIdentity.tokens.length === 0 || rightIdentity.tokens.length === 0)
  ) {
    return true;
  }

  if (
    leftIdentity.categoryKey !== "other" &&
    leftIdentity.categoryKey === rightIdentity.categoryKey
  ) {
    if (sharedTokens.length > 0) {
      return true;
    }
  }

  if (sharedTokens.length > 0) {
    const oneSideIsSingleToken = leftIdentity.tokens.length === 1 || rightIdentity.tokens.length === 1;
    if (oneSideIsSingleToken) {
      return true;
    }
  }

  return false;
}

function parseNumericHints(value = "") {
  const numbers = String(value || "").match(/\d+/g) || [];
  return numbers.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
}

function calculateReadiness(group) {
  const sharedGear = group.gear.filter((item) => item.scope === "shared");
  const personalGear = group.gear.filter((item) => item.scope === "personal");
  const spareGear = group.gear.filter((item) => item.scope === "spare" || item.shareable);
  const hasAnyGear = sharedGear.length > 0 || personalGear.length > 0 || spareGear.length > 0;
  const activeNeeds = group.gearNeeds.filter((item) => isActiveGearNeedStatus(item.status));

  if (activeNeeds.length === 0) {
    return "готово";
  }

  return hasAnyGear ? "частково готово" : "збираємо";
}

function buildFinalSummary(group) {
  const expensesTotal = group.expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const foodTotal = group.food.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
  const totalGear = group.gear.length;
  const activeNeeds = group.gearNeeds.filter((item) => isActiveGearNeedStatus(item.status));
  const routePoints = Array.isArray(group.routePlan?.points) ? group.routePlan.points.filter(Boolean) : [];
  const routeName = group.routePlan?.source === "vpohid" && group.routePlan?.sourceTitle
    ? group.routePlan.sourceTitle
    : routePoints.length
      ? routePoints.join(" -> ")
      : [group.routePlan?.from, group.routePlan?.to].filter(Boolean).join(" -> ");

  return {
    members: group.members.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      canManage: member.canManage,
      attendanceStatus: member.attendanceStatus || ""
    })),
    routeName: routeName || "маршрут не задано",
    gearReadinessStatus: group.tripCard?.gearReadinessStatus || calculateReadiness(group),
    gearCount: totalGear,
    gearNeedsCount: activeNeeds.length,
    foodCount: group.food.length,
    foodTotal,
    photoCount: Array.isArray(group.tripPhotos) ? group.tripPhotos.length : 0,
    expensesCount: group.expenses.length,
    expensesTotal,
    totalCost: foodTotal + expensesTotal
  };
}

function groupHasMember(group, memberId) {
  const normalizedMemberId = String(memberId || "");
  if (!normalizedMemberId) {
    return false;
  }

  if (Array.isArray(group?.members) && group.members.some((member) => String(member?.id || "") === normalizedMemberId)) {
    return true;
  }

  return Array.isArray(group?.finalSummary?.members)
    && group.finalSummary.members.some((member) => String(member?.id || "") === normalizedMemberId);
}

function groupHasParticipatingMember(group, memberId) {
  const normalizedMemberId = String(memberId || "");
  if (!normalizedMemberId) {
    return false;
  }

  if (
    Array.isArray(group?.members) &&
    group.members.some((member) =>
      String(member?.id || "") === normalizedMemberId &&
      isMemberIncludedInCalculations(member)
    )
  ) {
    return true;
  }

  return Array.isArray(group?.finalSummary?.members)
    && group.finalSummary.members.some((member) =>
      String(member?.id || "") === normalizedMemberId &&
      isMemberIncludedInCalculations(member)
    );
}

function isMemberIncludedInCalculations(member) {
  return String(member?.attendanceStatus || "") !== "not_going";
}

function getMembersIncludedInCalculations(members = []) {
  return (Array.isArray(members) ? members : []).filter(isMemberIncludedInCalculations);
}

function createEmptyGroupFields(group) {
  return {
    ...group,
    ownerId: group.ownerId || group.members?.[0]?.id || null,
    gear: Array.isArray(group.gear) ? group.gear.map((item) => enrichTripGearItem(item)) : [],
    gearNeeds: Array.isArray(group.gearNeeds) ? group.gearNeeds.map((item) => normalizeGearNeed(item)) : [],
    food: Array.isArray(group.food) ? group.food : [],
    expenses: Array.isArray(group.expenses) ? group.expenses : [],
    tripPhotos: Array.isArray(group.tripPhotos) ? group.tripPhotos.map((item) => normalizeTripPhotoEntry(item)).filter((item) => item.fileId) : [],
    tripNotes: Array.isArray(group.tripNotes) ? group.tripNotes : [],
    routePlan: group.routePlan || null,
    region: group.region || null,
    tripCard: group.tripCard || null,
    reminderState: group.reminderState || {},
    remindersEnabled: group.remindersEnabled === true,
    status: group.status || "active",
    createdAt: group.createdAt || null,
    completedAt: group.completedAt || null,
    archivedAt: group.archivedAt || null,
    finalSummary: group.finalSummary || null,
    members: Array.isArray(group.members)
      ? group.members.map((member) => ({
          ...member,
          attendanceStatus:
            member.attendanceStatus === "going" ||
            member.attendanceStatus === "thinking" ||
            member.attendanceStatus === "not_going"
              ? member.attendanceStatus
              : "",
          attendanceSelfLocked: member.attendanceSelfLocked === true,
          role:
            member.role ||
            (member.id === (group.ownerId || group.members?.[0]?.id) ? "owner" : "member"),
          canManage:
            typeof member.canManage === "boolean"
              ? member.canManage
              : member.id === (group.ownerId || group.members?.[0]?.id)
        }))
      : []
  };
}

export class GroupService {
  constructor(store) {
    this.store = store;
  }

  createGroup({ name, ownerId, ownerName }) {
    const data = this.store.read();
    const activeGroup = data.groups
      .map((group) => createEmptyGroupFields(group))
      .find(
        (group) =>
          group.status === "active" &&
          group.members.some((member) => member.id === ownerId)
      );

    if (activeGroup) {
      return {
        ok: false,
        message: `У тебе вже є активна група "${activeGroup.name}". Спочатку заверш похід, а потім створюй нову групу.`
      };
    }

    const group = {
      id: crypto.randomUUID(),
      name,
      ownerId,
      inviteCode: createInviteCode(),
      members: [
        {
          id: ownerId,
          name: ownerName,
          attendanceStatus: "",
          attendanceSelfLocked: false,
          role: "owner",
          canManage: true
        }
      ],
      gear: [],
      gearNeeds: [],
      food: [],
      expenses: [],
      tripPhotos: [],
      tripNotes: [],
      routePlan: null,
      region: null,
      tripCard: null,
      reminderState: {},
      remindersEnabled: false,
      status: "active",
      createdAt: new Date().toISOString(),
      completedAt: null,
      archivedAt: null,
      finalSummary: null
    };
    data.groups.push(group);
    this.store.write(data);

    return { ok: true, group };
  }

  joinGroup(inviteCode, member) {
    const data = this.store.read();
    const activeGroup = data.groups
      .map((group) => createEmptyGroupFields(group))
      .find(
        (group) =>
          group.status === "active" &&
          group.members.some((existingMember) => existingMember.id === member.id)
      );

    if (activeGroup) {
      return {
        ok: false,
        message: `Ти вже береш участь в активній групі "${activeGroup.name}". Спочатку заверш поточний похід.`
      };
    }

    const group = data.groups
      .map((item) => createEmptyGroupFields(item))
      .find((item) => item.inviteCode === inviteCode && item.status === "active");

    if (!group) {
      return { ok: false, message: "Активну групу з таким кодом не знайдено." };
    }

    const rawGroup = data.groups.find((item) => item.id === group.id);
    const alreadyMember = rawGroup.members.some((item) => item.id === member.id);
    if (!alreadyMember) {
      rawGroup.members.push({
        ...member,
        attendanceStatus: "",
        attendanceSelfLocked: false,
        role: "member",
        canManage: false
      });
      this.store.write(data);
    }

    return { ok: true, group: createEmptyGroupFields(rawGroup) };
  }

  findGroupByMember(memberId) {
    const data = this.store.read();
    const group = data.groups
      .map((item) => createEmptyGroupFields(item))
      .find(
        (item) =>
          item.status === "active" &&
          groupHasMember(item, memberId)
      );
    return group ? createEmptyGroupFields(group) : null;
  }

  getGroup(groupId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);
    return group ? createEmptyGroupFields(group) : null;
  }

  getActiveGroups() {
    const data = this.store.read();
    return data.groups
      .map((item) => createEmptyGroupFields(item))
      .filter((item) => item.status === "active");
  }

  getMember(groupId, memberId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return null;
    }

    const preparedGroup = createEmptyGroupFields(group);
    return preparedGroup.members.find((member) => String(member?.id || "") === String(memberId || "")) || null;
  }

  canManageGroup(groupId, memberId) {
    const member = this.getMember(groupId, memberId);
    return Boolean(member?.canManage);
  }

  getInviteInfo(groupId, botUsername = "") {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return null;
    }

    const preparedGroup = createEmptyGroupFields(group);
    const deepLink = botUsername
      ? `https://t.me/${botUsername}?start=join_${preparedGroup.inviteCode}`
      : null;

    return {
      inviteCode: preparedGroup.inviteCode,
      deepLink
    };
  }

  grantManagePermission({ groupId, actorId, targetMemberId }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return { ok: false, message: "Похід не знайдено." };
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const actor = group.members.find((member) => member.id === actorId);
    if (!actor || actor.role !== "owner") {
      return { ok: false, message: "Лише організатор походу може надавати права редагування." };
    }

    const target = group.members.find((member) => member.id === targetMemberId);
    if (!target) {
      return { ok: false, message: "Учасника не знайдено в цьому поході." };
    }

    if (target.id === actorId) {
      return { ok: false, message: "У тебе вже є всі права організатора." };
    }

    target.role = "manager";
    target.canManage = true;
    this.store.write(data);

    return { ok: true, group: createEmptyGroupFields(group), member: target };
  }

  setMemberAttendanceStatus({
    groupId,
    actorId,
    targetMemberId,
    status,
    lockSelfChange = false,
    clearSelfLock = false
  }) {
    const allowedStatuses = new Set(["going", "thinking", "not_going"]);
    if (!allowedStatuses.has(status)) {
      return { ok: false, message: "Невідомий статус учасника." };
    }

    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return { ok: false, message: "Похід не знайдено." };
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const actor = group.members.find((member) => member.id === actorId);
    if (!actor) {
      return { ok: false, message: "Тебе не знайдено серед учасників цього походу." };
    }

    const target = group.members.find((member) => member.id === targetMemberId);
    if (!target) {
      return { ok: false, message: "Учасника не знайдено в цьому поході." };
    }

    const actorCanManage = actor.canManage === true || actor.role === "owner";
    const isSelfUpdate = actor.id === target.id;

    if (!isSelfUpdate && !actorCanManage) {
      return { ok: false, message: "Ти можеш змінювати тільки свій статус участі." };
    }

    if (isSelfUpdate && target.attendanceSelfLocked === true && !actorCanManage) {
      return {
        ok: false,
        message:
          "Твій статус уже зафіксовано як «Не йду». Якщо це помилка, звернися до організатора або редактора походу."
      };
    }

    const previousStatus = target.attendanceStatus || "";
    const previousLock = target.attendanceSelfLocked === true;
    target.attendanceStatus = status;
    if (lockSelfChange) {
      target.attendanceSelfLocked = true;
    } else if (clearSelfLock || actorCanManage) {
      target.attendanceSelfLocked = false;
    }
    this.store.write(data);

    return {
      ok: true,
      group: createEmptyGroupFields(group),
      member: { ...target },
      previousStatus,
      changed:
        previousStatus !== status ||
        previousLock !== (target.attendanceSelfLocked === true)
    };
  }

  setMemberAttendanceStatusSystem({
    groupId,
    targetMemberId,
    status,
    lockSelfChange = false,
    clearSelfLock = false
  }) {
    const allowedStatuses = new Set(["going", "thinking", "not_going"]);
    if (!allowedStatuses.has(status)) {
      return { ok: false, message: "Невідомий статус учасника." };
    }

    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return { ok: false, message: "Похід не знайдено." };
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const target = group.members.find((member) => member.id === targetMemberId);
    if (!target) {
      return { ok: false, message: "Учасника не знайдено в цьому поході." };
    }

    const previousStatus = target.attendanceStatus || "";
    const previousLock = target.attendanceSelfLocked === true;
    target.attendanceStatus = status;
    if (lockSelfChange) {
      target.attendanceSelfLocked = true;
    } else if (clearSelfLock) {
      target.attendanceSelfLocked = false;
    }
    this.store.write(data);

    return {
      ok: true,
      group: createEmptyGroupFields(group),
      member: { ...target },
      previousStatus,
      changed:
        previousStatus !== status ||
        previousLock !== (target.attendanceSelfLocked === true)
    };
  }

  getGroupHistoryByMember(memberId) {
    this.archiveStaleCompletedGroups();
    const data = this.store.read();
    return data.groups
      .map((item) => createEmptyGroupFields(item))
      .filter(
        (item) =>
          (item.status === "completed" || item.status === "archived") &&
          groupHasParticipatingMember(item, memberId)
      )
      .sort((left, right) =>
        String(right.archivedAt || right.completedAt).localeCompare(String(left.archivedAt || left.completedAt))
      );
  }

  getOutstandingGearLoans(groupId) {
    const snapshot = this.getGearSnapshot(groupId);
    if (!snapshot) {
      return [];
    }

    const combined = [...snapshot.sharedGear, ...snapshot.personalGear, ...snapshot.spareGear];
    return combined
      .filter((item) => Array.isArray(item.loans) && item.loans.length > 0)
      .map((item) => ({
        gearId: item.id,
        gearName: item.name,
        ownerMemberId: item.memberId,
        ownerMemberName: item.memberName || "учасник",
        totalQuantity: item.quantity,
        availableQuantity: item.availableQuantity,
        inUseQuantity: item.inUseQuantity,
        loans: item.loans.map((loan) => ({
          borrowerMemberId: loan.borrowerMemberId,
          borrowerMemberName: loan.borrowerMemberName || "учасник",
          quantity: Number(loan.quantity) || 0
        }))
      }));
  }

  completeGroup(groupId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const outstandingLoans = this.getOutstandingGearLoans(groupId);
    if (outstandingLoans.length > 0) {
      return {
        ok: false,
        message: "Похід не можна завершити, поки учасники не повернуть позичене спорядження.",
        outstandingLoans
      };
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);
    group.status = "completed";
    group.completedAt = new Date().toISOString();
    group.archivedAt = null;
    group.finalSummary = buildFinalSummary(group);
    this.store.write(data);

    return {
      ok: true,
      group: createEmptyGroupFields(group)
    };
  }

  archiveGroup(groupId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);
    group.status = "archived";
    group.archivedAt = new Date().toISOString();
    if (!group.finalSummary) {
      group.finalSummary = buildFinalSummary(group);
    }
    this.store.write(data);

    return createEmptyGroupFields(group);
  }

  archiveStaleCompletedGroups(days = 30) {
    const cutoffMs = Math.max(1, Number(days) || 30) * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const data = this.store.read();
    let changed = false;

    for (const rawGroup of data.groups) {
      const group = createEmptyGroupFields(rawGroup);
      if (group.status !== "completed" || !group.completedAt) {
        continue;
      }

      const completedMs = Date.parse(group.completedAt);
      if (Number.isNaN(completedMs) || now - completedMs < cutoffMs) {
        continue;
      }

      rawGroup.status = "archived";
      rawGroup.archivedAt = rawGroup.archivedAt || new Date().toISOString();
      rawGroup.finalSummary = rawGroup.finalSummary || buildFinalSummary(group);
      changed = true;
    }

    if (changed) {
      this.store.write(data);
    }
  }

  addGear({ groupId, memberId, memberName, gear }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const addedItem = enrichTripGearItem({
      id: crypto.randomUUID(),
      memberId,
      memberName,
      name: canonicalizeGearName(gear.name),
      quantity: gear.quantity,
      attributes: gear.attributes || {},
      shareable: gear.shareable,
      scope: gear.scope,
      note: gear.note || "",
      details: gear.details || "",
      season: gear.season || "",
      weightGrams: Number(gear.weightGrams) || 0
    });

    group.gear.push(addedItem);

    this.store.write(data);
    return addedItem;
  }

  updateGear({ groupId, gearId, patch = {} }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const index = group.gear.findIndex((item) => item.id === gearId);
    if (index === -1) {
      return null;
    }

    const current = enrichTripGearItem(group.gear[index]);
    const currentInUseQuantity = Number(current.inUseQuantity) || 0;
    const scopeChanged = typeof patch.scope !== "undefined" && String(patch.scope) !== String(current.scope);
    const shareableChanged = typeof patch.shareable !== "undefined" && Boolean(patch.shareable) !== Boolean(current.shareable);

    if (currentInUseQuantity > 0 && (scopeChanged || shareableChanged)) {
      return {
        ok: false,
        message: "Не можна змінити тип спорядження, поки ця річ перебуває в користуванні іншого учасника.",
        item: current
      };
    }

    const next = enrichTripGearItem({
      ...current,
      ...patch,
      name: typeof patch.name !== "undefined" ? canonicalizeGearName(patch.name) : current.name,
      id: current.id,
      memberId: patch.memberId || current.memberId,
      memberName: patch.memberName || current.memberName,
      attributes: {
        ...(current.attributes || {}),
        ...((patch.attributes && typeof patch.attributes === "object") ? patch.attributes : {})
      }
    });

    group.gear[index] = next;
    this.store.write(data);
    return {
      ok: true,
      item: next
    };
  }

  deleteGear({ groupId, gearId }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const index = group.gear.findIndex((item) => item.id === gearId);
    if (index === -1) {
      return null;
    }

    const current = enrichTripGearItem(group.gear[index]);
    if ((Number(current.inUseQuantity) || 0) > 0) {
      return {
        ok: false,
        message: "Цю річ зараз не можна видалити, бо частина кількості вже в користуванні.",
        item: current
      };
    }

    const [removed] = group.gear.splice(index, 1);
    this.store.write(data);
    return {
      ok: true,
      item: enrichTripGearItem(removed)
    };
  }

  addFood({ groupId, memberId, memberName, food }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const canonicalName = canonicalizeFoodName(food.name);
    const category = categorizeFoodName(canonicalName);
    group.food.push({
      id: crypto.randomUUID(),
      memberId,
      memberName,
      name: canonicalName,
      categoryKey: category.key,
      categoryLabel: category.label,
      amountLabel: food.amountLabel || "",
      weightGrams: Number(food.weightGrams) || 0,
      quantity: food.quantity,
      cost: Number(food.cost) || 0,
      note: food.note || ""
    });

    this.store.write(data);
  }

  deleteFood({ groupId, foodId }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const index = group.food.findIndex((item) => item.id === foodId);
    if (index === -1) {
      return null;
    }

    const [removed] = group.food.splice(index, 1);
    this.store.write(data);
    return removed;
  }

  addExpense({ groupId, memberId, memberName, expense }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const canonicalTitle = canonicalizeExpenseTitle(expense.title);
    const category = categorizeExpenseTitle(canonicalTitle);
    group.expenses.push({
      id: crypto.randomUUID(),
      memberId,
      memberName,
      title: canonicalTitle,
      categoryKey: category.key,
      categoryLabel: category.label,
      quantity: expense.quantity,
      price: Number(expense.price) || 0,
      amount: Number(expense.amount) || 0,
      note: expense.note || ""
    });

    this.store.write(data);
  }

  deleteExpense({ groupId, expenseId }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const index = group.expenses.findIndex((item) => item.id === expenseId);
    if (index === -1) {
      return null;
    }

    const [removed] = group.expenses.splice(index, 1);
    this.store.write(data);
    return removed;
  }

  setRoutePlan({ groupId, routePlan, region }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    group.routePlan = {
      ...routePlan,
      updatedAt: new Date().toISOString()
    };
    group.region = region || group.region || routePlan.from;

    this.store.write(data);
    return createEmptyGroupFields(group);
  }

  updateRoutePlan({ groupId, routePlan, region }) {
    return this.setRoutePlan({ groupId, routePlan, region });
  }

  setTripCard({ groupId, tripCard, tripName = "" }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);
    const previousStartDate = preparedGroup.tripCard?.startDate || null;
    const normalizedTripName = String(tripName || "").trim();
    if (normalizedTripName) {
      group.name = normalizedTripName;
    }
    group.tripCard = {
      ...preparedGroup.tripCard,
      ...tripCard,
      updatedAt: new Date().toISOString()
    };
    if (tripCard.startDate && tripCard.startDate !== previousStartDate) {
      group.reminderState = {};
    }
    this.store.write(data);

    return createEmptyGroupFields(group);
  }

  getTripCard(groupId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return null;
    }

    return createEmptyGroupFields(group).tripCard;
  }

  addTripNote({ groupId, note }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    group.tripNotes.push({
      id: crypto.randomUUID(),
      ...note,
      createdAt: new Date().toISOString()
    });

    this.store.write(data);
    return createEmptyGroupFields(group);
  }

  addTripPhoto({ groupId, photo }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const normalizedPhoto = normalizeTripPhotoEntry(photo);
    group.tripPhotos.push(normalizedPhoto);
    this.store.write(data);

    return normalizedPhoto;
  }

  getTripPhotoAlbum(groupId, { limit = 12 } = {}) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return null;
    }

    const preparedGroup = createEmptyGroupFields(group);
    const items = [...preparedGroup.tripPhotos]
      .filter((item) => item.fileId)
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    const safeLimit = Math.max(1, Number(limit) || 12);
    const byMomentMap = new Map();
    const byAuthorMap = new Map();

    for (const item of items) {
      const currentMoment = byMomentMap.get(item.momentKey);
      if (currentMoment) {
        currentMoment.count += 1;
      } else {
        byMomentMap.set(item.momentKey, {
          key: item.momentKey,
          label: item.momentLabel || "Маршрут і команда",
          count: 1
        });
      }

      const authorKey = String(item.authorMemberId || item.authorMemberName || "");
      const currentAuthor = byAuthorMap.get(authorKey);
      if (currentAuthor) {
        currentAuthor.count += 1;
      } else {
        byAuthorMap.set(authorKey, {
          authorMemberId: item.authorMemberId || "",
          authorMemberName: item.authorMemberName || "учасник",
          count: 1
        });
      }
    }

    return {
      items: items.slice(0, safeLimit),
      totalCount: items.length,
      byMoment: [...byMomentMap.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
      byAuthor: [...byAuthorMap.values()].sort((left, right) => right.count - left.count || left.authorMemberName.localeCompare(right.authorMemberName)),
      latestAt: items[0]?.createdAt || null
    };
  }

  getTripNotes(groupId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return [];
    }

    return createEmptyGroupFields(group).tripNotes;
  }

  markReminderSent({ groupId, reminderKey }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);
    group.reminderState = {
      ...preparedGroup.reminderState,
      [reminderKey]: new Date().toISOString()
    };
    this.store.write(data);
    return createEmptyGroupFields(group);
  }

  setRemindersEnabled({ groupId, enabled }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);
    group.remindersEnabled = enabled === true;
    this.store.write(data);
    return createEmptyGroupFields(group);
  }

  setRegion({ groupId, region }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);
    group.region = region;
    this.store.write(data);

    return createEmptyGroupFields(group);
  }

  getRoutePlan(groupId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return null;
    }

    const preparedGroup = createEmptyGroupFields(group);
    return {
      routePlan: preparedGroup.routePlan,
      region: preparedGroup.region
    };
  }

  addGearNeed({ groupId, memberId, memberName, need }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const gearNeed = normalizeGearNeed({
      memberId,
      memberName,
      name: need.name,
      quantity: need.quantity,
      note: need.note || ""
    });
    group.gearNeeds.push(gearNeed);

    this.store.write(data);
    return gearNeed;
  }

  getMemberGearNeeds(groupId, memberId, { includeResolved = false } = {}) {
    const snapshot = this.getGearSnapshot(groupId);
    if (!snapshot) {
      return [];
    }

    const source = includeResolved ? snapshot.allGearNeeds : snapshot.gearNeeds;
    return source.filter((item) => String(item.memberId) === String(memberId));
  }

  getGearNeed(groupId, needId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return null;
    }

    const preparedGroup = createEmptyGroupFields(group);
    return preparedGroup.gearNeeds.find((item) => item.id === needId) || null;
  }

  updateGearNeed({ groupId, needId, patch = {} }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const index = group.gearNeeds.findIndex((item) => item.id === needId);
    if (index === -1) {
      return null;
    }

    const current = normalizeGearNeed(group.gearNeeds[index]);
    const next = normalizeGearNeed({
      ...current,
      ...patch,
      id: current.id,
      memberId: patch.memberId || current.memberId,
      memberName: patch.memberName || current.memberName,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    });

    group.gearNeeds[index] = next;
    this.store.write(data);
    return next;
  }

  cancelGearNeed({ groupId, needId }) {
    return this.updateGearNeed({
      groupId,
      needId,
      patch: {
        status: "cancelled",
        matchedByMemberId: "",
        matchedByMemberName: "",
        matchedGearId: "",
        matchedGearName: "",
        matchedAt: null,
        loanRequestStatus: "",
        loanRequestedAt: null,
        loanApprovedAt: null,
        cancelledAt: new Date().toISOString()
      }
    });
  }

  requestGearLoan({ groupId, needId, lenderMemberId, lenderMemberName, gearId }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const needIndex = group.gearNeeds.findIndex((item) => item.id === needId);
    if (needIndex === -1) {
      return null;
    }

    const gearItem = group.gear.find((item) => item.id === gearId);
    if (!gearItem) {
      return null;
    }

    const updatedNeed = normalizeGearNeed({
      ...group.gearNeeds[needIndex],
      status: "matched",
      matchedByMemberId: lenderMemberId || gearItem.memberId || "",
      matchedByMemberName: lenderMemberName || gearItem.memberName || "",
      matchedGearId: gearItem.id,
      matchedGearName: gearItem.name,
      matchedAt: new Date().toISOString(),
      loanRequestStatus: "pending",
      loanRequestedAt: new Date().toISOString(),
      loanApprovedAt: null,
      updatedAt: new Date().toISOString()
    });

    group.gearNeeds[needIndex] = updatedNeed;
    this.store.write(data);
    return updatedNeed;
  }

  clearGearNeedMatch({ groupId, needId }) {
    return this.updateGearNeed({
      groupId,
      needId,
      patch: {
        status: "open",
        matchedByMemberId: "",
        matchedByMemberName: "",
        matchedGearId: "",
        matchedGearName: "",
        matchedAt: null,
        loanRequestStatus: "",
        loanRequestedAt: null,
        loanApprovedAt: null
      }
    });
  }

  fulfillGearNeed({ groupId, needId }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const needIndex = group.gearNeeds.findIndex((item) => item.id === needId);
    if (needIndex === -1) {
      return { ok: false, message: "Запит не знайдено." };
    }

    const need = normalizeGearNeed(group.gearNeeds[needIndex]);
    if (need.status === "fulfilled") {
      return { ok: false, message: "Цей запит уже позначено як отриманий." };
    }

    if (!need.matchedGearId) {
      return { ok: false, message: "Спочатку потрібно визначити, хто саме поділиться цією річчю." };
    }

    if (need.loanRequestStatus === "pending" && !need.loanApprovedAt) {
      return { ok: false, message: "Власник речі ще не підтвердив передачу." };
    }

    const gearIndex = group.gear.findIndex((item) => item.id === need.matchedGearId);
    if (gearIndex === -1) {
      return { ok: false, message: "Річ, якою мали поділитися, вже недоступна в спорядженні походу." };
    }

    const gearItem = enrichTripGearItem(group.gear[gearIndex]);
    if (gearItem.availableQuantity < need.quantity) {
      return {
        ok: false,
        message: `Цієї речі зараз недостатньо в наявності. Доступно: ${gearItem.availableQuantity}/${need.quantity}.`
      };
    }

    const loan = normalizeGearLoan({
      needId: need.id,
      borrowerMemberId: need.memberId,
      borrowerMemberName: need.memberName,
      quantity: need.quantity
    });

    const updatedGear = enrichTripGearItem({
      ...gearItem,
      loans: [...(gearItem.loans || []), loan]
    });
    const fulfilledNeed = normalizeGearNeed({
      ...need,
      status: "fulfilled",
      loanRequestStatus: "approved",
      loanApprovedAt: need.loanApprovedAt || new Date().toISOString(),
      fulfilledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    group.gear[gearIndex] = updatedGear;
    group.gearNeeds[needIndex] = fulfilledNeed;
    this.store.write(data);

    return {
      ok: true,
      need: fulfilledNeed,
      gear: updatedGear,
      loan
    };
  }

  matchGearNeed({ groupId, needId, lenderMemberId, lenderMemberName, gearId }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const needIndex = group.gearNeeds.findIndex((item) => item.id === needId);
    if (needIndex === -1) {
      return null;
    }

    const gearItem = group.gear.find((item) => item.id === gearId);
    if (!gearItem) {
      return null;
    }

    const updatedNeed = normalizeGearNeed({
      ...group.gearNeeds[needIndex],
      status: "matched",
      matchedByMemberId: lenderMemberId || gearItem.memberId || "",
      matchedByMemberName: lenderMemberName || gearItem.memberName || "",
      matchedGearId: gearItem.id,
      matchedGearName: gearItem.name,
      matchedAt: new Date().toISOString(),
      loanRequestStatus: "",
      loanRequestedAt: null,
      loanApprovedAt: null,
      updatedAt: new Date().toISOString()
    });

    group.gearNeeds[needIndex] = updatedNeed;
    this.store.write(data);
    return updatedNeed;
  }

  findShareableGear(groupId, gearName, { excludeMemberId = "", requestedQuantity = 1 } = {}) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return [];
    }

    const preparedGroup = createEmptyGroupFields(group);
    const requested = Math.max(1, Number(requestedQuantity) || 1);

    return preparedGroup.gear.filter(
      (item) => (item.scope === "shared" || item.scope === "spare" || item.shareable)
        && gearNamesMatch(item.name, gearName)
        && (!excludeMemberId || String(item.memberId) !== String(excludeMemberId))
    ).map((item) => {
      const enriched = enrichTripGearItem(item);
      const availableQuantity = Math.max(0, Number(enriched.availableQuantity) || 0);
      return {
        ...enriched,
        requestedQuantity: requested,
        availableQuantity,
        isEnough: availableQuantity >= requested,
        missingQuantity: Math.max(0, requested - availableQuantity)
      };
    }).sort((left, right) => Number(right.isEnough) - Number(left.isEnough));
  }

  findNeedsMatchedByGear(groupId, gearName, { excludeMemberId = "" } = {}) {
    const snapshot = this.getGearSnapshot(groupId);
    if (!snapshot) {
      return [];
    }

    return snapshot.gearNeeds.filter(
      (item) =>
        gearNamesMatch(item.name, gearName)
        && (!excludeMemberId || String(item.memberId) !== String(excludeMemberId))
    );
  }

  getGearSnapshot(groupId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return null;
    }

    const preparedGroup = createEmptyGroupFields(group);
    const sharedGear = preparedGroup.gear.filter((item) => item.scope === "shared").map((item) => enrichTripGearItem(item));
    const personalGear = preparedGroup.gear.filter((item) => item.scope === "personal").map((item) => enrichTripGearItem(item));
    const spareGear = preparedGroup.gear.filter((item) => item.scope === "spare" || item.shareable).map((item) => enrichTripGearItem(item));
    const shareableGear = spareGear;
    const allGearNeeds = preparedGroup.gearNeeds.map((item) => normalizeGearNeed(item));
    const activeGearNeeds = allGearNeeds.filter((item) => isActiveGearNeedStatus(item.status));

    return {
      sharedGear,
      personalGear,
      spareGear,
      shareableGear,
      gearNeeds: activeGearNeeds,
      allGearNeeds,
      readiness:
        activeGearNeeds.length === 0
          ? "готово"
          : shareableGear.length > 0 || sharedGear.length > 0 || personalGear.length > 0
            ? "частково готово"
            : "збираємо"
    };
  }

  findGearCoverage(groupId, gearName, { excludeMemberId = "", requestedQuantity = 1 } = {}) {
    const needs = this.getGearSnapshot(groupId)?.gearNeeds || [];
    const matches = this.findShareableGear(groupId, gearName, { excludeMemberId, requestedQuantity });

    return {
      needs: needs.filter((item) => gearNamesMatch(item.name, gearName)),
      matches
    };
  }

  approveGearLoanRequest({ groupId, needId, approverMemberId = "" }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const needIndex = group.gearNeeds.findIndex((item) => item.id === needId);
    if (needIndex === -1) {
      return { ok: false, message: "Запит не знайдено." };
    }

    const need = normalizeGearNeed(group.gearNeeds[needIndex]);
    if (!need.matchedGearId || need.loanRequestStatus !== "pending") {
      return { ok: false, message: "Немає активного запиту на підтвердження." };
    }

    const gearIndex = group.gear.findIndex((item) => item.id === need.matchedGearId);
    if (gearIndex === -1) {
      return { ok: false, message: "Річ уже недоступна." };
    }

    const gearItem = enrichTripGearItem(group.gear[gearIndex]);
    if (approverMemberId && String(gearItem.memberId) !== String(approverMemberId)) {
      return { ok: false, message: "Підтвердити передачу може тільки власник цієї речі." };
    }

    if (gearItem.availableQuantity < need.quantity) {
      return {
        ok: false,
        message: `Цієї речі зараз недостатньо в наявності. Доступно: ${gearItem.availableQuantity}/${need.quantity}.`
      };
    }

    const updatedNeed = normalizeGearNeed({
      ...need,
      loanRequestStatus: "approved",
      loanApprovedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    group.gearNeeds[needIndex] = updatedNeed;
    this.store.write(data);

    return this.fulfillGearNeed({ groupId, needId });
  }

  declineGearLoanRequest({ groupId, needId, approverMemberId = "" }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const needIndex = group.gearNeeds.findIndex((item) => item.id === needId);
    if (needIndex === -1) {
      return { ok: false, message: "Запит не знайдено." };
    }

    const need = normalizeGearNeed(group.gearNeeds[needIndex]);
    if (!need.matchedGearId || need.loanRequestStatus !== "pending") {
      return { ok: false, message: "Немає активного запиту на підтвердження." };
    }

    const gearItem = group.gear.find((item) => item.id === need.matchedGearId);
    if (approverMemberId && gearItem && String(gearItem.memberId) !== String(approverMemberId)) {
      return { ok: false, message: "Відхилити запит може тільки власник цієї речі." };
    }

    const resetNeed = normalizeGearNeed({
      ...need,
      status: "open",
      matchedByMemberId: "",
      matchedByMemberName: "",
      matchedGearId: "",
      matchedGearName: "",
      matchedAt: null,
      loanRequestStatus: "",
      loanRequestedAt: null,
      loanApprovedAt: null,
      updatedAt: new Date().toISOString()
    });

    group.gearNeeds[needIndex] = resetNeed;
    this.store.write(data);
    return { ok: true, need: resetNeed };
  }

  getBorrowedGearForMember(groupId, memberId) {
    const snapshot = this.getGearSnapshot(groupId);
    if (!snapshot) {
      return [];
    }

    const combined = [...snapshot.sharedGear, ...snapshot.personalGear, ...snapshot.spareGear];
    const aggregated = new Map();

    for (const item of combined) {
      for (const loan of item.loans || []) {
        if (String(loan.borrowerMemberId) !== String(memberId)) {
          continue;
        }

        const key = `${item.id}:${item.memberId}`;
        const current = aggregated.get(key);
        if (current) {
          current.quantity += Number(loan.quantity) || 0;
          current.pendingReturnQuantity += loan.returnRequestStatus === "pending" ? Number(loan.quantity) || 0 : 0;
          current.loanCreatedAt = current.loanCreatedAt < loan.createdAt ? current.loanCreatedAt : loan.createdAt;
          continue;
        }

        aggregated.set(key, {
          gearId: item.id,
          gearName: item.name,
          ownerMemberId: item.memberId,
          ownerMemberName: item.memberName || "учасник",
          quantity: Number(loan.quantity) || 0,
          pendingReturnQuantity: loan.returnRequestStatus === "pending" ? Number(loan.quantity) || 0 : 0,
          totalQuantity: item.quantity,
          availableQuantity: item.availableQuantity,
          scope: item.scope,
          loanCreatedAt: loan.createdAt
        });
      }
    }

    return [...aggregated.values()];
  }

  getLoanedOutGearForMember(groupId, memberId) {
    const snapshot = this.getGearSnapshot(groupId);
    if (!snapshot) {
      return [];
    }

    const combined = [...snapshot.sharedGear, ...snapshot.personalGear, ...snapshot.spareGear];
    return combined
      .filter((item) => String(item.memberId) === String(memberId) && Array.isArray(item.loans) && item.loans.length > 0)
      .map((item) => {
        const aggregatedLoans = new Map();

        for (const loan of item.loans) {
          const borrowerId = String(loan.borrowerMemberId || "");
          const key = borrowerId || `${loan.borrowerMemberName}:${loan.needId}`;
          const current = aggregatedLoans.get(key);
          if (current) {
            current.quantity += Number(loan.quantity) || 0;
            current.pendingReturnQuantity += loan.returnRequestStatus === "pending" ? Number(loan.quantity) || 0 : 0;
            continue;
          }

          aggregatedLoans.set(key, {
            borrowerMemberId: borrowerId,
            borrowerMemberName: loan.borrowerMemberName || "учасник",
            quantity: Number(loan.quantity) || 0,
            pendingReturnQuantity: loan.returnRequestStatus === "pending" ? Number(loan.quantity) || 0 : 0
          });
        }

        return {
          gearId: item.id,
          gearName: item.name,
          quantity: item.quantity,
          availableQuantity: item.availableQuantity,
          inUseQuantity: item.inUseQuantity,
          scope: item.scope,
          loans: [...aggregatedLoans.values()],
          hasPendingReturns: [...aggregatedLoans.values()].some((loan) => loan.pendingReturnQuantity > 0)
        };
      });
  }

  requestGearReturn({ groupId, gearId, borrowerMemberId = "" }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const gearIndex = group.gear.findIndex((item) => item.id === gearId);
    if (gearIndex === -1) {
      return { ok: false, message: "Річ не знайдено." };
    }

    const gearItem = enrichTripGearItem(group.gear[gearIndex]);
    const activeLoans = gearItem.loans.filter((loan) => String(loan.borrowerMemberId) === String(borrowerMemberId));
    if (!activeLoans.length) {
      return { ok: false, message: "Ти зараз не користуєшся цією річчю." };
    }

    const pendingLoans = activeLoans.filter((loan) => loan.returnRequestStatus === "pending");
    if (pendingLoans.length === activeLoans.length) {
      return { ok: false, message: "Повернення цієї речі вже очікує підтвердження власника." };
    }

    const updatedLoans = gearItem.loans.map((loan) => {
      if (String(loan.borrowerMemberId) !== String(borrowerMemberId)) {
        return loan;
      }
      return normalizeGearLoan({
        ...loan,
        returnRequestStatus: "pending",
        returnRequestedAt: new Date().toISOString()
      });
    });

    const updatedGear = enrichTripGearItem({
      ...gearItem,
      loans: updatedLoans
    });

    group.gear[gearIndex] = updatedGear;
    this.store.write(data);

    const quantity = activeLoans.reduce((sum, loan) => sum + (Number(loan.quantity) || 0), 0);

    return {
      ok: true,
      gear: updatedGear,
      ownerMemberId: gearItem.memberId,
      ownerMemberName: gearItem.memberName || "учасник",
      quantity
    };
  }

  confirmGearReturn({ groupId, gearId, ownerMemberId = "" }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    const gearIndex = group.gear.findIndex((item) => item.id === gearId);
    if (gearIndex === -1) {
      return { ok: false, message: "Річ не знайдено." };
    }

    const gearItem = enrichTripGearItem(group.gear[gearIndex]);
    if (ownerMemberId && String(gearItem.memberId) !== String(ownerMemberId)) {
      return { ok: false, message: "Підтвердити повернення може тільки власник цієї речі." };
    }

    const pendingLoans = gearItem.loans.filter((loan) => loan.returnRequestStatus === "pending");
    if (!pendingLoans.length) {
      return { ok: false, message: "Зараз немає речей, які очікують підтвердження повернення." };
    }

    const remainingLoans = gearItem.loans.filter((loan) => loan.returnRequestStatus !== "pending");
    const updatedGear = enrichTripGearItem({
      ...gearItem,
      loans: remainingLoans
    });

    group.gear[gearIndex] = updatedGear;
    this.store.write(data);

    const borrowers = new Map();
    for (const loan of pendingLoans) {
      const key = String(loan.borrowerMemberId || "");
      const current = borrowers.get(key);
      if (current) {
        current.quantity += Number(loan.quantity) || 0;
        continue;
      }
      borrowers.set(key, {
        borrowerMemberId: key,
        borrowerMemberName: loan.borrowerMemberName || "учасник",
        quantity: Number(loan.quantity) || 0
      });
    }

    return {
      ok: true,
      gear: updatedGear,
      returnedBorrowers: [...borrowers.values()]
    };
  }

  getFoodSnapshot(groupId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return null;
    }

    const preparedGroup = createEmptyGroupFields(group);
    const totalCost = preparedGroup.food.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    const totalWeight = preparedGroup.food.reduce((sum, item) => sum + (Number(item.weightGrams) || 0), 0);
    const byMember = preparedGroup.members.map((member) => {
      const items = preparedGroup.food.filter((item) => item.memberId === member.id);
      return {
        memberId: member.id,
        memberName: member.name,
        itemCount: items.length,
        totalCost: items.reduce((sum, item) => sum + (Number(item.cost) || 0), 0),
        totalWeight: items.reduce((sum, item) => sum + (Number(item.weightGrams) || 0), 0)
      };
    }).filter((entry) => entry.itemCount > 0);

    return {
      items: preparedGroup.food,
      totalCost,
      totalWeight,
      byMember
    };
  }

  getBackpackWeightSnapshot(groupId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return null;
    }

    const preparedGroup = createEmptyGroupFields(group);
    const members = getMembersIncludedInCalculations(preparedGroup.members || []);
    const memberCount = Math.max(1, members.length);
    const gearItems = preparedGroup.gear.map((item) => enrichGearItem(item));
    const foodItems = preparedGroup.food.map((item) => ({
      ...item,
      weightGrams: Number(item.weightGrams) || 0
    }));

    const sharedGearItems = gearItems.filter((item) => item.scope === "shared");
    const loanTrackedItems = gearItems.filter((item) => Array.isArray(item.loans) && item.loans.length > 0);
    const borrowedWeightByMember = new Map();
    let sharedGearWeight = 0;
    let sharedGearMissing = 0;

    for (const item of sharedGearItems) {
      const weightPerUnit = Number(item.weightGrams) || 0;
      const availableQuantity = Math.max(0, Number(item.availableQuantity ?? item.quantity) || 0);
      const loans = Array.isArray(item.loans) ? item.loans : [];

      if (weightPerUnit > 0) {
        sharedGearWeight += weightPerUnit * availableQuantity;
      } else if (availableQuantity > 0) {
        sharedGearMissing += 1;
      }
    }

    for (const item of loanTrackedItems) {
      const weightPerUnit = Number(item.weightGrams) || 0;
      const loans = Array.isArray(item.loans) ? item.loans : [];
      for (const loan of loans) {
        const borrowerId = String(loan.borrowerMemberId || "");
        const quantity = Math.max(0, Number(loan.quantity) || 0);
        if (!borrowerId || quantity <= 0) {
          continue;
        }

        const currentBorrowed = borrowedWeightByMember.get(borrowerId) || 0;
        borrowedWeightByMember.set(
          borrowerId,
          currentBorrowed + (weightPerUnit > 0 ? weightPerUnit * quantity : 0)
        );
      }
    }

    const totalFoodWeight = foodItems.reduce((sum, item) => sum + (Number(item.weightGrams) || 0), 0);
    const foodMissing = foodItems.filter((item) => !(Number(item.weightGrams) > 0)).length;

    const byMember = members.map((member) => {
      const personalGearItems = gearItems.filter((item) => item.scope === "personal" && item.memberId === member.id);
      const personalGearWeight = personalGearItems.reduce(
        (sum, item) => sum + ((Number(item.weightGrams) || 0) * Math.max(0, Number(item.availableQuantity ?? item.quantity) || 0)),
        0
      );
      const personalGearMissing = personalGearItems.filter((item) => !(Number(item.weightGrams) > 0) && Math.max(0, Number(item.availableQuantity ?? item.quantity) || 0) > 0).length;
      const borrowedGearWeight = borrowedWeightByMember.get(String(member.id)) || 0;
      const sharedGearShare = sharedGearWeight / memberCount;
      const foodShare = totalFoodWeight / memberCount;
      const personalGearDetails = personalGearItems
        .map((item) => {
          const quantity = Math.max(0, Number(item.availableQuantity ?? item.quantity) || 0);
          const weightPerUnit = Number(item.weightGrams) || 0;
          return {
            id: item.id,
            name: item.name,
            quantity,
            weightPerUnit,
            totalWeight: weightPerUnit * quantity
          };
        })
        .filter((item) => item.quantity > 0);
      const borrowedGearDetails = loanTrackedItems.flatMap((item) => {
        const weightPerUnit = Number(item.weightGrams) || 0;
        return (Array.isArray(item.loans) ? item.loans : [])
          .filter((loan) => String(loan.borrowerMemberId || "") === String(member.id))
          .map((loan) => {
            const quantity = Math.max(0, Number(loan.quantity) || 0);
            return {
              id: item.id,
              name: item.name,
              ownerMemberId: item.memberId || "",
              ownerMemberName: item.memberName || "",
              quantity,
              weightPerUnit,
              totalWeight: weightPerUnit * quantity
            };
          });
      }).filter((item) => item.quantity > 0);
      const sharedGearDetails = sharedGearItems
        .map((item) => {
          const availableQuantity = Math.max(0, Number(item.availableQuantity ?? item.quantity) || 0);
          const weightPerUnit = Number(item.weightGrams) || 0;
          const totalWeight = weightPerUnit * availableQuantity;
          return {
            id: item.id,
            name: item.name,
            quantity: availableQuantity,
            weightPerUnit,
            totalWeight,
            shareWeight: totalWeight / memberCount
          };
        })
        .filter((item) => item.quantity > 0);
      const foodShareDetails = foodItems.map((item) => {
        const totalWeight = Number(item.weightGrams) || 0;
        return {
          id: item.id,
          name: item.name,
          quantity: Math.max(0, Number(item.quantity) || 0),
          totalWeight,
          shareWeight: totalWeight / memberCount
        };
      }).filter((item) => item.totalWeight > 0);

      return {
        memberId: member.id,
        memberName: member.name,
        personalGearWeight,
        personalGearDetails,
        borrowedGearWeight,
        borrowedGearDetails,
        sharedGearShare,
        sharedGearDetails,
        foodShare,
        foodShareDetails,
        totalWeight: personalGearWeight + borrowedGearWeight + sharedGearShare + foodShare,
        missingWeights: personalGearMissing + sharedGearMissing + foodMissing
      };
    });

    return {
      byMember,
      totalFoodWeight,
      sharedGearWeight,
      sharedGearMissing,
      foodMissing,
      note: ""
    };
  }

  getExpenseSnapshot(groupId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      return null;
    }

    const preparedGroup = createEmptyGroupFields(group);
    const items = preparedGroup.expenses;
    const totalCost = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const byMember = preparedGroup.members.map((member) => {
      const memberItems = items.filter((item) => item.memberId === member.id);
      return {
        memberId: member.id,
        memberName: member.name,
        itemCount: memberItems.length,
        totalCost: memberItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
      };
    }).filter((entry) => entry.itemCount > 0);
    return {
      items,
      totalCost,
      byMember
    };
  }

}

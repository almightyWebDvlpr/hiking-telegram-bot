import crypto from "node:crypto";
import { categorizeGearName, enrichGearItem, resolveGearProfile } from "../data/gearCatalog.js";

function createInviteCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
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
    name: need.name || "",
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
    fulfilledAt: need.fulfilledAt || null,
    cancelledAt: need.cancelledAt || null
  };
}

function normalizeGearSearchValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

function extractSearchTokens(value = "") {
  return normalizeGearSearchValue(value)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

function buildGearIdentity(name = "") {
  const category = categorizeGearName(name);
  const profile = resolveGearProfile(name);
  return {
    normalized: normalizeGearSearchValue(name),
    categoryKey: category.key,
    profileKey: profile.key,
    tokens: extractSearchTokens(name)
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

  if (leftValue.includes(rightValue) || rightValue.includes(leftValue)) {
    return true;
  }

  if (
    leftIdentity.profileKey !== "generic" &&
    rightIdentity.profileKey !== "generic" &&
    leftIdentity.profileKey === rightIdentity.profileKey
  ) {
    return true;
  }

  if (
    leftIdentity.categoryKey !== "other" &&
    leftIdentity.categoryKey === rightIdentity.categoryKey
  ) {
    const sharedTokens = leftIdentity.tokens.filter((item) => rightIdentity.tokens.includes(item));
    if (sharedTokens.length > 0) {
      return true;
    }
  }

  return false;
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
      canManage: member.canManage
    })),
    routeName: routeName || "маршрут не задано",
    gearReadinessStatus: group.tripCard?.gearReadinessStatus || calculateReadiness(group),
    gearCount: totalGear,
    gearNeedsCount: activeNeeds.length,
    foodCount: group.food.length,
    foodTotal,
    expensesCount: group.expenses.length,
    expensesTotal,
    totalCost: foodTotal + expensesTotal
  };
}

function createEmptyGroupFields(group) {
  return {
    ...group,
    ownerId: group.ownerId || group.members?.[0]?.id || null,
    gear: Array.isArray(group.gear) ? group.gear : [],
    gearNeeds: Array.isArray(group.gearNeeds) ? group.gearNeeds.map((item) => normalizeGearNeed(item)) : [],
    food: Array.isArray(group.food) ? group.food : [],
    expenses: Array.isArray(group.expenses) ? group.expenses : [],
    tripNotes: Array.isArray(group.tripNotes) ? group.tripNotes : [],
    routePlan: group.routePlan || null,
    region: group.region || null,
    tripCard: group.tripCard || null,
    reminderState: group.reminderState || {},
    status: group.status || "active",
    createdAt: group.createdAt || null,
    completedAt: group.completedAt || null,
    archivedAt: group.archivedAt || null,
    finalSummary: group.finalSummary || null,
    members: Array.isArray(group.members)
      ? group.members.map((member) => ({
          ...member,
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
          role: "owner",
          canManage: true
        }
      ],
      gear: [],
      gearNeeds: [],
      food: [],
      expenses: [],
      tripNotes: [],
      routePlan: null,
      region: null,
      tripCard: null,
      reminderState: {},
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
          item.members.some((member) => member.id === memberId)
      );
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
    return preparedGroup.members.find((member) => member.id === memberId) || null;
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

  getGroupHistoryByMember(memberId) {
    this.archiveStaleCompletedGroups();
    const data = this.store.read();
    return data.groups
      .map((item) => createEmptyGroupFields(item))
      .filter(
        (item) =>
          (item.status === "completed" || item.status === "archived") &&
          item.members.some((member) => member.id === memberId)
      )
      .sort((left, right) =>
        String(right.archivedAt || right.completedAt).localeCompare(String(left.archivedAt || left.completedAt))
      );
  }

  completeGroup(groupId) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);
    group.status = "completed";
    group.completedAt = new Date().toISOString();
    group.archivedAt = null;
    group.finalSummary = buildFinalSummary(group);
    this.store.write(data);

    return createEmptyGroupFields(group);
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

    const addedItem = enrichGearItem({
      id: crypto.randomUUID(),
      memberId,
      memberName,
      name: gear.name,
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

    const current = enrichGearItem(group.gear[index]);
    const next = enrichGearItem({
      ...current,
      ...patch,
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
    return next;
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

    const [removed] = group.gear.splice(index, 1);
    this.store.write(data);
    return enrichGearItem(removed);
  }

  addFood({ groupId, memberId, memberName, food }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);

    group.food.push({
      id: crypto.randomUUID(),
      memberId,
      memberName,
      name: food.name,
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

    group.expenses.push({
      id: crypto.randomUUID(),
      memberId,
      memberName,
      title: expense.title,
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

  setTripCard({ groupId, tripCard }) {
    const data = this.store.read();
    const group = data.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    const preparedGroup = createEmptyGroupFields(group);
    Object.assign(group, preparedGroup);
    const previousStartDate = preparedGroup.tripCard?.startDate || null;
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
        cancelledAt: new Date().toISOString()
      }
    });
  }

  fulfillGearNeed({ groupId, needId }) {
    return this.updateGearNeed({
      groupId,
      needId,
      patch: {
        status: "fulfilled",
        fulfilledAt: new Date().toISOString()
      }
    });
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
      const enriched = enrichGearItem(item);
      const availableQuantity = Math.max(0, Number(enriched.quantity) || 0);
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
    const sharedGear = preparedGroup.gear.filter((item) => item.scope === "shared").map((item) => enrichGearItem(item));
    const personalGear = preparedGroup.gear.filter((item) => item.scope === "personal").map((item) => enrichGearItem(item));
    const spareGear = preparedGroup.gear.filter((item) => item.scope === "spare" || item.shareable).map((item) => enrichGearItem(item));
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
    const members = preparedGroup.members || [];
    const memberCount = Math.max(1, members.length);
    const gearItems = preparedGroup.gear.map((item) => enrichGearItem(item));
    const foodItems = preparedGroup.food.map((item) => ({
      ...item,
      weightGrams: Number(item.weightGrams) || 0
    }));

    const sharedGearItems = gearItems.filter((item) => item.scope === "shared" || item.scope === "spare" || item.shareable);
    const sharedGearWeight = sharedGearItems.reduce((sum, item) => sum + ((Number(item.weightGrams) || 0) * (Number(item.quantity) || 0)), 0);
    const sharedGearMissing = sharedGearItems.filter((item) => !(Number(item.weightGrams) > 0)).length;
    const totalFoodWeight = foodItems.reduce((sum, item) => sum + (Number(item.weightGrams) || 0), 0);
    const foodMissing = foodItems.filter((item) => !(Number(item.weightGrams) > 0)).length;

    const byMember = members.map((member) => {
      const personalGearItems = gearItems.filter((item) => item.scope === "personal" && item.memberId === member.id);
      const personalGearWeight = personalGearItems.reduce(
        (sum, item) => sum + ((Number(item.weightGrams) || 0) * (Number(item.quantity) || 0)),
        0
      );
      const personalGearMissing = personalGearItems.filter((item) => !(Number(item.weightGrams) > 0)).length;
      const sharedGearShare = sharedGearWeight / memberCount;
      const foodShare = totalFoodWeight / memberCount;

      return {
        memberId: member.id,
        memberName: member.name,
        personalGearWeight,
        sharedGearShare,
        foodShare,
        totalWeight: personalGearWeight + sharedGearShare + foodShare,
        missingWeights: personalGearMissing + sharedGearMissing + foodMissing
      };
    });

    return {
      byMember,
      totalFoodWeight,
      sharedGearWeight,
      sharedGearMissing,
      foodMissing,
      note: "Попередній розрахунок: спільне спорядження і їжа діляться порівну між усіма учасниками."
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

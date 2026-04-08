import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const GEAR_NEED_MANAGE_STEPS = ["pick", "action", "match_pick", "cancel_confirm"];

export const gearNeedManageMachine = createMachine({
  id: "gearNeedManage",
  initial: "pick",
  states: {
    pick: { on: { NEXT: "action" } },
    action: { on: { MATCH: "match_pick", CANCEL: "cancel_confirm", BACK: "pick" } },
    match_pick: { on: { BACK: "action" } },
    cancel_confirm: { on: { BACK: "action" } }
  }
});

function getSnapshot(step = "pick") {
  return gearNeedManageMachine.resolveState({
    ...getInitialSnapshot(gearNeedManageMachine),
    value: step
  });
}

export function getGearNeedManageNextStep(step = "pick", eventType = "NEXT") {
  const snapshot = getNextSnapshot(gearNeedManageMachine, getSnapshot(step), { type: eventType });
  return String(snapshot.value || step);
}

export function getGearNeedManagePreviousStep(step = "pick") {
  const snapshot = getNextSnapshot(gearNeedManageMachine, getSnapshot(step), { type: "BACK" });
  return String(snapshot.value || step);
}

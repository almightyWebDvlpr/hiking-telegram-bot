import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const GEAR_EDIT_STEPS = ["pick", "action", "quantity", "scope", "field", "save", "delete_confirm"];

export const gearEditMachine = createMachine({
  id: "gearEdit",
  initial: "pick",
  states: {
    pick: { on: { NEXT: "action" } },
    action: { on: { NEXT: "quantity", DELETE: "delete_confirm", BACK: "pick" } },
    quantity: { on: { NEXT: "scope", BACK: "action" } },
    scope: { on: { NEXT: "field", BACK: "quantity" } },
    field: { on: { NEXT: "save", BACK: "scope" } },
    save: { on: { BACK: "field" } },
    delete_confirm: { on: { BACK: "action" } }
  }
});

function getSnapshot(step = "pick") {
  return gearEditMachine.resolveState({
    ...getInitialSnapshot(gearEditMachine),
    value: step
  });
}

export function getGearEditNextStep(step = "pick", eventType = "NEXT") {
  const snapshot = getNextSnapshot(gearEditMachine, getSnapshot(step), { type: eventType });
  return String(snapshot.value || step);
}

export function getGearEditPreviousStep(step = "pick") {
  const snapshot = getNextSnapshot(gearEditMachine, getSnapshot(step), { type: "BACK" });
  return String(snapshot.value || step);
}

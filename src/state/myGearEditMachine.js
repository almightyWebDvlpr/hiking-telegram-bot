import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const MY_GEAR_EDIT_STEPS = ["pick", "action", "quantity", "field", "save", "delete_confirm"];

export const myGearEditMachine = createMachine({
  id: "myGearEdit",
  initial: "pick",
  states: {
    pick: { on: { NEXT: "action" } },
    action: { on: { NEXT: "quantity", DELETE: "delete_confirm", BACK: "pick" } },
    quantity: { on: { NEXT: "field", BACK: "action" } },
    field: { on: { NEXT: "save", BACK: "quantity" } },
    save: { on: { BACK: "field" } },
    delete_confirm: { on: { BACK: "action" } }
  }
});

function getSnapshot(step = "pick") {
  return myGearEditMachine.resolveState({
    ...getInitialSnapshot(myGearEditMachine),
    value: step
  });
}

export function getMyGearEditNextStep(step = "pick", eventType = "NEXT") {
  const snapshot = getNextSnapshot(myGearEditMachine, getSnapshot(step), { type: eventType });
  return String(snapshot.value || step);
}

export function getMyGearEditPreviousStep(step = "pick") {
  const snapshot = getNextSnapshot(myGearEditMachine, getSnapshot(step), { type: "BACK" });
  return String(snapshot.value || step);
}

import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const borrowedGearMachine = createMachine({
  id: "borrowedGear",
  initial: "pick",
  states: {
    pick: { on: { NEXT: "action" } },
    action: { on: { BACK: "pick" } }
  }
});

function getSnapshot(step = "pick") {
  return borrowedGearMachine.resolveState({
    ...getInitialSnapshot(borrowedGearMachine),
    value: step
  });
}

export function getBorrowedGearNextStep(step = "pick") {
  const snapshot = getNextSnapshot(borrowedGearMachine, getSnapshot(step), { type: "NEXT" });
  return String(snapshot.value || step);
}

export function getBorrowedGearPreviousStep(step = "pick") {
  const snapshot = getNextSnapshot(borrowedGearMachine, getSnapshot(step), { type: "BACK" });
  return String(snapshot.value || step);
}

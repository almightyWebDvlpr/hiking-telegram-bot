import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const GEAR_NEED_STEPS = ["name", "quantity", "note"];

export const gearNeedMachine = createMachine({
  id: "gearNeed",
  initial: "name",
  states: {
    name: {
      on: {
        NEXT: "quantity"
      }
    },
    quantity: {
      on: {
        NEXT: "note",
        BACK: "name"
      }
    },
    note: {
      on: {
        BACK: "quantity"
      }
    }
  }
});

export function getGearNeedNextStep(step = "name") {
  const currentSnapshot = gearNeedMachine.resolveState({
    ...getInitialSnapshot(gearNeedMachine),
    value: step
  });
  const snapshot = getNextSnapshot(gearNeedMachine, currentSnapshot, { type: "NEXT" });
  return String(snapshot.value || step);
}

export function getGearNeedPreviousStep(step = "name") {
  const currentSnapshot = gearNeedMachine.resolveState({
    ...getInitialSnapshot(gearNeedMachine),
    value: step
  });
  const snapshot = getNextSnapshot(gearNeedMachine, currentSnapshot, { type: "BACK" });
  return String(snapshot.value || step);
}

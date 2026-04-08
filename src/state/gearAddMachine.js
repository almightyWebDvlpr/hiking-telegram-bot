import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const GEAR_ADD_STEPS = ["name", "quantity", "field", "save"];

export const gearAddMachine = createMachine({
  id: "gearAdd",
  initial: "name",
  states: {
    name: {
      on: {
        NEXT: "quantity"
      }
    },
    quantity: {
      on: {
        NEXT: "field",
        BACK: "name"
      }
    },
    field: {
      on: {
        NEXT: "save",
        BACK: "quantity"
      }
    },
    save: {
      on: {
        BACK: "field"
      }
    }
  }
});

export function getGearAddNextStep(step = "name") {
  const currentSnapshot = gearAddMachine.resolveState({
    ...getInitialSnapshot(gearAddMachine),
    value: step
  });
  const snapshot = getNextSnapshot(gearAddMachine, currentSnapshot, { type: "NEXT" });
  return String(snapshot.value || step);
}

export function getGearAddPreviousStep(step = "name") {
  const currentSnapshot = gearAddMachine.resolveState({
    ...getInitialSnapshot(gearAddMachine),
    value: step
  });
  const snapshot = getNextSnapshot(gearAddMachine, currentSnapshot, { type: "BACK" });
  return String(snapshot.value || step);
}

export function isGearAddStep(step = "") {
  return GEAR_ADD_STEPS.includes(step);
}

import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const FOOD_ADD_STEPS = ["name", "weight", "quantity", "cost"];

export const foodAddMachine = createMachine({
  id: "foodAdd",
  initial: "name",
  states: {
    name: {
      on: {
        NEXT: "weight"
      }
    },
    weight: {
      on: {
        NEXT: "quantity",
        BACK: "name"
      }
    },
    quantity: {
      on: {
        NEXT: "cost",
        BACK: "weight"
      }
    },
    cost: {
      on: {
        BACK: "quantity"
      }
    }
  }
});

export function getFoodAddNextStep(step = "name") {
  const currentSnapshot = foodAddMachine.resolveState({
    ...getInitialSnapshot(foodAddMachine),
    value: step
  });
  const snapshot = getNextSnapshot(foodAddMachine, currentSnapshot, { type: "NEXT" });
  return String(snapshot.value || step);
}

export function getFoodAddPreviousStep(step = "name") {
  const currentSnapshot = foodAddMachine.resolveState({
    ...getInitialSnapshot(foodAddMachine),
    value: step
  });
  const snapshot = getNextSnapshot(foodAddMachine, currentSnapshot, { type: "BACK" });
  return String(snapshot.value || step);
}

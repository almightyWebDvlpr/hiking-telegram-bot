import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const EXPENSE_ADD_STEPS = ["title", "quantity", "price"];

export const expenseAddMachine = createMachine({
  id: "expenseAdd",
  initial: "title",
  states: {
    title: {
      on: {
        NEXT: "quantity"
      }
    },
    quantity: {
      on: {
        NEXT: "price",
        BACK: "title"
      }
    },
    price: {
      on: {
        BACK: "quantity"
      }
    }
  }
});

export function getExpenseAddNextStep(step = "title") {
  const currentSnapshot = expenseAddMachine.resolveState({
    ...getInitialSnapshot(expenseAddMachine),
    value: step
  });
  const snapshot = getNextSnapshot(expenseAddMachine, currentSnapshot, { type: "NEXT" });
  return String(snapshot.value || step);
}

export function getExpenseAddPreviousStep(step = "title") {
  const currentSnapshot = expenseAddMachine.resolveState({
    ...getInitialSnapshot(expenseAddMachine),
    value: step
  });
  const snapshot = getNextSnapshot(expenseAddMachine, currentSnapshot, { type: "BACK" });
  return String(snapshot.value || step);
}

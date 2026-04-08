import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const loanedGearMachine = createMachine({
  id: "loanedGear",
  initial: "pick",
  states: {
    pick: { on: { NEXT: "action" } },
    action: { on: { BACK: "pick" } }
  }
});

function getSnapshot(step = "pick") {
  return loanedGearMachine.resolveState({
    ...getInitialSnapshot(loanedGearMachine),
    value: step
  });
}

export function getLoanedGearNextStep(step = "pick") {
  const snapshot = getNextSnapshot(loanedGearMachine, getSnapshot(step), { type: "NEXT" });
  return String(snapshot.value || step);
}

export function getLoanedGearPreviousStep(step = "pick") {
  const snapshot = getNextSnapshot(loanedGearMachine, getSnapshot(step), { type: "BACK" });
  return String(snapshot.value || step);
}

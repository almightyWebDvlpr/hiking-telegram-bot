import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const tripCreateMachine = createMachine({
  id: "tripCreate",
  initial: "name",
  states: {
    name: { on: { NEXT: "startDate" } },
    startDate: { on: { NEXT: "endDate" } },
    endDate: { on: { NEXT: "gearStatus" } },
    gearStatus: { on: { NEXT: "confirm" } },
    confirm: {}
  }
});

function getSnapshot(step = "name") {
  return tripCreateMachine.resolveState({
    ...getInitialSnapshot(tripCreateMachine),
    value: step
  });
}

export function getTripCreateNextStep(step = "name") {
  const snapshot = getNextSnapshot(tripCreateMachine, getSnapshot(step), { type: "NEXT" });
  return String(snapshot.value || step);
}

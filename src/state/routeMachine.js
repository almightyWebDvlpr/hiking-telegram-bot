import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const routeMachine = createMachine({
  id: "route",
  initial: "from",
  states: {
    from: { on: { NEXT: "to" } },
    to: { on: { NEXT: "stops", BACK: "from" } },
    stops: { on: { NEXT: "region", BACK: "to" } },
    region: { on: { NEXT: "confirm", BACK: "stops" } },
    confirm: { on: { BACK: "region" } }
  }
});

function getSnapshot(step = "from") {
  return routeMachine.resolveState({
    ...getInitialSnapshot(routeMachine),
    value: step
  });
}

export function getRouteNextStep(step = "from") {
  const snapshot = getNextSnapshot(routeMachine, getSnapshot(step), { type: "NEXT" });
  return String(snapshot.value || step);
}

export function getRoutePreviousStep(step = "from") {
  const snapshot = getNextSnapshot(routeMachine, getSnapshot(step), { type: "BACK" });
  return String(snapshot.value || step);
}

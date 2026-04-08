import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const TRIP_CARD_STEPS = [
  "name",
  "startDate",
  "endDate",
  "gearStatus",
  "meetingPoint",
  "meetingDate",
  "meetingTime",
  "confirm"
];

export const tripCardMachine = createMachine({
  id: "tripCard",
  initial: "name",
  states: {
    name: {
      on: {
        NEXT: "startDate"
      }
    },
    startDate: {
      on: {
        NEXT: "endDate",
        BACK: "name"
      }
    },
    endDate: {
      on: {
        NEXT: "gearStatus",
        BACK: "startDate"
      }
    },
    gearStatus: {
      on: {
        NEXT: "meetingPoint",
        BACK: "endDate"
      }
    },
    meetingPoint: {
      on: {
        NEXT: "meetingDate",
        BACK: "gearStatus"
      }
    },
    meetingDate: {
      on: {
        NEXT: "meetingTime",
        BACK: "meetingPoint"
      }
    },
    meetingTime: {
      on: {
        NEXT: "confirm",
        BACK: "meetingDate"
      }
    },
    confirm: {
      on: {
        BACK: "meetingTime"
      }
    }
  }
});

export function getTripCardNextStep(step = "name") {
  const currentSnapshot = tripCardMachine.resolveState({
    ...getInitialSnapshot(tripCardMachine),
    value: step
  });
  const snapshot = getNextSnapshot(tripCardMachine, currentSnapshot, { type: "NEXT" });
  return String(snapshot.value || step);
}

export function getTripCardPreviousStep(step = "name") {
  const currentSnapshot = tripCardMachine.resolveState({
    ...getInitialSnapshot(tripCardMachine),
    value: step
  });
  const snapshot = getNextSnapshot(tripCardMachine, currentSnapshot, { type: "BACK" });
  return String(snapshot.value || step);
}

export function isTripCardStep(step = "") {
  return TRIP_CARD_STEPS.includes(step);
}

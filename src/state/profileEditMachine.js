import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";

export const PROFILE_EDIT_STEPS = [
  "fullName",
  "birthDate",
  "gender",
  "bloodType",
  "allergies",
  "medications",
  "healthNotes",
  "phone",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelation",
  "experienceLevel",
  "city",
  "passportNumber",
  "passportIssuedBy"
];

export const profileEditMachine = createMachine({
  id: "profileEdit",
  initial: "fullName",
  states: {
    fullName: { on: { NEXT: "birthDate" } },
    birthDate: { on: { NEXT: "gender", BACK: "fullName" } },
    gender: { on: { NEXT: "bloodType", BACK: "birthDate" } },
    bloodType: { on: { NEXT: "allergies", BACK: "gender" } },
    allergies: { on: { NEXT: "medications", BACK: "bloodType" } },
    medications: { on: { NEXT: "healthNotes", BACK: "allergies" } },
    healthNotes: { on: { NEXT: "phone", BACK: "medications" } },
    phone: { on: { NEXT: "emergencyContactName", BACK: "healthNotes" } },
    emergencyContactName: { on: { NEXT: "emergencyContactPhone", BACK: "phone" } },
    emergencyContactPhone: { on: { NEXT: "emergencyContactRelation", BACK: "emergencyContactName" } },
    emergencyContactRelation: { on: { NEXT: "experienceLevel", BACK: "emergencyContactPhone" } },
    experienceLevel: { on: { NEXT: "city", BACK: "emergencyContactRelation" } },
    city: { on: { NEXT: "passportNumber", BACK: "experienceLevel" } },
    passportNumber: { on: { NEXT: "passportIssuedBy", BACK: "city" } },
    passportIssuedBy: { on: { BACK: "passportNumber" } }
  }
});

export function getProfileEditNextStep(step = "fullName") {
  const currentSnapshot = profileEditMachine.resolveState({
    ...getInitialSnapshot(profileEditMachine),
    value: step
  });
  const snapshot = getNextSnapshot(profileEditMachine, currentSnapshot, { type: "NEXT" });
  return String(snapshot.value || step);
}

export function getProfileEditPreviousStep(step = "fullName") {
  const currentSnapshot = profileEditMachine.resolveState({
    ...getInitialSnapshot(profileEditMachine),
    value: step
  });
  const snapshot = getNextSnapshot(profileEditMachine, currentSnapshot, { type: "BACK" });
  return String(snapshot.value || step);
}

export function isProfileEditStep(step = "") {
  return PROFILE_EDIT_STEPS.includes(step);
}

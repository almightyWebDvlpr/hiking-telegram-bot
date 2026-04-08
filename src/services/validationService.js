import { z } from "zod";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MEETING_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PHONE_REGEX = /^\+?[0-9()\-\s]{8,20}$/;
const BLOOD_TYPE_REGEX = /^((1|2|3|4)|(I|II|III|IV))\s?[+-]$/i;
const INVITE_CODE_REGEX = /^[A-Z0-9]{6}$/;

export const isoDateSchema = z
  .string()
  .trim()
  .regex(ISO_DATE_REGEX, "Введи дату у форматі YYYY-MM-DD.");

export const meetingTimeSchema = z
  .string()
  .trim()
  .regex(MEETING_TIME_REGEX, "Введи час у форматі HH:MM.");

export const positiveIntegerSchema = z
  .coerce
  .number()
  .int("Потрібне ціле число.")
  .positive("Число має бути більше нуля.");

export const positiveMoneySchema = z
  .coerce
  .number()
  .positive("Сума має бути більшою за нуль.");

export const nonNegativeWeightSchema = z
  .coerce
  .number()
  .nonnegative("Вага не може бути від'ємною.");

export const tripNameSchema = z
  .string()
  .trim()
  .min(1, "Назва походу не може бути порожньою.")
  .max(120, "Назва походу занадто довга.");

export const gearItemNameSchema = z
  .string()
  .trim()
  .min(2, "Назва має бути трохи детальнішою.")
  .max(120, "Назва занадто довга.");

export const meetingPointSchema = z
  .string()
  .trim()
  .min(2, "Точка збору має бути трохи детальнішою.")
  .max(160, "Точка збору занадто довга.");

export const citySchema = z
  .string()
  .trim()
  .min(2, "Вкажи місто трохи детальніше.")
  .max(80, "Назва міста занадто довга.");

export const routePlaceSchema = z
  .string()
  .trim()
  .min(2, "Вкажи точку маршруту трохи детальніше.")
  .max(120, "Назва точки маршруту занадто довга.");

export const searchQuerySchema = z
  .string()
  .trim()
  .min(2, "Введи хоча б 2 символи для пошуку.")
  .max(160, "Пошуковий запит занадто довгий.");

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(INVITE_CODE_REGEX, "Код походу має містити 6 латинських символів або цифр.");

export const profileNameSchema = z
  .string()
  .trim()
  .min(2, "Вкажи ПІБ або ім'я трохи детальніше.")
  .max(120, "ПІБ занадто довге.");

export const shortProfileTextSchema = z
  .string()
  .trim()
  .min(2, "Вкажи значення трохи детальніше.")
  .max(80, "Значення занадто довге.");

export const longProfileTextSchema = z
  .string()
  .trim()
  .min(2, "Вкажи значення трохи детальніше.")
  .max(300, "Текст занадто довгий.");

export const phoneSchema = z
  .string()
  .trim()
  .regex(PHONE_REGEX, "Введи телефон у зрозумілому форматі, наприклад +380671234567.");

export const bloodTypeSchema = z
  .string()
  .trim()
  .regex(BLOOD_TYPE_REGEX, "Введи групу крові у форматі 4+ або 2-.");

export const gearStatusSchema = z.enum(["готово", "частково готово", "збираємо"], {
  errorMap: () => ({ message: "Обери один зі статусів готовності." })
});

function buildResult(result) {
  if (result.success) {
    return {
      ok: true,
      value: result.data
    };
  }

  return {
    ok: false,
    error: result.error.issues[0]?.message || "Некоректне значення."
  };
}

export function validateIsoDate(value) {
  return buildResult(isoDateSchema.safeParse(value));
}

export function validateMeetingTime(value) {
  return buildResult(meetingTimeSchema.safeParse(value));
}

export function validatePositiveInteger(value) {
  return buildResult(positiveIntegerSchema.safeParse(value));
}

export function validatePositiveMoney(value) {
  return buildResult(positiveMoneySchema.safeParse(value));
}

export function validateNonNegativeWeight(value) {
  return buildResult(nonNegativeWeightSchema.safeParse(value));
}

export function validateTripName(value) {
  return buildResult(tripNameSchema.safeParse(value));
}

export function validateGearItemName(value) {
  return buildResult(gearItemNameSchema.safeParse(value));
}

export function validateMeetingPoint(value) {
  return buildResult(meetingPointSchema.safeParse(value));
}

export function validateGearStatus(value) {
  return buildResult(gearStatusSchema.safeParse(value));
}

export function validateCity(value) {
  return buildResult(citySchema.safeParse(value));
}

export function validateProfileName(value) {
  return buildResult(profileNameSchema.safeParse(value));
}

export function validateRoutePlace(value) {
  return buildResult(routePlaceSchema.safeParse(value));
}

export function validateSearchQuery(value) {
  return buildResult(searchQuerySchema.safeParse(value));
}

export function validateInviteCode(value) {
  return buildResult(inviteCodeSchema.safeParse(value));
}

export function validateShortProfileText(value) {
  return buildResult(shortProfileTextSchema.safeParse(value));
}

export function validateLongProfileText(value) {
  return buildResult(longProfileTextSchema.safeParse(value));
}

export function validatePhone(value) {
  return buildResult(phoneSchema.safeParse(value));
}

export function validateBloodType(value) {
  return buildResult(bloodTypeSchema.safeParse(value));
}

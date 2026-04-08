import { z } from "zod";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MEETING_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

export const meetingPointSchema = z
  .string()
  .trim()
  .min(2, "Точка збору має бути трохи детальнішою.")
  .max(160, "Точка збору занадто довга.");

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

export function validateMeetingPoint(value) {
  return buildResult(meetingPointSchema.safeParse(value));
}

export function validateGearStatus(value) {
  return buildResult(gearStatusSchema.safeParse(value));
}

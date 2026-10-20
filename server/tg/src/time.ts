/** Местные дата и время телефона - как LocalDateTime.now() в приложении. */
import { minutes, segments } from "../../shared/schedule";
import type { Lesson, Slot } from "../../shared/types";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-19" */
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "08:30" */
export const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** Минуты от полуночи с долями - для полосы хода. */
export const minuteOf = (d: Date) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
/** Сколько минут до [to] (минуты от полуночи), с округлением вверх, как minutesUntil в приложении. */
export const minutesUntil = (from: number, to: string) => Math.ceil(minutes(to) - from);

/** Перемены внутри пары долями её длины - разрывы на полосе хода. */
export function breakFractions(l: Lesson, slots: Slot[]): [number, number][] {
  const s = minutes(l.start);
  const total = minutes(l.end) - s;
  return segments(l, slots)
    .filter((p) => p.isBreak)
    .map((p) => [(minutes(p.start) - s) / total, (minutes(p.end) - s) / total]);
}

/** Подпись под названием: необязательность, аудитория, преподаватель. */
export const where = (l: Lesson) => [l.optional && "необязательная", l.room_ru, l.teacher].filter(Boolean).join(" · ");

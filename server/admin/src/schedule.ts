/**
 * Какие пары идут в какую дату - та же логика, что Schedule.kt в приложении:
 * неделя считается от первого понедельника, перенос подменяет день недели, 0 - выходной.
 * Даты - строки "ГГГГ-ММ-ДД", считаем в UTC, чтобы часовой пояс не сдвигал дни.
 */
import type { GroupData } from "./api";
import type { Lesson } from "./xlsx";

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(iso + "T00:00:00Z");
export const addDays = (iso: string, n: number) => new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);
/** 1 = понедельник … 7 = воскресенье */
export const weekday = (iso: string) => ((new Date(ms(iso)).getUTCDay() + 6) % 7) + 1;
export const weekOf = (week1: string, iso: string) => Math.floor((ms(iso) - ms(week1)) / DAY / 7) + 1;
export const mondayOfWeek = (week1: string, week: number) => addDays(week1, (week - 1) * 7);

export function today(): string {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((x) => String(x).padStart(2, "0")).join("-");
}

type Sched = Pick<GroupData, "lessons" | "shifts" | "meta">;

export function lessonsOn(g: Sched, iso: string): Lesson[] {
  const day = g.shifts[iso] ?? weekday(iso);
  if (day === 0) return [];
  const w = weekOf(g.meta.week1_monday, iso);
  return g.lessons
    .filter((l) => l.day === day && w >= l.weeks[0] && w <= l.weeks[1])
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Следующие даты пар по тому же предмету - до какой показывать домашку. */
export function nextDates(g: Sched, l: Lesson, iso: string, n = 5): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 120 && out.length < n; i++) {
    const d = addDays(iso, i);
    if (lessonsOn(g, d).some((x) => x.name_ru === l.name_ru)) out.push(d);
  }
  return out;
}

/** Правки на подряд идущие даты с одним значением сливаются: 1-7 октября - одна строка. */
export function shiftRanges(shifts: Record<string, number>) {
  const out: { from: string; to: string; day: number }[] = [];
  for (const d of Object.keys(shifts).sort()) {
    const last = out.at(-1);
    if (last && last.day === shifts[d] && addDays(last.to, 1) === d) last.to = d;
    else out.push({ from: d, to: d, day: shifts[d] });
  }
  return out;
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

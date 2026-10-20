/**
 * Подписи как в приложении (MainActivity.kt, Schedule.kt): заголовок дня, «1 ч 08 мин», код предмета
 * для сетки недели - и разбор того, что ввели в поле кода группы. text.test.ts сверяет случаи UiTextTest.
 */
import { addDays, weekday } from "../../shared/schedule";
import { DAYS } from "../../shared/text";

// даты словами - общие с ботом
export { DAYS, DAYS_SHORT, dayLabel, humanDate } from "../../shared/text";

/** Заголовок дня: соседние дни - словами, дальше - день недели. */
export function dayTitle(iso: string, today: string): string {
  if (iso === today) return "Сегодня";
  if (iso === addDays(today, 1)) return "Завтра";
  if (iso === addDays(today, -1)) return "Вчера";
  return DAYS[weekday(iso) - 1];
}

/** Сколько осталось словами: 68 -> «1 ч 08 мин». */
export const humanMinutes = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, "0")} мин` : `${m} мин`;

const LETTER = /\p{L}/u;
const UPPER = /\p{Lu}/u;

/**
 * Короткий код предмета для сетки недели: аббревиатура из слов,
 * готовое сокращение вроде ООП - как есть, одно слово - первые четыре буквы.
 */
export function shortCode(name: string): string {
  const words = name.split(" ").filter((w) => w.length > 2 && LETTER.test(w));
  const abbr = words.find((w) => [...w].every((c) => !LETTER.test(c) || UPPER.test(c)));
  if (abbr) return abbr;
  return words.length >= 2 ? words.slice(0, 3).map((w) => w[0].toUpperCase()).join("") : [...name].slice(0, 4).join("");
}

/** A6-413 -> 413, а спорткомплекс оставляем как есть - ячейка обрежет сама. */
export const shortRoom = (room: string) => room.slice(room.lastIndexOf("-") + 1);

const CODE = /^[a-z0-9]{1,32}$/i;

/**
 * Что ввели в поле: код группы («gtu47z»), ссылку-приглашение (…/g/gtu47z),
 * ссылку на бота (t.me/dnui_schedule_bot?start=… или ?startapp=…). null - ни то, ни другое.
 */
export function parseCode(input: string): string | null {
  const s = input.trim();
  if (CODE.test(s)) return s.toLowerCase();
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(s) ? s : "https://" + s);
  } catch {
    return null;
  }
  const code =
    u.pathname.match(/\/g\/([^/]+)\/?$/)?.[1] ??
    u.searchParams.get("startapp") ??
    u.searchParams.get("start") ??
    u.searchParams.get("group");
  return code && CODE.test(code) ? code.toLowerCase() : null;
}

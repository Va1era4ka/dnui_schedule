/**
 * Когда что напомнить - та же логика, что nextEvent в Notifier.kt, events.test.ts сверяет те же случаи,
 * что NotifierTest. Приложению нужно ближайшее событие, чтобы завести будильник, серверу - все события
 * с прошлого запуска cron: отсюда eventsBetween, правила - одни.
 * Момент - "ГГГГ-ММ-ДДTЧЧ:ММ" по местным часам группы: такие строки сравниваются как текст.
 */
import { addDays, lessonsOn, minutes, type Sched } from "./schedule";
import type { Lesson } from "./types";

export type Event =
  /** Вечером: что будет завтра, в дату [date]. */
  | { kind: "digest"; at: string; date: string }
  /** За N минут до конца пары: какая следующая, null - эта последняя. */
  | { kind: "nextUp"; at: string; current: Lesson; next: Lesson | null }
  /** За SOON_MIN минут до начала первой пары дня или пары после большой перемены. */
  | { kind: "soon"; at: string; lesson: Lesson };

/** Что человек включил - как в настройках приложения. */
export interface Prefs {
  digestOn: boolean;
  /** когда присылать сводку, "ЧЧ:ММ" */
  digestAt: string;
  nextUpOn: boolean;
  /** за сколько минут до конца пары предупредить о следующей */
  leadMin: number;
}

export const SOON_MIN = 20;

/** Сдвиг момента на [n] минут - и через полночь. */
export const addMinutes = (at: string, n: number) =>
  new Date(Date.parse(at + ":00Z") + n * 60_000).toISOString().slice(0, 16);

/** События, которые дают пары даты [iso], - в том же порядке, что в приложении. */
function eventsOf(g: Sched, iso: string, p: Prefs): Event[] {
  const out: Event[] = [];
  const tomorrow = addDays(iso, 1);
  // Молчим, если завтра пар нет - иначе каждую пятницу прилетает "завтра ничего".
  if (p.digestOn && lessonsOn(g, tomorrow).length) out.push({ kind: "digest", at: `${iso}T${p.digestAt}`, date: tomorrow });
  if (p.nextUpOn) {
    const day = lessonsOn(g, iso);
    day.forEach((l, i) => {
      out.push({ kind: "nextUp", at: addMinutes(`${iso}T${l.end}`, -p.leadMin), current: l, next: day[i + 1] ?? null });
      // Обычная перемена 20 минут - там хватает nextUp с прошлой пары.
      const prev = day[i - 1];
      if (!prev || minutes(prev.end) + SOON_MIN < minutes(l.start)) {
        out.push({ kind: "soon", at: addMinutes(`${iso}T${l.start}`, -SOON_MIN), lesson: l });
      }
    });
  }
  return out;
}

/**
 * События в промежутке (from, to] по времени. Промежутки встык ничего не теряют и не повторяют:
 * cron рассылает от прошлого запуска до этого.
 */
export function eventsBetween(g: Sched, from: string, to: string, p: Prefs): Event[] {
  const out: Event[] = [];
  // событие бывает и накануне своей даты: «за 20 минут» до пары в 00:10 - в 23:50
  for (let d = from.slice(0, 10); d <= addDays(to.slice(0, 10), 1); d = addDays(d, 1)) {
    out.push(...eventsOf(g, d, p).filter((e) => e.at > from && e.at <= to));
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/**
 * Какие пары идут в какую дату, из чего пара состоит и какая к ней домашка - та же логика, что
 * Schedule.kt в приложении, общая для Worker, админки и Mini App. Поменял правило в одном - поменяй
 * и в другом: schedule.test.ts сверяет те же случаи, что NotifierTest, UiTextTest и SyncTest.
 *
 * Неделя считается от первого понедельника, перенос подменяет день недели, 0 - выходной,
 * правка на дату отменяет, подменяет или добавляет пару только в эту дату.
 * Даты - строки "ГГГГ-ММ-ДД", время - "ЧЧ:ММ", считаем в UTC, чтобы часовой пояс не сдвигал дни.
 */
import type { GroupData, Homework, Lesson, Slot } from "./types";

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(iso + "T00:00:00Z");
export const addDays = (iso: string, n: number) => new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);
/** 1 = понедельник … 7 = воскресенье */
export const weekday = (iso: string) => ((new Date(ms(iso)).getUTCDay() + 6) % 7) + 1;
export const weekOf = (week1: string, iso: string) => Math.floor((ms(iso) - ms(week1)) / DAY / 7) + 1;
export const mondayOfWeek = (week1: string, week: number) => addDays(week1, (week - 1) * 7);

/** Сегодня по часам устройства - для страниц в браузере. В Worker часы в UTC, ему не годится. */
export function today(): string {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((x) => String(x).padStart(2, "0")).join("-");
}

export type Sched = Pick<GroupData, "lessons" | "shifts" | "meta" | "changes">;

/** Правка пары на дату: undefined - её нет, null - пара отменена, иначе - что идёт вместо. */
export const changeOf = (g: Sched, iso: string, id: string) => {
  const c = g.changes?.[iso];
  return c && Object.hasOwn(c, id) ? c[id] : undefined;
};

/**
 * Замена приходит с id исходной пары - к нему привязана домашка этой даты.
 * [withCancelled] - вместе с отменёнными в эту дату: админке их надо показать, чтобы вернуть.
 */
export function lessonsOn(g: Sched, iso: string, withCancelled = false): Lesson[] {
  const day = g.shifts[iso] ?? weekday(iso);
  if (day === 0) return [];
  const w = weekOf(g.meta.week1_monday, iso);
  const added = Object.entries(g.changes?.[iso] ?? {}).flatMap(([id, c]) =>
    c?.added && !g.lessons.some((l) => l.id === id) ? [{ ...c, id, day, weeks: [w, w] as [number, number] }] : [],
  );
  return g.lessons
    .filter((l) => l.day === day && w >= l.weeks[0] && w <= l.weeks[1])
    .flatMap((l) => {
      const c = changeOf(g, iso, l.id);
      if (c === undefined) return [l];
      // от исходной у замены только id, день и недели: необязательность и раскладка - свои, как в приложении
      return c ? [{ ...c, id: l.id, day: l.day, weeks: l.weeks }] : withCancelled ? [l] : [];
    })
    .concat(added)
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

export const minutes = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3);
const hm = (m: number) => [Math.floor(m / 60), m % 60].map((x) => String(x).padStart(2, "0")).join(":");

/**
 * Куски пары по сетке, как в Schedule.kt: у каждой пары сетки 45 + 10 + 45, между ними - перемена
 * до следующей. Не совпадает с сеткой - [] (одним куском).
 */
export function defaultParts(start: string, end: string, slots: Slot[]): number[] {
  const covered = slots.filter((s) => s.start >= start && s.end <= end).sort((a, b) => a.start.localeCompare(b.start));
  if (!covered.length || covered[0].start !== start || covered.at(-1)!.end !== end) return [];
  return covered.flatMap((s, i) => {
    const gap = i ? [minutes(s.start) - minutes(covered[i - 1].end)] : [];
    const d = minutes(s.end) - minutes(s.start);
    const half = Math.floor((d - 10) / 2);
    return [...gap, ...(d >= 60 ? [half, 10, d - 10 - half] : [d])];
  });
}

/** Раскладка пары: своя из админки, если сходится с длиной пары, иначе по сетке. */
export function partsOf(l: Pick<Lesson, "start" | "end" | "parts">, slots: Slot[]): number[] {
  const own = l.parts;
  if (own && own.length % 2 === 1 && own.reduce((a, b) => a + b, 0) === minutes(l.end) - minutes(l.start)) return own;
  return defaultParts(l.start, l.end, slots);
}

/** Кусок пары: занятие или перемена внутри неё. */
export interface Part {
  start: string;
  end: string;
  isBreak: boolean;
}

/** Перемена между парами сдвоенной: внутри пары она 10 минут, между парами - 20. */
const BIG_BREAK_MIN = 15;
export const isBigBreak = (p: Part) => p.isBreak && minutes(p.end) - minutes(p.start) >= BIG_BREAK_MIN;

/** Пара по кускам со временем: 08:00-08:45 занятие, 08:45-08:55 перемена, … */
export function segments(l: Pick<Lesson, "start" | "end" | "parts">, slots: Slot[]): Part[] {
  const parts = partsOf(l, slots);
  if (!parts.length) return [{ start: l.start, end: l.end, isBreak: false }];
  let t = minutes(l.start);
  return parts.map((m, i) => {
    const p = { start: hm(t), end: hm(t + m), isBreak: i % 2 === 1 };
    t += m;
    return p;
  });
}

const ORDINALS = ["Первая", "Вторая", "Третья"];

/**
 * Где мы внутри идущей пары в момент [t], если впереди или сейчас перемена:
 * «Перемена в 08:45», «Перемена до 08:55», у сдвоенной - «Первая пара до 09:40».
 * null - перемен больше нет или пара не идёт.
 */
export function phase(l: Pick<Lesson, "start" | "end" | "parts">, slots: Slot[], t: string): string | null {
  const segs = segments(l, slots);
  const i = segs.findIndex((s) => t >= s.start && t < s.end);
  if (i < 0) return null;
  const cur = segs[i];
  if (cur.isBreak) return (isBigBreak(cur) ? "Большая перемена до " : "Перемена до ") + cur.end;
  const next = segs.slice(i + 1).find((s) => s.isBreak);
  if (!next) return null;
  if (!isBigBreak(next)) return "Перемена в " + next.start;
  const n = segs.slice(0, i + 1).filter(isBigBreak).length + 1;
  return (ORDINALS[n - 1] ?? `${n}-я`) + " пара до " + next.start;
}

/**
 * Из чего пара: «45 мин · перемена 10 · 45 мин», у сдвоенной - обе пары и что в каждой.
 * null - пара одним куском, рассказывать нечего.
 */
export function structure(l: Pick<Lesson, "start" | "end" | "parts">, slots: Slot[]): string | null {
  const segs = segments(l, slots);
  if (segs.length === 1) return null;
  const pairs: Part[][] = [[]];
  for (const s of segs) {
    if (isBigBreak(s)) pairs.push([]);
    else pairs.at(-1)!.push(s);
  }
  const length = (s: Part) => minutes(s.end) - minutes(s.start);
  const inner = (p: Part[]) => p.map((s) => (s.isBreak ? `перемена ${length(s)}` : `${length(s)} мин`)).join(" · ");
  if (pairs.length === 1) return inner(pairs[0]);
  const head = pairs.length === 2 ? "Сдвоенная: " : `${pairs.length} пары подряд: `;
  const ranges = pairs.map((p) => `${p[0].start}–${p.at(-1)!.end}`).join(" и ");
  const inners = [...new Set(pairs.map(inner))];
  return head + ranges + (inners.length === 1 ? "\nв каждой " + inners[0] : "");
}

/** Номер пары -> её начало по всем парам группы (сдвоенная пара 1 - раннее начало). */
export function slotStarts(g: Sched): { n: number; start: string }[] {
  // замены и добавленные на дату тоже бывают в новом слоте; правка пары, которую потом убрали, - ни к чему
  const ids = new Set(g.lessons.map((l) => l.id));
  const changed = Object.values(g.changes ?? {}).flatMap((day) =>
    Object.entries(day).flatMap(([id, c]) => (c && (ids.has(id) || c.added) ? [c] : [])),
  );
  const starts = new Map<number, string>();
  for (const l of [...g.lessons, ...changed]) {
    const s = starts.get(l.slot);
    if (s === undefined || l.start < s) starts.set(l.slot, l.start);
  }
  return [...starts].sort((a, b) => a[0] - b[0]).map(([n, start]) => ({ n, start }));
}

/**
 * Колонка дня для сетки недели: пара (или пусто) и сколько слотов она занимает.
 * Сдвоенная пара идёт одной записью 08:00-11:40 - это два слота, а не один.
 */
export function column(g: Sched, iso: string): { lesson: Lesson | null; span: number }[] {
  const day = lessonsOn(g, iso);
  const slots = slotStarts(g);
  const out: { lesson: Lesson | null; span: number }[] = [];
  for (let i = 0; i < slots.length; ) {
    const l = day.find((x) => x.slot === slots[i].n) ?? null;
    const span = l ? slots.filter((s) => s.start >= l.start && s.start < l.end).length : 1;
    out.push({ lesson: l, span });
    i += Math.max(span, 1);
  }
  return out;
}

/** Насколько далеко смотрим по предмету назад: семестр, дальше домашку не задают. */
const HORIZON = 120;

/**
 * Прошлые занятия по тому же предмету, ближайшее первым - там задают домашку к этой паре.
 * Пары того же дня, что начались раньше, тоже в счёт.
 */
export function* earlier(g: Sched, l: Lesson, iso: string): Generator<{ lesson: Lesson; date: string }> {
  for (let back = 0; back <= HORIZON; back++) {
    const d = addDays(iso, -back);
    const same = lessonsOn(g, d).filter((x) => x.name_ru === l.name_ru && (d < iso || x.start < l.start));
    for (const x of same.reverse()) yield { lesson: x, date: d };
  }
}

/**
 * Домашка к паре [l] в дату [iso] - заданная на прошлых по предмету: где задали и текст.
 * Без пометки «до» видна только на следующей паре, с пометкой - вплоть до той даты.
 */
export function homeworkFor(g: Sched & Pick<GroupData, "homework">, l: Lesson, iso: string): { date: string; text: string } | null {
  if (!g.homework.length) return null;
  // дата в ключе - всегда последние 10 символов, разделитель не нужен
  const byKey = new Map(g.homework.map((h) => [h.lesson + h.date, h]));
  let i = 0;
  for (const p of earlier(g, l, iso)) {
    const h = byKey.get(p.lesson.id + p.date);
    const visible = h && (h.until ? iso <= h.until : i === 0);
    if (h?.text && visible) return { date: p.date, text: h.text };
    i++;
  }
  return null;
}

/** Что задали на самой этой паре - пропустившим пару тоже надо знать. */
export const homeworkAt = (g: Pick<GroupData, "homework">, l: Lesson, iso: string): Homework | null =>
  g.homework.find((h) => h.lesson === l.id && h.date === iso) ?? null;

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

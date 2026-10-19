import { expect, it } from "vitest";
import { type Event, eventsBetween, type Prefs } from "./events";
import { addDays, lessonsOn } from "./schedule";
import type { Lesson } from "./types";

// Те же случаи, что NotifierTest в приложении: ломается порядок событий или пропуск пустого дня -
// падает и там, и здесь.

const lesson = (day: number, slot: number, start: string, end: string, name: string, weeks: [number, number] = [1, 16]): Lesson => ({
  id: `${day}-${slot}-${name}`, name, name_ru: name, weeks, teacher: "t", room: "A6-1", room_ru: "A6-1",
  building: "A6", building_ru: "A6", day, slot, start, end,
});
const group = (lessons: Lesson[], shifts: Record<string, number> = {}) => ({
  lessons,
  meta: { week1_monday: "2026-08-31", weeks: 16 },
  shifts,
});

// Пн: две пары. Вт: одна. Ср: одна, только первые 8 недель. Чт и Пт пустые.
const s = group([
  lesson(1, 1, "08:00", "09:40", "первая"),
  lesson(1, 2, "10:00", "11:40", "вторая"),
  lesson(2, 1, "08:00", "09:40", "вторник"),
  lesson(3, 1, "08:00", "09:40", "среда", [1, 8]),
]);
const ALL: Prefs = { digestOn: true, digestAt: "20:00", nextUpOn: true, leadMin: 5 };

/** Ближайшее событие после [now] - то, на что приложение заводит будильник (оно смотрит на две недели). */
const next = (now: string, g = s, p = ALL): Event | undefined =>
  eventsBetween(g, now, `${addDays(now.slice(0, 10), 14)}T23:59`, p)[0];

it("диапазон недель отсекает предмет", () => {
  expect(lessonsOn(s, "2026-09-02")).toHaveLength(1); // неделя 1, среда
  expect(lessonsOn(s, "2026-11-04")).toEqual([]); // неделя 10, среда
});

it("во время первой пары ждём сигнал за 5 минут до её конца", () => {
  expect(next("2026-08-31T08:30")).toMatchObject({
    kind: "nextUp",
    at: "2026-08-31T09:35",
    current: { name: "первая" },
    next: { name: "вторая" },
  });
});

it("у последней пары дня следующей нет", () => {
  expect(next("2026-08-31T10:30")).toMatchObject({ kind: "nextUp", at: "2026-08-31T11:35", next: null });
});

it("после пар ближайшее - вечерняя сводка про завтра", () => {
  expect(next("2026-08-31T12:00")).toEqual({ kind: "digest", at: "2026-08-31T20:00", date: "2026-09-01" });
});

it("сводка молчит, если завтра пар нет", () => {
  // Вт вечер: среда есть - сводка. Ср вечер: четверг пуст - пропуск, ближайшая - в вс перед понедельником.
  expect(next("2026-09-02T12:00")).toMatchObject({ kind: "digest", at: "2026-09-06T20:00" });
  // переносы тоже в счёт: вторник - выходной, в пустой четверг - пары за понедельник
  const shifted = group(s.lessons, { "2026-09-01": 0, "2026-09-03": 1 });
  const digests = eventsBetween(shifted, "2026-08-31T12:00", "2026-09-03T00:00", { ...ALL, nextUpOn: false });
  expect(digests.map((e) => e.kind === "digest" && e.date)).toEqual(["2026-09-02", "2026-09-03"]);
});

it("за 20 минут до первой пары и после большой перемены, но не после обычной", () => {
  const s2 = group([...s.lessons, lesson(1, 3, "13:20", "15:00", "третья")]);
  expect(next("2026-08-31T06:00", s2)).toMatchObject({ kind: "soon", at: "2026-08-31T07:40", lesson: { name: "первая" } });
  expect(next("2026-08-31T09:45", s2)?.kind).toBe("nextUp"); // перемена 20 минут
  expect(next("2026-08-31T11:45", s2)).toMatchObject({ kind: "soon", at: "2026-08-31T13:00", lesson: { name: "третья" } });
});

it("выключенные типы не стреляют", () => {
  expect(next("2026-08-31T12:00", s, { ...ALL, digestOn: false, nextUpOn: false })).toBeUndefined();
});

it("промежуток: начало не входит, конец входит, события по времени", () => {
  expect(eventsBetween(s, "2026-08-31T09:34", "2026-08-31T09:35", ALL)).toHaveLength(1);
  expect(eventsBetween(s, "2026-08-31T09:35", "2026-08-31T09:36", ALL)).toEqual([]);
  expect(eventsBetween(s, "2026-08-31T00:00", "2026-09-01T00:00", ALL).map((e) => `${e.kind} ${e.at.slice(11)}`)).toEqual([
    "soon 07:40",
    "nextUp 09:35",
    "nextUp 11:35",
    "digest 20:00",
  ]);
});

it("cron поминутно рассылает ровно то же, что за сутки разом, - без потерь и повторов", () => {
  const p = { ...ALL, digestAt: "23:58", leadMin: 15 };
  // пара сразу после полуночи: «за 20 минут» до неё - ещё накануне
  const g = group([...s.lessons, lesson(2, 0, "00:10", "01:00", "ночная")]);
  const from = "2026-08-31T00:00";
  const to = "2026-09-02T00:00";
  const ticks: Event[] = [];
  for (let t = from; t < to; ) {
    const n = new Date(Date.parse(t + ":00Z") + 60_000).toISOString().slice(0, 16);
    ticks.push(...eventsBetween(g, t, n, p));
    t = n;
  }
  const whole = eventsBetween(g, from, to, p);
  expect(ticks).toEqual(whole);
  expect(whole.find((e) => e.kind === "soon" && e.lesson.name === "ночная")?.at).toBe("2026-08-31T23:50");
});

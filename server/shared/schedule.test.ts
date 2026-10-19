import { expect, it } from "vitest";
import fixture from "../../fixtures/schedule.1.json";
import {
  column,
  defaultParts,
  earlier,
  homeworkAt,
  homeworkFor,
  lessonsOn,
  nextDates,
  partsOf,
  phase,
  shiftRanges,
  structure,
  weekOf,
} from "./schedule";
import type { GroupData, Lesson } from "./types";

// Тот же эталон, что у тестов приложения: случаи отсюда есть в NotifierTest, UiTextTest и SyncTest.
const fx = fixture as unknown as Pick<GroupData, "meta" | "slots" | "lessons">;
const g = (shifts: Record<string, number> = {}) => ({ lessons: fx.lessons, meta: fx.meta, shifts });
const names = (iso: string, shifts?: Record<string, number>) => lessonsOn(g(shifts), iso).map((l) => l.id);
const byId = (id: string) => fx.lessons.find((l) => l.id === id)!;
// сервер отдаёт замену без id, дня и недель
const { id: _, day: __, weeks: ___, ...other } = fx.lessons[0];

/** Расписание из одних пар, как в NotifierTest: семестр с 31 августа. */
const lesson = (day: number, slot: number, start: string, end: string, name: string): Lesson => ({
  id: `${day}-${slot}-${name}`, name, name_ru: name, weeks: [1, 16], teacher: "t", room: "A6-1", room_ru: "A6-1",
  building: "A6", building_ru: "A6", day, slot, start, end,
});
const plain = (lessons: Lesson[]) => ({ lessons, meta: { week1_monday: "2026-08-31", weeks: 16 }, shifts: {} });

it("неделя от первого понедельника, диапазон недель отсекает пару", () => {
  expect(weekOf("2026-08-31", "2026-08-31")).toBe(1);
  expect(weekOf("2026-08-31", "2026-09-06")).toBe(1); // вс той же недели
  expect(weekOf("2026-08-31", "2026-09-24")).toBe(4);
  // пн 1-й пары: до 8-й недели разговорный, с 9-й - китайский
  expect(names("2026-08-31")[0]).toBe("1-1-汉语口语1-1");
  expect(names("2026-10-26")[0]).toBe("1-1-汉语1-9");
});

it("выходной пустой, перенос ставит пары другого дня", () => {
  expect(names("2026-10-01", { "2026-10-01": 0 })).toEqual([]);
  expect(names("2026-09-27", { "2026-09-27": 1 })).toEqual(names("2026-09-28"));
});

it("правка на дату: отмена и замена только в свою дату", () => {
  const bd = "4-3-金融大数据分析-1";
  const c = { ...g(), changes: { "2026-10-08": { [bd]: null }, "2026-10-22": { [bd]: { ...other, name_ru: "Физра" } } } };
  const ids = (iso: string, all = false) => lessonsOn(c, iso, all).map((l) => l.id);
  expect(ids("2026-10-08")).not.toContain(bd);
  expect(ids("2026-10-08", true)).toContain(bd);
  expect(ids("2026-10-15")).toContain(bd);
  // замена - под id исходной пары, но с чужим названием: для «следующей пары по предмету» её нет
  expect(lessonsOn(c, "2026-10-22").find((l) => l.id === bd)?.name_ru).toBe("Физра");
  expect(nextDates(c, byId(bd), "2026-10-01", 2)).toEqual(["2026-10-15", "2026-10-29"]);
});

it("у замены от исходной пары только id, день и недели - необязательность и раскладка свои", () => {
  const base = { ...fx.lessons[0], optional: true, parts: [40, 20, 40] };
  const c = { ...g(), lessons: [base], changes: { "2026-08-31": { [base.id]: other } } };
  const l = lessonsOn(c, "2026-08-31")[0];
  expect(l).toMatchObject({ id: base.id, day: 1, weeks: [1, 8] });
  expect(l.optional).toBeUndefined();
  expect(partsOf(l, fx.slots)).toEqual([45, 10, 45]); // по сетке, а не 40 + 20 + 40 исходной
});

it("пара, добавленная на дату, - только в эту дату и только с added", () => {
  const c = { ...g(), changes: { "2026-10-10": { x: { ...other, added: true } }, "2026-10-11": { y: other } } };
  expect(lessonsOn(c, "2026-10-10").find((l) => l.id === "x")).toMatchObject({ day: 6, weeks: [6, 6] });
  expect(lessonsOn(c, "2026-10-17").map((l) => l.id)).not.toContain("x");
  expect(lessonsOn(c, "2026-10-11").map((l) => l.id)).not.toContain("y"); // правка пары, которой нет, - не добавление
});

it("следующие пары по предмету идут в обход выходных", () => {
  expect(nextDates(g({ "2026-10-01": 0 }), byId("4-3-金融大数据分析-1"), "2026-09-24", 2)).toEqual(["2026-10-08", "2026-10-15"]);
});

it("соседние даты с одной правкой сливаются в диапазон", () => {
  expect(shiftRanges({ "2026-10-02": 0, "2026-10-01": 0, "2026-10-03": 0, "2026-09-27": 1 })).toEqual([
    { from: "2026-09-27", to: "2026-09-27", day: 1 },
    { from: "2026-10-01", to: "2026-10-03", day: 0 },
  ]);
});

it("пара по сетке: 45 + 10 + 45, сдвоенная - две таких через перемену, своя из админки", () => {
  expect(defaultParts("08:00", "09:40", fx.slots)).toEqual([45, 10, 45]);
  expect(defaultParts("08:00", "11:40", fx.slots)).toEqual([45, 10, 45, 20, 45, 10, 45]);
  expect(defaultParts("08:00", "09:30", fx.slots)).toEqual([]);

  const single = fx.lessons.find((l) => l.end === "09:40")!;
  const double = fx.lessons.find((l) => l.start === "08:00" && l.end === "11:40")!;
  expect(structure(single, fx.slots)).toBe("45 мин · перемена 10 · 45 мин");
  expect(structure(double, fx.slots)).toBe("Сдвоенная: 08:00–09:40 и 10:00–11:40\nв каждой 45 мин · перемена 10 · 45 мин");

  const at = (t: string) => phase(double, fx.slots, t);
  expect(at("08:30")).toBe("Перемена в 08:45");
  expect(at("08:50")).toBe("Перемена до 08:55");
  expect(at("09:00")).toBe("Первая пара до 09:40");
  expect(at("09:45")).toBe("Большая перемена до 10:00");
  expect(at("10:10")).toBe("Перемена в 10:45");
  expect(at("11:00")).toBeNull(); // дальше перемен нет - хватает «осталось»
  expect(at("07:59")).toBeNull();

  // своя раскладка из админки, если сходится по длине; не сходится - по сетке
  const own = { start: "08:00", end: "09:30", parts: [40, 5, 45] };
  expect(partsOf(own, fx.slots)).toEqual([40, 5, 45]);
  expect(partsOf({ ...own, parts: [40, 5] }, fx.slots)).toEqual([]); // 09:30 - не по сетке
  expect(structure({ ...own, parts: [40, 5] }, fx.slots)).toBeNull();
});

it("сдвоенная пара занимает в сетке два слота", () => {
  const s = plain([
    lesson(1, 2, "10:00", "11:40", "вторая"),
    lesson(3, 1, "08:00", "11:40", "ООП"), // сдвоенная: слоты 1 и 2
    lesson(3, 3, "13:20", "15:00", "китайский"),
  ]);
  const col = (iso: string) => column(s, iso).map(({ lesson: l, span }) => [l?.name ?? "-", span]);
  expect(col("2026-09-02")).toEqual([["ООП", 2], ["китайский", 1]]); // ср
  expect(col("2026-08-31")).toEqual([["-", 1], ["вторая", 1], ["-", 1]]);
});

it("прошлая пара по предмету - ближайшая назад, а не первая в семестре", () => {
  const s = plain([lesson(1, 1, "08:00", "09:40", "мат"), lesson(3, 1, "08:00", "09:40", "мат")]);
  const wed2 = "2026-09-09"; // среда второй недели
  const dates = [...earlier(s, lessonsOn(s, wed2)[0], wed2)].slice(0, 2).map((p) => p.date);
  expect(dates).toEqual(["2026-09-07", "2026-09-02"]);
});

it("домашка видна на следующей паре по предмету, с пометкой до - вплоть до даты", () => {
  const s = {
    ...g(),
    homework: [
      { lesson: "1-4-概率论与数理统计Ⅱ-1", date: "2026-09-21", text: "задачи 1-5", until: null },
      { lesson: "4-3-金融大数据分析-1", date: "2026-09-24", text: "глава 2", until: "2026-10-08" },
    ],
  };
  const tv = byId("4-4-概率论与数理统计Ⅱ-1"); // теорвер по четвергам
  expect(homeworkFor(s, tv, "2026-09-24")).toEqual({ date: "2026-09-21", text: "задачи 1-5" });
  // следующая пара по теорверу уже в понедельник - без пометки «до» дальше не тянется
  expect(homeworkFor(s, byId("1-4-概率论与数理统计Ⅱ-1"), "2026-09-28")).toBeNull();

  const bd = byId("4-3-金融大数据分析-1");
  expect(homeworkAt(s, bd, "2026-09-24")?.text).toBe("глава 2");
  expect(homeworkFor(s, bd, "2026-10-08")?.text).toBe("глава 2");
  expect(homeworkFor(s, bd, "2026-10-15")).toBeNull();
});

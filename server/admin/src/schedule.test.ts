import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { lessonsOn, nextDates, shiftRanges, weekOf } from "./schedule";

const fx = JSON.parse(readFileSync(resolve("../../fixtures/schedule.1.json"), "utf8"));
const g = (shifts: Record<string, number> = {}) => ({ lessons: fx.lessons, meta: fx.meta, shifts });
const names = (iso: string, shifts?: Record<string, number>) => lessonsOn(g(shifts), iso).map((l) => l.id);

it("неделя от первого понедельника, диапазон недель отсекает пару", () => {
  expect(weekOf("2026-08-31", "2026-09-24")).toBe(4);
  // пн 1-й пары: до 8-й недели разговорный, с 9-й - китайский
  expect(names("2026-08-31")[0]).toBe("1-1-汉语口语1-1");
  expect(names("2026-10-26")[0]).toBe("1-1-汉语1-9");
});

it("выходной пустой, перенос ставит пары другого дня", () => {
  expect(names("2026-10-01", { "2026-10-01": 0 })).toEqual([]);
  expect(names("2026-09-27", { "2026-09-27": 1 })).toEqual(names("2026-09-28"));
});

it("следующие пары по предмету идут в обход выходных", () => {
  const bd = fx.lessons.find((l: { id: string }) => l.id === "4-3-金融大数据分析-1");
  expect(nextDates(g({ "2026-10-01": 0 }), bd, "2026-09-24", 2)).toEqual(["2026-10-08", "2026-10-15"]);
});

it("соседние даты с одной правкой сливаются в диапазон", () => {
  expect(shiftRanges({ "2026-10-02": 0, "2026-10-01": 0, "2026-10-03": 0, "2026-09-27": 1 })).toEqual([
    { from: "2026-09-27", to: "2026-09-27", day: 1 },
    { from: "2026-10-01", to: "2026-10-03", day: 0 },
  ]);
});

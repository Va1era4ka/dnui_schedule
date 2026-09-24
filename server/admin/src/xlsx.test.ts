import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { diffLessons, parseXlsx, ScheduleFormatError } from "./xlsx";

// vitest запускается из server/admin
const fixture = (name: string) => resolve("../../fixtures", name);
const bytes = (name: string) => {
  const b = readFileSync(fixture(name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

// Те же эталоны, что у XlsxTest.kt в приложении: два разбора обязаны совпадать.
it.each([1, 2])("xlsx класса %i разбирается ровно в эталонный JSON", async (k) => {
  const want = JSON.parse(readFileSync(fixture(`schedule.${k}.json`), "utf8"));
  expect(await parseXlsx(bytes(`schedule.${k}.xlsx`), "2026-08-31")).toEqual(want);
});

it("не xlsx - понятная ошибка, а не падение", async () => {
  const junk = new TextEncoder().encode("просто текст").buffer;
  await expect(parseXlsx(junk as ArrayBuffer, "2026-08-31")).rejects.toThrow(new ScheduleFormatError("Это не xlsx-файл"));
});

it("разница пар: добавленные, пропавшие и изменённые по id", async () => {
  const { lessons } = await parseXlsx(bytes("schedule.1.xlsx"), "2026-08-31");
  const moved = { ...lessons[1], teacher: "Другой" };
  const d = diffLessons(lessons, [lessons[0], moved, { ...lessons[2], id: "новый" }]);
  expect(d.changed.map((l) => l.id)).toEqual([lessons[1].id]);
  expect(d.added.map((l) => l.id)).toEqual(["новый"]);
  expect(d.removed).toHaveLength(lessons.length - 2);
});

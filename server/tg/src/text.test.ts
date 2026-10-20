import { expect, it } from "vitest";
import { dayLabel, dayTitle, humanMinutes, parseCode, shortCode, shortRoom } from "./text";

// Те же случаи, что UiTextTest в приложении.

it("код предмета - аббревиатура, готовое сокращение или обрезка", () => {
  expect(shortCode("Базы данных I")).toBe("БД");
  expect(shortCode("Большие данные в финансах")).toBe("БДФ");
  expect(shortCode("Основы ООП I")).toBe("ООП");
  expect(shortCode("Frontend-разработка I")).toBe("Fron");
  expect(shortCode("Физкультура 3")).toBe("Физк");
});

it("аудитория в ячейке - номер без корпуса", () => {
  expect(shortRoom("A6-413")).toBe("413");
  expect(shortRoom("спорткомплекс")).toBe("спорткомплекс");
});

it("заголовок дня - вчера, сегодня, завтра или день недели", () => {
  const today = "2026-09-22"; // вторник
  expect(dayTitle(today, today)).toBe("Сегодня");
  expect(dayTitle("2026-09-23", today)).toBe("Завтра");
  expect(dayTitle("2026-09-21", today)).toBe("Вчера");
  expect(dayTitle("2026-09-25", today)).toBe("Пятница");
  expect(dayLabel(today)).toBe("вт, 22 сентября");
});

it("остаток времени - часы и минуты", () => {
  expect(humanMinutes(48)).toBe("48 мин");
  expect(humanMinutes(68)).toBe("1 ч 08 мин");
  expect(humanMinutes(120)).toBe("2 ч 00 мин");
});

it("в поле кода - код, ссылка-приглашение или ссылка на бота", () => {
  expect(parseCode(" GTU47Z ")).toBe("gtu47z");
  expect(parseCode("https://dnui-schedule.hsryata.com/g/gtu47z")).toBe("gtu47z");
  expect(parseCode("dnui-schedule.hsryata.com/g/gtu47z/")).toBe("gtu47z");
  expect(parseCode("https://t.me/dnui_schedule_bot?startapp=gtu47z")).toBe("gtu47z");
  expect(parseCode("t.me/dnui_schedule_bot?start=gtu47z")).toBe("gtu47z");
  expect(parseCode("raspisanie://connect?server=https%3A%2F%2Fx&group=abc")).toBe("abc");
  expect(parseCode("моя группа")).toBeNull();
  expect(parseCode("https://t.me/dnui_schedule_bot")).toBeNull();
  expect(parseCode("https://x/g/../etc")).toBeNull();
});

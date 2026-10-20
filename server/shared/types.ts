/**
 * Расписание группы так, как его отдаёт сервер (docs/api.md). Общие типы Worker, админки и Mini App.
 */

/** Пара по расписанию - формат ассетов приложения, эталон разбора xlsx - fixtures/. */
export interface Lesson {
  id: string;
  name: string;
  name_ru: string;
  weeks: [number, number];
  teacher: string;
  room: string;
  room_ru: string;
  building: string;
  building_ru: string;
  day: number;
  slot: number;
  start: string;
  end: string;
  /** необязательная пара - только из админки, в выгрузке такого нет */
  optional?: boolean;
  /** минуты по очереди: занятие, перемена, занятие… - только из админки, иначе по сетке (defaultParts) */
  parts?: number[];
}

export interface Slot {
  n: number;
  start: string;
  end: string;
}

/** Пара в конкретный день: всё, кроме id, дня недели и недель - они остаются от пары по расписанию. */
export type DayLesson = Omit<Lesson, "id" | "day" | "weeks"> & {
  /** новая пара только на эту дату, под своим id - не замена пары из расписания */
  added?: boolean;
};

/** Домашка: задали на паре [lesson] в дату [date], [until] - докуда показывать на следующих парах. */
export interface Homework {
  lesson: string;
  date: string;
  text: string;
  until: string | null;
}

/** Расписание группы - как его видит приложение (публичный GET). */
export interface GroupData {
  code: string;
  title: string;
  rev: number;
  meta: { title?: string; week1_monday: string; weeks: number };
  slots: Slot[];
  lessons: Lesson[];
  shifts: Record<string, number>;
  homework: Homework[];
  /**
   * Правки на одну дату: дата -> id пары -> null (отменена), что идёт вместо неё или добавленная пара (added).
   * Нет в ответе, закэшированном до появления правок (304).
   */
  changes?: Record<string, Record<string, DayLesson | null>>;
}

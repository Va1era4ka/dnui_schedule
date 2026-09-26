import type { Lesson, Slot } from "./xlsx";

/** Группа в списке админки. */
export interface GroupInfo {
  code: string;
  title: string;
  listed: number;
  rev: number;
  updated_at: string;
  updated_by: string | null;
}

/** Расписание группы - как его видит приложение (публичный GET). */
/** Пара в конкретный день: всё, кроме id, дня недели и недель - они остаются от пары по расписанию. */
export type DayLesson = Omit<Lesson, "id" | "day" | "weeks">;

export interface GroupData {
  code: string;
  title: string;
  rev: number;
  meta: { week1_monday: string; weeks: number };
  slots: Slot[];
  lessons: Lesson[];
  shifts: Record<string, number>;
  homework: { lesson: string; date: string; text: string; until: string | null }[];
  /**
   * Правки на одну дату: дата -> id пары -> null (отменена) или что идёт вместо неё.
   * Нет в ответе, закэшированном до появления правок (304).
   */
  changes?: Record<string, Record<string, DayLesson | null>>;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method,
      // кончилась сессия Access - он отвечает редиректом на свою страницу входа, ловим его сами
      redirect: "manual",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Нет связи с сервером", 0);
  }
  if (r.type === "opaqueredirect" || r.status === 401) {
    throw new ApiError("Сессия входа закончилась - обновите страницу", 401);
  }
  const data = await r.json().catch(() => ({}));
  if (r.ok) return data as T;
  if (r.status === 409) {
    throw new ApiError("Расписание группы уже кто-то поменял - обновите страницу, чтобы не затереть его правки", 409);
  }
  throw new ApiError(data.message ?? (r.status === 404 ? "Не найдено" : `Ошибка сервера ${r.status}`), r.status);
}

export const api = {
  me: () => call<{ email: string }>("GET", "/v1/admin/me"),
  groups: () => call<{ groups: GroupInfo[] }>("GET", "/v1/admin/groups").then((r) => r.groups),
  group: (code: string) => call<GroupData>("GET", `/v1/groups/${code}`),
  create: (g: { title: string; week1_monday: string; listed: boolean; slots?: Slot[]; lessons?: Lesson[] }) =>
    call<{ code: string; rev: number }>("POST", "/v1/admin/groups", g),
  patch: (code: string, fields: { title?: string; week1_monday?: string; listed?: boolean }) =>
    call<{ rev: number }>("PATCH", `/v1/admin/groups/${code}`, fields),
  remove: (code: string) => call<unknown>("DELETE", `/v1/admin/groups/${code}`),
  lessons: (code: string, rev: number, slots: Slot[], lessons: Lesson[]) =>
    call<{ rev: number }>("PUT", `/v1/admin/groups/${code}/lessons`, { rev, slots, lessons }),
  // id пары бывает с иероглифами и пробелами - в путь только закодированным
  homework: (code: string, lesson: string, date: string, text: string, until: string | null) =>
    call<{ rev: number }>("PUT", `/v1/admin/groups/${code}/homework/${encodeURIComponent(lesson)}/${date}`, { text, until }),
  dropHomework: (code: string, lesson: string, date: string) =>
    call<{ rev: number }>("DELETE", `/v1/admin/groups/${code}/homework/${encodeURIComponent(lesson)}/${date}`),
  /** null - отменить пару в эту дату, объект - что идёт вместо неё */
  change: (code: string, lesson: string, date: string, repl: DayLesson | null) =>
    call<{ rev: number }>("PUT", `/v1/admin/groups/${code}/changes/${encodeURIComponent(lesson)}/${date}`, { lesson: repl }),
  dropChange: (code: string, lesson: string, date: string) =>
    call<{ rev: number }>("DELETE", `/v1/admin/groups/${code}/changes/${encodeURIComponent(lesson)}/${date}`),
  shift: (code: string, date: string, day: number) =>
    call<{ rev: number }>("PUT", `/v1/admin/groups/${code}/shifts/${date}`, { day }),
  dropShift: (code: string, date: string) => call<{ rev: number }>("DELETE", `/v1/admin/groups/${code}/shifts/${date}`),
};

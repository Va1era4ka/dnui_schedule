/**
 * Сервер: настройки человека - /tg/api/me (вход по initData), расписание группы - публичный /v1.
 * Последние ответы лежат в localStorage: Mini App открывается сразу, свежее подтягивается следом.
 */
import type { GroupData } from "../../shared/types";
import { initData } from "./telegram";

/** Настройки человека - как их отдаёт /tg/api/me. */
export interface Me {
  group: string | null;
  digest_on: boolean;
  digest_at: string;
  next_up_on: boolean;
  lead_min: number;
  /** бот может писать: нажал «Старт» или разрешил из Mini App */
  can_write: boolean;
  onboarded: boolean;
}
export type Notify = Pick<Me, "digest_on" | "digest_at" | "next_up_on" | "lead_min">;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = path.startsWith("/tg/") ? { authorization: "tma " + initData() } : {};
  if (body !== undefined) headers["content-type"] = "application/json";
  let r: Response;
  try {
    r = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("Нет связи с сервером", 0);
  }
  const data = await r.json().catch(() => ({}));
  if (r.ok) return data as T;
  throw new ApiError(data.message ?? (r.status === 404 ? "Не найдено" : `Ошибка сервера ${r.status}`), r.status);
}

export const api = {
  me: () => call<Me>("GET", "/tg/api/me"),
  save: (patch: Partial<Notify> & { group?: string; onboarded?: true }) => call<Me>("PUT", "/tg/api/me", patch),
  groups: () => call<{ groups: { code: string; title: string }[] }>("GET", "/v1/groups").then((r) => r.groups),
  group: (code: string) => call<GroupData>("GET", `/v1/groups/${code}`),
};

// localStorage бывает недоступен (приватный режим, чистка данных) - тогда просто без кэша
export function cached<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
export function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // без кэша Mini App просто дольше открывается
  }
}

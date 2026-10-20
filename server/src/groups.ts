/**
 * Группы целиком, как их отдаёт GET /v1/groups/{code}: и для приложений, и для рассылки бота.
 * Одним батчем - это одна транзакция: rev, переносы, правки на дату и домашка из одного состояния базы.
 */
import type { DayLesson, GroupData, Homework, Lesson } from "../shared/types";

interface GroupRow {
  code: string;
  title: string;
  week1_monday: string;
  slots_json: string;
  lessons_json: string;
  rev: number;
}

/** Список одним параметром - JSON-массивом: у D1 параметров на запрос не больше сотни. */
export const IN = "IN (SELECT value FROM json_each(?))";

/** [homework] = false - без домашки: рассылке она нужна, только когда есть что прислать. */
export async function loadGroups(db: D1Database, codes: string[], homework = true): Promise<Map<string, GroupData>> {
  const list = JSON.stringify(codes);
  const [groups, shifts, changes, hw] = await db.batch([
    db.prepare(`SELECT code, title, week1_monday, slots_json, lessons_json, rev FROM groups WHERE code ${IN}`).bind(list),
    db.prepare(`SELECT group_code, date, day FROM shifts WHERE group_code ${IN} ORDER BY date`).bind(list),
    db.prepare(`SELECT group_code, date, lesson_id, lesson_json FROM changes WHERE group_code ${IN} ORDER BY date, lesson_id`).bind(list),
    ...(homework ? [homeworkOf(db, codes)] : []),
  ]);
  const out = new Map<string, GroupData>();
  for (const r of groups.results as unknown as GroupRow[]) {
    const lessons: Lesson[] = JSON.parse(r.lessons_json);
    out.set(r.code, {
      code: r.code,
      title: r.title,
      rev: r.rev,
      meta: { title: r.title, week1_monday: r.week1_monday, weeks: Math.max(0, ...lessons.map((l) => l.weeks[1])) },
      slots: JSON.parse(r.slots_json),
      lessons,
      shifts: {},
      homework: [],
      changes: {},
    });
  }
  for (const s of shifts.results as { group_code: string; date: string; day: number }[]) {
    out.get(s.group_code)!.shifts[s.date] = s.day;
  }
  for (const c of changes.results as { group_code: string; date: string; lesson_id: string; lesson_json: string | null }[]) {
    const day = (out.get(c.group_code)!.changes![c.date] ??= {});
    day[c.lesson_id] = c.lesson_json ? (JSON.parse(c.lesson_json) as DayLesson) : null;
  }
  if (hw) addHomework(out, hw.results as (Homework & { group_code: string })[]);
  return out;
}

/** Домашка групп - запрос для батча, ответ раскладывает addHomework. */
export const homeworkOf = (db: D1Database, codes: string[]) =>
  db
    .prepare(`SELECT group_code, lesson_id AS lesson, date, text, until FROM homework WHERE group_code ${IN} ORDER BY date, lesson_id`)
    .bind(JSON.stringify(codes));

export function addHomework(groups: Map<string, GroupData>, rows: (Homework & { group_code: string })[]) {
  for (const { group_code, ...h } of rows) groups.get(group_code)?.homework.push(h);
}

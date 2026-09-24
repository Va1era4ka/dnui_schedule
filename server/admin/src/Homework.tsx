import { useState } from "react";
import { api, type GroupData } from "./api";
import { nextDates, today, weekday } from "./schedule";
import { Card, DAYS, ErrorText, humanDate } from "./ui";
import { HomeworkEditor } from "./Week";

/** Вся домашка группы, свежая сверху. Добавляют её на вкладке «Неделя» - у конкретной пары. */
export function Homework({ data, onSaved }: { data: GroupData; onSaved: () => void }) {
  const [edit, setEdit] = useState<{ lesson: string; date: string } | null>(null);
  const [error, setError] = useState("");
  const [showPast, setShowPast] = useState(false);
  const byId = new Map(data.lessons.map((l) => [l.id, l]));
  // «прошла» - когда студенты её уже не видят: позади дата «до», а без неё - следующая пара по предмету
  const now = today();
  const all = [...data.homework].sort((a, b) => b.date.localeCompare(a.date) || a.lesson.localeCompare(b.lesson));
  const visibleTill = (h: (typeof all)[number]) => {
    const l = byId.get(h.lesson);
    return h.until ?? (l && nextDates(data, l, h.date, 1)[0]) ?? h.date;
  };
  const shown = showPast ? all : all.filter((h) => visibleTill(h) >= now);
  const hidden = all.length - shown.length;
  const editing = edit && byId.get(edit.lesson);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Добавить домашку - на вкладке «Неделя», у пары, на которой её задали.</p>
      {!all.length && <p className="text-muted">Домашки пока нет.</p>}
      <ErrorText>{error}</ErrorText>
      {shown.map((h) => {
        const l = byId.get(h.lesson);
        return (
          <Card key={h.lesson + h.date}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted">
                  {DAYS[weekday(h.date) - 1]}, {humanDate(h.date)} · {l ? l.name_ru : "пары больше нет в расписании"}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{h.text}</p>
                <p className="mt-1 text-xs text-muted">
                  {h.until ? `видна до ${humanDate(h.until)}` : "видна на следующей паре"}
                </p>
              </div>
              {l ? (
                <button className="text-sm font-semibold text-primary" onClick={() => setEdit(h)}>
                  Изменить
                </button>
              ) : (
                <button
                  className="text-sm text-error"
                  onClick={() => api.dropHomework(data.code, h.lesson, h.date).then(onSaved, (e: Error) => setError(e.message))}
                >
                  Удалить
                </button>
              )}
            </div>
          </Card>
        );
      })}
      {(hidden > 0 || showPast) && (
        <button className="text-sm text-primary" onClick={() => setShowPast((v) => !v)}>
          {showPast ? "Скрыть прошедшую" : `Прошедшая · ${hidden}`}
        </button>
      )}
      {editing && edit && (
        <HomeworkEditor data={data} lesson={editing} date={edit.date} onClose={() => setEdit(null)} onSaved={onSaved} />
      )}
    </div>
  );
}

import { useState } from "react";
import { api, type GroupData } from "./api";
import { datesBetween, shiftRanges, today, weekday } from "./schedule";
import { Button, Card, DAYS, DAYS_FULL, ErrorText, Field, humanDate, inputClass } from "./ui";

/** «1–7 октября · выходные», «вс, 27 сентября · пары за понедельник» - как в настройках приложения. */
function label(r: { from: string; to: string; day: number }) {
  const period =
    r.from === r.to
      ? `${DAYS[weekday(r.from) - 1].toLowerCase()}, ${humanDate(r.from)}`
      : r.from.slice(0, 7) === r.to.slice(0, 7)
        ? `${+r.from.slice(8)}–${humanDate(r.to)}`
        : `${humanDate(r.from)} – ${humanDate(r.to)}`;
  const what = r.day ? `пары за ${DAYS_FULL[r.day - 1]}` : r.from === r.to ? "выходной" : "выходные";
  return `${period} · ${what}`;
}

export function Shifts({ data, onSaved }: { data: GroupData; onSaved: () => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [day, setDay] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);

  // ponytail: по запросу на дату - на пару недель каникул хватает; массовый PUT, если понадобятся семестры
  const run = async (write: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await write();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    onSaved();
  };
  const holidays = () => {
    const [a, b] = [from, to || from].sort();
    const dates = datesBetween(a, b);
    if (dates.length > 60) return setError("Больше 60 дней за раз - разбейте на части");
    run(async () => {
      for (const d of dates) await api.shift(data.code, d, 0);
      setFrom("");
      setTo("");
    });
  };

  const now = today();
  const ranges = shiftRanges(data.shifts);
  const past = ranges.filter((r) => r.to < now);
  const shown = showPast ? ranges : ranges.filter((r) => r.to >= now);

  return (
    <div className="space-y-4">
      <Card title="Выходные и переносы">
        {!ranges.length && <p className="text-sm text-muted">Пары идут по обычной сетке.</p>}
        {shown.map((r) => (
          <div key={r.from} className="flex items-center gap-3">
            <span className={`flex-1 ${r.to < now ? "text-muted" : ""}`}>{label(r)}</span>
            <button
              className="text-sm text-error disabled:opacity-40"
              disabled={busy}
              onClick={() => run(async () => {
                for (const d of datesBetween(r.from, r.to)) await api.dropShift(data.code, d);
              })}
            >
              Убрать
            </button>
          </div>
        ))}
        {past.length > 0 && (
          <button className="text-sm text-primary" onClick={() => setShowPast((v) => !v)}>
            {showPast ? "Скрыть прошедшие" : `Прошедшие · ${past.length}`}
          </button>
        )}
        <ErrorText>{error}</ErrorText>
      </Card>

      <Card title="Выходные">
        <div className="grid grid-cols-2 gap-3">
          <Field label="С">
            <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="По" hint="Один день - оставьте пустым">
            <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Button disabled={busy || !from} onClick={holidays}>
          Добавить выходные
        </Button>
      </Card>

      <Card title="Учебный день">
        <p className="text-sm text-muted">Перенос: в этот день идут пары другого дня недели - например, в воскресенье пары за понедельник.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата">
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Пары за">
            <select className={inputClass} value={day} onChange={(e) => setDay(+e.target.value)}>
              {DAYS_FULL.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button disabled={busy || !date} onClick={() => run(async () => { await api.shift(data.code, date, day); setDate(""); })}>
          Добавить учебный день
        </Button>
      </Card>
    </div>
  );
}

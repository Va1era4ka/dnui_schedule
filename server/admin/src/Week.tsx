import { useState } from "react";
import { api, type GroupData } from "./api";
import { addDays, lessonsOn, mondayOfWeek, nextDates, today, weekday, weekOf } from "./schedule";
import { Button, DAYS_FULL, ErrorText, Field, humanDate, inputClass, Modal } from "./ui";
import type { Lesson, Slot } from "./xlsx";

type Edit = { kind: "lesson"; lesson: Lesson | null; day: number } | { kind: "hw"; lesson: Lesson; date: string } | null;

const badge = "rounded-full px-2.5 py-0.5 text-xs";

/** Неделя по дням: пары с домашкой на эту дату, правка пар и домашки. */
export function Week({ data, onSaved }: { data: GroupData; onSaved: () => void }) {
  const current = weekOf(data.meta.week1_monday, today());
  const [week, setWeek] = useState(Math.max(1, current));
  const [edit, setEdit] = useState<Edit>(null);
  const monday = mondayOfWeek(data.meta.week1_monday, week);
  // сб и вс - только если туда что-то попало: пары, перенос или выходной
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter(
    (d) => weekday(d) <= 5 || d in data.shifts || lessonsOn(data, d).length > 0,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button kind="outline" className="w-12 shrink-0 px-0" aria-label="Предыдущая неделя" onClick={() => setWeek((w) => w - 1)}>
          ‹
        </Button>
        <button className="h-12 min-w-0 flex-1 truncate rounded-full bg-highest px-3 text-sm font-semibold" onClick={() => setWeek(current)}>
          Неделя {week}
          {week === current ? " · текущая" : ""}
          <span className="font-normal text-muted">
            {" "}· {humanDate(monday)} – {humanDate(addDays(monday, 6))}
          </span>
        </button>
        <Button kind="outline" className="w-12 shrink-0 px-0" aria-label="Следующая неделя" onClick={() => setWeek((w) => w + 1)}>
          ›
        </Button>
      </div>

      {dates.map((d) => (
        <Day key={d} data={data} date={d} onEdit={setEdit} />
      ))}
      <p className="text-xs text-muted">Правка пары меняет её во всех неделях, где она идёт. Домашка - только на эту дату.</p>

      {edit?.kind === "hw" && (
        <HomeworkEditor data={data} lesson={edit.lesson} date={edit.date} onClose={() => setEdit(null)} onSaved={onSaved} />
      )}
      {edit?.kind === "lesson" && (
        <LessonEditor data={data} lesson={edit.lesson} day={edit.day} onClose={() => setEdit(null)} onSaved={onSaved} />
      )}
    </div>
  );
}

function Day({ data, date, onEdit }: { data: GroupData; date: string; onEdit: (e: Edit) => void }) {
  const shift = data.shifts[date];
  const wd = weekday(date);
  const lessons = lessonsOn(data, date);
  return (
    <section className="space-y-3 rounded-[22px] bg-variant p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold first-letter:uppercase">
          {DAYS_FULL[wd - 1]}, {humanDate(date)}
        </h3>
        {date === today() && <span className={`${badge} bg-primary text-on-primary`}>сегодня</span>}
        {shift === 0 && <span className={`${badge} bg-tertiary-container text-on-tertiary-container`}>выходной</span>}
        {shift > 0 && shift !== wd && (
          <span className={`${badge} bg-tertiary-container text-on-tertiary-container`}>пары за {DAYS_FULL[shift - 1]}</span>
        )}
      </div>
      {!lessons.length && shift !== 0 && <p className="text-sm text-muted">Пар нет</p>}
      {lessons.map((l) => {
        const hw = data.homework.find((h) => h.lesson === l.id && h.date === date);
        return (
          <div key={l.id} className="space-y-2 rounded-2xl bg-lowest p-3">
            <div className="flex gap-3">
              <span className="w-[5.5rem] shrink-0 text-sm font-semibold text-primary">
                {l.start}–{l.end}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{l.name_ru}</p>
                <p className="text-sm text-muted">
                  {l.room_ru} · {l.teacher} · недели {l.weeks[0]}–{l.weeks[1]}
                </p>
              </div>
            </div>
            {hw && (
              <p className="rounded-xl bg-primary-container px-3 py-2 text-sm text-on-primary-container">
                ДЗ: {hw.text}
                {hw.until ? ` · до ${humanDate(hw.until)}` : ""}
              </p>
            )}
            <div className="flex gap-4 text-sm">
              <button className="font-semibold text-primary" onClick={() => onEdit({ kind: "hw", lesson: l, date })}>
                {hw ? "Изменить домашку" : "+ Домашка"}
              </button>
              <button className="text-muted" onClick={() => onEdit({ kind: "lesson", lesson: l, day: l.day })}>
                Изменить пару
              </button>
            </div>
          </div>
        );
      })}
      {shift !== 0 && (
        <button className="text-sm font-semibold text-primary" onClick={() => onEdit({ kind: "lesson", lesson: null, day: shift ?? wd })}>
          + Пара по дням «{DAYS_FULL[(shift ?? wd) - 1]}»
        </button>
      )}
    </section>
  );
}

/** Домашка, заданная на паре [lesson] в дату [date]. Правила показа - как у заметок в приложении. */
export function HomeworkEditor({ data, lesson, date, onClose, onSaved }: {
  data: GroupData;
  lesson: Lesson;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const hw = data.homework.find((h) => h.lesson === lesson.id && h.date === date);
  const [text, setText] = useState(hw?.text ?? "");
  const [until, setUntil] = useState<string | null>(hw?.until ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = nextDates(data, lesson, date);
  if (hw?.until && !next.includes(hw.until)) next.push(hw.until);

  const run = async (write: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await write();
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const chip = (on: boolean) =>
    `rounded-full px-3 py-2 text-sm ${on ? "bg-primary font-semibold text-on-primary" : "bg-highest"}`;

  return (
    <Modal open onClose={onClose} title="Домашка">
      <p className="text-sm text-muted">
        {lesson.name_ru}, {humanDate(date)} - задали на этой паре. Студенты увидят её на следующей паре по предмету.
      </p>
      <textarea
        className={`${inputClass} h-auto min-h-28 py-3`}
        value={text}
        maxLength={2000}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        placeholder="Упражнения 3–5, прочитать главу 2…"
      />
      <Field label="Показывать">
        <div className="flex flex-wrap gap-2">
          <button className={chip(until === null)} onClick={() => setUntil(null)}>
            только на следующей паре
          </button>
          {next.map((d) => (
            <button key={d} className={chip(until === d)} onClick={() => setUntil(d)}>
              до {humanDate(d)}
            </button>
          ))}
        </div>
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !text.trim()} onClick={() => run(() => api.homework(data.code, lesson.id, date, text.trim(), until))}>
          Сохранить
        </Button>
        {hw && (
          <Button kind="danger" disabled={busy} onClick={() => run(() => api.dropHomework(data.code, lesson.id, date))}>
            Удалить
          </Button>
        )}
        <Button kind="outline" onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  );
}

/** Пара целиком, во всех её неделях. Новая получает id по формуле парсера, у старой id не меняется. */
function LessonEditor({ data, lesson, day, onClose, onSaved }: {
  data: GroupData;
  lesson: Lesson | null;
  day: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const first: Slot = data.slots[0] ?? { n: 1, start: "08:00", end: "09:40" };
  const [l, setL] = useState<Lesson>(
    lesson ?? {
      id: "", name: "", name_ru: "", weeks: [1, data.meta.weeks || 16], teacher: "", room: "", room_ru: "",
      building: "", building_ru: "", day, slot: first.n, start: first.start, end: first.end,
    },
  );
  const set = (patch: Partial<Lesson>) => setL((x) => ({ ...x, ...patch }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const homework = lesson ? data.homework.filter((h) => h.lesson === lesson.id).length : 0;

  const put = async (lessons: Lesson[], slots: Slot[] = data.slots) => {
    setBusy(true);
    setError("");
    try {
      lessons.sort((a, b) => a.day - b.day || a.slot - b.slot || a.weeks[0] - b.weeks[0]);
      await api.lessons(data.code, data.rev, slots, lessons);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const save = () => {
    const name_ru = l.name_ru.trim();
    if (!name_ru) return setError("Нужно название");
    if (l.weeks[0] < 1 || l.weeks[1] > 30 || l.weeks[0] > l.weeks[1]) return setError("Недели: от 1 до 30, «с» не больше «по»");
    if (l.start >= l.end) return setError("Пара должна кончаться позже, чем начинается");
    const room = l.room.trim();
    const building = room.split("-")[0];
    const next: Lesson = {
      ...l,
      name: l.name.trim() || name_ru,
      name_ru,
      teacher: l.teacher.trim(),
      room,
      room_ru: l.room_ru.trim() || room,
      building,
      building_ru: lesson?.building === building ? lesson.building_ru : building,
    };
    if (!lesson) {
      const ids = new Set(data.lessons.map((x) => x.id));
      next.id = `${next.day}-${next.slot}-${next.name}-${next.weeks[0]}`;
      while (ids.has(next.id)) next.id += "+";
    }
    // пара в слоте, которого у группы ещё нет (группа без xlsx), - слот появляется с её временем
    const slots = data.slots.some((s) => s.n === next.slot)
      ? data.slots
      : [...data.slots, { n: next.slot, start: next.start, end: next.end }].sort((a, b) => a.n - b.n);
    put(lesson ? data.lessons.map((x) => (x.id === lesson.id ? next : x)) : [...data.lessons, next], slots);
  };

  const remove = () => {
    const warn = homework ? ` У неё ${homework} записей домашки - они перестанут показываться.` : "";
    if (confirm(`Удалить пару «${lesson!.name_ru}» во всех неделях?${warn}`)) put(data.lessons.filter((x) => x.id !== lesson!.id));
  };

  const slotOptions = data.slots.length ? data.slots : [1, 2, 3, 4, 5, 6].map((n) => ({ n, start: "", end: "" }));
  return (
    <Modal open onClose={onClose} title={lesson ? "Пара" : "Новая пара"}>
      <Field label="Название">
        <input className={inputClass} value={l.name_ru} onChange={(e) => set({ name_ru: e.target.value })} autoFocus />
      </Field>
      <Field label="Название в выгрузке" hint={lesson ? undefined : "Если пусто - как русское. Из него и дня/пары/недели складывается id"}>
        <input className={inputClass} value={l.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Преподаватель">
        <input className={inputClass} value={l.teacher} onChange={(e) => set({ teacher: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Аудитория" hint="Как в выгрузке: A6-413">
          <input className={inputClass} value={l.room} onChange={(e) => set({ room: e.target.value })} />
        </Field>
        <Field label="Показывать как" hint="Если пусто - так же">
          <input className={inputClass} value={l.room_ru} onChange={(e) => set({ room_ru: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="День">
          <select className={inputClass} value={l.day} onChange={(e) => set({ day: +e.target.value })}>
            {DAYS_FULL.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Пара">
          <select
            className={inputClass}
            value={l.slot}
            onChange={(e) => {
              const s = slotOptions.find((x) => x.n === +e.target.value)!;
              set({ slot: s.n, ...(s.start && { start: s.start, end: s.end }) });
            }}
          >
            {slotOptions.map((s) => (
              <option key={s.n} value={s.n}>
                {s.n}-я{s.start ? ` · ${s.start}–${s.end}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Начало">
          <input type="time" className={inputClass} value={l.start} onChange={(e) => set({ start: e.target.value })} />
        </Field>
        <Field label="Конец" hint="Сдвоенная пара - конец второй">
          <input type="time" className={inputClass} value={l.end} onChange={(e) => set({ end: e.target.value })} />
        </Field>
        <Field label="С недели">
          <input type="number" min={1} max={30} className={inputClass} value={l.weeks[0]} onChange={(e) => set({ weeks: [+e.target.value, l.weeks[1]] })} />
        </Field>
        <Field label="По неделю">
          <input type="number" min={1} max={30} className={inputClass} value={l.weeks[1]} onChange={(e) => set({ weeks: [l.weeks[0], +e.target.value] })} />
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={save}>
          Сохранить
        </Button>
        {lesson && (
          <Button kind="danger" disabled={busy} onClick={remove}>
            Удалить пару
          </Button>
        )}
        <Button kind="outline" onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { api, type GroupData, type GroupInfo } from "./api";
import { Checkbox, mondayHint } from "./Groups";
import { Homework } from "./Homework";
import { Shifts } from "./Shifts";
import { Button, Card, DAYS, ErrorText, Field, inputClass, Link, mondayOf, navigate } from "./ui";
import { Week } from "./Week";
import { diffLessons, type Lesson, parseXlsx, type Parsed } from "./xlsx";

const TABS = [
  ["", "Неделя"],
  ["homework", "Домашка"],
  ["shifts", "Выходные"],
  ["settings", "Настройки"],
] as const;

/** Выбор xlsx: разбирается сразу в браузере, на сервер уходят уже готовые пары. */
export function XlsxInput({ onParsed }: { onParsed: (p: Parsed | null) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <input
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="block w-full text-sm text-muted file:mr-4 file:h-10 file:rounded-full file:border-0 file:bg-primary-container file:px-4 file:font-semibold file:text-on-primary-container"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          setError("");
          onParsed(null);
          if (!f) return;
          setBusy(true);
          try {
            // дата начала семестра у группы своя, в файле её нет - тут она не нужна
            onParsed(await parseXlsx(await f.arrayBuffer(), ""));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <p className="text-sm text-muted">Читаю файл…</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export function Group({ code, tab }: { code: string; tab: string }) {
  const [data, setData] = useState<GroupData | null>(null);
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    Promise.all([api.group(code), api.groups()]).then(
      ([d, list]) => {
        setData(d);
        setInfo(list.find((g) => g.code === code) ?? null);
      },
      (e: Error) => setError(e.message),
    );
  useEffect(() => {
    load();
  }, [code]);

  if (!data || !info) return error ? <ErrorText>{error}</ErrorText> : <p className="text-muted">Загружаю…</p>;
  return (
    <div className="space-y-4">
      <div>
        <Link to="/admin/" className="text-sm text-primary">
          ← Все группы
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{data.title}</h1>
        <p className="text-sm text-muted">
          код <span className="font-mono">{code}</span> · ревизия {data.rev}
        </p>
      </div>
      <nav className="flex gap-1 overflow-x-auto rounded-full bg-highest p-1">
        {TABS.map(([t, name]) => (
          <Link
            key={t}
            to={`/admin/g/${code}${t && "/" + t}`}
            className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-center text-sm ${tab === t ? "bg-primary font-semibold text-on-primary" : ""}`}
          >
            {name}
          </Link>
        ))}
      </nav>
      {tab === "" && <Week data={data} onSaved={load} />}
      {tab === "homework" && <Homework data={data} onSaved={load} />}
      {tab === "shifts" && <Shifts data={data} onSaved={load} />}
      {tab === "settings" && (
        <>
          {/* key: после сохранения поля заново берутся с сервера */}
          <Settings key={data.rev} data={data} info={info} onSaved={load} />
          <Invite code={code} />
          <Lessons data={data} onSaved={load} />
          <Danger data={data} />
        </>
      )}
    </div>
  );
}

function Settings({ data, info, onSaved }: { data: GroupData; info: GroupInfo; onSaved: () => void }) {
  const [title, setTitle] = useState(data.title);
  const [week1, setWeek1] = useState(data.meta.week1_monday);
  const [listed, setListed] = useState(!!info.listed);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const changes = {
    ...(title.trim() !== data.title && { title: title.trim() }),
    ...(week1 && mondayOf(week1) !== data.meta.week1_monday && { week1_monday: mondayOf(week1) }),
    ...(listed !== !!info.listed && { listed }),
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.patch(data.code, changes);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card title="Группа">
      <Field label="Название">
        <input className={inputClass} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Первый понедельник семестра" hint={mondayHint(week1)}>
        <input type="date" className={inputClass} value={week1} onChange={(e) => setWeek1(e.target.value)} />
      </Field>
      <Checkbox
        checked={listed}
        onChange={setListed}
        label="Показывать в списке групп"
        hint="Иначе к группе подключаются только по коду или ссылке"
      />
      <ErrorText>{error}</ErrorText>
      <Button onClick={save} disabled={busy || !title.trim() || !Object.keys(changes).length}>
        {busy ? "Сохраняю…" : "Сохранить"}
      </Button>
    </Card>
  );
}

function Invite({ code }: { code: string }) {
  const link = `${location.origin}/g/${code}`;
  const [copied, setCopied] = useState(false);
  return (
    <Card title="Ссылка для студентов">
      <p className="text-sm text-muted">
        Откроет приложение и предложит подключиться к группе. Без приложения - страница с кодом и ссылкой на APK.
      </p>
      <div className="flex gap-2">
        <input readOnly value={link} className={inputClass} onFocus={(e) => e.target.select()} />
        <Button kind="tonal" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}>
          {copied ? "Готово" : "Копировать"}
        </Button>
      </div>
      <p className="text-sm text-muted">
        Код группы: <span className="font-mono text-base font-semibold text-fg">{code}</span>
      </p>
    </Card>
  );
}

const describe = (l: Lesson) =>
  `${DAYS[l.day - 1]}, ${l.slot}-я пара · ${l.name_ru} · недели ${l.weeks[0]}–${l.weeks[1]}`;

function LessonList({ title, lessons }: { title: string; lessons: Lesson[] }) {
  if (!lessons.length) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">
        {title}: {lessons.length}
      </summary>
      <ul className="mt-2 space-y-1 pl-4 text-muted">
        {lessons.map((l) => (
          <li key={l.id}>{describe(l)}</li>
        ))}
      </ul>
    </details>
  );
}

function Lessons({ data, onSaved }: { data: GroupData; onSaved: () => void }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [picker, setPicker] = useState(0); // сменить key - сбросить выбранный файл
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const days = [...new Set(data.lessons.map((l) => l.day))].sort().map((d) => DAYS[d - 1]).join(", ");
  const diff = parsed && diffLessons(data.lessons, parsed.lessons);
  const removedIds = new Set(diff?.removed.map((l) => l.id));
  const orphanHomework = data.homework.filter((h) => removedIds.has(h.lesson)).length;

  const replace = async () => {
    setBusy(true);
    setError("");
    try {
      await api.lessons(data.code, data.rev, parsed!.slots, parsed!.lessons);
      setParsed(null);
      setPicker((k) => k + 1);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Card title="Расписание">
      <p>{data.lessons.length ? `${data.lessons.length} пар · ${days} · недели 1–${data.meta.weeks}` : "Пар пока нет - загрузите xlsx"}</p>
      <Field label="Заменить из xlsx" hint="Выгрузка DNUI, лист 课表. Перед заменой покажем, что изменится">
        <XlsxInput key={picker} onParsed={setParsed} />
      </Field>
      {diff && (
        <div className="space-y-3 rounded-2xl bg-lowest p-4">
          {!diff.added.length && !diff.removed.length && !diff.changed.length ? (
            <p className="text-sm">Файл совпадает с тем, что уже на сервере.</p>
          ) : (
            <>
              <p className="font-semibold">
                +{diff.added.length} · −{diff.removed.length} · изменено {diff.changed.length}
              </p>
              <LessonList title="Новые пары" lessons={diff.added} />
              <LessonList title="Пропадут" lessons={diff.removed} />
              <LessonList title="Изменятся" lessons={diff.changed} />
              {diff.removed.length > 0 && (
                <p className="rounded-xl bg-tertiary-container p-3 text-sm text-on-tertiary-container">
                  Пара, которая пропала или переехала на другой день, для приложения - другая пара. Личные заметки
                  студентов к ней перестанут показываться
                  {orphanHomework ? `, и ${orphanHomework} записей домашки тоже` : ""}.
                </p>
              )}
              <ErrorText>{error}</ErrorText>
              <div className="flex gap-2">
                <Button onClick={replace} disabled={busy}>
                  {busy ? "Заменяю…" : "Заменить расписание"}
                </Button>
                <Button kind="outline" onClick={() => (setParsed(null), setPicker((k) => k + 1))}>
                  Отмена
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Danger({ data }: { data: GroupData }) {
  const [error, setError] = useState("");
  return (
    <Card title="Удаление">
      <p className="text-sm text-muted">
        Группа пропадёт с сервера вместе с домашкой и переносами. У подключённых студентов приложение останется на
        последнем скачанном расписании и будет писать, что группа не найдена.
      </p>
      <ErrorText>{error}</ErrorText>
      <Button
        kind="danger"
        onClick={() => {
          if (!confirm(`Удалить группу «${data.title}»? Это не отменить.`)) return;
          api.remove(data.code).then(() => navigate("/admin/"), (e: Error) => setError(e.message));
        }}
      >
        Удалить группу
      </Button>
    </Card>
  );
}

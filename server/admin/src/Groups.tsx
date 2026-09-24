import { useEffect, useState } from "react";
import { api, type GroupInfo } from "./api";
import { XlsxInput } from "./Group";
import { Button, Card, ErrorText, Field, humanDate, humanStamp, inputClass, Link, mondayOf, navigate } from "./ui";
import type { Parsed } from "./xlsx";

export function Groups() {
  const [groups, setGroups] = useState<GroupInfo[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.groups().then(setGroups, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Группы</h1>
        <Button onClick={() => navigate("/admin/new")}>Новая группа</Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {groups === null && !error && <p className="text-muted">Загружаю…</p>}
      {groups?.length === 0 && <p className="text-muted">Групп пока нет.</p>}
      {groups?.map((g) => (
        <Link key={g.code} to={`/admin/g/${g.code}`} className="block rounded-[22px] bg-variant p-5 hover:bg-highest">
          <div className="flex items-start gap-3">
            <span className="flex-1 font-semibold">{g.title}</span>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs ${g.listed ? "bg-primary-container text-on-primary-container" : "bg-highest text-muted"}`}
            >
              {g.listed ? "в списке" : "по коду"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            код <span className="font-mono">{g.code}</span> · изменено {humanStamp(g.updated_at)}
            {g.updated_by ? " · " + g.updated_by : ""}
          </p>
        </Link>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-0.5 size-5 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

export function mondayHint(week1: string) {
  if (!week1) return "С него считаются учебные недели";
  const monday = mondayOf(week1);
  return monday === week1
    ? "С него считаются учебные недели"
    : `Это не понедельник - первая неделя начнётся в понедельник, ${humanDate(monday)}`;
}

export function NewGroup() {
  const [title, setTitle] = useState("");
  const [week1, setWeek1] = useState("");
  const [listed, setListed] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const { code } = await api.create({
        title: title.trim(),
        week1_monday: mondayOf(week1),
        listed,
        slots: parsed?.slots,
        lessons: parsed?.lessons,
      });
      navigate(`/admin/g/${code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/admin/" className="text-sm text-primary">
        ← Все группы
      </Link>
      <Card title="Новая группа">
        <Field label="Название" hint="Так группа видна студентам, например «留软件25401 (俄财大), класс 1»">
          <input className={inputClass} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Первый понедельник семестра" hint={mondayHint(week1)}>
          <input type="date" className={inputClass} value={week1} onChange={(e) => setWeek1(e.target.value)} />
        </Field>
        <Field label="Расписание из xlsx" hint="Выгрузка DNUI, лист 课表. Можно загрузить и потом, на странице группы">
          <XlsxInput
            onParsed={(p) => {
              setParsed(p);
              if (p && !title) setTitle(p.meta.title);
            }}
          />
        </Field>
        {parsed && <p className="text-sm">Пар в файле: {parsed.lessons.length}</p>}
        <Checkbox
          checked={listed}
          onChange={setListed}
          label="Показывать в списке групп"
          hint="Иначе к группе подключаются только по коду или ссылке"
        />
        <ErrorText>{error}</ErrorText>
        <Button onClick={create} disabled={busy || !title.trim() || !week1}>
          {busy ? "Создаю…" : "Создать группу"}
        </Button>
      </Card>
    </div>
  );
}

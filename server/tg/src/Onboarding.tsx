import { type ReactNode, useEffect, useState } from "react";
import { api, ApiError, type Me, type Notify } from "./api";
import { NotifyBlock } from "./Notify";
import { useBackButton } from "./telegram";
import { parseCode } from "./text";
import { BackLink, Block, Button, Divider, ErrorText, Icon, inputClass, SectionLabel, TITLE } from "./ui";

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-5 pt-6 pb-10">
      <h1 className={TITLE}>{title}</h1>
      {children}
    </main>
  );
}

/** Шаг 1 онбординга и смена группы из настроек: открытые группы списком или код/ссылка. */
export function GroupPicker({ onPick, onBack }: { onPick: (code: string) => Promise<void>; onBack?: () => void }) {
  const [groups, setGroups] = useState<{ code: string; title: string }[] | null>(null);
  const [listError, setListError] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useBackButton(onBack);
  useEffect(() => {
    api.groups().then(setGroups, (e: Error) => setListError(e.message));
  }, []);

  const connect = async (code: string) => {
    setBusy(code);
    setError("");
    try {
      await onPick(code);
    } catch (e) {
      setError((e as ApiError).status === 404 ? `Группа «${code}» не найдена` : (e as Error).message);
      setBusy(null);
    }
  };
  const go = () => {
    const code = parseCode(input);
    if (code) connect(code);
    else setError("Это не похоже ни на код группы, ни на ссылку");
  };

  return (
    <>
      {onBack && <BackLink onBack={onBack} />}
      <Screen title="Ваша группа">
        <p className="text-[14.5px] text-muted">
          Общее расписание группы: пары, переносы и домашка. Потом группу можно поменять в настройках.
        </p>
        <div>
          <SectionLabel>Группы</SectionLabel>
          <Block>
            {listError && <p className="px-[18px] py-4 text-[12.5px] text-error">{listError}</p>}
            {!listError && !groups && <p className="px-[18px] py-4 text-[12.5px] text-muted">Загружаю список групп…</p>}
            {groups?.length === 0 && <p className="px-[18px] py-4 text-[12.5px] text-muted">Открытых групп нет — подключайтесь по коду</p>}
            {groups?.map((g, i) => (
              <div key={g.code}>
                {i > 0 && <Divider />}
                <button
                  disabled={!!busy}
                  onClick={() => connect(g.code)}
                  className="flex w-full items-center gap-3 px-[18px] py-4 text-left"
                >
                  <span className="flex-1 text-[14.5px] font-medium">{g.title}</span>
                  {busy === g.code ? <span className="text-xs text-muted">Подключаюсь…</span> : <Icon name="chevron" className="size-5 text-muted" />}
                </button>
              </div>
            ))}
          </Block>
        </div>
        <div className="space-y-3">
          <SectionLabel>По коду</SectionLabel>
          <input
            className={inputClass}
            value={input}
            placeholder="Код группы или ссылка"
            // коды вида gtu47z: автозамена и заглавные только мешают
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            onChange={(e) => {
              setInput(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && go()}
          />
          <ErrorText>{error}</ErrorText>
          <Button className="w-full" disabled={!input.trim() || !!busy} onClick={go}>
            {busy && !groups?.some((g) => g.code === busy) ? "Подключаюсь…" : "Подключиться"}
          </Button>
        </div>
      </Screen>
    </>
  );
}

/** Открыли по ссылке t.me/dnui_schedule_bot?startapp=код: спрашиваем, подключиться ли. */
export function Invite({ code, current, onJoin, onCancel }: {
  code: string;
  /** код нынешней группы - тогда отказ оставляет её */
  current: string | null;
  onJoin: () => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.group(code).then(
      (g) => setTitle(g.title),
      (e: ApiError) => (e.status === 404 ? setMissing(true) : setError(e.message)),
    );
  }, [code]);
  const join = async () => {
    setBusy(true);
    setError("");
    try {
      await onJoin();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen title={missing ? "Группа не найдена" : "Подключиться к группе?"}>
      {missing ? (
        <p className="text-[14.5px] text-muted">Группы с кодом «{code}» нет — проверьте ссылку или выберите группу из списка.</p>
      ) : (
        <Block>
          <div className="space-y-1 p-5">
            <p className="text-[17px] font-semibold">{title ?? "Загружаю…"}</p>
            <p className="pt-3 text-xs font-bold uppercase tracking-[0.09em] text-muted">Код группы</p>
            <p className="font-mono text-3xl font-semibold tracking-[0.12em]">{code}</p>
          </div>
        </Block>
      )}
      {current && !missing && <p className="text-[12.5px] text-muted">Расписание и уведомления переключатся на эту группу.</p>}
      <ErrorText>{error}</ErrorText>
      {!missing && (
        <Button className="w-full" disabled={!title || busy} onClick={join}>
          {busy ? "Подключаюсь…" : "Подключиться"}
        </Button>
      )}
      <Button kind="outline" className="w-full" disabled={busy} onClick={onCancel}>
        {current ? "Оставить мою группу" : "Выбрать из списка"}
      </Button>
    </Screen>
  );
}

/** Шаг 2 онбординга: какие уведомления присылать. По умолчанию - только сводка вечером. */
export function NotifySetup({ me, onDone }: { me: Me; onDone: (n: Notify) => Promise<void> }) {
  const [n, setN] = useState<Notify>({
    digest_on: me.digest_on,
    digest_at: me.digest_at,
    next_up_on: me.next_up_on,
    lead_min: me.lead_min,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const done = async () => {
    setBusy(true);
    setError("");
    try {
      await onDone(n);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Screen title="Уведомления">
      <p className="text-[14.5px] text-muted">Бот пришлёт их сюда, в чат. Потом можно поменять в настройках.</p>
      <NotifyBlock value={n} onChange={(p) => setN((v) => ({ ...v, ...p }))} />
      <p className="ml-1 text-[12.5px] text-muted">Если завтра пар нет, сводки не будет.</p>
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={busy} onClick={done}>
        {busy ? "Сохраняю…" : "Готово"}
      </Button>
    </Screen>
  );
}

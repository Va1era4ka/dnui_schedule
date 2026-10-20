import { useCallback, useEffect, useRef, useState } from "react";
import type { GroupData, Lesson } from "../../shared/types";
import { api, ApiError, cached, type Me, type Notify, remember } from "./api";
import { LessonScreen } from "./Lesson";
import { GroupPicker, Invite, NotifySetup } from "./Onboarding";
import { Settings } from "./Settings";
import { askWriteAccess, closeApp, initData, openLink, startParam } from "./telegram";
import { parseCode } from "./text";
import { Today } from "./Today";
import { Button, Icon, TITLE, useNow } from "./ui";
import { Week } from "./Week";

type Tab = "today" | "week" | "settings";
const TABS = [
  ["today", "Сегодня", "list"],
  ["week", "Неделя", "week"],
  ["settings", "Настройки", "settings"],
] as const;

/**
 * Онбординг (группа, уведомления), потом вкладки «Сегодня», «Неделя», «Настройки» и экран пары поверх.
 * С прошлого открытия в localStorage лежат настройки и расписание: показываем их сразу, свежее - следом.
 */
export function App() {
  const [me, setMe] = useState(() => cached<Me>("me"));
  const [data, setData] = useState(() => cached<GroupData>("group"));
  const [error, setError] = useState<ApiError | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [invite, setInvite] = useState(() => parseCode(startParam()));
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [picked, setPicked] = useState<{ l: Lesson; date: string } | null>(null);
  const scroll = useRef(0);
  const unsaved = useRef<Partial<Notify>>({});
  const saving = useRef(0);
  const now = useNow();

  const keepMe = (m: Me) => {
    setMe(m);
    remember("me", m);
  };
  const loadGroup = useCallback(async (code: string) => {
    const g = await api.group(code);
    setData(g);
    remember("group", g);
  }, []);
  const load = useCallback(async () => {
    try {
      const m = await api.me();
      // что ещё не ушло на сервер, остаётся как на экране
      keepMe({ ...m, ...unsaved.current });
      if (m.group) await loadGroup(m.group);
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    }
  }, [loadGroup]);

  const choose = async (code: string) => {
    keepMe(await api.save({ group: code }));
    await loadGroup(code);
    setInvite(null);
    setPicking(false);
    setTab("today");
  };
  const finish = async (n: Notify) => {
    // писать в чат человек не разрешал (открыл по ссылке мимо «Старт») - спросим, ответ сервер узнает сам
    if ((n.digest_on || n.next_up_on) && !me?.can_write) await askWriteAccess();
    keepMe(await api.save({ ...n, onboarded: true }));
  };
  // Настройки меняются на экране сразу, на сервер - одним запросом через полсекунды: колесо времени
  // и быстрые переключения не плодят запросов. Не вышло - перечитываем, как есть на сервере.
  const flush = useCallback(() => {
    clearTimeout(saving.current);
    const patch = unsaved.current;
    unsaved.current = {};
    if (!Object.keys(patch).length) return;
    api.save(patch).catch((e: Error) => {
      setSettingsError(e.message);
      load();
    });
  }, [load]);
  const change = (patch: Partial<Notify>) => {
    keepMe({ ...me!, ...patch });
    setSettingsError("");
    unsaved.current = { ...unsaved.current, ...patch };
    clearTimeout(saving.current);
    saving.current = window.setTimeout(flush, 500);
  };

  useEffect(() => {
    load();
    // свернули - дописываем настройки; вернули на экран - домашку могли задать, пока Mini App висела
    const toggle = () => (document.visibilityState === "visible" ? load() : flush());
    document.addEventListener("visibilitychange", toggle);
    return () => document.removeEventListener("visibilitychange", toggle);
  }, [load, flush]);
  const open = (l: Lesson, date: string) => {
    if (!picked) scroll.current = scrollY;
    setPicked({ l, date });
  };
  const close = () => {
    setPicked(null);
    requestAnimationFrame(() => scrollTo(0, scroll.current));
  };

  if (!me) return error ? <Problem error={error} onRetry={load} /> : <Loading />;
  if (invite && invite !== me.group) {
    return <Invite code={invite} current={me.group} onJoin={() => choose(invite)} onCancel={() => setInvite(null)} />;
  }
  if (!me.group || picking) return <GroupPicker onPick={choose} onBack={picking && me.group ? () => setPicking(false) : undefined} />;
  if (!me.onboarded) return <NotifySetup me={me} onDone={finish} />;
  const group = data?.code === me.group ? data : null;
  if (!group) return error ? <Problem error={error} onRetry={load} /> : <Loading />;

  const problem = !error
    ? null
    : error.status === 401
      ? "Откройте расписание заново из чата с ботом"
      : `${error.message} · показано сохранённое`;
  return (
    <>
      {picked && <LessonScreen data={group} l={picked.l} date={picked.date} now={now} onBack={close} onPick={open} />}
      {/* вкладки не выгружаются: день и неделя, которые листали, остаются на месте */}
      <div hidden={!!picked} className="pb-[calc(84px+var(--safe-bottom))]">
        <div hidden={tab !== "today"}>
          <Today data={group} now={now} problem={problem} onRetry={load} onPick={open} />
        </div>
        <div hidden={tab !== "week"}>
          <Week data={group} now={now} onPick={open} />
        </div>
        <div hidden={tab !== "settings"}>
          <Settings
            me={me}
            title={group.title}
            error={settingsError}
            onChange={change}
            onAllowed={() => keepMe({ ...me, can_write: true })}
            onPickGroup={() => setPicking(true)}
          />
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-10 flex bg-variant px-2 pt-3 pb-[calc(12px+var(--safe-bottom))]">
          {TABS.map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                scrollTo(0, 0);
              }}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <span
                className={`flex h-8 w-16 items-center justify-center rounded-full ${tab === key ? "bg-primary-container text-on-primary-container" : "text-muted"}`}
              >
                <Icon name={icon} />
              </span>
              <span className={`text-xs ${tab === key ? "font-semibold" : "text-muted"}`}>{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}

function Loading() {
  return <p className="px-5 pt-24 text-center text-[14.5px] text-muted">Загружаю расписание…</p>;
}

/** Показать нечего: нет связи, открыли не из Telegram или initData устарел. */
function Problem({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const [title, text, action] =
    error.status === 401 && !initData()
      ? [
          "Расписание открывается в Telegram",
          "Откройте бота @dnui_schedule_bot и нажмите «Открыть расписание».",
          <Button className="w-full" onClick={() => openLink("https://t.me/dnui_schedule_bot")}>
            Открыть бота
          </Button>,
        ]
      : error.status === 401
        ? [
            "Откройте расписание заново",
            "Окно висело открытым слишком долго — закройте его и откройте расписание из чата с ботом.",
            <Button className="w-full" onClick={closeApp}>
              Закрыть
            </Button>,
          ]
        : [
            error.message,
            "Расписание ещё ни разу не загружалось, показать нечего.",
            <Button className="w-full" onClick={onRetry}>
              Повторить
            </Button>,
          ];
  return (
    <main className="mx-auto max-w-lg space-y-4 px-5 pt-16">
      <h1 className={TITLE}>{title}</h1>
      <p className="text-[14.5px] text-muted">{text}</p>
      {action}
    </main>
  );
}

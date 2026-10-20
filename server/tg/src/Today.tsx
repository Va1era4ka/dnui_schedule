import { useState } from "react";
import { addDays, homeworkFor, lessonsOn, minutes, phase, subjects, weekOf } from "../../shared/schedule";
import type { GroupData, Lesson } from "../../shared/types";
import { dayLabel, dayTitle, humanMinutes } from "./text";
import { breakFractions, dayOf, minuteOf, minutesUntil, timeOf, where } from "./time";
import { Chip, Icon, ProgressBar, TITLE, useSwipe } from "./ui";

type Tile = "past" | "now" | "next" | "later";

/** День: листается вбок, идущая или следующая пара - крупной карточкой, как «Сегодня» в приложении. */
export function Today({ data, now, problem, onRetry, onPick }: {
  data: GroupData;
  now: Date;
  /** не удалось обновить - показываем сохранённое и пишем почему */
  problem: string | null;
  onRetry: () => void;
  onPick: (l: Lesson, date: string) => void;
}) {
  const today = dayOf(now);
  // сдвиг от сегодня, а не дата: в полночь «Сегодня» само переедет на новый день
  const [offset, setOffset] = useState(0);
  const date = addDays(today, offset);
  // куда листали: день въезжает с той стороны; первый показ - плитки поднимаются по очереди
  const [dir, setDir] = useState("");
  const go = (to: number) => {
    setDir(to > offset ? "from-right" : "from-left");
    setOffset(to);
  };
  const swipe = useSwipe(() => go(offset + 1), () => go(offset - 1));
  const lessons = lessonsOn(data, date);
  const t = timeOf(now);
  const current = lessons.findIndex((l) => t < l.end);
  const names = subjects(data);

  return (
    <div {...swipe} className="min-h-[calc(100dvh-90px)]">
      <div key={date} className={dir}>
        <header className="px-5 pt-3.5 pb-3.5">
          <p className="text-xs font-bold uppercase tracking-[0.09em] text-muted">{dayLabel(date)}</p>
          <h1 className={`${TITLE} mt-1.5`}>{dayTitle(date, today)}</h1>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip className="bg-tertiary-container text-on-tertiary-container">Неделя {weekOf(data.meta.week1_monday, date)}</Chip>
            {date !== today && (
              <button onClick={() => go(0)}>
                <Chip className="bg-primary-container text-on-primary-container">К сегодня</Chip>
              </button>
            )}
          </div>
          {problem && (
            <button onClick={onRetry} className="mt-2.5 flex items-center gap-1.5 text-left text-[12.5px] text-muted">
              <Icon name="refresh" className="size-3.5" />
              {problem}
            </button>
          )}
        </header>

        {!lessons.length && (
          <div className="px-5 py-10">
            <p className="text-[21px] font-semibold">{date === today ? "Пар сегодня нет" : "Пар в этот день нет"}</p>
            <p className="mt-1.5 text-[12.5px] text-muted">Листайте вбок — соседние дни</p>
          </div>
        )}

        {lessons.map((l, i) => {
          const state: Tile =
            date > today ? "later"
            : date < today ? "past"
            : i < current || current < 0 ? "past"
            : i > current ? "later"
            : t < l.start ? "next"
            : "now";
          const big = state === "now" || state === "next";
          const prev = lessons[i - 1];
          const homework = homeworkFor(data, l, date)?.text ?? "";
          const open = () => onPick(l, date);
          return (
            <div key={l.id} className={dir ? "" : "rise"} style={dir ? undefined : { animationDelay: `${(i + 1) * 45}ms` }}>
              {prev && <BreakRow minutes={minutes(l.start) - minutes(prev.end)} />}
              <div className={`flex gap-3 px-5 ${big ? "items-start" : "items-center"}`}>
                <span className={`w-[46px] shrink-0 text-right text-[13px] font-semibold ${big ? "pt-5 text-primary" : "text-muted"}`}>
                  {l.start}
                </span>
                {big ? (
                  <Hero l={l} prev={prev} now={now} running={state === "now"} homework={homework} data={data} onClick={open} />
                ) : state === "past" ? (
                  <Past l={l} onClick={open} />
                ) : (
                  <Later l={l} color={names.indexOf(l.name_ru)} homework={homework} onClick={open} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BreakRow({ minutes }: { minutes: number }) {
  return (
    <div className="flex items-center gap-2 py-[7px] pl-[78px]">
      <span className="h-px w-4 bg-outline-variant" />
      <span className="text-xs text-muted">перемена {humanMinutes(minutes)}</span>
    </div>
  );
}

/** Крупная карточка идущей пары - или отсчёта до следующей на перемене. */
function Hero({ l, prev, now, running, homework, data, onClick }: {
  l: Lesson;
  prev?: Lesson;
  now: Date;
  running: boolean;
  homework: string;
  data: GroupData;
  onClick: () => void;
}) {
  const m = minuteOf(now);
  const start = minutes(l.start);
  // идёт - доля пройденного, ждём - отсчёт от конца прошлой пары до начала этой
  const from = running ? start : prev ? minutes(prev.end) : m;
  const to = running ? minutes(l.end) : start;
  const fraction = to <= from ? 1 : (m - from) / (to - from);
  const step = running ? phase(l, data.slots, timeOf(now)) : null;
  return (
    <button onClick={onClick} className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-[28px] bg-primary p-[18px] text-left text-on-primary">
      <div className="flex items-center gap-2">
        <Chip className={`bg-on-primary text-primary ${running ? "breathe" : ""}`}>{running ? "Идёт сейчас" : "Следующая"}</Chip>
        <span className="ml-auto text-[13px] font-semibold opacity-80">
          {l.start} – {l.end}
        </span>
      </div>
      <div>
        <p className="line-clamp-2 text-[21px] leading-[25px] font-semibold tracking-[-0.2px]">{l.name_ru}</p>
        <p className="mt-[7px] truncate text-[13px] opacity-80">{where(l)}</p>
        {/* к этой паре её и готовят - на крупной карточке домашку видно первой */}
        {homework && <p className="mt-2.5 line-clamp-2 rounded-lg bg-on-primary/15 px-2 py-1 text-[12.5px]">ДЗ: {homework}</p>}
      </div>
      <div>
        <ProgressBar
          fraction={fraction}
          gaps={running ? breakFractions(l, data.slots) : []}
          track="bg-on-primary/30"
          fill="bg-on-primary"
        />
        <div className="mt-[11px] flex items-end gap-2">
          <span className="text-[17px] font-semibold">
            {running ? `Осталось ${humanMinutes(minutesUntil(m, l.end))}` : `Начало через ${humanMinutes(minutesUntil(m, l.start))}`}
          </span>
          <span className="ml-auto text-xs opacity-80">{running ? `до ${l.end}` : `в ${l.start}`}</span>
        </div>
        {step && <p className="mt-1 text-xs opacity-80">{step}</p>}
      </div>
    </button>
  );
}

function Past({ l, onClick }: { l: Lesson; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-[58px] min-w-0 flex-1 items-center rounded-[18px] bg-variant px-4 text-left text-muted">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{l.name_ru}</span>
        <span className="block truncate text-xs">{l.room_ru}</span>
      </span>
      <Icon name="check" className="size-[18px]" />
    </button>
  );
}

function Later({ l, color, homework, onClick }: { l: Lesson; color: number; homework: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[86px] min-w-0 flex-1 items-center rounded-[22px] border border-outline-variant bg-lowest px-4 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{l.name_ru}</span>
        <span className="mt-1.5 flex items-center gap-[7px]">
          <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--s${color % 9}-fg)` }} />
          <span className="truncate text-[12.5px] text-muted">{where(l)}</span>
        </span>
        {homework && (
          <span className="mt-1.5 line-clamp-2 rounded-lg bg-primary-container px-2 py-1 text-[12.5px] text-on-primary-container">
            ДЗ: {homework}
          </span>
        )}
      </span>
      <Icon name="chevron" className="size-5 text-muted" />
    </button>
  );
}

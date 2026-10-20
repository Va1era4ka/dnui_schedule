import { useState } from "react";
import { addDays, column, lessonsOn, mondayOfWeek, slotStarts, subjects, weekday, weekOf } from "../../shared/schedule";
import type { GroupData, Lesson } from "../../shared/types";
import { DAYS_SHORT, humanDate, shortCode, shortRoom } from "./text";
import { dayOf, timeOf } from "./time";
import { SectionLabel, subjectStyle, TITLE, useSwipe } from "./ui";

const CELL_H = 90;
const GAP = 5;
/** Высота плитки на [span] слотов - вместе со съеденными промежутками. */
const cellHeight = (span: number) => CELL_H * Math.max(span, 1) + GAP * (Math.max(span, 1) - 1);

/** Сетка недели, как в приложении: листается вбок, ‹ › и «Неделя N» - к текущей. */
export function Week({ data, now, onPick }: { data: GroupData; now: Date; onPick: (l: Lesson, date: string) => void }) {
  const today = dayOf(now);
  const week1 = data.meta.week1_monday;
  const thisWeek = weekOf(week1, today);
  // сдвиг от текущей недели - в понедельник «текущая» переедет сама
  const [offset, setOffset] = useState(0);
  const week = thisWeek + offset;
  const [dir, setDir] = useState("");
  const go = (w: number) => {
    setDir(w > week ? "from-right" : "from-left");
    setOffset(w - thisWeek);
  };
  const swipe = useSwipe(() => go(week + 1), () => go(week - 1));

  const monday = mondayOfWeek(week1, week);
  // сб и вс - только если туда перенесли учебный день
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i)).filter((d) => weekday(d) <= 5 || lessonsOn(data, d).length);
  const slots = slotStarts(data);
  const names = subjects(data);
  const t = timeOf(now);
  const present = [...new Set(days.flatMap((d) => lessonsOn(data, d).map((l) => l.name_ru)))].sort();

  return (
    <div {...swipe} className="pb-6">
      <div className="flex items-end gap-3 px-5 pt-3.5">
        <h1 className={`${TITLE} flex-1`}>Неделя</h1>
        <span className="pb-1 text-[12.5px] text-muted">
          {humanDate(monday)} – {humanDate(days.at(-1)!)}
        </span>
      </div>
      <div className="flex items-center gap-2 px-5 py-3">
        <Step label="‹" title="Предыдущая неделя" onClick={() => go(week - 1)} />
        <button onClick={() => go(thisWeek)} className="h-11 flex-1 rounded-[22px] bg-highest text-[13.5px] font-bold">
          Неделя {week}
          {week === thisWeek ? " · текущая" : ""}
        </button>
        <Step label="›" title="Следующая неделя" onClick={() => go(week + 1)} />
      </div>

      {/* доигравший сдвиг снимаем - иначе он проиграется заново, когда вкладку покажут снова */}
      <div key={week} className={dir} onAnimationEnd={(e) => e.target === e.currentTarget && setDir("")}>
        <div className="grid gap-x-[5px] px-3" style={{ gridTemplateColumns: `32px repeat(${days.length}, minmax(0, 1fr))` }}>
          <span />
          {days.map((d) => (
            <span
              key={d}
              className={`mb-[5px] flex h-[26px] items-center justify-center rounded-[13px] text-xs ${d === today ? "bg-primary font-bold text-on-primary" : "font-semibold text-muted"}`}
            >
              {DAYS_SHORT[weekday(d) - 1]}
            </span>
          ))}
          <div className="flex flex-col gap-[5px]">
            {slots.map((s) => (
              <div key={s.n} style={{ height: CELL_H }} className="flex flex-col items-end justify-center">
                <span className="text-sm font-bold">{s.n}</span>
                <span className="text-[9px] text-muted">{s.start}</span>
              </div>
            ))}
          </div>
          {days.map((d) =>
            // помеченный выходной - одна плашка 休息日 на весь день
            data.shifts[d] === 0 ? (
              <div
                key={d}
                style={{ height: cellHeight(slots.length) }}
                className="flex flex-col items-center justify-center rounded-[14px] bg-variant text-[15px] text-muted"
              >
                {[..."休息日"].map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            ) : (
              <div key={d} className="flex min-w-0 flex-col gap-[5px]">
                {column(data, d).map(({ lesson: l, span }, i) =>
                  l ? (
                    <Cell
                      key={l.id}
                      l={l}
                      span={span}
                      color={names.indexOf(l.name_ru)}
                      running={d === today && t >= l.start && t < l.end}
                      onClick={() => onPick(l, d)}
                    />
                  ) : (
                    <div key={i} style={{ height: cellHeight(span) }} className="rounded-[14px] bg-variant" />
                  ),
                )}
              </div>
            ),
          )}
        </div>

        <div className="px-5 pt-3.5">
          <SectionLabel>Предметы недели</SectionLabel>
          {present.map((name) => (
            <p key={name} className="flex items-center gap-2 py-[3px] text-[11.5px]">
              <span className="size-[9px] shrink-0 rounded-full" style={{ background: subjectStyle(names.indexOf(name)).color }} />
              <span className="truncate">
                {shortCode(name)} — {name}
              </span>
            </p>
          ))}
          {!present.length && <p className="text-[12.5px] text-muted">На этой неделе пар нет</p>}
        </div>
      </div>
    </div>
  );
}

function Step({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={title} className="flex size-11 items-center justify-center rounded-full bg-highest text-xl font-bold">
      {label}
    </button>
  );
}

function Cell({ l, span, color, running, onClick }: { l: Lesson; span: number; color: number; running: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ height: cellHeight(span), ...subjectStyle(color), ...(running && { boxShadow: "inset 0 0 0 2.5px var(--primary)" }) }}
      className="flex min-w-0 flex-col rounded-[14px] px-1.5 py-2 text-left"
    >
      <span className="w-full truncate text-[11px] font-bold">{shortCode(l.name_ru)}</span>
      <span className="mt-[3px] w-full truncate text-[10px]">{shortRoom(l.room_ru)}</span>
      {running && <span className="mt-auto text-[9px] font-bold">сейчас</span>}
    </button>
  );
}

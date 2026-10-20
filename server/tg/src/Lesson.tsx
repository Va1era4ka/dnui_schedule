import { useLayoutEffect } from "react";
import { addDays, homeworkAt, homeworkFor, lessonsOn, minutes, mondayOfWeek, phase, structure, weekday, weekOf } from "../../shared/schedule";
import type { GroupData, Lesson } from "../../shared/types";
import { openLink, tg, useBackButton } from "./telegram";
import { DAYS, humanDate, humanMinutes, shortRoom } from "./text";
import { breakFractions, dayOf, minuteOf, minutesUntil, timeOf } from "./time";
import { BackLink, Button, Chip, Divider, Icon, ProgressBar, SectionLabel } from "./ui";

/** Кампус для поиска на карте - как CAMPUS в Schedule.kt. Промахивается - подставь точное название. */
const CAMPUS = "软件园校区";

/** Пара целиком: время, где, из чего состоит, домашка - и та же пара на других днях недели. */
export function LessonScreen({ data, l, date, now, onBack, onPick }: {
  data: GroupData;
  l: Lesson;
  date: string;
  now: Date;
  onBack: () => void;
  onPick: (l: Lesson, date: string) => void;
}) {
  useBackButton(onBack);
  useLayoutEffect(() => scrollTo(0, 0), [l.id, date]);
  const t = timeOf(now);
  const m = minuteOf(now);
  const running = date === dayOf(now) && t >= l.start && t < l.end;
  const step = running ? phase(l, data.slots, t) : null;
  const parts = structure(l, data.slots);
  const due = homeworkFor(data, l, date);
  const given = homeworkAt(data, l, date);
  const monday = mondayOfWeek(data.meta.week1_monday, weekOf(data.meta.week1_monday, date));
  const more = [0, 1, 2, 3, 4, 5, 6]
    .map((i) => addDays(monday, i))
    .flatMap((d) => lessonsOn(data, d).filter((x) => x.name_ru === l.name_ru && !(x.id === l.id && d === date)).map((x) => ({ x, d })));

  return (
    <div className="pb-8">
      <div className="flex h-16 items-center px-3">
        <BackLink onBack={onBack} />
        <p className="flex-1 text-center text-sm font-semibold text-muted">
          {l.slot}-я пара · {DAYS[weekday(date) - 1].toLowerCase()}, {humanDate(date)}
        </p>
        {!tg && <span className="w-12" />}
      </div>

      <section className="mx-5 space-y-3.5 rounded-[28px] bg-primary-container p-5 text-on-primary-container">
        <div className="flex flex-wrap items-center gap-2">
          {running && <Chip className="breathe bg-primary text-on-primary">Идёт сейчас</Chip>}
          {l.optional && <Chip className="bg-highest text-muted">Необязательная</Chip>}
          <span className="text-[13px] font-semibold">
            {l.start} – {l.end}
          </span>
        </div>
        <div>
          <h1 className="text-[21px] leading-[25px] font-semibold tracking-[-0.2px]">{l.name_ru}</h1>
          <p className="mt-1 text-[12.5px]">{l.name}</p>
        </div>
        {running && (
          <div>
            <ProgressBar
              fraction={(m - minutes(l.start)) / (minutes(l.end) - minutes(l.start))}
              gaps={breakFractions(l, data.slots)}
              track="bg-on-primary-container/25"
              fill="bg-primary"
            />
            <div className="mt-2.5 flex items-end gap-2">
              <span className="text-[17px] font-semibold">Осталось {humanMinutes(minutesUntil(m, l.end))}</span>
              <span className="ml-auto text-xs">прошло {humanMinutes(Math.floor(m - minutes(l.start)))}</span>
            </div>
            {step && <p className="mt-1 text-xs">{step}</p>}
          </div>
        )}
      </section>

      <section className="mx-5 mt-3.5 overflow-hidden rounded-3xl border border-outline-variant bg-lowest">
        <Info icon="person" label="Преподаватель" value={l.teacher || "—"} />
        <Divider />
        <Info icon="place" label="Аудитория" value={`${l.room_ru} · ${l.building_ru}`} />
        <Divider />
        <Info
          icon="week"
          label="Недели"
          // пара на одну дату - неделя у неё одна
          value={`${l.weeks[0] === l.weeks[1] ? `${l.weeks[0]}-я` : `${l.weeks[0]}–${l.weeks[1]}`} · ${DAYS[l.day - 1].toLowerCase()}`}
        />
        {parts && (
          <>
            <Divider />
            <Info icon="info" label="Из чего пара" value={parts} />
          </>
        )}
      </section>

      <div className="mx-5 mt-3.5">
        <Button
          kind="outline"
          className="w-full"
          onClick={() => openLink(`https://maps.apple.com/?q=${encodeURIComponent(`${CAMPUS} ${l.building}`)}`)}
        >
          {l.building} на карте
        </Button>
      </div>

      {due && <Note label={`Домашка к этой паре · задали ${humanDate(due.date)}`} text={due.text} />}
      {given && <Note label={`Задали на этой паре${given.until ? ` · до ${humanDate(given.until)}` : ""}`} text={given.text} />}

      {more.length > 0 && (
        <div className="mx-5 mt-[18px]">
          <SectionLabel>Ещё на этой неделе</SectionLabel>
          {more.map(({ x, d }) => (
            <button
              key={x.id + d}
              onClick={() => onPick(x, d)}
              className="mb-2 flex w-full items-center rounded-2xl bg-variant px-4 py-3 text-left"
            >
              <span className="flex-1 text-sm font-medium">
                {DAYS[weekday(d) - 1]}, {x.slot}-я пара
              </span>
              <span className="text-[13px] text-muted">
                {x.start} · {shortRoom(x.room_ru)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ icon, label, value }: { icon: "person" | "place" | "week" | "info"; label: string; value: string }) {
  return (
    <div className="flex min-h-[58px] items-center gap-3.5 px-[18px] py-2.5">
      <Icon name={icon} className="size-5 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-[15px] font-semibold whitespace-pre-line">{value}</p>
      </div>
    </div>
  );
}

/** Домашка с сервера - только чтение. */
function Note({ label, text }: { label: string; text: string }) {
  return (
    <div className="mx-5 mt-3.5 rounded-[18px] bg-primary-container px-4 py-3 text-on-primary-container">
      <p className="text-xs font-semibold opacity-80">{label}</p>
      <p className="mt-1 text-[14.5px] whitespace-pre-wrap">{text}</p>
    </div>
  );
}

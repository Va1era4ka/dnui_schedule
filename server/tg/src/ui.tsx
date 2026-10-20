/** Детали оформления из макета приложения (Theme.kt, Screens.kt): блоки, переключатели, полоса хода. */
import { type ButtonHTMLAttributes, type ReactNode, type TouchEvent, useEffect, useRef, useState } from "react";
import { tg } from "./telegram";

// Пути Material Icons - те же значки, что в приложении.
const ICONS = {
  list: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
  week: "M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z",
  settings:
    "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  chevron: "M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z",
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  person:
    "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  place:
    "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
  info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  refresh:
    "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
};

export function Icon({ name, className = "size-5" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`shrink-0 fill-current ${className}`}>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Крупный заголовок экрана. */
export const TITLE = "text-[30px] leading-[34px] font-bold tracking-[-0.6px]";

/** Подпись раздела: мелкие заглавные. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 ml-1 text-xs font-bold uppercase tracking-[0.09em] text-muted">{children}</h2>;
}

/** Блок настроек: строки на общей плашке. */
export function Block({ children }: { children: ReactNode }) {
  return <section className="overflow-hidden rounded-[22px] bg-variant">{children}</section>;
}

export const Divider = () => <div className="mx-[18px] h-px bg-outline-variant" />;

export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-block rounded-lg px-[9px] py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

const KINDS = {
  primary: "bg-primary text-on-primary",
  outline: "border border-outline-variant text-primary",
  text: "text-primary",
};

export function Button({ kind = "primary", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: keyof typeof KINDS }) {
  return (
    <button
      className={`h-[52px] rounded-full px-6 text-[15px] font-semibold transition-opacity disabled:opacity-40 ${KINDS[kind]} ${className}`}
      {...p}
    />
  );
}

export const inputClass =
  "h-[52px] w-full rounded-2xl border border-outline-variant bg-lowest px-4 text-base text-fg outline-primary focus:outline-2";

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors ${on ? "border-primary bg-primary" : "border-muted bg-highest"}`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 rounded-full transition-all ${on ? "left-[22px] size-6 bg-on-primary" : "left-1 size-4 bg-muted"}`}
      />
    </button>
  );
}

export function SwitchRow({ title, subtitle, on, onChange }: { title: string; subtitle: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-3.5 py-2.5 pr-3.5 pl-[18px]">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium">{title}</p>
        <p className="text-[12.5px] text-muted">{subtitle}</p>
      </div>
      <Switch on={on} onChange={onChange} label={title} />
    </div>
  );
}

/** Переключатель-пилюля: две-три кнопки в общей плашке. */
export function Segmented({ options, selected, onSelect, className = "" }: {
  options: string[];
  selected: number;
  onSelect: (i: number) => void;
  className?: string;
}) {
  return (
    <div className={`flex rounded-[22px] bg-highest p-1 ${className}`}>
      {options.map((o, i) => (
        <button
          key={o}
          onClick={() => onSelect(i)}
          className={`h-9 flex-1 rounded-[18px] text-[13.5px] transition-colors ${i === selected ? "bg-primary font-bold text-on-primary" : "font-medium"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * Полоса хода пары. [gaps] - перемены долями длины: там полоса сужается в тонкую линию,
 * занятия - отдельные куски.
 */
export function ProgressBar({ fraction, gaps = [], track, fill }: {
  fraction: number;
  gaps?: [number, number][];
  track: string;
  fill: string;
}) {
  const done = Math.min(Math.max(fraction, 0), 1);
  const edges = [0, ...gaps.flat(), 1];
  const pieces: { a: number; b: number; thin: boolean }[] = [];
  for (let i = 0; i + 1 < edges.length; i++) pieces.push({ a: edges[i], b: edges[i + 1], thin: i % 2 === 1 });
  return (
    <div className="relative h-2">
      {pieces.map(({ a, b, thin }) => (
        <div
          key={a}
          className={`absolute overflow-hidden ${thin ? "top-[3px] h-0.5" : "top-0 h-2 rounded-full"} ${track}`}
          style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }}
        >
          <div
            className={`h-full transition-[width] duration-700 ${fill}`}
            style={{ width: `${Math.min(Math.max((done - a) / (b - a), 0), 1) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/** Свайп вбок - соседний день или неделя, как листалка в приложении. */
export function useSwipe(onNext: () => void, onPrev: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onNext();
      else onPrev();
    },
  };
}

/** Часы для «осталось N мин»: раз в полминуты и сразу, как Mini App снова на экране. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}

/** Своя кнопка «назад» - только вне Telegram: там она в шапке (useBackButton). */
export function BackLink({ onBack }: { onBack: () => void }) {
  if (tg) return null;
  return (
    <button onClick={onBack} className="flex size-12 items-center justify-center rounded-full" aria-label="Назад">
      <Icon name="back" />
    </button>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  return children ? <p className="text-sm text-error">{children}</p> : null;
}

/** Цвет предмета по месту в subjects(): заливка и текст из index.css. */
export const subjectStyle = (i: number) => ({ background: `var(--s${i % 9}-bg)`, color: `var(--s${i % 9}-fg)` });

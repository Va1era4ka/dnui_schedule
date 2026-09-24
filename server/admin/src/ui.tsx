import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Переход без перезагрузки: маршруты рисует App по location.pathname. */
export function navigate(to: string) {
  history.pushState(null, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return; // в новой вкладке - как обычная ссылка
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-[22px] bg-variant p-5">
      {title && <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>}
      {children}
    </section>
  );
}

const KINDS = {
  primary: "bg-primary text-on-primary",
  tonal: "bg-primary-container text-on-primary-container",
  outline: "border border-outline-variant text-primary",
  danger: "border border-outline-variant text-error",
};

export function Button({ kind = "primary", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: keyof typeof KINDS }) {
  return (
    <button
      className={`h-12 rounded-full px-6 text-sm font-semibold transition-opacity disabled:opacity-40 ${KINDS[kind]} ${className}`}
      {...p}
    />
  );
}

export const inputClass =
  "h-12 w-full rounded-2xl border border-outline-variant bg-lowest px-4 text-fg outline-primary focus:outline-2";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  return children ? <p className="text-sm text-error">{children}</p> : null;
}

export const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** "2026-08-31" -> "31 августа" */
export const humanDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

/** Понедельник той недели, в которую попала дата: неделю семестра считают от понедельника. */
export function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** "2026-09-24 08:12:04" из SQLite (UTC) -> «24 сент., 16:12» по местному времени. */
export const humanStamp = (sqlite: string) =>
  new Date(sqlite.replace(" ", "T") + "Z").toLocaleString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

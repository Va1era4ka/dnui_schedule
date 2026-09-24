import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef } from "react";

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

/** Модальное окно на встроенном <dialog>: фон, Esc и фокус браузер делает сам. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto max-h-[90dvh] w-[min(100%-2rem,34rem)] overflow-auto rounded-[28px] bg-bg text-fg backdrop:bg-black/50"
    >
      {open && (
        <div className="space-y-4 p-6">
          <h2 className="text-xl font-semibold">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  return children ? <p className="text-sm text-error">{children}</p> : null;
}

export const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const DAYS_FULL = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
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

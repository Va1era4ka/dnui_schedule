/**
 * Telegram Mini Apps SDK (telegram-web-app.js из index.html) - только то, чем пользуемся.
 * Вне Telegram (локально в браузере) initData пустой, а кнопки и цвета шапки ничего не делают.
 */
import { useEffect, useRef } from "react";

interface WebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  colorScheme: "light" | "dark";
  platform: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  disableVerticalSwipes(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor(color: string): void;
  requestWriteAccess(cb: (granted: boolean) => void): void;
  openLink(url: string): void;
  close(): void;
  onEvent(event: "themeChanged", cb: () => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}

const sdk = window.Telegram?.WebApp;
/** Открыто в Telegram: у SDK, загруженного в обычном браузере, platform - "unknown". */
export const tg = sdk && sdk.platform !== "unknown" ? sdk : undefined;

/** Подписанный Telegram initData - им Mini App входит в /tg/api/me. Вне Telegram - пусто. */
export const initData = () => tg?.initData ?? "";

/** Код группы из ссылки t.me/dnui_schedule_bot?startapp=код. */
export const startParam = () => tg?.initDataUnsafe.start_param ?? "";

/** Тема и шапка - как у Telegram; окно на всю высоту, свайп вниз не закрывает его посреди прокрутки. */
export function startTelegram() {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const dark = tg ? tg.colorScheme === "dark" : media.matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    if (!tg?.isVersionAtLeast("6.9")) return;
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    tg.setHeaderColor(bg);
    tg.setBackgroundColor(bg);
    if (tg.isVersionAtLeast("7.10")) tg.setBottomBarColor(bg);
  };
  apply();
  if (!tg) {
    media.addEventListener("change", apply);
    return;
  }
  tg.onEvent("themeChanged", apply);
  tg.ready();
  tg.expand();
  if (tg.isVersionAtLeast("7.7")) tg.disableVerticalSwipes();
}

/** Кнопка «назад» в шапке Telegram, пока экран открыт и есть куда вернуться. Вне Telegram экран рисует свою. */
export function useBackButton(onBack?: () => void) {
  // последний обработчик - через ref, чтобы кнопка не мигала на каждой перерисовке
  const last = useRef(onBack);
  useEffect(() => {
    last.current = onBack;
  });
  const shown = !!onBack;
  useEffect(() => {
    if (!tg || !shown) return;
    const click = () => last.current?.();
    tg.BackButton.onClick(click);
    tg.BackButton.show();
    return () => {
      tg.BackButton.offClick(click);
      tg.BackButton.hide();
    };
  }, [shown]);
}

/** Спросить, можно ли боту писать; true - разрешили. На старом Telegram спросить нечем. */
export const askWriteAccess = () =>
  new Promise<boolean>((resolve) => {
    if (tg?.isVersionAtLeast("6.9")) tg.requestWriteAccess(resolve);
    else resolve(false);
  });

/** Внешняя ссылка: из Telegram - в браузер или приложение карт, иначе - новая вкладка. */
export const openLink = (url: string) => (tg ? tg.openLink(url) : window.open(url, "_blank", "noopener"));

export const closeApp = () => tg?.close();

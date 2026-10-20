/** Даты словами, как в приложении (DATE_FMT, HEADER_FMT в MainActivity.kt): ими пишут и Mini App, и бот. */
import { weekday } from "./schedule";

export const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
export const DAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** "2026-10-19" -> «19 октября» */
export const humanDate = (iso: string) => `${+iso.slice(8)} ${MONTHS[+iso.slice(5, 7) - 1]}`;

/** «пн, 19 октября» */
export const dayLabel = (iso: string) => `${DAYS_SHORT[weekday(iso) - 1].toLowerCase()}, ${humanDate(iso)}`;

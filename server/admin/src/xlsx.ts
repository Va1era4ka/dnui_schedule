/**
 * xlsx-выгрузка расписания DNUI -> пары в формате ассетов приложения.
 * Копия Xlsx.kt из приложения: оба разбора сверяются с одними эталонами в fixtures/
 * (xlsx.test.ts здесь, XlsxTest.kt там) - поменял правило в одном, поменяй и в другом.
 */

export interface Lesson {
  id: string;
  name: string;
  name_ru: string;
  weeks: [number, number];
  teacher: string;
  room: string;
  room_ru: string;
  building: string;
  building_ru: string;
  day: number;
  slot: number;
  start: string;
  end: string;
}
export interface Slot {
  n: number;
  start: string;
  end: string;
}
export interface Parsed {
  meta: { title: string; week1_monday: string; weeks: number };
  slots: Slot[];
  lessons: Lesson[];
}

/** Файл не похож на выгрузку расписания DNUI. Текст показывается как есть. */
export class ScheduleFormatError extends Error {}
const fail = (msg: string): never => {
  throw new ScheduleFormatError(msg);
};

// ponytail: словарь - копия RU из Xlsx.kt. Нет перевода - останется китайское название,
// его можно поправить после загрузки.
const RU: Record<string, string> = {
  "汉语口语1": "Разговорный китайский 1",
  "汉语1": "Китайский язык 1",
  "面向对象编程基础 I": "Основы ООП I",
  "前端开发技术 I": "Frontend-разработка I",
  "数据库原理与技术I": "Базы данных I",
  "机器学习 I": "Машинное обучение I",
  "金融大数据分析": "Большие данные в финансах",
  "概率论与数理统计Ⅱ": "Теорвер и матстатистика II",
  "体育3": "Физкультура 3",
};
const RU_BUILDING: Record<string, string> = { A6: "корпус A6", A7: "корпус A7", "体育馆": "спорткомплекс" };
const RU_ROOM: Record<string, string> = { "体育馆-羽毛球场": "спорткомплекс, корт для бадминтона" };

const CN_DAYS: Record<string, number> = {
  "星期一": 1, "星期二": 2, "星期三": 3, "星期四": 4, "星期五": 5, "星期六": 6, "星期日": 7,
};
const RE_WEEKS = /^(\d+)\s*-\s*(\d+)\s*周\s*(.*)$/;
const RE_ROOM = /^[A-Za-z]\d+-\S+$|^体育馆/;
const RE_PAIR = /\((\d+)-(\d+)节\)/;
const RE_TIME = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/;
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export async function parseXlsx(data: ArrayBuffer, week1Monday: string): Promise<Parsed> {
  try {
    return await parse(await unzip(data), week1Monday);
  } catch (e) {
    if (e instanceof ScheduleFormatError) throw e;
    throw new ScheduleFormatError("Не получилось прочитать файл: " + (e as Error).message);
  }
}

interface Entry {
  name: string | null;
  from: number;
  to: number;
  teacher: string;
  room: string | null;
}

async function parse(files: Files, week1Monday: string): Promise<Parsed> {
  const sheet = await sheetOf(files);
  const cells = await cellsOf(files, sheet);
  const key = (r: number, c: number) => r * 10000 + c;

  // какие ячейки объединены по вертикали -> пара на несколько слотов
  const spans = new Map<number, number>();
  for (const m of all(sheet, "mergeCell")) {
    const [a, b] = m.getAttribute("ref")!.split(":").map(ref);
    if (a[1] === b[1] && b[0] > a[0]) spans.set(key(a[0], a[1]), b[0]);
  }

  const rows = [...cells.keys()].map((k) => Math.floor(k / 10000));
  let hdr = 0;
  for (let r = 1; r <= 10 && !hdr; r++) {
    for (const [k, v] of cells) if (Math.floor(k / 10000) === r && v in CN_DAYS) hdr = r;
  }
  if (!hdr) fail("Не нашёл строку с днями недели (星期一, 星期二…) - это точно расписание DNUI?");
  const colDay = [...cells]
    .filter(([k, v]) => Math.floor(k / 10000) === hdr && v in CN_DAYS)
    .map(([k, v]) => [k % 10000, CN_DAYS[v]] as const)
    .sort((a, b) => a[0] - b[0]);

  const slots = new Map<number, Slot>();
  const found: { e: Entry; cell: string; day: number; slot: number; start: string; end: string; span: number }[] = [];
  const last = Math.max(...rows);
  for (let r = hdr + 1; r <= last; r++) {
    const s = slotOf(cells.get(key(r, 1)) ?? "");
    if (!s) continue;
    const [n, start, end] = s;
    slots.set(n, { n, start, end });
    for (const [col, day] of colDay) {
      const text = cells.get(key(r, col));
      if (!text) continue;
      for (const e of cellOf(text)) {
        found.push({ e, cell: colName(col) + r, day, slot: n, start, end, span: (spans.get(key(r, col)) ?? r) - r + 1 });
      }
    }
  }
  if (!found.length) fail("Не распознано ни одной пары");

  for (const f of found) {
    // сдвоенная пара -> конец следующего слота
    const tail = f.span > 1 ? slots.get(f.slot + f.span - 1) : undefined;
    if (tail) f.end = tail.end;
  }
  found.sort((a, b) => a.day - b.day || a.slot - b.slot || a.e.from - b.e.from);

  const ids = new Set<string>();
  const lessons = found.map((f): Lesson => {
    const { e } = f;
    const name = e.name!;
    const room = e.room ?? fail(`Ячейка ${f.cell}: у пары «${name}» нет аудитории`);
    if (e.from < 1 || e.from > 30 || e.to < e.from || e.to > 30) {
      fail(`Ячейка ${f.cell}: странные недели ${e.from}-${e.to} у пары «${name}»`);
    }
    const id = `${f.day}-${f.slot}-${name}-${e.from}`;
    if (ids.has(id)) fail(`Ячейка ${f.cell}: пара «${name}» записана дважды`);
    ids.add(id);
    const building = room.split("-")[0];
    return {
      name,
      weeks: [e.from, e.to],
      teacher: e.teacher,
      room,
      day: f.day,
      slot: f.slot,
      start: f.start,
      end: f.end,
      building,
      name_ru: RU[name] ?? name,
      room_ru: RU_ROOM[room] ?? room,
      building_ru: RU_BUILDING[building] ?? building,
      id,
    };
  });

  return {
    meta: {
      title: cells.get(key(1, 1)) ?? "",
      week1_monday: week1Monday,
      weeks: Math.max(...found.map((f) => f.e.to)),
    },
    slots: [...slots.values()].sort((a, b) => a.n - b.n),
    lessons,
  };
}

/** Ячейка -> список пар. Формат: имя / '1-8周 препод' / [аудитория]. */
function cellOf(text: string): Entry[] {
  const out: Entry[] = [];
  let name: string | null = null;
  for (const l of text.split("\n").map((s) => s.trim()).filter(Boolean)) {
    const m = RE_WEEKS.exec(l);
    if (m) {
      out.push({ name, from: +m[1], to: +m[2], teacher: m[3].trim(), room: null });
      name = null;
    } else if (RE_ROOM.test(l)) {
      // хвостовая аудитория -> всем без своей
      for (const e of out) e.room ??= l;
    } else {
      name = l;
    }
  }
  return out.filter((e) => e.name !== null);
}

/** '第一大节\n(1-2节)\n8:00-9:40' -> [1, "08:00", "09:40"] */
function slotOf(text: string): [number, string, string] | null {
  const m = RE_PAIR.exec(text);
  const t = RE_TIME.exec(text);
  if (!m || !t) return null;
  return [Math.floor((+m[1] + 1) / 2), t[1].padStart(2, "0") + ":" + t[2], t[3].padStart(2, "0") + ":" + t[4]];
}

async function cellsOf(files: Files, sheet: Element): Promise<Map<number, string>> {
  const sst = await files.text("xl/sharedStrings.xml");
  const strings = sst
    ? all(xml(sst), "si").map((si) =>
        // rPh - фонетическая подсказка к иероглифам, в текст ячейки не входит
        all(si, "t").filter((t) => t.parentElement?.localName !== "rPh").map((t) => t.textContent).join(""),
      )
    : [];
  const out = new Map<number, string>();
  for (const c of all(sheet, "c")) {
    const [r, col] = ref(c.getAttribute("r")!);
    const v = all(c, "v")[0]?.textContent ?? null;
    const t = c.getAttribute("t");
    const text = t === "s" ? (v === null ? null : strings[+v]) : t === "inlineStr" ? all(c, "t").map((x) => x.textContent).join("") : v;
    if (text != null) out.set(r * 10000 + col, text);
  }
  return out;
}

async function sheetOf(files: Files): Promise<Element> {
  const wb = xml((await files.text("xl/workbook.xml"))!);
  const rid = all(wb, "sheet").find((s) => s.getAttribute("name") === "课表")?.getAttributeNS(REL_NS, "id")
    ?? fail("В файле нет листа «课表» - это не выгрузка расписания DNUI");
  const rels = xml((await files.text("xl/_rels/workbook.xml.rels")) ?? fail("Файл повреждён: нет workbook.xml.rels"));
  const target = all(rels, "Relationship").find((r) => r.getAttribute("Id") === rid)?.getAttribute("Target")
    ?? fail("Файл повреждён: лист 课表 не найден");
  const path = target.startsWith("/") ? target.slice(1) : "xl/" + target;
  return xml((await files.text(path)) ?? fail(`Файл повреждён: внутри нет ${path}`));
}

function xml(text: string): Element {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) fail("Файл повреждён: XML не читается");
  return doc.documentElement;
}

const all = (e: Element, tag: string) => Array.from(e.getElementsByTagNameNS("*", tag));

/** "D12" -> [12, 4] */
function ref(r: string): [number, number] {
  const letters = /^[A-Z]+/.exec(r)?.[0] ?? "";
  return [+r.slice(letters.length), [...letters].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0)];
}

const colName = (col: number): string =>
  col <= 26 ? String.fromCharCode(64 + col) : colName(Math.floor((col - 1) / 26)) + String.fromCharCode(65 + ((col - 1) % 26));

// ---------- zip: только чтение, без библиотек - DecompressionStream есть во всех браузерах ----------

interface Files {
  text(name: string): Promise<string | undefined>;
}

async function unzip(data: ArrayBuffer): Promise<Files> {
  const v = new DataView(data);
  // конец центрального каталога: сигнатура 0x06054b50 в последних 64 КБ
  let eocd = -1;
  for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail("Это не xlsx-файл");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const entries = new Map<string, { method: number; size: number; offset: number }>();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) fail("Файл повреждён: каталог zip");
    const nameLen = v.getUint16(p + 28, true);
    const name = dec.decode(new Uint8Array(data, p + 46, nameLen));
    entries.set(name, {
      method: v.getUint16(p + 10, true),
      size: v.getUint32(p + 20, true),
      offset: v.getUint32(p + 42, true),
    });
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  if (!entries.has("xl/workbook.xml")) fail("Это не xlsx-файл");
  return {
    async text(name) {
      const e = entries.get(name);
      if (!e) return undefined;
      const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
      const raw = new Uint8Array(data, start, e.size);
      if (e.method === 0) return dec.decode(raw);
      if (e.method !== 8) fail(`Файл повреждён: неизвестное сжатие ${e.method}`);
      const stream = new Response(raw).body!.pipeThrough(new DecompressionStream("deflate-raw"));
      return dec.decode(await new Response(stream).arrayBuffer());
    },
  };
}

// ---------- сравнение с тем, что уже на сервере ----------

const same = (a: Lesson, b: Lesson) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/**
 * Что поменяется, если заменить пары. Пропавшие id - это не только удалённые пары:
 * пара, переехавшая на другой день, тоже получает новый id, и её домашка
 * и личные заметки студентов к ней перестают показываться.
 */
export function diffLessons(before: Lesson[], after: Lesson[]) {
  const old = new Map(before.map((l) => [l.id, l]));
  const next = new Map(after.map((l) => [l.id, l]));
  return {
    added: after.filter((l) => !old.has(l.id)),
    removed: before.filter((l) => !next.has(l.id)),
    changed: after.filter((l) => old.has(l.id) && !same(old.get(l.id)!, l)),
  };
}

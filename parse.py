"""xlsx -> schedule.json. Разовый скрипт: поменялось расписание - перезапусти."""
import json, re, sys, glob, datetime

ASSETS = "app/src/main/assets"
WEEK1_MONDAY = "2026-08-31"   # пн 1-й недели семестра. ПРОВЕРЬ.
DAYS = {"星期一": 1, "星期二": 2, "星期三": 3, "星期四": 4, "星期五": 5,
        "星期六": 6, "星期日": 7}
RE_WEEKS = re.compile(r"^(\d+)\s*-\s*(\d+)\s*周\s*(.*)$")
# ponytail: комната = "буквацифра-цифры" либо всё с 体育馆. Хватает на все 3 корпуса.
RE_ROOM = re.compile(r"^([A-Za-z]\d+)-\S+$|^体育馆")

# ponytail: 9 предметов, словарь в коде. Появится десятый - допишешь строку.
RU = {
    "汉语口语1": "Разговорный китайский 1",
    "汉语1": "Китайский язык 1",
    "面向对象编程基础 I": "Основы ООП I",
    "前端开发技术 I": "Frontend-разработка I",
    "数据库原理与技术I": "Базы данных I",
    "机器学习 I": "Машинное обучение I",
    "金融大数据分析": "Большие данные в финансах",
    "概率论与数理统计Ⅱ": "Теорвер и матстатистика II",
    "体育3": "Физкультура 3",
}
RU_BUILDING = {"A6": "корпус A6", "A7": "корпус A7", "体育馆": "спорткомплекс"}
RU_ROOM = {"体育馆-羽毛球场": "спорткомплекс, корт для бадминтона"}


def parse_cell(text):
    """Ячейка -> список пар. Формат: имя / '1-8周 препод' / [аудитория]."""
    lines = [l.strip() for l in str(text).split("\n") if l.strip()]
    out, name = [], None
    for l in lines:
        m = RE_WEEKS.match(l)
        if m:
            out.append({"name": name, "weeks": [int(m[1]), int(m[2])],
                        "teacher": m[3].strip(), "room": None})
            name = None
        elif RE_ROOM.match(l):
            for e in out:                      # хвостовая аудитория -> всем без своей
                if not e["room"]:
                    e["room"] = l
        else:
            name = l
    return [e for e in out if e["name"]]


def parse_slot(text):
    """'第一大节\n(1-2节)\n8:00-9:40' -> (1, '08:00', '09:40')"""
    m = re.search(r"\((\d+)-(\d+)节\)", text)
    t = re.search(r"(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})", text)
    if not (m and t):
        return None
    return (int(m[1]) + 1) // 2, f"{int(t[1]):02d}:{t[2]}", f"{int(t[3]):02d}:{t[4]}"


def parse(path):
    import openpyxl
    ws = openpyxl.load_workbook(path)["课表"]
    title = str(ws["A1"].value or "")
    # какие строки/столбцы объединены -> пара на 2 слота
    spans = {(r.min_row, r.min_col): r.max_row for r in ws.merged_cells.ranges
             if r.min_col == r.max_col and r.max_row > r.min_row}

    hdr = next(r for r in ws.iter_rows(min_row=1, max_row=10)
               if any(str(c.value) in DAYS for c in r))
    col_day = {c.column: DAYS[str(c.value)] for c in hdr if str(c.value) in DAYS}

    slots, lessons = {}, []
    for row in ws.iter_rows(min_row=hdr[0].row + 1):
        s = parse_slot(row[0].value or "")
        if not s:
            continue
        n, start, end = s
        slots[n] = {"n": n, "start": start, "end": end}
        for c in row:
            if c.column not in col_day or not c.value:
                continue
            for e in parse_cell(c.value):
                e.update(day=col_day[c.column], slot=n, start=start, end=end,
                         span=spans.get((c.row, c.column), c.row) - c.row + 1)
                e["building"] = (e["room"] or "").split("-")[0]
                e["name_ru"] = RU.get(e["name"], e["name"])
                e["room_ru"] = RU_ROOM.get(e["room"], e["room"])
                e["building_ru"] = RU_BUILDING.get(e["building"], e["building"])
                lessons.append(e)

    for e in lessons:                     # сдвоенная пара -> конец следующего слота
        if e["span"] > 1 and e["slot"] + e["span"] - 1 in slots:
            e["end"] = slots[e["slot"] + e["span"] - 1]["end"]
        e["id"] = f"{e['day']}-{e['slot']}-{e['name']}-{e['weeks'][0]}"
        del e["span"]

    lessons.sort(key=lambda e: (e["day"], e["slot"], e["weeks"][0]))
    return {"meta": {"title": title, "week1_monday": WEEK1_MONDAY,
                     "weeks": max(e["weeks"][1] for e in lessons)},
            "slots": [slots[k] for k in sorted(slots)], "lessons": lessons}


def check(data):
    """ponytail: единственная проверка - что парсер не проглотил пары."""
    ls = data["lessons"]
    assert len(ls) >= 15, f"подозрительно мало пар: {len(ls)}"
    assert all(e["name"] and e["teacher"] and e["room"] for e in ls), \
        [e for e in ls if not (e["name"] and e["teacher"] and e["room"])]
    assert all(1 <= e["weeks"][0] <= e["weeks"][1] <= 30 for e in ls)
    miss = sorted({e["name"] for e in ls if e["name"] == e["name_ru"]})
    assert not miss, f"нет перевода, допиши в RU: {miss}"
    assert len({e["id"] for e in ls}) == len(ls), "дубли id"
    ends = {(s["start"], s["end"]) for s in data["slots"]}
    long = [e for e in ls if (e["start"], e["end"]) not in ends]
    assert len(long) <= 2, f"слишком много сдвоенных пар, проверь merge: {long}"


if __name__ == "__main__":
    for i, f in enumerate(sorted(glob.glob("*课表.xlsx")), 1):
        d = parse(f)
        check(d)
        out = f"{ASSETS}/schedule.{i}.json"
        json.dump(d, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{out}: {len(d['lessons'])} пар, {len(d['slots'])} слотов <- {f}")
    m = datetime.date.fromisoformat(WEEK1_MONDAY)
    today = datetime.date.today()
    print(f"week1_monday={m} ({m.strftime('%a')}), сегодня {today} = неделя "
          f"{(today - m).days // 7 + 1}")

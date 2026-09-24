-- Группа. Пары одним JSON (формат ассетов приложения): правятся редко - целиком
-- загрузкой xlsx или по одной в админке, построчная таблица им не нужна.
-- rev растёт на любую правку группы, её переносов и домашки - это ETag для приложения.
CREATE TABLE groups (
  code         TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  week1_monday TEXT NOT NULL,
  slots_json   TEXT NOT NULL,
  lessons_json TEXT NOT NULL,
  listed       INTEGER NOT NULL DEFAULT 0,
  rev          INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by   TEXT
);

-- Перенос или выходной на дату: day = чьи пары идут, 1 = понедельник, 0 = выходной.
CREATE TABLE shifts (
  group_code TEXT NOT NULL REFERENCES groups(code) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  day        INTEGER NOT NULL CHECK (day BETWEEN 0 AND 7),
  PRIMARY KEY (group_code, date)
);

-- Домашка висит на паре и дате, где её задали. until - докуда показывать на следующих парах.
CREATE TABLE homework (
  group_code TEXT NOT NULL REFERENCES groups(code) ON DELETE CASCADE,
  lesson_id  TEXT NOT NULL,
  date       TEXT NOT NULL,
  text       TEXT NOT NULL,
  until      TEXT,
  author     TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_code, lesson_id, date)
);

-- Пара изменена в одну дату, в остальные недели идёт как обычно.
-- lesson_json NULL - отменена, иначе - что идёт вместо неё: поля пары без id, day и weeks.
CREATE TABLE changes (
  group_code  TEXT NOT NULL REFERENCES groups(code) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  lesson_id   TEXT NOT NULL,
  lesson_json TEXT,
  PRIMARY KEY (group_code, date, lesson_id)
);

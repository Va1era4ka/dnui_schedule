-- Подписчики бота @dnui_schedule_bot (src/tg.ts). chat_id - id пользователя Telegram, он же личный чат с ботом.
-- group_code NULL - группу ещё не выбрали или её удалили. По умолчанию - только вечерняя сводка в 20:00.
-- Время - по часам группы: digest_at "20:00", sent_until "2026-10-19T20:00".
CREATE TABLE tg_users (
  chat_id      INTEGER PRIMARY KEY,
  group_code   TEXT REFERENCES groups(code) ON DELETE SET NULL,
  digest_on    INTEGER NOT NULL DEFAULT 1,
  digest_at    TEXT NOT NULL DEFAULT '20:00',
  next_up_on   INTEGER NOT NULL DEFAULT 0,
  lead_min     INTEGER NOT NULL DEFAULT 5,
  -- можно ли писать: нажал «Старт» или разрешил из Mini App; 0 - не разрешал или заблокировал бота
  can_write    INTEGER NOT NULL DEFAULT 0,
  -- до какого момента уведомления разосланы; NULL - ещё ничего, cron начнёт с текущей минуты
  sent_until   TEXT,
  onboarded_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX tg_users_group ON tg_users(group_code);

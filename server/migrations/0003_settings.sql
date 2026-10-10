-- Общие настройки сервера. app_version - объявленная из админки версия приложения:
-- подключённые к серверу приложения увидят её и предложат обновиться.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

// Первые группы из эталонов приложения -> seed.sql для `wrangler d1 execute --file seed.sql`.
// Коды случайные: запускай один раз, повторный прогон заведёт ещё две группы с новыми кодами.
import { readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";

// без 0/o и 1/l - код перепечатывают руками с экрана
const ABC = "abcdefghijkmnpqrstuvwxyz23456789";
const code = () => Array.from({ length: 6 }, () => ABC[randomInt(ABC.length)]).join("");
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";

const sql = [1, 2].map((k) => {
  const d = JSON.parse(readFileSync(new URL(`../../fixtures/schedule.${k}.json`, import.meta.url), "utf8"));
  const c = code();
  console.log(`класс ${k}: ${c}`);
  return (
    "INSERT INTO groups (code, title, week1_monday, slots_json, lessons_json, listed) VALUES (" +
    [c, `留软件25401 (俄财大), класс ${k}`, d.meta.week1_monday, JSON.stringify(d.slots), JSON.stringify(d.lessons)]
      .map(q).join(", ") +
    ", 1);"
  );
});
writeFileSync(new URL("../seed.sql", import.meta.url), sql.join("\n") + "\n");
console.log("-> seed.sql");

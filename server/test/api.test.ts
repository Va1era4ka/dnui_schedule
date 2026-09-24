import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import fixture from "../../fixtures/schedule.1.json";

const get = (path: string, headers: Record<string, string> = {}) =>
  exports.default.fetch(new Request("https://dnui-schedule.hsryata.com" + path, { headers }));

beforeEach(async () => {
  const add = env.DB.prepare(
    "INSERT OR REPLACE INTO groups (code, title, week1_monday, slots_json, lessons_json, listed, rev) VALUES (?, ?, ?, ?, ?, ?, 7)",
  );
  await env.DB.batch([
    add.bind("abc234", "Класс 1", "2026-08-31", JSON.stringify(fixture.slots), JSON.stringify(fixture.lessons), 1),
    add.bind("hidden", "Скрытая", "2026-08-31", "[]", "[]", 0),
    add.bind("esc123", "<b>Класс</b>", "2026-08-31", "[]", "[]", 0),
    env.DB.prepare("INSERT OR REPLACE INTO shifts VALUES ('abc234', '2026-10-01', 0), ('abc234', '2026-09-27', 1)"),
    env.DB.prepare(
      "INSERT OR REPLACE INTO homework (group_code, lesson_id, date, text, until) VALUES ('abc234', '1-2-汉语1-1', '2026-09-21', 'упр. 3', NULL)",
    ),
  ]);
});

it("в списке только группы, открытые для списка", async () => {
  const r = await get("/v1/groups");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ groups: [{ code: "abc234", title: "Класс 1" }] });
});

it("группа отдаётся в формате ассетов приложения плюс переносы и домашка", async () => {
  const r = await get("/v1/groups/abc234");
  expect(r.status).toBe(200);
  expect(r.headers.get("etag")).toBe('"7"');
  const g: any = await r.json();
  expect(g.lessons).toEqual(fixture.lessons);
  expect(g.slots).toEqual(fixture.slots);
  expect(g.meta).toEqual({ title: "Класс 1", week1_monday: "2026-08-31", weeks: 16 });
  expect(g.shifts).toEqual({ "2026-09-27": 1, "2026-10-01": 0 });
  expect(g.homework).toEqual([{ lesson: "1-2-汉语1-1", date: "2026-09-21", text: "упр. 3", until: null }]);
});

it("304, если у приложения та же ревизия, и полный ответ - если старая", async () => {
  expect((await get("/v1/groups/abc234", { "if-none-match": '"7"' })).status).toBe(304);
  expect((await get("/v1/groups/abc234", { "if-none-match": '"6"' })).status).toBe(200);
});

it("скрытая группа доступна по коду, чужое - 404/405", async () => {
  expect((await get("/v1/groups/hidden")).status).toBe(200);
  expect((await get("/v1/groups/nope42")).status).toBe(404);
  expect((await get("/v1/groups/../etc")).status).toBe(404);
  expect((await get("/")).status).toBe(404);
  const post = await exports.default.fetch(new Request("https://x/v1/groups", { method: "POST" }));
  expect(post.status).toBe(405);
});

it("приглашение: страница с кодом и кнопкой в приложение, название экранировано", async () => {
  const r = await get("/g/ABC234");
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("text/html");
  const html = await r.text();
  expect(html).toContain(">abc234<");
  expect(html).toContain("raspisanie://connect?server=https%3A%2F%2Fdnui-schedule.hsryata.com&amp;group=abc234");
  expect(await (await get("/g/esc123")).text()).toContain("&lt;b&gt;Класс&lt;/b&gt;");
  expect((await get("/g/nope42")).status).toBe(404);
});

it("assetlinks.json отдаёт пакет и отпечатки ключей для App Links", async () => {
  const r = await get("/.well-known/assetlinks.json");
  expect(r.headers.get("content-type")).toBe("application/json");
  const [link]: any = await r.json();
  expect(link.target.package_name).toBe("ru.valov.raspisanie");
  expect(link.target.sha256_cert_fingerprints).toHaveLength(2);
  expect(link.target.sha256_cert_fingerprints[0]).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});

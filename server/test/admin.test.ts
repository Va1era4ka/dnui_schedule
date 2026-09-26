import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import fixture from "../../fixtures/schedule.1.json";

const HOST = "https://dnui-schedule.hsryata.com";
const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
let keys: CryptoKeyPair;
let stranger: CryptoKeyPair; // чужой ключ: подпись им Access не признаёт

const b64 = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (o: unknown) => b64(new TextEncoder().encode(JSON.stringify(o)));

/** JWT как у Cloudflare Access; claims можно испортить для проверки отказов. */
async function jwt(claims: Record<string, unknown> = {}, key = keys.privateKey) {
  const head = enc({ alg: "RS256", kid: "k1" });
  const body = enc({
    iss: "https://testteam.cloudflareaccess.com",
    aud: ["test-aud"],
    email: "starosta@example.com",
    exp: Math.floor(Date.now() / 1000) + 600,
    ...claims,
  });
  const sig = await crypto.subtle.sign(alg, key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64(sig)}`;
}

async function call(method: string, path: string, opts: { body?: unknown; token?: string | null; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  const token = opts.token === undefined ? await jwt() : opts.token;
  if (token) headers["cf-access-jwt-assertion"] = token;
  if (opts.origin) headers.origin = opts.origin;
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  return exports.default.fetch(new Request(HOST + path, init));
}

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(
    { ...alg, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["sign", "verify"],
  )) as CryptoKeyPair;
  stranger = (await crypto.subtle.generateKey(
    { ...alg, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1", alg: "RS256" };
  // вместо https://testteam.cloudflareaccess.com/cdn-cgi/access/certs
  const real = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://testteam.cloudflareaccess.com/cdn-cgi/access/certs") return Response.json({ keys: [pub] });
    return real(input, init);
  });
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM groups"),
    env.DB.prepare(
      "INSERT INTO groups (code, title, week1_monday, slots_json, lessons_json, listed, rev) VALUES ('abc234', 'Класс 1', '2026-08-31', ?, ?, 1, 5), ('hidden', 'Скрытая', '2026-08-31', '[]', '[]', 0, 1)",
    ).bind(JSON.stringify(fixture.slots), JSON.stringify(fixture.lessons)),
  ]);
});

it("без входа, с чужой подписью, чужим aud или протухшим токеном - 401", async () => {
  expect((await call("GET", "/v1/admin/groups", { token: null })).status).toBe(401);
  expect((await call("GET", "/v1/admin/groups", { token: await jwt({}, stranger.privateKey) })).status).toBe(401);
  expect((await call("GET", "/v1/admin/groups", { token: await jwt({ aud: ["other"] }) })).status).toBe(401);
  expect((await call("GET", "/v1/admin/groups", { token: await jwt({ exp: 1 }) })).status).toBe(401);
  expect((await call("GET", "/v1/admin/groups", { token: "a.b.c" })).status).toBe(401);
});

it("с входом видно, кто пришёл, и все группы, скрытые тоже", async () => {
  expect(await (await call("GET", "/v1/admin/me")).json()).toEqual({ email: "starosta@example.com" });
  const r: any = await (await call("GET", "/v1/admin/groups")).json();
  expect(r.groups.map((g: any) => g.code).sort()).toEqual(["abc234", "hidden"]);
});

it("домашка: запись поднимает rev, видна в публичном API, чужая пара и кривые даты - 400", async () => {
  const lesson = encodeURIComponent("4-3-金融大数据分析-1");
  const put = await call("PUT", `/v1/admin/groups/abc234/homework/${lesson}/2026-09-24`, {
    body: { text: " Глава 2 ", until: "2026-10-08" },
  });
  expect(await put.json()).toEqual({ rev: 6 });
  const pub: any = await (await exports.default.fetch(new Request(HOST + "/v1/groups/abc234"))).json();
  expect(pub.rev).toBe(6);
  expect(pub.homework).toEqual([{ lesson: "4-3-金融大数据分析-1", date: "2026-09-24", text: "Глава 2", until: "2026-10-08" }]);

  expect((await call("PUT", "/v1/admin/groups/abc234/homework/nope/2026-09-24", { body: { text: "x" } })).status).toBe(400);
  expect((await call("PUT", `/v1/admin/groups/abc234/homework/${lesson}/2026-13-40`, { body: { text: "x" } })).status).toBe(400);
  const early = await call("PUT", `/v1/admin/groups/abc234/homework/${lesson}/2026-09-24`, {
    body: { text: "x", until: "2026-09-01" },
  });
  expect(early.status).toBe(400);

  expect(await (await call("DELETE", `/v1/admin/groups/abc234/homework/${lesson}/2026-09-24`)).json()).toEqual({ rev: 7 });
});

it("переносы: выходной и отмена", async () => {
  expect((await call("PUT", "/v1/admin/groups/abc234/shifts/2026-10-01", { body: { day: 0 } })).status).toBe(200);
  expect((await call("PUT", "/v1/admin/groups/abc234/shifts/2026-10-02", { body: { day: 9 } })).status).toBe(400);
  let pub: any = await (await exports.default.fetch(new Request(HOST + "/v1/groups/abc234"))).json();
  expect(pub.shifts).toEqual({ "2026-10-01": 0 });
  await call("DELETE", "/v1/admin/groups/abc234/shifts/2026-10-01");
  pub = await (await exports.default.fetch(new Request(HOST + "/v1/groups/abc234"))).json();
  expect(pub.shifts).toEqual({});
});

it("правка пары в одну дату: отмена и замена", async () => {
  const id = "4-3-金融大数据分析-1";
  const url = `/v1/admin/groups/abc234/changes/${encodeURIComponent(id)}`;
  const orig = fixture.lessons.find((l) => l.id === id)!;
  const repl = { ...orig, name_ru: "Физкультура", room: "спортзал", id: "лишнее", weeks: [1, 2] };
  expect((await call("PUT", `${url}/2026-10-08`, { body: { lesson: null } })).status).toBe(200);
  expect((await call("PUT", `${url}/2026-10-15`, { body: { lesson: repl } })).status).toBe(200);
  expect((await call("PUT", `${url}/2026-10-22`, { body: {} })).status).toBe(400);
  expect((await call("PUT", `${url}/2026-10-22`, { body: { lesson: { name: "x" } } })).status).toBe(400);
  expect((await call("PUT", "/v1/admin/groups/abc234/changes/nope/2026-10-08", { body: { lesson: null } })).status).toBe(400);
  let pub: any = await (await exports.default.fetch(new Request(HOST + "/v1/groups/abc234"))).json();
  const { id: _, weeks: __, day: ___, ...fields } = { ...orig, name_ru: "Физкультура", room: "спортзал" };
  expect(pub.changes).toEqual({ "2026-10-08": { [id]: null }, "2026-10-15": { [id]: fields } });
  await call("DELETE", `${url}/2026-10-08`);
  await call("DELETE", `${url}/2026-10-15`);
  pub = await (await exports.default.fetch(new Request(HOST + "/v1/groups/abc234"))).json();
  expect(pub.changes).toEqual({});
});

it("пары меняются только с текущим rev - иначе 409, два редактора не затрут друг друга", async () => {
  const ok = await call("PUT", "/v1/admin/groups/abc234/lessons", {
    body: { rev: 5, slots: fixture.slots, lessons: fixture.lessons.slice(0, 3) },
  });
  expect(await ok.json()).toEqual({ rev: 6 });
  const stale = await call("PUT", "/v1/admin/groups/abc234/lessons", {
    body: { rev: 5, slots: fixture.slots, lessons: fixture.lessons },
  });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toEqual({ error: "conflict", rev: 6 });
  const broken = await call("PUT", "/v1/admin/groups/abc234/lessons", {
    body: { rev: 6, slots: fixture.slots, lessons: [{ ...fixture.lessons[0], day: 8 }] },
  });
  expect(broken.status).toBe(400);
});

it("создание, правка и удаление группы", async () => {
  const c = await call("POST", "/v1/admin/groups", { body: { title: "Новая", week1_monday: "2027-02-22" } });
  expect(c.status).toBe(201);
  const { code }: any = await c.json();
  expect(code).toMatch(/^[a-z2-9]{6}$/);
  expect((await call("PATCH", `/v1/admin/groups/${code}`, { body: { title: "Переименована", listed: true } })).status).toBe(200);
  const list: any = await (await exports.default.fetch(new Request(HOST + "/v1/groups"))).json();
  expect(list.groups).toContainEqual({ code, title: "Переименована" });
  expect((await call("DELETE", `/v1/admin/groups/${code}`)).status).toBe(200);
  expect((await exports.default.fetch(new Request(HOST + `/v1/groups/${code}`))).status).toBe(404);
});

it("запись с чужого сайта - 403, даже с действующим входом", async () => {
  const r = await call("PUT", "/v1/admin/groups/abc234/shifts/2026-10-01", {
    body: { day: 0 },
    origin: "https://evil.example",
  });
  expect(r.status).toBe(403);
  const same = await call("PUT", "/v1/admin/groups/abc234/shifts/2026-10-01", { body: { day: 0 }, origin: HOST });
  expect(same.status).toBe(200);
});

import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

// Тесты крутятся в настоящем рантайме Workers с локальной D1 - той же схемой, что в проде.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          // своя «команда» Access: ключи для неё тесты подсовывают сами (test/admin.test.ts)
          ACCESS_TEAM: "testteam",
          ACCESS_AUD: "test-aud",
          // бот: initData тесты подписывают этим токеном сами (test/tg.test.ts)
          TG_BOT_TOKEN: "123456:TEST-token",
          TG_WEBHOOK_SECRET: "test-secret",
          DEV_TG_USER: "777",
        },
      },
    })),
  ],
  // shared/ - логика расписания для Worker, админки и Mini App: проверяем её в рантайме Workers.
  // admin/ - отдельный пакет со своими тестами (npm --prefix admin test)
  test: { include: ["test/**/*.test.ts", "shared/**/*.test.ts"], setupFiles: ["./test/setup.ts"] },
});

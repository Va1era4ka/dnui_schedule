declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
  // чтобы exports.default в тестах знал, что это наш fetch
  interface GlobalProps {
    mainModule: typeof import("../src/index");
  }
}

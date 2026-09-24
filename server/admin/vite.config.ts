import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// Админка собирается в server/public/admin - её отдаёт Worker по /admin/ (путь закрыт Access).
export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../public/admin", emptyOutDir: true },
  test: { environment: "jsdom" },
});

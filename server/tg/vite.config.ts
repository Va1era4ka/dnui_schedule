import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// Mini App бота собирается в server/public/tg - её отдаёт Worker по /tg/ (src/tg.ts).
export default defineConfig({
  base: "/tg/",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../public/tg", emptyOutDir: true },
});

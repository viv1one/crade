import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors tsconfig.json's "@/*" path alias so tests (and the route
// handlers/modules they import, which use "@/..." internally) resolve the
// same way the Next.js build already does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

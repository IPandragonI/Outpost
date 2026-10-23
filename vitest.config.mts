import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    // Domain code runs in Node; component tests opt into jsdom with a file comment.
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    // The engine tests run the real Stockfish build, which takes a few seconds per search.
    testTimeout: 30000,
  },
});

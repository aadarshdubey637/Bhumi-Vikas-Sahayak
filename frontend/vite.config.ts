/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { sourcemap: false },
  test: {
    environment: "./src/test/jsdom-native-abort.ts",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    testTimeout: 20000, // the first render of a page pulls in lazy chunks; slow CI machines need the headroom
    env: { VITE_API_BASE_URL: "http://localhost:8000" },
  },
});

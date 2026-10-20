import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      // Pages and components must never call fetch directly; only src/api/client.ts may.
      "no-restricted-globals": ["error", { name: "fetch", message: "Use src/api/client.ts." }],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "fetch", message: "Use src/api/client.ts." },
      ],
    },
  },
  {
    files: ["src/api/client.ts", "src/**/*.test.{ts,tsx}", "src/test/**"],
    rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
  },
  { files: ["scripts/**/*.mjs", "*.js"], languageOptions: { globals: globals.node } },
);

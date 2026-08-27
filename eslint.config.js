// Flat config. Scoped to src/: dist/ is generated and node_modules is not ours.
//
// The rule set mirrors the workspace standard (~/Desktop/.claude/skills/cr/references/
// standard.md §6): the react-hooks rules are the automated half of "every effect cleans up"
// and "no conditional hooks", which are [blocker] rules there.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "*.config.js", "*.config.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { window: "readonly", document: "readonly", navigator: "readonly",
                 performance: "readonly", console: "readonly", location: "readonly",
                 WebSocket: "readonly", URL: "readonly", Blob: "readonly",
                 MediaRecorder: "readonly", AbortController: "readonly",
                 setTimeout: "readonly", clearTimeout: "readonly",
                 setInterval: "readonly", clearInterval: "readonly",
                 requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
                 fetch: "readonly", TextDecoder: "readonly", Audio: "readonly" },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // The standard forbids `any` at the boundary; the codebase already has zero.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Debug output must sit behind a flag (standard §6). warn/error stay allowed.
      "no-console": ["error", { allow: ["warn", "error"] }],
      // `!= null` is the idiomatic null-or-undefined check and is used deliberately
      // throughout; everything else must be strict.
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    // These two log through an explicit debug flag (`if (debug)` in the hook,
    // `PAD_DEBUG = import.meta.env.DEV` in the page), which satisfies the standard's
    // "no debug output outside a flag" rule — but eslint cannot see the guard.
    files: ["src/hooks/useGamepad.ts", "src/pages/ControlPage.tsx"],
    rules: { "no-console": "off" },
  },
);

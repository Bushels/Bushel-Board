import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".ds-sync/**",
    ".playwright-mcp/**",
    "out/**",
    "build/**",
    "ds-bundle/**",
    "graphify-out/**",
    "scratch/**",
    ".claude/**",
    ".codex/**",
    "tmp/**",
    "docs/design-handoffs/**",
    "next-env.d.ts",
  ]),
  // Keep app/Next lint strict while avoiding launch-blocking failures from
  // operational scripts and Supabase Edge Function adapters that intentionally
  // parse dynamic JSON payloads.
  {
    files: ["scripts/**/*.{ts,tsx}", "supabase/functions/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-assign-module-variable": "off",
    },
  },
]);

export default eslintConfig;

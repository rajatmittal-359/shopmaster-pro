import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // eslint-config-next does not turn `no-undef` on. On 13 Sep 2026 a
    // component called t() without `const t = useT()` and the seller
    // dashboard crashed in the browser with lint green. Never again.
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node, React: "readonly" } },
    rules: { "no-undef": "error" },
  },
]);

export default eslintConfig;

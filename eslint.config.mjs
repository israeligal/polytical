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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Storybook static build output (generated, not source).
    "storybook-static/**",
  ]),
  // Force all displayed dates/times through the central Asia/Jerusalem module
  // (lib/time.ts). Ad-hoc Intl.DateTimeFormat / toLocale*String format in the
  // runtime timezone, which is UTC on the server and local in the browser →
  // hydration mismatches (React #418) + wrong times. Exempt: lib/time.ts (the
  // module itself), lib/format.ts (toLocaleString on NUMBERS), and
  // app/lib/knesset/normalize.ts (server-only data day-key, already Asia/Jerusalem).
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["lib/time.ts", "lib/format.ts", "app/lib/knesset/normalize.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
          message:
            "Use the Asia/Jerusalem formatters in @/lib/time — never `new Intl.DateTimeFormat` directly (UTC/local hydration mismatches).",
        },
        {
          selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]",
          message:
            "Use the Asia/Jerusalem formatters in @/lib/time — never `toLocale*String` for dates (UTC/local hydration mismatches).",
        },
      ],
    },
  },
]);

export default eslintConfig;

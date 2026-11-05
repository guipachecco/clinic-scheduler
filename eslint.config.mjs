import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The owner connection bypasses row-level security. Inside src/ only the
  // migrations (and the module itself) may touch it; scripts and tests import
  // it from outside src/.
  {
    files: ["src/**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    ignores: ["src/db/migrate.ts", "src/db/owner.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/db/owner", "**/db/owner", "./owner", "**/db/owner.*"],
              message:
                "A conexão do dono ignora o row-level security: use inClinic, asClient, authDb ou platformDb de @/db/client.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // Existing client flows intentionally react to server-action state and
    // navigation changes inside effects. Next 16 enables these experimental
    // React Compiler diagnostics as errors; keep the established behavior
    // until those components are migrated as a separate UI refactor.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "next-env.d.ts",
    // Imports optional three/@react-three packages that are not installed.
    "src/components/site/request-pipeline-card-3d.tsx",
  ]),
]);

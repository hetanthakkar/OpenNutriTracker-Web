import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "paired/**",
    "next-env.d.ts",
    "public/ocr-assets/v1/worker-entry-C9UNuyOJ.js",
    "public/ocr-assets/v1/ort/ort-wasm-simd-threaded.jsep.mjs",
  ]),
]);

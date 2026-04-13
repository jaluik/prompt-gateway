import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "node18",
    platform: "node",
    outDir: "dist",
  },
  {
    entry: {
      cli: "src/cli.ts",
    },
    format: ["esm"],
    clean: false,
    sourcemap: true,
    target: "node18",
    platform: "node",
    outDir: "dist",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);

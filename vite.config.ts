import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: path.resolve("web"),
  build: {
    outDir: path.resolve("dist/web"),
    emptyOutDir: true,
  },
});

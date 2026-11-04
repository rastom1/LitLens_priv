import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// The content script is injected with chrome.scripting.executeScript, which
// only runs classic scripts, so it is bundled into one IIFE: dist/content.js.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: fileURLToPath(new URL("src/extension/content.ts", import.meta.url)),
      formats: ["iife"],
      name: "LitLensContent",
      fileName: () => "content.js",
    },
  },
});

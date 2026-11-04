import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// One build for the web walkthrough, the extension side panel and the
// extension service worker. The content script has its own config
// (vite.content.config.ts) because it must be a single classic script.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwind()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        web: here("index.html"),
        sidepanel: here("sidepanel.html"),
        background: here("src/extension/background.ts"),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
      },
    },
  },
});

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Local dependencies may live outside iCloud through a node_modules symlink.
      allow: [
        fileURLToPath(new URL(".", import.meta.url)),
        realpathSync(new URL("./node_modules", import.meta.url)),
      ],
    },
  },
  build: {
    // The production CSP serves fonts from this origin. Even small language
    // subsets must stay as files instead of becoming blocked data: URLs.
    assetsInlineLimit: (filePath) =>
      /\.(woff2?|ttf|otf)$/.test(filePath) ? false : undefined,
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"], react: ["react", "react-dom"] },
      },
    },
  },
});

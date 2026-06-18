import { defineConfig } from "vite";

// GitHub Pages serves the site at https://<user>.github.io/Typing-game/,
// so every asset URL needs the repo name as a prefix. If you fork this
// project under a different repo name, change `base` to match.
export default defineConfig({
  base: "/Typing-game/",
  build: {
    target: "es2022",
    sourcemap: true,
    // Phaser alone is ~1.4 MB, so the default 500 kB warning always fires.
    // Bump the limit and split third-party code (Phaser, Supabase, etc.)
    // into a dedicated `vendor` chunk that browsers can cache separately
    // from frequently-changing game code.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    host: true,
  },
});

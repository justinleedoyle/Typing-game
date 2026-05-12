import { defineConfig } from "vite";

// GitHub Pages serves the site at https://<user>.github.io/Typing-game/,
// so every asset URL needs the repo name as a prefix. If you fork this
// project under a different repo name, change `base` to match.
export default defineConfig({
  base: "/Typing-game/",
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    host: true,
  },
});

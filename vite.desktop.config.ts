import { mergeConfig } from "vite";
import { fileURLToPath } from "node:url";
import web from "./vite.config";

export default mergeConfig(web, {
  base: "./",
  plugins: [{ name: "installed-content-policy", transformIndexHtml: () => [{
    tag: "meta", injectTo: "head-prepend", attrs: { "http-equiv": "Content-Security-Policy", content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'" },
  }] }],
  resolve: { alias: [{ find: /^.*\/supabaseClient(?:\.ts)?$/, replacement: fileURLToPath(new URL("./desktop/offlineAuth.ts", import.meta.url)) }] },
  build: { outDir: "desktop-dist/renderer", emptyOutDir: true },
});

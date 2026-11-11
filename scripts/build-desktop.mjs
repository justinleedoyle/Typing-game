import { build } from "vite";
import { fileURLToPath } from "node:url";

await build({ configFile: "vite.desktop.config.ts" });
for (const entry of ["main", "preload"]) {
  await build({
    configFile: false,
    resolve: { alias: [{ find: /^.*\/supabaseClient(?:\.ts)?$/, replacement: fileURLToPath(new URL("../desktop/offlineAuth.ts", import.meta.url)) }] },
    build: {
      target: "node22", outDir: "desktop-dist", emptyOutDir: false, sourcemap: true,
      lib: { entry: `desktop/${entry}.ts`, formats: ["cjs"], fileName: () => `${entry}.cjs` },
      rollupOptions: { external: ["electron", /^node:/], output: { inlineDynamicImports: true } },
    },
  });
}

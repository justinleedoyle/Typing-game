import { readFileSync } from "node:fs";
import ts from "typescript";
import type { SaveCheckpoint } from "../src/game/saveState";

// The same production file owns browser-only painting and pure save metadata.
// Execute its pure functions without importing Phaser or raster artwork in Node.
const url = new URL("../src/game/winterFoxEncounter.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const functions = source.statements.filter(ts.isFunctionDeclaration);
const code = ts.transpileModule(functions.map(statement => statement.getText(source).replace(/^export\s+/, "")).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
export const winterFoxCareBindings = new Function(`${code}; return { ${functions.map(statement => statement.name!.text).join(",")} };`)() as {
  resolveWinterFoxApproach(checkpoint: SaveCheckpoint | null, choices: Readonly<Record<string, string>>): "light" | "space" | null;
  winterFoxCareData(approach: "light" | "space" | null): SaveCheckpoint["data"];
};

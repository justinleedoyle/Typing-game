import { existsSync, lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, relative } from "node:path";

/** Manual native review stays in an explicitly named disposable profile. This
 * flag neither seeds progress nor automates input or changes normal launches. */
export function desktopReviewProfile(argv: readonly string[]): string | null {
  const values = argv.filter(arg => arg.startsWith("--desktop-review-profile=")).map(arg => arg.slice("--desktop-review-profile=".length));
  if (!values.length) return null;
  if (values.length !== 1 || !isAbsolute(values[0]) || !existsSync(values[0])) throw new Error("Invalid desktop review profile");
  const path = values[0], stat = lstatSync(path), root = realpathSync(tmpdir()), actual = realpathSync(path);
  const child = relative(root, actual);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !basename(actual).startsWith("portalwrights-desktop-review-") ||
      !child || child === ".." || child.startsWith("../") || child.startsWith("..\\") || isAbsolute(child)) throw new Error("Desktop review profile must be a named disposable temp folder");
  return actual;
}

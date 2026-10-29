// Launch the packaged app itself, using an isolated disposable profile. The
// application's explicit smoke mode writes reports/screenshots; this launcher
// checks restart persistence and kills the crash phase outside the app.
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SMOKE_PHASES = ["seed", "verify", "crash", "recover"];

function requireValue(value, message) {
  if (!value) throw new Error(message);
}

/** Reports are evidence from the actual packaged main/renderer, not a claim
 * about physical keyboard, human difficulty or Steam client integration. */
export function validateSmokeReport(report, phase) {
  requireValue(report && typeof report === "object", "Missing smoke report");
  requireValue(report.version === 1 && report.phase === phase, `Wrong smoke report phase: expected ${phase}`);
  requireValue(report.ok === true, `Packaged ${phase} failed: ${report.error ?? "no successful result"}`);
  requireValue(report.profileIsolated === true, `${phase} did not confirm an isolated profile`);
  requireValue(report.offline === true, `${phase} was not run offline`);
  requireValue(Array.isArray(report.unexpectedRequests) && report.unexpectedRequests.length === 0, `${phase} attempted an unexpected network request`);
  requireValue(report.renderer?.canvas === true && report.renderer?.fontsReady === true, `${phase} did not boot the game and bundled fonts`);
  requireValue(report.renderer.activeScene === "WinterMountainScene" && report.keyboard?.pauseAndResume === true, `${phase} did not restore Winter and navigate its pause menu`);
  requireValue(report.durable === true, `${phase} did not acknowledge a durable save`);
  requireValue(report.save && typeof report.save === "object" && typeof report.save.runId === "string" && report.save.runId.length > 0, `${phase} has no saved journey identity`);
  requireValue(report.save.checkpoint && typeof report.save.checkpoint.scene === "string" && typeof report.save.checkpoint.step === "string", `${phase} has no real saved checkpoint`);
  const checkpoint = report.save.checkpoint;
  requireValue(checkpoint.scene === "WinterMountainScene" && checkpoint.step === (phase === "seed" || phase === "verify" ? "fork1" : "firefly"), `${phase} resumed the wrong checkpoint`);
  requireValue(checkpoint.data?.candles === 2 && checkpoint.data?.statsSoul === 62.5 && checkpoint.data?.statsCombo === 8, `${phase} changed the synthetic checkpoint resources`);
  if (phase === "seed") requireValue(report.keyboard?.uppercaseAndRelease === true && report.keyboard?.backspaceDispatched === true, "Seed did not verify synthetic uppercase typing and safe prefix release");
  requireValue(report.save.keyStats?.s?.hits === 1 && report.save.keyStats.s.misses === 0 && report.save.keyStats?.a?.hits === 1 && report.save.keyStats.a.misses === 0 && Object.keys(report.save.keyStats).length === 2, `${phase} did not retain the two exact keyboard smoke hits`);
  return report;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function validateSmokeSequence(reports) {
  for (const phase of SMOKE_PHASES) validateSmokeReport(reports[phase], phase);
  for (const phase of ["seed", "verify", "recover"]) {
    requireValue(reports[phase].normalExit === true && reports[phase].exitCode === 0, `${phase} did not complete the normal window-close handshake`);
  }
  requireValue(reports.crash.forcedTermination === true, "Crash phase was not forcibly terminated by the launcher");
  // Actual scene continuation legitimately refreshes its updatedAt timestamp.
  // Every progress field, checkpoint/resource value and choice must survive.
  const progress = save => { const { updatedAt: _time, ...state } = save; return state; };
  requireValue(stable(progress(reports.seed.save)) === stable(progress(reports.verify.save)), "Normal relaunch changed the durable journey");
  requireValue(reports.crash.save.runId === reports.seed.save.runId, "Crash phase switched to a different journey");
  requireValue(stable(reports.crash.save.checkpoint) !== stable(reports.seed.save.checkpoint), "Crash phase did not write a different checkpoint");
  requireValue(stable(progress(reports.crash.save)) === stable(progress(reports.recover.save)), "Forced termination lost or changed the acknowledged save");
}

const stopping = new WeakSet();
async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise(done => {
    const onExit = () => { clearTimeout(timer); done(true); };
    const timer = setTimeout(() => { child.off("exit", onExit); done(false); }, timeoutMs);
    child.once("exit", onExit);
    // Observe an exit which raced the initial check/listener registration.
    if (child.exitCode !== null || child.signalCode !== null) { child.off("exit", onExit); clearTimeout(timer); done(true); }
  });
}
async function forceStop(child) {
  if (!Number.isInteger(child.pid) || child.exitCode !== null || child.signalCode !== null || stopping.has(child)) return false;
  stopping.add(child);
  if (process.platform === "win32") {
    const code = await new Promise((done, reject) => {
      const kill = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      kill.once("error", reject);
      kill.once("exit", done);
    });
    if (code !== 0) {
      // The failing app may exit on its own between reading its failure report
      // and cleanup. That benign race must not replace the original diagnosis.
      if (await waitForExit(child, 1000)) return false;
      throw new Error(`taskkill exited ${code} while the packaged app was still running`);
    }
  } else {
    try { process.kill(-child.pid, "SIGKILL"); }
    catch (error) { if (error?.code === "ESRCH") { await waitForExit(child, 1000); return false; } throw error; }
  }
  requireValue(await waitForExit(child, 5000), "Packaged app did not terminate after forced kill");
  return true;
}

/** Cleanup is secondary evidence. Preserve the original app/test error and
 * always attempt stdout/stderr logging even when process cleanup itself fails. */
export async function cleanupSmokePhase({ primaryError, stop, writeLogs }) {
  let cleanupError;
  try { await stop(); } catch (error) { cleanupError = error; }
  try { await writeLogs(cleanupError); }
  catch (error) { if (!cleanupError) cleanupError = error; }
  if (!primaryError && cleanupError) throw cleanupError;
}

async function runPhase(executable, profile, output, phase, timeoutMs) {
  const reportPath = join(output, `${phase}.json`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [
    `--desktop-smoke=${phase}`, `--desktop-profile=${profile}`, `--desktop-report=${reportPath}`,
  ], { env, detached: process.platform !== "win32", windowsHide: false, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "", launchError, exited = false, exitCode = null;
  child.stdout?.on("data", data => { stdout = (stdout + data).slice(-64_000); });
  child.stderr?.on("data", data => { stderr = (stderr + data).slice(-64_000); });
  child.once("error", error => { launchError = error; });
  child.once("exit", code => { exited = true; exitCode = code; });
  const deadline = Date.now() + timeoutMs;
  let report, primaryError;
  try {
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      try { report = JSON.parse(await readFile(reportPath, "utf8")); }
      catch (error) { if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
      if (report) {
        validateSmokeReport(report, phase);
        if (phase === "crash") {
          requireValue(!exited, "Crash phase exited before the launcher could force termination");
          requireValue(await forceStop(child), "Crash phase exited before external forced termination");
          report.forcedTermination = true;
          break;
        }
        if (exited) {
          requireValue(exitCode === 0, `${phase} app exited ${exitCode}`);
          report.normalExit = true;
          report.exitCode = exitCode;
          break;
        }
      } else if (exited) throw new Error(`${phase} app exited ${exitCode} before writing its report`);
      await new Promise(done => setTimeout(done, 100));
    }
    requireValue(report && (phase === "crash" || exited), `${phase} timed out`);
    const png = await readFile(join(output, `${phase}.png`));
    requireValue(png.length > 1024 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${phase} has no real PNG screenshot`);
    // These completion fields are added by the outside launcher only after
    // observing process exit/termination, never self-reported by the app.
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await cleanupSmokePhase({ primaryError, stop: () => forceStop(child), writeLogs: async cleanupError => {
      await Promise.all([
        writeFile(join(output, `${phase}.stdout.log`), stdout),
        writeFile(join(output, `${phase}.stderr.log`), stderr),
        ...(cleanupError ? [writeFile(join(output, `${phase}.cleanup.log`), String(cleanupError))] : []),
      ]);
    } });
  }
}

export async function runDesktopSmoke({ executable, output, timeoutMs = 60_000 }) {
  const executablePath = resolve(executable), outputPath = resolve(output);
  await mkdir(outputPath, { recursive: true });
  const profile = await mkdtemp(join(tmpdir(), "portalwrights-desktop-smoke-"));
  const evidence = await mkdtemp(join(tmpdir(), "portalwrights-desktop-evidence-"));
  const reports = {};
  await writeFile(join(outputPath, "scope.json"), JSON.stringify({
    executable: basename(executablePath), profile, sourceCommit: process.env.GITHUB_SHA ?? null,
    scope: "Synthetic packaged-app offline/save/relaunch/crash smoke test; not physical keyboard, human difficulty or Steam acceptance.",
  }, null, 2));
  for (const phase of SMOKE_PHASES) {
    try { reports[phase] = await runPhase(executablePath, profile, evidence, phase, timeoutMs); }
    finally {
      for (const extension of ["json", "png", "stdout.log", "stderr.log", "cleanup.log"]) {
        try { await copyFile(join(evidence, `${phase}.${extension}`), join(outputPath, `${phase}.${extension}`)); }
        catch (error) { if (error?.code !== "ENOENT") throw error; }
      }
    }
  }
  validateSmokeSequence(reports);
  await writeFile(join(outputPath, "summary.json"), JSON.stringify({ version: 1, ok: true, phases: SMOKE_PHASES, reports }, null, 2));
  console.log(`Packaged desktop smoke passed: ${SMOKE_PHASES.join(" → ")}`);
  return reports;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  const executable = value("--executable"), output = value("--output");
  if (!executable || !output) {
    console.error("Usage: node scripts/desktop-smoke.mjs --executable <packaged exe> --output <artifact directory>");
    process.exitCode = 1;
  } else {
    runDesktopSmoke({ executable, output }).catch(error => { console.error(error); process.exitCode = 1; });
  }
}

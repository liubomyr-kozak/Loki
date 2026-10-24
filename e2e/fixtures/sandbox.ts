/**
 * Low-level, reusable e2e sandbox helpers.
 *
 * Mirrors `scripts/smoke-test.js`'s hand-rolled `freePort`/`waitForServer`/
 * `killAndWait`/`pollUntil` helpers (see design.md §3.1) so the Playwright
 * harness and future suite-level fixtures don't reimplement process/port
 * plumbing per file.
 *
 * Nothing here is Playwright-specific — it's plain Node so it can be
 * imported from `playwright.config.ts`, `global-setup.ts`,
 * `global-teardown.ts`, and (in later tasks) suite-level fixtures.
 */
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import type { ChildProcess } from 'child_process';

export const repoRoot = path.resolve(__dirname, '..', '..');

export const DEMO_APP_NAMES = ['demo-backend', 'demo-frontend', 'demo-worker'] as const;
export type DemoAppName = (typeof DEMO_APP_NAMES)[number];

/** Poll `fn` until it returns truthy or `deadlineMs` elapses; returns the last result. */
export async function pollUntil<T>(fn: () => T | Promise<T>, deadlineMs = 3000, intervalMs = 100): Promise<T> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start >= deadlineMs) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Ask the OS for an unused TCP port on 127.0.0.1. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/** Poll `url` until it responds with any HTTP status (server is at least accepting connections), or throw. */
export async function waitForServer(
  url: string,
  opts: { deadlineMs?: number; child?: ChildProcess | null } = {}
): Promise<void> {
  const { deadlineMs = 30000, child = null } = opts;
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    if (child && child.exitCode !== null) {
      throw new Error(`process exited early with code ${child.exitCode} while waiting for ${url}`);
    }
    try {
      const res = await fetch(url);
      // Any response (even 404) means the server is up and answering HTTP.
      if (res) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server did not answer on ${url} within ${deadlineMs}ms`);
}

/** SIGTERM, then SIGKILL fallback if the process hasn't exited within `graceMs`. */
export async function killAndWait(child: ChildProcess | null | undefined, graceMs = 5000): Promise<void> {
  if (!child || child.exitCode !== null || child.killed) return;
  try {
    child.kill('SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + graceMs;
  while (child.exitCode === null && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (child.exitCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/** SIGTERM, then SIGKILL fallback, for a bare pid (no ChildProcess handle) — used to sweep detached-provider children in teardown. */
export async function killPidAndWait(pid: number, graceMs = 5000): Promise<void> {
  const alive = (): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  if (!alive()) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + graceMs;
  while (alive() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (alive()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/** Create a fresh mkdtemp sandbox directory for one Playwright test run. */
export function createSandbox(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'loki-e2e-'));
}

/**
 * `backend/apps/effectiveConfig.ts`'s `resolveEffective()` scans `repoPath`
 * for a `package.json` and, when no explicit environment selection is made,
 * auto-selects its FIRST script name as the "environment" — silently
 * replacing the app config's own `startCommand` with that script's raw
 * command text (e.g. `"node server.js"`, no `PORT=` prefix). This is a real
 * app-level behavior (out of e2e's scope to change — see task Scope
 * Boundaries), and it defeats `demo-config.ts`'s dynamically-allocated-port
 * `startCommand` for demo-backend/demo-frontend: `resolveEffective` picks up
 * their package.json's `"start": "node server.js"` script instead, which
 * falls back to a hardcoded default — never the intended dynamic port.
 * Confirmed via direct reproduction: a start attempt against an unmodified
 * copy binds the wrong port and never reaches 'running'. Strip `scripts`
 * from the sandboxed copy so `scanProject` finds nothing to auto-select and
 * `resolveEffective` falls through to `app.startCommand` as configured.
 */
export function stripPackageJsonScripts(appDir: string): void {
  const pkgPath = path.join(appDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  delete pkg.scripts;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

/** Recursively copy `demo/demo-backend`, `demo/demo-frontend`, `demo/demo-worker` into `<sandboxDir>/apps/<name>`. Returns the absolute paths of the copies. */
export function copyDemoApps(sandboxDir: string): Record<DemoAppName, string> {
  const appsDir = path.join(sandboxDir, 'apps');
  fs.mkdirSync(appsDir, { recursive: true });
  const result = {} as Record<DemoAppName, string>;
  for (const name of DEMO_APP_NAMES) {
    const src = path.join(repoRoot, 'demo', name);
    const dest = path.join(appsDir, name);
    fs.cpSync(src, dest, { recursive: true });
    // Not applied to copyExtraApp's clones: git-repo-scripts-preview.ts
    // deliberately exercises the package.json-scripts-by-ref feature this
    // works around here.
    stripPackageJsonScripts(dest);
    result[name] = dest;
  }
  return result;
}

/**
 * Recursively copy `demo/<sourceName>` into `<sandboxDir>/apps/<destDirName>`
 * — for a suite-exclusive EXTRA physical clone beyond the three tracked
 * `copyDemoApps` copies. Used when two fixtures would otherwise need to run
 * real git commands (checkout/branch create) against the very same on-disk
 * repo concurrently (`playwright.config.ts`'s `fullyParallel: true` gives no
 * ordering guarantee between suite files) — giving each its own physical
 * directory removes the race instead of trying to coordinate/lock across
 * unrelated Node processes. See `fixtures/git-repo-scripts-preview.ts` for
 * the concrete case this exists for.
 */
export function copyExtraApp(sandboxDir: string, sourceName: DemoAppName, destDirName: string): string {
  const appsDir = path.join(sandboxDir, 'apps');
  fs.mkdirSync(appsDir, { recursive: true });
  const src = path.join(repoRoot, 'demo', sourceName);
  const dest = path.join(appsDir, destDirName);
  fs.cpSync(src, dest, { recursive: true });
  return dest;
}

/** Remove the sandbox directory tree. Best-effort — never throws. */
export function removeSandbox(sandboxDir: string): void {
  try {
    fs.rmSync(sandboxDir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* best effort */
  }
}

// --- Detached-child pid bookkeeping ---------------------------------------
// The `detached` session provider (backend/apps/providers/detachedProvider.ts)
// spawns fully detached, unref'd children *inside the backend's own process*.
// Our Playwright process has no direct ChildProcess handle to them, and
// Playwright's own webServer teardown only kills the backend process itself
// — not its detached grandchildren. Suite-level fixtures (later tasks) that
// start demo apps through the backend API should record the resulting pid
// here so global-teardown can sweep anything still alive at the end of the
// run.

const PID_LOG_NAME = '.spawned-pids.jsonl';

export function pidLogPath(sandboxDir: string): string {
  return path.join(sandboxDir, PID_LOG_NAME);
}

/** Append a pid a suite fixture is responsible for to the sandbox's sweep log. */
export function recordSpawnedPid(sandboxDir: string, pid: number, label = ''): void {
  try {
    fs.appendFileSync(pidLogPath(sandboxDir), `${JSON.stringify({ pid, label, ts: Date.now() })}\n`);
  } catch {
    /* best effort — teardown will simply have nothing to sweep for this pid */
  }
}

/** Read back every pid recorded via `recordSpawnedPid` for this sandbox. */
export function readSpawnedPids(sandboxDir: string): number[] {
  const file = pidLogPath(sandboxDir);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
  const pids = new Set<number>();
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (typeof entry.pid === 'number') pids.add(entry.pid);
    } catch {
      /* skip malformed line */
    }
  }
  return Array.from(pids);
}

/** SIGTERM->SIGKILL every pid recorded for this sandbox. Best-effort, never throws. */
export async function sweepSpawnedPids(sandboxDir: string): Promise<void> {
  const pids = readSpawnedPids(sandboxDir);
  await Promise.all(pids.map((pid) => killPidAndWait(pid).catch(() => undefined)));
}

/**
 * Playwright `globalTeardown`: cleans up everything Playwright's own
 * `webServer` teardown does NOT know about.
 *
 * Playwright itself is responsible for stopping the backend + Vite
 * `webServer` processes (SIGTERM to `webserver-backend.ts` / the vite
 * command). What's left for us:
 *
 *   1. Any `detached`-session-provider grandchildren (backend/apps/
 *      providers/detachedProvider.ts spawns fully detached, unref'd
 *      children — a suite fixture that starts a demo app through the
 *      backend API should call `recordSpawnedPid()` so they land in the
 *      sandbox's pid log for us to sweep here; SIGTERM->SIGKILL, mirrors
 *      smoke-test.js's `killAndWait`).
 *   2. Best-effort: ask the (about-to-die) backend for any apps it still
 *      reports as running, in case a suite forgot step 1 — belt and
 *      suspenders, never fatal if the backend is already gone.
 *   3. Remove the mkdtemp sandbox directory.
 *   4. Clear the shared runtime manifest so the next run starts clean.
 */
import { readRuntimeManifestIfExists, clearRuntimeManifest } from './fixtures/runtime';
import { sweepSpawnedPids, removeSandbox, killPidAndWait } from './fixtures/sandbox';

interface ApiAppStatus {
  pid?: number | null;
}

async function sweepViaBackendApi(backendPort: number): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${backendPort}/api/apps`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return;
    const body = (await res.json()) as Record<string, ApiAppStatus> | ApiAppStatus[];
    const statuses: ApiAppStatus[] = Array.isArray(body) ? body : Object.values(body);
    const pids = statuses.map((s) => s.pid).filter((pid): pid is number => typeof pid === 'number');
    await Promise.all(pids.map((pid) => killPidAndWait(pid).catch(() => undefined)));
  } catch {
    // Backend already down, unreachable, or shape didn't match — fine, this
    // path is defense-in-depth on top of the pid log, not the primary sweep.
  }
}

export default async function globalTeardown(): Promise<void> {
  const runtime = readRuntimeManifestIfExists();
  if (!runtime) {
    console.log('[e2e:global-teardown] no runtime manifest found — nothing to clean up.');
    return;
  }

  console.log(`[e2e:global-teardown] sweeping detached children for sandbox ${runtime.sandboxDir}`);
  await sweepSpawnedPids(runtime.sandboxDir);
  await sweepViaBackendApi(runtime.backendPort);

  removeSandbox(runtime.sandboxDir);
  clearRuntimeManifest();
  console.log('[e2e:global-teardown] done.');
}

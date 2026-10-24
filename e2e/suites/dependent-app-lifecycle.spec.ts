/**
 * Suite 2/9 (design.md §5.2): `demo-frontend` (`dependsOn: ["demo-backend"]`)
 * start/stop semantics.
 *
 *  1. Starting `demo-frontend` recursively starts `demo-backend` first
 *     (`backend/apps/lifecycleOps.ts` — `startApp` awaits every entry in
 *     `app.dependsOn` before starting the app itself, ~line 121-125). We
 *     assert `demo-backend` reaches `running` WHILE `demo-frontend` is still
 *     `stopped`, not just that both eventually end up running.
 *  2. Stop asymmetry (analysis.md risk #4): stopping `demo-frontend` must
 *     NOT also stop `demo-backend` — explicit negative assertion, not just
 *     absence of a check.
 *
 * Talks to the backend API directly (`GET/POST /api/apps/:name/...`) rather
 * than driving the desktop UI — the dependsOn chain's intermediate state is
 * only reliably observable by polling status mid-flight, which is far
 * simpler over the API than through DOM badges.
 *
 * This suite owns `demo-backend` + `demo-frontend` process state exclusively
 * — it never starts/stops `demo-worker` (reserved for the sibling
 * `app-list-lifecycle.spec.ts` suite, task-2).
 *
 * Timeouts (design.md §6): a single port-bearing app's own start is bounded
 * by `PORT_DISCOVERY_TIMEOUT_MS=30000` (backend/apps/lifecycleOps.ts). The
 * full `demo-frontend` -> `demo-backend` dependsOn chain is budgeted
 * ~35-40s. Playwright's 5s default `toPass()`/`expect` timeout is far too
 * short for either, so every polling assertion below sets its own generous
 * timeout explicitly.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { BACKEND_PORT, VITE_PORT } from '../fixtures/runtime';

const BASE = `http://127.0.0.1:${BACKEND_PORT}`;

// design.md §6: PORT_DISCOVERY_TIMEOUT_MS (30s) + margin for a single app's
// own start. Bumped from 35s: real measured spawn+discovery for a portful
// demo app on this host consistently lands at ~30.8s (same as demo-worker's
// measured start in app-list-lifecycle/session-provider-detached), and the
// original 35s margin proved too tight once HTTP round-trip + request-queue
// overhead is included — observed FAILs at the 35s boundary on an otherwise
// fully isolated (workers: 1, no sibling contention) run.
const SINGLE_APP_START_TIMEOUT_MS = 50_000;
// design.md §6: ~35-40s budget for the full dependsOn chain (demo-backend's
// full port-discovery window, then demo-frontend's own on top of it).
// Bumped in lockstep with SINGLE_APP_START_TIMEOUT_MS above.
const CHAIN_START_TIMEOUT_MS = 65_000;
const STOP_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 250;

interface ApiAppStatus {
  name: string;
  process: 'running' | 'stopped' | 'port-conflict' | 'unhealthy' | 'unknown';
}

async function getStatus(request: APIRequestContext, name: string): Promise<ApiAppStatus> {
  const res = await request.get(`${BASE}/api/apps/${name}`);
  expect(res.ok(), `GET /api/apps/${name} should succeed`).toBeTruthy();
  return (await res.json()) as ApiAppStatus;
}

async function postStop(request: APIRequestContext, name: string): Promise<void> {
  await request.post(`${BASE}/api/apps/${name}/stop`, { data: {} });
}

async function waitForProcess(
  request: APIRequestContext,
  name: string,
  want: ApiAppStatus['process'],
  timeoutMs: number
): Promise<void> {
  await expect(async () => {
    const status = await getStatus(request, name);
    expect(status.process, `${name}.process`).toBe(want);
  }).toPass({ timeout: timeoutMs, intervals: [POLL_INTERVAL_MS] });
}

test.describe('dependent-app-lifecycle: demo-frontend (dependsOn demo-backend)', () => {
  // These two tests share `demo-backend`/`demo-frontend` process state — run
  // them one at a time so the second test always starts from the clean
  // "both stopped" state the first test's afterEach leaves behind.
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async ({ request }) => {
    // Teardown must stop both apps regardless of test outcome so no demo
    // process leaks into later suites/global-teardown. Best-effort: a
    // failed stop here shouldn't mask the test's own failure.
    await Promise.allSettled([postStop(request, 'demo-frontend'), postStop(request, 'demo-backend')]);
  });

  test('starting demo-frontend recursively starts demo-backend first', async ({ request }) => {
    // CHAIN_START_TIMEOUT_MS (65s) exceeds playwright.config.ts's global 60s
    // per-test timeout — override locally for this suite's real worst case.
    test.setTimeout(90_000);
    const initialBackend = await getStatus(request, 'demo-backend');
    const initialFrontend = await getStatus(request, 'demo-frontend');
    expect(initialBackend.process).toBe('stopped');
    expect(initialFrontend.process).toBe('stopped');

    // Fire the start WITHOUT awaiting completion: startApp('demo-frontend')
    // awaits startApp('demo-backend') to fully finish (incl. its own
    // port-discovery loop) before it even begins starting demo-frontend, so
    // the "backend running, frontend still stopped" window only exists
    // while this request is in flight — polling AFTER it resolves would
    // always observe both already running.
    const startPromise = request.post(`${BASE}/api/apps/demo-frontend/start`, { data: {} });
    // This promise is intentionally not awaited until after the polling loop
    // below (its whole point is to observe state WHILE the request is still
    // in flight). If it rejects during that window (e.g. `socket hang up`
    // from a dropped connection) before we get to `await startPromise`,
    // Node/Playwright treats it as an unhandled rejection and kills the
    // CURRENT test immediately — aborting the polling loop mid-flight with a
    // confusing stack trace instead of the real assertion failure below.
    // Attaching a handler to the same promise object now (not to a derived
    // `.then()`/`.catch()` chain) marks it "handled" for that purpose; the
    // real result/error is still observed via the original `startPromise`
    // reference when we `await` it further down.
    startPromise.catch(() => {});

    let observedBackendRunningWhileFrontendStopped = false;
    await expect(async () => {
      const [backend, frontend] = await Promise.all([
        getStatus(request, 'demo-backend'),
        getStatus(request, 'demo-frontend'),
      ]);
      if (backend.process === 'running' && frontend.process === 'stopped') {
        observedBackendRunningWhileFrontendStopped = true;
      }
      // Drives the retry loop: keep polling until demo-backend has come up.
      expect(backend.process, 'demo-backend.process').toBe('running');
    }).toPass({ timeout: SINGLE_APP_START_TIMEOUT_MS, intervals: [POLL_INTERVAL_MS] });

    expect(
      observedBackendRunningWhileFrontendStopped,
      'expected to observe demo-backend running while demo-frontend was still stopped (recursive dependsOn start order)'
    ).toBe(true);

    let startRes;
    try {
      startRes = await startPromise;
    } catch (err) {
      // A rejection here (e.g. `socket hang up`, `Request context disposed`)
      // means the connection carrying this request died mid-flight — the
      // backend process this suite's `webServer` started was killed or the
      // request context itself was torn down out from under us. That is not
      // something `demo-frontend`'s own start logic can cause by itself; by
      // this point we've already observed `demo-backend` reach `running`
      // above, so the dependsOn chain itself was progressing normally. Fail
      // with a message pointing at the likely real cause instead of letting
      // the raw network error stand alone.
      throw new Error(
        `POST /api/apps/demo-frontend/start's connection died before responding (${(err as Error).message}). ` +
          `This is not demo-frontend/demo-backend's own start logic failing — dependsOn progressed normally ` +
          `(demo-backend was already observed running above). Likely cause: something outside this test tore ` +
          `down the backend process or this APIRequestContext while the request was in flight (e.g. another ` +
          `concurrent process on fixed ports ${BACKEND_PORT}/${VITE_PORT}, or a prior assertion failure in this ` +
          `test triggering early teardown).`
      );
    }
    expect(startRes.ok(), 'POST /api/apps/demo-frontend/start should succeed').toBeTruthy();

    // Full chain: demo-frontend itself must reach running within the
    // dependsOn-chain budget.
    await waitForProcess(request, 'demo-frontend', 'running', CHAIN_START_TIMEOUT_MS);

    const backendFinal = await getStatus(request, 'demo-backend');
    expect(backendFinal.process).toBe('running');
  });

  test('stopping demo-frontend leaves demo-backend running', async ({ request }) => {
    test.setTimeout(90_000);
    const startRes = await request.post(`${BASE}/api/apps/demo-frontend/start`, { data: {} });
    expect(startRes.ok(), 'POST /api/apps/demo-frontend/start should succeed').toBeTruthy();

    await waitForProcess(request, 'demo-frontend', 'running', CHAIN_START_TIMEOUT_MS);
    await waitForProcess(request, 'demo-backend', 'running', SINGLE_APP_START_TIMEOUT_MS);

    const stopRes = await request.post(`${BASE}/api/apps/demo-frontend/stop`, { data: {} });
    expect(stopRes.ok(), 'POST /api/apps/demo-frontend/stop should succeed').toBeTruthy();

    await waitForProcess(request, 'demo-frontend', 'stopped', STOP_TIMEOUT_MS);

    // Stop asymmetry (analysis.md risk #4): demo-backend must remain
    // running — explicit negative assertion, not just "we didn't call stop
    // on it".
    const backendAfterStop = await getStatus(request, 'demo-backend');
    expect(backendAfterStop.process).toBe('running');
    expect(backendAfterStop.process).not.toBe('stopped');
  });
});

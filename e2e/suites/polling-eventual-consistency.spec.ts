/**
 * Verifies usePolling.ts's eventual-consistency contract (design.md §5.9,
 * analysis.md risk #2): a state change made behind the UI's back is picked
 * up on the next refetch trigger, but NOT before one happens.
 *
 * design.md §6 variant 2 (the adopted, lower-friction default — variant 1
 * would require a `VITE_E2E_POLL_MS` source-code injection point and is
 * explicitly NOT used here): rather than waiting out the real
 * `POLL_MS = 300000` (5 minutes, app/src/lib/constants.ts, untouched by
 * this suite), the test forces the OTHER refetch path usePolling.ts already
 * wires independently of the interval — the `window` `focus` listener
 * (app/src/hooks/usePolling.ts:41-49) — via
 * `page.evaluate(() => window.dispatchEvent(new Event('focus')))`.
 *
 * `demo-worker` is used (per task-10 acceptance): it has no `dependsOn` and
 * no port, so a start/stop is a plain process-alive transition with no
 * port-discovery wait (design.md §6) to conflate with polling-refetch
 * latency.
 */
import { test, expect } from '@playwright/test';
import { BACKEND_PORT } from '../fixtures/runtime';

const DEMO_WORKER_LABEL = 'Demo Worker';

function apiUrl(path: string): string {
  return `http://127.0.0.1:${BACKEND_PORT}${path}`;
}

/** Direct backend call, bypassing the UI entirely — the whole point of this suite. */
async function callApi(path: string): Promise<unknown> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

test.describe('polling eventual consistency (usePolling.ts interval + focus refetch)', () => {
  test.afterEach(async () => {
    // Best-effort cleanup so this suite doesn't leak a running demo-worker
    // into whatever runs next (design.md §3.4 — suites reset their own
    // state). Never fatal: if start failed, stop is a harmless no-op/404.
    await fetch(apiUrl('/api/apps/demo-worker/stop'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => undefined);
  });

  test('UI stays stale after a direct API state change, and updates only after a focus event', async ({ page }) => {
    // Registered BEFORE navigation so it can't miss the response: usePolling.ts's
    // mount effect (usePolling.ts:16-25) fires `dispatch(refreshAll())` ->
    // `fetchApps()` -> `api.getApps()` (app/src/api.ts:118), a single
    // GET /api/apps, independently of and in parallel with `fetchConfig()`.
    // The app-list rows render as soon as `config` resolves (they do NOT
    // wait on this apps-status fetch — app/src/store/selectors.ts's
    // `selectVisibleNames` only gates on `config`, and a not-yet-loaded
    // status renders with no `.dot` element at all, same as a genuinely
    // stopped one — app/src/components/AppList/AppRowStatus.tsx:14-34,
    // app/src/hooks/useAppRow.ts:153-155). So the row being visible with
    // zero `.dot.running` does NOT by itself prove this initial status fetch
    // has landed. If it's still in flight when the test's direct
    // `/start` call below fires, it resolves with the ALREADY-running state
    // moments later — indistinguishable from a real poll, but actually just
    // the first-ever status fetch racing the direct API call. Waiting for it
    // here closes that race.
    const initialAppsFetch = page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/apps'
    );
    await page.goto('/');
    await initialAppsFetch;

    const row = page.locator('.row', { hasText: DEMO_WORKER_LABEL }).first();
    await expect(row).toBeVisible();

    // Baseline: demo-worker starts stopped (fresh sandboxed config, never
    // started by this test yet) — the running-state `.dot.running` indicator
    // (app/src/components/AppList/AppRowStatus.tsx) must not be present.
    await expect(row.locator('.dot.running')).toHaveCount(0);

    // Trigger the state change directly against the backend HTTP API — NOT
    // through a UI click — so the only thing that can surface it in the UI
    // is usePolling.ts's own refetch machinery.
    const startedStatus = (await callApi('/api/apps/demo-worker/start')) as { process?: string };
    expect(startedStatus.process).toBe('running');

    // The UI must NOT reflect the change yet: no focus event has fired, and
    // POLL_MS (5 minutes) is nowhere near elapsing. Give the page a short
    // grace window to (wrongly) pick it up before asserting it hasn't.
    await page.waitForTimeout(1000);
    await expect(row.locator('.dot.running')).toHaveCount(0);

    // Force the focus-triggered refetch path usePolling.ts wires
    // independently of the interval (app/src/hooks/usePolling.ts:41-50)
    // — this is design.md §6 variant 2, no source change, no VITE_E2E_POLL_MS.
    // Evaluated as a string (not a typed arrow fn): e2e/tsconfig.json's `lib`
    // is Node-only (no `dom`), so `window` isn't a resolvable type here —
    // this still runs in the page's browser context exactly the same way.
    await page.evaluate("window.dispatchEvent(new Event('focus'))");

    // Now the UI should catch up, well within a bounded timeout (not 5 minutes).
    await expect(row.locator('.dot.running')).toBeVisible({ timeout: 10_000 });
  });
});

/**
 * Suite 1 (design.md §5.1): single-app start/stop/status lifecycle for
 * `demo-worker` — the one demo app with no `dependsOn` and no port, so
 * there's no port-discovery wait involved (analysis.md §6 risk #5 only
 * applies to `demo-backend`/`demo-frontend`). Every state transition below
 * is driven through real UI clicks against the AppRow toggle button
 * (app/src/components/AppList/AppRowActions.tsx), never a direct API
 * call to the backend — the API is only used in `afterEach` as a teardown
 * safety net, not as part of what's being asserted.
 *
 * `demo-worker` only: this suite must never start/stop `demo-backend` or
 * `demo-frontend` (reserved for `dependent-app-lifecycle.spec.ts`, task-3)
 * so demo-app process state stays independent across parallel workers per
 * design.md §3.4/§4.
 */
import { test, expect } from '@playwright/test';
import { BACKEND_PORT } from '../fixtures/runtime';

const APP_LABEL = 'Demo Worker';

/** Locate the demo-worker row by its config-derived label — never by index/order. */
function demoWorkerRow(page: import('@playwright/test').Page) {
  return page.locator('.row').filter({ hasText: APP_LABEL });
}

/** The row's single primary action button (Start/Stop toggle). */
function toggleButton(page: import('@playwright/test').Page) {
  return demoWorkerRow(page).locator('button.toggle');
}

/** Best-effort direct-API stop, used only for teardown — never for assertions. */
async function stopDemoWorkerViaApi(): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/apps/demo-worker/stop`, { method: 'POST' });
  } catch {
    /* best effort — nothing left to stop, or backend already down */
  }
}

test.describe('app list lifecycle — demo-worker', () => {
  test.afterEach(async () => {
    // Guards against a failed assertion leaving demo-worker running and
    // leaking its process into another suite's worker (design.md §3.4).
    await stopDemoWorkerViaApi();
  });

  test('demo-worker: stopped -> running -> stopped via UI clicks', async ({ page }) => {
    await page.goto('/');

    const row = demoWorkerRow(page);
    await expect(row).toBeVisible();

    const toggle = toggleButton(page);

    // --- initial state: stopped -----------------------------------------
    // AppRowStatus only renders a `.dot` (status-colored) when the app is
    // running/unhealthy (app/src/components/AppList/AppRowStatus.tsx) —
    // a stopped row shows its plain icon instead. The reliable UI signal for
    // "stopped" is therefore the toggle button reading "Start" and no
    // running-state dot being present yet.
    await expect(toggle).toHaveText('Start');
    await expect(row.locator('.dot.running')).toHaveCount(0);

    // --- start: stopped -> running ----------------------------------------
    await toggle.click();

    // Real-run finding: contrary to this suite's original assumption, the
    // backend's POST /api/apps/:name/start does NOT skip port discovery for
    // a portless app like demo-worker — startAppLocked (backend/apps/
    // lifecycleOps.ts) unconditionally polls discoverPort(pid) every
    // PORT_DISCOVERY_POLL_MS (1s) for up to PORT_DISCOVERY_TIMEOUT_MS
    // (30s) before responding, and the UI only flips a row to "running"
    // once that response lands (POLL_MS background refresh is 5 minutes,
    // far too slow to mask this). So the toggle click's fetch — and with it
    // this dot — genuinely does not resolve for ~30s. That is app-level
    // behavior this test cannot change; the timeout below is set above that
    // real worst case instead of the previous (incorrect) default 5s.
    await expect(row.locator('.dot.running')).toBeVisible({ timeout: 35_000 });
    // The dot and the toggle's label are both derived from the same status
    // update (useAppRow.ts: `st`/`isStoppable`) but the label ALSO gates on
    // `isBusy` (AppRowActions.tsx renders a spinner, not text, while busy) —
    // both flip in the same redux reducer tick as the dot, but under
    // machine load the commit/paint of that render can trail the dot's own
    // assertion by more than Playwright's tight 5s default (observed once
    // in a real run: the toggle still read the disabled spinner state for
    // several retries after the dot had already appeared). Widened rather
    // than left at the default so a slow paint doesn't flake a test whose
    // underlying state transition is already correct and atomic.
    await expect(toggle).toContainText('Stop', { timeout: 10_000 });

    // --- stop: running -> stopped ------------------------------------------
    await toggle.click();

    await expect(row.locator('.dot.running')).toHaveCount(0, { timeout: 10_000 });
    await expect(toggle).toHaveText('Start', { timeout: 10_000 });
  });
});

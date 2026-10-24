/**
 * design.md §5.8 / §3.1 — session-provider-detached suite.
 *
 * Verifies the UI's app-list status badge and the Sessions dropdown
 * (`app/src/components/Header/SessionsDropdown.tsx`) both reflect a
 * REAL `detached`-provider-backed process end-to-end, against the sandboxed
 * backend task-1's fixtures already boot (see `fixtures/runtime.ts`,
 * `fixtures/demo-config.ts` — `global.sessionProvider: "detached"`).
 *
 * `detached` (backend/apps/providers/detachedProvider.ts, provider id
 * `'detached'`) is a shipped, non-fake provider that spawns a real detached
 * child process and answers `sessionAlive`/`listSessions` via a real
 * `process.kill(pid, 0)` liveness check — not a stub. `demo-worker` is used
 * because it has no `dependsOn` and no port, so this suite needs none of the
 * port-discovery wait budget suites 2/9 in design.md require (§6).
 *
 * Deliberately touches ONLY `demo-worker` — no `demo-backend`/`demo-frontend`
 * references anywhere in this file, keeping this suite's process footprint
 * disjoint from task-3's `dependent-app-lifecycle.spec.ts`.
 */
import { test, expect } from '@playwright/test';
import { BACKEND_PORT } from '../fixtures/runtime';

const APP_LABEL = 'Demo Worker';
const APP_NAME = 'demo-worker';
const API_BASE = `http://127.0.0.1:${BACKEND_PORT}`;

/** Best-effort direct-API stop, used both mid-test and in teardown — never throws. */
async function stopDemoWorkerViaApi(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/apps/${APP_NAME}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  } catch {
    /* best effort — teardown must never fail the run over an already-stopped app */
  }
}

test.describe('session provider (detached) — demo-worker', () => {
  // Acceptance: "Suite's teardown stops demo-worker regardless of test
  // outcome." Goes straight through the backend API rather than the UI so
  // it doesn't depend on the page/app still being in a clickable state
  // after a failed assertion.
  test.afterEach(async () => {
    await stopDemoWorkerViaApi();
  });

  test('start via UI reflects a real detached-provider process in the status badge and Sessions dropdown; stop removes it from both', async ({ page }) => {
    // Overrides the suite-file default (60s, sized for the port-discovery
    // suites this file explicitly opts out of) — this test's own start step
    // alone can take up to ~30s per the port-discovery-loop note below, so
    // it needs headroom past that plus the rest of the flow.
    test.setTimeout(90_000);

    // Sanity check on the harness itself (design.md §3.1's "correction to
    // intake framing"): the sandboxed config really is wired to the real
    // `detached` provider, not `tmux` and not a fake in-memory double.
    const globalConfig = (await fetch(`${API_BASE}/api/config/global`).then((r) => r.json())) as {
      global: { sessionProvider: string };
      activeProvider: string;
    };
    expect(globalConfig.global.sessionProvider).toBe('detached');
    expect(globalConfig.activeProvider).toBe('detached');

    await page.goto('/');

    const row = page.locator('.row', { hasText: APP_LABEL });
    await expect(row).toBeVisible();

    const toggleBtn = row.locator('.toggle');
    const statusDot = row.locator('.dot');

    // Starting state: stopped, no active-status dot rendered yet (AppRowStatus
    // only renders `.dot` once `hasActiveStatus` — running or unhealthy).
    await expect(toggleBtn).toHaveText('Start');

    await toggleBtn.click();

    // Correction to this suite's original assumption: even though
    // demo-worker has no port, `startAppLocked` (backend/apps/lifecycleOps.ts)
    // unconditionally runs its port-discovery poll loop after spawning —
    // `PORT_DISCOVERY_TIMEOUT_MS` (30s) × `PORT_DISCOVERY_POLL_MS` (1s)
    // steps — regardless of whether the app declares a port at all. For a
    // portless app `discoverPort(pid)` never resolves, so the loop always
    // runs its full 30s before the `POST /start` response (and thus this
    // click) settles. Confirmed via a real run: the button stayed disabled
    // (busy, no text) for ~30s, then reverted to enabled "Start" once the
    // default 5s/30s assertion timeout gave up before the backend's 30s
    // loop finished. Wait past that budget with margin instead of assuming
    // a fast synchronous resolve.
    await expect(toggleBtn).toHaveText('Stop', { timeout: 40_000 });
    await expect(statusDot).toHaveClass(/\brunning\b/);

    // Cross-check directly against the backend: `process: 'running'` must
    // correlate with `sessionAlive: true`, which the detached provider only
    // reports after a real `process.kill(pid, 0)` liveness check — this is
    // what distinguishes it from a stubbed/mocked provider that could report
    // "running" without ever spawning anything.
    await expect(async () => {
      const apps = (await fetch(`${API_BASE}/api/apps`).then((r) => r.json())) as Record<string, { process?: string; sessionAlive?: boolean }>;
      expect(apps[APP_NAME]?.process).toBe('running');
      expect(apps[APP_NAME]?.sessionAlive).toBe(true);
    }).toPass();

    // Sessions dropdown: the header-level session button only renders once
    // `sessions.sessions.length > 0` (SessionsDropdown.tsx) — populated via
    // `refreshAll()`'s `fetchSessions()` call, which the row's own start
    // handler already triggers, so the button should now be present.
    const sessionsToggle = page.locator('.sessionsWrap .groupBtn');
    await expect(sessionsToggle).toBeVisible();
    await sessionsToggle.click();

    const sessionRow = page.locator('.sessionsRow', { hasText: APP_LABEL });
    await expect(sessionRow).toBeVisible();
    await expect(sessionRow.locator('.sessionDot')).not.toHaveClass(/\bdead\b/);

    // Stop via the UI (row toggle, not the sessions panel's own stop button —
    // exercises the same lifecycle path the test started with).
    await toggleBtn.click();

    await expect(toggleBtn).toHaveText('Start');
    await expect(statusDot).toHaveCount(0);

    // The dropdown either closes entirely (sessions.length back to 0 —
    // SessionsDropdown returns null) or stays open with the row gone; either
    // way `demo-worker`'s session row must no longer be listed.
    await expect(page.locator('.sessionsRow', { hasText: APP_LABEL })).toHaveCount(0);

    await expect(async () => {
      const apps = (await fetch(`${API_BASE}/api/apps`).then((r) => r.json())) as Record<string, { process?: string }>;
      expect(apps[APP_NAME]?.process).not.toBe('running');
    }).toPass();
  });
});

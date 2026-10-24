/**
 * Groups + search/filter DOM-assertions suite (design.md §5.7, task-8).
 *
 * Scope, per the task spec:
 *  - Group rendering: `AllSection`/`GroupSection` (`OtherSection` is a real
 *    component but is NOT mounted anywhere in `AppList.tsx` today — only
 *    `GroupSection` + `AllSection` are — and the demo config's three apps are
 *    all tagged into a real group, so there is no ungrouped app to exercise
 *    it with anyway; nothing here relies on it).
 *  - The group-level start-conflict dialog (`GroupStartConflictDialog.tsx`).
 *  - Search/filter via `Header`/`SearchBar`.
 *
 * No new backend API surface beyond start/stop/status, already exercised by
 * other suites — this file only uses those to set up a known runtime
 * precondition for the conflict-dialog scenario, and always via direct API
 * calls (never through another suite's fixture file), so it has no import
 * dependency on task-2..7.
 *
 * Demo config groups (demo/loki-config.json, copied verbatim into the
 * sandbox by fixtures/demo-config.ts): "Demo Web" = [demo-backend,
 * demo-frontend], "Demo Background" = [demo-worker].
 */
import { test, expect, type Page } from '@playwright/test';
import { ensureRuntime } from '../fixtures/runtime';

let backendPort: number;

test.beforeAll(async () => {
  // Idempotent (fixtures/runtime.ts): the backend webServer entry already
  // created the one sandbox for this run; this just reads the same manifest
  // back to learn the (fixed) backend port for direct API calls below.
  const runtime = await ensureRuntime();
  backendPort = runtime.backendPort;
});

interface ApiAppStatus {
  process: string;
  branch?: string;
}

function apiUrl(path: string): string {
  return `http://127.0.0.1:${backendPort}${path}`;
}

async function apiStart(name: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/apps/${name}/start`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`e2e: start ${name} failed: ${res.status} ${await res.text()}`);
}

async function apiStop(name: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/apps/${name}/stop`), { method: 'POST' });
  if (!res.ok) throw new Error(`e2e: stop ${name} failed: ${res.status} ${await res.text()}`);
}

async function apiStatus(name: string): Promise<ApiAppStatus> {
  const res = await fetch(apiUrl(`/api/apps/${name}`));
  if (!res.ok) throw new Error(`e2e: status ${name} failed: ${res.status}`);
  return (await res.json()) as ApiAppStatus;
}

// Budget per design.md §6: port-discovery is polled every 1s up to a real
// 30s worst case for a port-bearing app (demo-backend has one). Bumped from
// 35s to 50s: real measured demo-backend start consistently lands near the
// 30s ceiling, and HTTP round-trip/request-queue overhead pushed observed
// runs past a 35s deadline even with zero sibling contention (workers: 1).
async function waitUntilRunning(name: string, deadlineMs = 50000): Promise<ApiAppStatus> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const status = await apiStatus(name);
    if (status.process === 'running') return status;
    if (Date.now() - start >= deadlineMs) {
      throw new Error(`e2e: ${name} did not reach 'running' within ${deadlineMs}ms (last status: ${status.process})`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  // "Demo Web"/"Demo Background" (GroupSection) start expanded — unlike the
  // "All" section, which uiSlice's initialState.collapsedGroups seeds
  // collapsed (ALL_ID) — so this is a reliable "config + initial status
  // fetch landed" signal without waiting on the 5-minute poll interval.
  await expect(page.locator('.groupHeader', { hasText: 'Demo Web' })).toBeVisible({ timeout: 15000 });
}

// `.groupHeader` and its sibling `.groupCard` (the rows) are rendered as
// direct siblings inside one wrapper div by both GroupSection.tsx and
// AllSection.tsx — this is the one DOM relationship every section in this
// suite is scoped through.
function cardFor(header: ReturnType<Page['locator']>) {
  return header.locator('xpath=following-sibling::div[contains(@class,"groupCard")]');
}

test.describe('group rendering', () => {
  test('AllSection shows every app, GroupSection sections apps under their configured group', async ({ page }) => {
    await gotoApp(page);

    const demoWebHeader = page.locator('.groupHeader', { hasText: 'Demo Web' });
    const demoBgHeader = page.locator('.groupHeader', { hasText: 'Demo Background' });
    await expect(demoWebHeader).toBeVisible();
    await expect(demoBgHeader).toBeVisible();

    const demoWebCard = cardFor(demoWebHeader);
    const demoBgCard = cardFor(demoBgHeader);

    // "Demo Web" = [demo-backend, demo-frontend] only.
    await expect(demoWebCard.locator('.row', { hasText: 'Demo Backend' })).toBeVisible();
    await expect(demoWebCard.locator('.row', { hasText: 'Demo Frontend' })).toBeVisible();
    await expect(demoWebCard.locator('.row', { hasText: 'Demo Worker' })).toHaveCount(0);

    // "Demo Background" = [demo-worker] only.
    await expect(demoBgCard.locator('.row', { hasText: 'Demo Worker' })).toBeVisible();
    await expect(demoBgCard.locator('.row', { hasText: 'Demo Backend' })).toHaveCount(0);
    await expect(demoBgCard.locator('.row', { hasText: 'Demo Frontend' })).toHaveCount(0);

    // AllSection (GroupHeader name="All") mirrors the whole list-surface
    // roster regardless of group membership — expand it (collapsed by
    // default) and confirm all three appear there too.
    const allHeader = page.locator('.groupHeader', { hasText: 'All' });
    await expect(allHeader).toBeVisible();
    await allHeader.click();

    const allCard = cardFor(allHeader);
    await expect(allCard.locator('.row', { hasText: 'Demo Backend' })).toBeVisible();
    await expect(allCard.locator('.row', { hasText: 'Demo Frontend' })).toBeVisible();
    await expect(allCard.locator('.row', { hasText: 'Demo Worker' })).toBeVisible();
  });
});

test.describe('search / filter', () => {
  test('SearchBar narrows the visible app rows by label', async ({ page }) => {
    await gotoApp(page);

    // No dedicated "open search" control exists — Header only renders
    // SearchBar once ui.searchActive is true, and useKeyboardSearch.ts's
    // global keydown listener is the only thing that flips it: typing any
    // single printable character while nothing is focused in an
    // input/textarea activates search and seeds the query with that
    // character (app/src/hooks/useKeyboardSearch.ts:11-29). Fresh page
    // load has no focused input, so this is safe to fire immediately.
    await page.keyboard.type('w');

    const searchInput = page.locator('.header input[placeholder="Search apps…"]');
    await expect(searchInput).toBeVisible();

    // Replace with a full query via the now-visible, now-focused input
    // itself (typing further raw keystrokes through the global listener
    // races React's render/focus cycle — filling the controlled input
    // directly is the deterministic way to set the rest of the query).
    await searchInput.fill('worker');
    await expect(searchInput).toHaveValue('worker');

    // Matching query ("worker" matches only "Demo Worker", case-insensitive
    // per selectVisibleNames/makeSectionRows): "Demo Background" survives,
    // "Demo Web" has zero visible members left and disappears entirely
    // (selectGroupSections drops empty sections).
    await expect(page.locator('.groupHeader', { hasText: 'Demo Background' })).toBeVisible();
    await expect(page.locator('.groupHeader', { hasText: 'Demo Web' })).toHaveCount(0);
    await expect(page.locator('.row', { hasText: 'Demo Worker' })).toBeVisible();
    await expect(page.locator('.row', { hasText: 'Demo Backend' })).toHaveCount(0);
    await expect(page.locator('.row', { hasText: 'Demo Frontend' })).toHaveCount(0);

    // Non-matching query: every group section disappears and AppList.tsx's
    // empty-state message renders instead.
    await searchInput.fill('zzz-nonexistent-app');
    await expect(page.locator('.empty', { hasText: 'No apps match your search.' })).toBeVisible();
    await expect(page.locator('.groupHeader', { hasText: 'Demo Web' })).toHaveCount(0);
    await expect(page.locator('.groupHeader', { hasText: 'Demo Background' })).toHaveCount(0);

    // SearchBar's own clear button (uiSlice.clearSearch) restores the full
    // list and closes search mode entirely.
    await page.locator('.header button[title="Clear search"]').click();
    await expect(searchInput).toHaveCount(0);
    await expect(page.locator('.groupHeader', { hasText: 'Demo Web' })).toBeVisible();
    await expect(page.locator('.groupHeader', { hasText: 'Demo Background' })).toBeVisible();
  });
});

test.describe('group start conflict dialog', () => {
  // This scenario is the only one in the file that round-trips a real
  // demo-backend process start (port-discovery, a live git branch, an
  // actual OS process) rather than pure DOM/API-seed state, so it is also
  // the only one exposed to host-level contention (this repo's e2e harness
  // pins the backend/vite dev servers to fixed ports 9999/1421 — see
  // playwright.config.ts — so a concurrently-running second e2e invocation,
  // or heavy system load, can slow or outright kill the in-process backend
  // mid-test with no JS-level stack trace to show for it: observed directly
  // against this suite as an immediate `ECONNREFUSED`/`socket other side
  // closed` on the `start` call under contention). A couple of retries
  // absorbs that class of host flake without masking a real assertion
  // failure (each retry re-runs the full stop/start/drift/dialog sequence
  // from scratch via beforeEach-equivalent setup at the top of the test
  // body + afterEach below).
  test.describe.configure({ retries: 2 });

  // Own setup/teardown, independent of whatever demo-backend/demo-frontend
  // state other suites leave behind: always force both apps to a known
  // stopped state before the scenario, and always stop demo-backend again
  // afterwards — this suite starts it, so this suite leaves it stopped.
  test.afterEach(async () => {
    await apiStop('demo-frontend').catch(() => {});
    await apiStop('demo-backend').catch(() => {});
  });

  test('starting a group with a running, intent-drifted member surfaces the conflict dialog', async ({ page }) => {
    // playwright.config.ts's global per-test timeout (60s) budgets for a
    // single worst-case port-discovery wait (design.md §6's "35s leaves
    // margin on top of [a 30s worst case]", mirrored in waitUntilRunning's
    // default `deadlineMs` above). This test's own `apiStart` call is a
    // synchronous-until-listening POST — backend/apps/lifecycleOps.ts holds
    // the HTTP response open until the spawned demo-backend's port is
    // discovered or that same ~30s budget is exhausted — so the 30s can
    // already be spent *before* `waitUntilRunning` below starts its own
    // up-to-35s poll: back-to-back, that is up to ~65s just to observe
    // "running", before any of the branch-picker/dialog interaction that
    // follows even starts. That sum alone exceeds the global 60s budget
    // (reproduced directly: the un-widened test failed with "Test timeout
    // 60000ms exceeded" while still polling for 'running', with `apiStart`
    // alone having already taken ~30s). Widen locally rather than touching
    // the shared global timeout in playwright.config.ts, which the other
    // suites' tests are tuned against.
    test.setTimeout(120_000);

    await apiStop('demo-frontend').catch(() => {});
    await apiStop('demo-backend').catch(() => {});

    // Precondition this suite owns end-to-end: demo-backend running on its
    // real checked-out branch, demo-frontend stopped — so "Demo Web"'s
    // GroupHeader has one running member and one not-running member, which
    // is exactly what makes it render a "Start" pill (GroupHeader.tsx:
    // hasNotRunning) rather than "Stop".
    await apiStart('demo-backend');
    const started = await waitUntilRunning('demo-backend');
    const liveBranch = started.branch;
    expect(liveBranch).toBeTruthy();

    await gotoApp(page);

    const demoWebHeader = page.locator('.groupHeader', { hasText: 'Demo Web' });
    const demoWebCard = cardFor(demoWebHeader);
    const backendRow = demoWebCard.locator('.row', { hasText: 'Demo Backend' });
    await expect(backendRow).toBeVisible();

    // Pick a branch on demo-backend's row THROUGH THE GROUP SECTION. Inside
    // a group, selecting a branch only records group intent
    // (groupSelectionsSlice via useAppRow.ts's onSelectBranch) — it does
    // NOT check out immediately, so this cannot itself mutate the
    // sandboxed repo. That stored intent now disagrees with the already
    // -running live branch, which is exactly the drift
    // groupOps.groupIntentConflicts()/hasIntentDrift() gate on.
    const branchPicker = backendRow.locator('.pickerTrigger.chip-branch');
    await branchPicker.click();
    const driftBranch = liveBranch === 'main' ? 'feature-error-mode' : 'main';
    const branchOption = page.getByRole('option', { name: driftBranch, exact: true });
    await expect(branchOption).toBeVisible({ timeout: 10000 });
    await branchOption.click();

    const startPill = demoWebHeader.locator('.groupActionPill.start');
    await expect(startPill).toBeVisible();
    await startPill.click();

    // GroupStartConflictDialog.tsx renders GitCheckoutConfirm with this
    // exact title + a warning row naming the drifted app.
    await expect(
      page.locator('.modalTitle', { hasText: 'Some apps in this group are running with different settings' })
    ).toBeVisible();
    await expect(page.locator('.modalRow', { hasText: 'Demo Backend' })).toBeVisible();

    // Cancel is a true no-op (GroupStartConflictDialog.tsx: only clears
    // ui.pendingExclusiveStart, never dispatches startGroupExclusive) —
    // asserting on it verifies the gate fired without needing to also drive
    // an actual restart/checkout through it.
    await page.locator('.modalActions .modalBtn', { hasText: 'Cancel' }).click();
    await expect(page.locator('.modalOverlay')).toHaveCount(0);

    const afterCancel = await apiStatus('demo-backend');
    expect(afterCancel.process).toBe('running');
    expect(afterCancel.branch).toBe(liveBranch);
  });
});

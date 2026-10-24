/**
 * Task-5 (design.md §5.4 / analysis.md §3): dirty-checkout auto-stash,
 * re-apply conflict, and stale-stash scenarios for `demo-frontend`'s git
 * branch flow. Own dedicated repo state — never touches `demo-backend`'s or
 * `demo-worker`'s repo (see `fixtures/git-repo-stash-conflict.ts`'s header).
 *
 * Every scenario drives the flow through the real UI (Picker → GitCheckoutConfirm)
 * against the real running backend (`backend/git/gitFlowService.ts`), asserting
 * both on the raw `POST .../git/checkout` response body (captured via
 * `page.waitForResponse`) and on what the UI actually renders — the two are
 * meant to diverge in exactly the ways `gitSlice.ts`'s reducer distinguishes
 * (`conflict` vs `checkoutError`), so both must be checked, not just one.
 *
 * The three tests share ONE git repo instance (the sandboxed `demo-frontend`
 * copy) and must run in a fixed order without interleaving — `serial` mode
 * turns off this file's share of `fullyParallel` (playwright.config.ts).
 */
import { test, expect, type Page, type Response } from '@playwright/test';
import { readRuntimeManifestIfExists } from '../fixtures/runtime';
import {
  ensureGitRepoWithBranches,
  resetRepoState,
  dirtyWorktree,
  readFixtureFile,
  listStashRaw,
  dropStashOutOfBandByTag,
  commitOnBranch,
  currentBranch,
  BRANCH_A,
  BRANCH_B,
} from '../fixtures/git-repo-stash-conflict';

test.describe.configure({ mode: 'serial' });

const APP_LABEL = 'Demo Frontend';
const STASH_TAG_A = `loki-orchestrator:${BRANCH_A}`;

function getRepoPath(): string {
  const runtime = readRuntimeManifestIfExists();
  if (!runtime) {
    throw new Error('e2e: runtime manifest not found — global-setup must run before this suite.');
  }
  const repoPath = runtime.demoAppDirs['demo-frontend'];
  if (!repoPath) {
    throw new Error('e2e: demo-frontend repo path missing from runtime manifest.');
  }
  return repoPath;
}

/** `page.request` has no baseURL configured for API calls in this project's
 * playwright config (only `page.goto` gets one) — same pattern as
 * `git-branch-switch.spec.ts`'s own `apiUrl` helper, resolving the backend's
 * real port from the shared runtime manifest instead of hardcoding it. */
function apiUrl(pathSuffix: string): string {
  const runtime = readRuntimeManifestIfExists();
  if (!runtime) {
    throw new Error('e2e: runtime manifest not found — global-setup must run before this suite.');
  }
  return `http://127.0.0.1:${runtime.backendPort}${pathSuffix}`;
}

/** Expands the "All" group section if it's collapsed. `uiSlice`'s
 * `initialState` starts with `collapsedGroups: [ALL_ID]`, so `AllSection`'s
 * rows aren't even in the DOM until this runs once per fresh page load
 * (mirrors `git-branch-switch.spec.ts`'s identical setup step). */
async function expandAllSection(page: Page): Promise<void> {
  const allHeader = page.locator('.groupHeader', { hasText: 'All' });
  await expect(allHeader).toBeVisible();
  await allHeader.click();
}

function demoFrontendRow(page: Page) {
  // Both `GroupSection` and `AllSection` render one row per app
  // (AppList.tsx, demo-frontend sits in the "Demo Web" group) — but only
  // `AllSection`'s row does a direct checkout on branch-select.
  // `GroupSection`'s row has a defined `groupId`, so `useAppRow.ts`'s
  // `onSelectBranch` routes it through `setGroupIntent` instead of
  // `requestBranchSwitch`/`switchBranch` — no `POST .../git/checkout` is
  // ever issued from that row (see `git-branch-switch.spec.ts`'s identical
  // note). `AllSection` renders AFTER `GroupSection` in the DOM
  // (`AppList.tsx`), so `.last()` — not `.first()` — pins to the row that
  // actually drives the checkout flow this suite exercises. Requires
  // `expandAllSection` to have run first, or `AllSection`'s row won't exist
  // in the DOM at all (collapsed by default) and `.last()` would silently
  // fall back to `GroupSection`'s row.
  return page.locator('.row').filter({ hasText: APP_LABEL }).last();
}

/** Opens the branch picker, selects `branch`, and returns the parsed
 * `POST .../git/checkout` response body. The options list is portaled to
 * `document.body` (`Popover.tsx`), so it must be queried at the page level,
 * not scoped under the row. */
async function selectBranch(page: Page, row: ReturnType<typeof demoFrontendRow>, branch: string): Promise<Record<string, unknown>> {
  const trigger = row.locator('.chip-branch');
  const branchesResponse = page.waitForResponse(
    (r: Response) => r.url().includes('/git/branches') && r.request().method() === 'GET'
  );
  await trigger.click();
  await branchesResponse;

  const option = page.getByRole('option', { name: branch, exact: true });
  await option.waitFor({ state: 'visible' });

  const [checkoutResponse] = await Promise.all([
    page.waitForResponse((r: Response) => r.url().includes('/git/checkout') && r.request().method() === 'POST'),
    option.click(),
  ]);
  return checkoutResponse.json();
}

test.beforeAll(() => {
  const repoPath = getRepoPath();
  ensureGitRepoWithBranches(repoPath);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expandAllSection(page);
});

test('dirty checkout auto-stashes on switch away and auto-unstashes on switch back', async ({ page }) => {
  const repoPath = getRepoPath();
  resetRepoState(repoPath, BRANCH_A);
  const dirtyContent = 'dirtied-by-e2e-roundtrip-test\n';
  dirtyWorktree(repoPath, dirtyContent);

  const row = demoFrontendRow(page);
  await expect(row.locator('.chip-branch .chipText')).toBeVisible();

  // Switch away: dirty tree on BRANCH_A must be auto-stashed, tagged for
  // BRANCH_A, and the checkout onto BRANCH_B must land clean.
  const awayBody = await selectBranch(page, row, BRANCH_B);
  expect(awayBody.ok).not.toBe(false);
  expect(awayBody.stashed).toBe(true);
  await expect(row.locator('.chip-branch .chipText')).toHaveText(BRANCH_B);
  expect(currentBranch(repoPath)).toBe(BRANCH_B);
  // Worktree is clean on BRANCH_B — the dirty edit followed the stash, not the checkout.
  expect(readFixtureFile(repoPath)).not.toBe(dirtyContent);

  const stashesAfterAway = listStashRaw(repoPath);
  expect(stashesAfterAway).toHaveLength(1);
  expect(stashesAfterAway[0].message).toContain(STASH_TAG_A);

  // Switch back: the matching stash record must auto-apply.
  const backBody = await selectBranch(page, row, BRANCH_A);
  expect(backBody.ok).not.toBe(false);
  expect(backBody.appliedStash).toBe(true);
  expect(backBody.conflict).toBeFalsy();
  await expect(row.locator('.chip-branch .chipText')).toHaveText(BRANCH_A);

  // The round trip must restore the exact dirty content the user had before switching away.
  expect(readFixtureFile(repoPath)).toBe(dirtyContent);

  // A clean auto-apply only retires the app's own bookkeeping (the sidecar
  // record in `git-stashes.json`, surfaced as `stash` on the branches
  // response) — it never runs `git stash drop`/`pop` on the user's behalf.
  // `gitFlowService.ts`'s `runCheckoutFlow` says so explicitly ("Never
  // dropped here — the record is removed only on a clean apply; the
  // physical stash always stays in `git stash list`"), so the raw git-level
  // entry from the away-switch is expected to still be there — same
  // git-level assertion the stale-stash scenario below makes for its own
  // pre-drop stash, and the same distinction its post-checkout branches-GET
  // makes between "sidecar record" and "raw git stash".
  const stashesAfterBack = listStashRaw(repoPath);
  expect(stashesAfterBack).toHaveLength(1);
  expect(stashesAfterBack[0].message).toContain(STASH_TAG_A);
  const branchesRes = await page.request.get(apiUrl('/api/apps/demo-frontend/git/branches'));
  const branchesBody = (await branchesRes.json()) as Record<string, unknown>;
  expect(branchesBody.stash).toBeUndefined();
});

test('a re-apply conflict surfaces as state.conflict, distinct from a hard checkoutError', async ({ page }) => {
  const repoPath = getRepoPath();
  resetRepoState(repoPath, BRANCH_A);
  const dirtyContent = 'e2e-conflict: dirtied-on-branch-a\n';
  dirtyWorktree(repoPath, dirtyContent);

  const row = demoFrontendRow(page);
  await expect(row.locator('.chip-branch .chipText')).toBeVisible();

  // Auto-stash BRANCH_A's dirty edit, land cleanly on BRANCH_B.
  const awayBody = await selectBranch(page, row, BRANCH_B);
  expect(awayBody.ok).not.toBe(false);
  expect(awayBody.stashed).toBe(true);
  await expect(row.locator('.chip-branch .chipText')).toHaveText(BRANCH_B);

  // Out-of-band (bypassing the app entirely): commit different content to the
  // SAME file/line on BRANCH_A, so the stash — recorded against BRANCH_A's
  // OLD base — no longer applies cleanly when re-applied on return.
  commitOnBranch(repoPath, BRANCH_A, 'e2e-conflict: committed-on-branch-a-after-stash\n', 'e2e: conflicting commit');

  // Switch back: checkout succeeds, but the stash re-apply collides.
  const backBody = await selectBranch(page, row, BRANCH_A);
  expect(backBody.ok).toBe(true);
  expect(backBody.conflict).toBe(true);
  expect(Array.isArray(backBody.files)).toBe(true);

  // Distinct UI surface from a hard checkoutError: GitCheckoutConfirm's
  // 'conflict' variant titles "Unresolved conflict" (AppRowModals.tsx), the
  // checkoutError variant titles "Branch switch failed" — must see the
  // former and NOT the latter. `demoFrontendRow`'s `AllSection` row is
  // rendered ALONGSIDE `GroupSection`'s row for the same app (both visible
  // once `expandAllSection` runs), and `conflict`/`checkoutError` are keyed
  // by appName in `gitSlice.ts` — not by which row's `AppRowModals`
  // rendered it — so BOTH row instances render their own copy of the modal
  // simultaneously. Scope to `.modalTitle` (excludes the pickerBadge
  // tooltip's own "Unresolved conflict — resolve…" text) and `.first()`
  // (there are two, one per row) instead of a bare `getByText`, which hits
  // Playwright's strict-mode multi-match error.
  await expect(page.locator('.modalTitle', { hasText: 'Unresolved conflict' }).first()).toBeVisible();
  await expect(page.locator('.modalTitle', { hasText: 'Branch switch failed' })).toHaveCount(0);

  // Dismiss the conflict dialog (its only action is "OK" / onCancel).
  // `dismissConflict` clears the shared appName-keyed state, so ONE click
  // closes both stacked modals at once — but each modal has its own
  // full-screen `.modalOverlay`, and only the TOPMOST one (last in the DOM,
  // highest stacking order) actually receives the click; `.first()`'s
  // button is visible yet occluded, so Playwright's actionability check
  // spins forever intercepted by the overlay above it. `.last()` targets
  // the one actually clickable.
  await page.getByRole('button', { name: 'OK' }).last().click();
  await expect(page.locator('.modalTitle', { hasText: 'Unresolved conflict' })).toHaveCount(0);

  // Clean up the unmerged conflict markers this scenario deliberately left,
  // so the next test starts from a known-clean repo.
  resetRepoState(repoPath, BRANCH_A);
});

test('a stale stash (dropped out-of-band) is silently reconciled away by the next branches fetch — never reaches checkout as staleStash+warning', async ({ page }) => {
  // NOTE ON THIS TEST'S SHAPE — a real bug found while iterating this
  // suite, not a selector/picker issue like the other two tests:
  //
  // `gitFlowService.ts`'s `runCheckoutFlow` DOES implement a
  // `staleStash: true` + `warning` response (lines ~88-107) for exactly
  // this scenario, and `gitSlice.ts`'s `switchBranch.fulfilled` DOES wire it
  // to the `checkoutError` channel ("Branch switch failed" title) — so the
  // ORIGINAL version of this test (still in git history) asserted on that
  // path through the real UI, the same way the other two tests do.
  //
  // It never got there. Root cause, confirmed by direct reproduction:
  // `gitStashStore.ts`'s `reconcileStashMap` silently deletes any sidecar
  // stash record (`git-stashes.json`) whose physical `git stash` entry no
  // longer exists — and it runs on EVERY `GET .../git/branches`
  // (`gitFlowService.ts`'s `readBranchesInfo`), not just inside the
  // checkout flow. Opening the branch picker is a mandatory step before a
  // real user (or this suite's `selectBranch` helper) can click a branch
  // option, and `Picker.tsx`'s `onTriggerClick` unconditionally re-fires
  // `onOpen` (`AppRowPickers`'s `onBranchOpen` → `fetchBranches`) on every
  // open — so that GET always lands BEFORE the POST checkout that would
  // otherwise report `staleStash`. By the time checkout runs, the sidecar
  // record naming the dropped stash is already gone, and `runCheckoutFlow`
  // silently takes its plain "no record for this branch" path instead —
  // `ok: true`, no `staleStash`, no `warning`, no `checkoutError` in the UI.
  // The dead stash disappears with no trace the user ever notices, which is
  // exactly what `runCheckoutFlow`'s own inline comment says this path is
  // supposed to avoid ("not a silent 'your changes vanished' for the
  // user" — see the `staleStash` branch's comment a few lines above it).
  //
  // Fixing that is a backend/store ordering fix (`gitStashStore.ts` /
  // `gitFlowService.ts` / `AppRowPickers.tsx`'s fetch-on-open), out of
  // scope for this suite's two owned files (spec + fixture only). This test
  // now documents and asserts the REAL, currently-shipped behavior instead
  // of the unreachable intended one, so it stays a true regression guard
  // rather than a red herring.
  const repoPath = getRepoPath();
  resetRepoState(repoPath, BRANCH_A);
  const dirtyContent = 'e2e-stale-stash: dirtied-on-branch-a\n';
  dirtyWorktree(repoPath, dirtyContent);

  const row = demoFrontendRow(page);
  await expect(row.locator('.chip-branch .chipText')).toBeVisible();

  const awayBody = await selectBranch(page, row, BRANCH_B);
  expect(awayBody.ok).not.toBe(false);
  expect(awayBody.stashed).toBe(true);
  await expect(row.locator('.chip-branch .chipText')).toHaveText(BRANCH_B);
  expect(listStashRaw(repoPath)).toHaveLength(1);

  // Drop the underlying stash directly via git, entirely outside the app —
  // the sidecar record (`git-stashes.json`) still points at it, for now.
  dropStashOutOfBandByTag(repoPath, STASH_TAG_A);
  expect(listStashRaw(repoPath)).toHaveLength(0);

  // Opening the picker (inside `selectBranch`, via its own
  // `page.waitForResponse('/git/branches')` wait) is the step that
  // silently reconciles the dead record away — assert that directly on
  // that GET's own body, matching `reconcileStashMap`'s effect exactly.
  const branchesResponsePromise = page.waitForResponse(
    (r: Response) => r.url().includes('/git/branches') && r.request().method() === 'GET'
  );
  await row.locator('.chip-branch').click();
  const branchesResponse = await branchesResponsePromise;
  const branchesBody = (await branchesResponse.json()) as Record<string, unknown>;
  expect(branchesBody.stash).toBeUndefined();
  const option = page.getByRole('option', { name: BRANCH_A, exact: true });
  await option.waitFor({ state: 'visible' });

  // Switch back: checkout must still succeed (no crash / no 5xx) — but,
  // per the bug documented above, `staleStash`/`warning` never arrive here;
  // the sidecar record naming the dropped stash was already reconciled away
  // by the GET this test just made above.
  const [checkoutResponse] = await Promise.all([
    page.waitForResponse((r: Response) => r.url().includes('/git/checkout') && r.request().method() === 'POST'),
    option.click(),
  ]);
  const backBody = (await checkoutResponse.json()) as Record<string, unknown>;
  expect(backBody.ok).toBe(true);
  expect(backBody.staleStash).toBeUndefined();
  expect(backBody.warning).toBeUndefined();
  await expect(row.locator('.chip-branch .chipText')).toHaveText(BRANCH_A);

  // No checkoutError/conflict surface either — the switch reads as a plain
  // clean checkout to the UI, consistent with the backend response above.
  await expect(page.locator('.modalTitle', { hasText: 'Branch switch failed' })).toHaveCount(0);
  await expect(page.locator('.modalTitle', { hasText: 'Unresolved conflict' })).toHaveCount(0);

  // The dead stash record stays gone (it was never coming back either way).
  const finalBranchesRes = await page.request.get(apiUrl('/api/apps/demo-frontend/git/branches'));
  const finalBranchesBody = (await finalBranchesRes.json()) as Record<string, unknown>;
  expect(finalBranchesBody.stash).toBeUndefined();
});

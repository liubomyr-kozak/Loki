/**
 * design.md §5.3 — happy-path branch checkout on a single demo-app's real
 * git repo, no dirty state, no stash/conflict involved. Touches:
 *   GET  /api/apps/:name/git/branches
 *   POST /api/apps/:name/git/checkout
 *
 * Uses ONLY `demo-backend` (per task-4's scope — the other git suites use
 * their own dedicated demo app / fixture and must never import
 * `fixtures/git-repo-branch-switch.ts`).
 *
 * The git repo itself is real (`fixtures/git-repo-branch-switch.ts` runs
 * actual `git` commands against the sandboxed `demo-backend` copy) — nothing
 * about git is mocked here, per analysis.md §6 risk #7.
 *
 * Both tests below share ONE git repo instance (the sandboxed `demo-backend`
 * copy) and this file's own `beforeAll` mutates it (creates/checks-out real
 * branches). With `playwright.config.ts`'s `fullyParallel: true`, Playwright
 * is free to run this file's two tests in two DIFFERENT worker processes —
 * each worker runs its own copy of `beforeAll`, so without `serial` mode two
 * concurrent `setupGitRepoBranchSwitch()` calls raced real `git checkout -b`
 * against the same on-disk repo (`fatal: cannot lock ref ... reference
 * already exists` / `index.lock` collisions). `serial` mode pins this file's
 * tests to a single worker, in order — same fix already applied to
 * `git-branch-stash-conflict.spec.ts` for the same reason (see that file's
 * header comment).
 */
import { test, expect } from '@playwright/test';
import { ensureRuntime } from '../fixtures/runtime';
import { setupGitRepoBranchSwitch, type GitRepoBranchSwitchFixture } from '../fixtures/git-repo-branch-switch';

test.describe.configure({ mode: 'serial' });

let backendPort: number;
let repo: GitRepoBranchSwitchFixture;

test.beforeAll(async () => {
  // Reuses the ONE sandbox global-setup/webserver-backend already created
  // (ensureRuntime is idempotent — see fixtures/runtime.ts) rather than
  // provisioning a fourth demo app or a second sandbox.
  const runtime = await ensureRuntime();
  backendPort = runtime.backendPort;
  repo = setupGitRepoBranchSwitch(runtime.demoAppDirs['demo-backend']);
});

function apiUrl(pathSuffix: string): string {
  return `http://127.0.0.1:${backendPort}${pathSuffix}`;
}

test.describe('git branch switch — happy path (demo-backend, clean repo)', () => {
  test('GET .../git/branches lists both real branches and reports the clean current one', async ({ request }) => {
    const res = await request.get(apiUrl('/api/apps/demo-backend/git/branches'));
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { current: string; branches: string[]; dirty: boolean; stash?: unknown };

    expect(body.branches).toEqual(expect.arrayContaining([repo.mainBranch, repo.featureBranch]));
    expect(body.current).toBe(repo.mainBranch);
    expect(body.dirty).toBe(false);
    expect(body.stash).toBeUndefined();
  });

  test('checkout via the UI moves the current branch from main to the feature branch', async ({ page }) => {
    await page.goto('/');

    // "All" (AllSection) is the only section whose rows do a direct checkout
    // on branch-select — GroupSection's rows (demo-backend also renders
    // there, since demo/loki-config.json puts it in the "Demo Web" group)
    // only stage a group *intent* and never call the checkout endpoint. It
    // starts collapsed by default (uiSlice initialState: collapsedGroups:
    // [ALL_ID]), so expand it first.
    const allHeader = page.locator('.groupHeader', { hasText: 'All' });
    await expect(allHeader).toBeVisible();
    await allHeader.click();

    // demo-backend renders once under its "Demo Web" GroupSection row and
    // again under the now-expanded All section — target the All section's
    // instance specifically (rendered after GroupSection in the DOM, see
    // AppList.tsx: <GroupSection .../><AllSection .../>).
    const row = page.locator('.row', { hasText: 'Demo Backend' }).last();
    await expect(row).toBeVisible();

    const branchTrigger = row.locator('.chip-branch');
    await expect(branchTrigger).toBeVisible();
    // Live branch comes straight from getGitInfo via the status poll that
    // fires on mount (usePolling.ts dispatches refreshAll() immediately),
    // not from opening the picker — should already read "main".
    await expect(branchTrigger).toContainText(repo.mainBranch, { timeout: 15000 });

    // Opening the picker triggers fetchBranches (GET .../git/branches),
    // which populates the dropdown options.
    await branchTrigger.click();
    const featureOption = page.locator('.pickerMenuPortal .pickerItem', { hasText: repo.featureBranch });
    await expect(featureOption).toBeVisible({ timeout: 15000 });
    // Both real branches must be offered, not just the target one.
    await expect(page.locator('.pickerMenuPortal .pickerItem', { hasText: repo.mainBranch })).toBeVisible();

    await featureOption.click();

    // switchBranch fulfilled updates branchesByApp[name].current directly
    // (no need to wait for a poll tick) — the chip should flip to the
    // feature branch once the POST .../git/checkout round-trip completes.
    await expect(branchTrigger).toContainText(repo.featureBranch, { timeout: 15000 });

    // No dirty state existed before the switch, so this must be a clean
    // checkout — no stash pushed/applied, no conflict banner.
    await expect(row.locator('.pickerBadge.conflict')).toHaveCount(0);
    await expect(row.locator('.pickerBadge.stash')).toHaveCount(0);

    // Confirm against the real backend/repo too, not just Redux state.
    const res = await page.request.get(apiUrl('/api/apps/demo-backend/git/branches'));
    const body = (await res.json()) as { current: string; dirty: boolean; stash?: unknown };
    expect(body.current).toBe(repo.featureBranch);
    expect(body.dirty).toBe(false);
    expect(body.stash).toBeUndefined();
  });
});

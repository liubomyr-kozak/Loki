/**
 * design.md §5.5 / analysis.md §3: `POST /api/apps/:name/git/checkout`
 * short-circuits with HTTP 409 before touching stash/checkout at all when
 * the repo already has unmerged paths (`backend/routes/git.ts:47-70` →
 * `backend/git/gitFlowService.ts:31-37`'s `hasUnmergedPaths` guard, which
 * runs before the branch/dirty/stash logic below it).
 *
 * Uses the sandboxed `demo-worker` repo exclusively (task-4's
 * `git-branch-switch` suite owns `demo-backend`, task-5's dirty-checkout/
 * stash suite owns `demo-frontend` — kept disjoint to avoid cross-suite git
 * state races per the task-6 spec).
 */
import { test, expect } from '@playwright/test';
import { ensureRuntime, BACKEND_PORT } from '../fixtures/runtime';
import {
  seedUnmergedConflict,
  abortUnmergedConflict,
  getUnmergedPaths,
  getStashList,
  UNMERGED_BASE_BRANCH,
} from '../fixtures/git-repo-unmerged';

test.describe('git checkout guard: unmerged paths', () => {
  let repoPath: string;

  test.beforeEach(async () => {
    const runtime = await ensureRuntime();
    repoPath = runtime.demoAppDirs['demo-worker'];
    await seedUnmergedConflict(repoPath);
  });

  test.afterEach(async () => {
    await abortUnmergedConflict(repoPath);
  });

  test('checkout attempt on a repo with unmerged paths returns 409 and touches nothing', async ({ request }) => {
    // Preconditions the fixture is supposed to guarantee — assert them
    // explicitly so a fixture regression fails here, not on a confusing
    // downstream assertion.
    const filesBefore = await getUnmergedPaths(repoPath);
    expect(filesBefore.length).toBeGreaterThan(0);
    const stashBefore = await getStashList(repoPath);
    expect(stashBefore).toEqual([]);

    const res = await request.post(`http://127.0.0.1:${BACKEND_PORT}/api/apps/demo-worker/git/checkout`, {
      data: { branch: 'main' },
    });

    // The route's own 409 short-circuit (routes/git.ts:47-70) — distinct
    // from its other failure paths, which all resolve 200 with ok:false.
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('conflict');
    expect(Array.isArray(body.files)).toBe(true);
    expect(body.files.length).toBeGreaterThan(0);

    // No stash/checkout attempt happened as a side effect of the 409 path:
    // branch unchanged, unmerged paths untouched, no new stash entry.
    const branchesRes = await request.get(`http://127.0.0.1:${BACKEND_PORT}/api/apps/demo-worker/git/branches`);
    expect(branchesRes.ok()).toBe(true);
    const branchesBody = await branchesRes.json();
    expect(branchesBody.current).toBe(UNMERGED_BASE_BRANCH);

    const filesAfter = await getUnmergedPaths(repoPath);
    expect(filesAfter.sort()).toEqual(filesBefore.sort());

    const stashAfter = await getStashList(repoPath);
    expect(stashAfter).toEqual([]);
  });
});

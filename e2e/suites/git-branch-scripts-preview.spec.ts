/**
 * Task-7 (design.md §5.6 / analysis.md §3): read-only coverage for
 * `GET /api/apps/:name/git/scripts?ref=<branch>`
 * (`backend/routes/git.ts:10-24` -> `backend/apps/envScripts.ts:listEnvScripts`
 * -> `backend/git/gitUtils.ts:32-34`'s `git show <ref>:package.json`).
 *
 * Two things this suite proves:
 *  1. Requesting a non-current ref's scripts (`ref=<otherBranch>`) returns
 *     that branch's `package.json` script list WITHOUT checking it out —
 *     `showFileAtRef` uses the same non-mutating `git()` runner as
 *     `getGitInfo`, never `withRepoLock`/`checkoutBranch`.
 *  2. The `ref:''` (current-worktree) slot reflects the actual current
 *     branch's `package.json`, and a later identical request (standing in
 *     for what `app/src/store/slices/gitSlice.ts`'s `refreshScripts`
 *     thunk re-triggers, `gitSlice.ts:68-79`) picks up a live change to that
 *     worktree — the backend has no caching layer of its own, so "refresh"
 *     is just "call it again after the worktree changed."
 *
 * This suite performs NO checkout/stash mutation calls of its own against
 * `/git/checkout` or `/git/stash/*` — strictly read-only against the repo
 * via the `/git/scripts` endpoint throughout (acceptance criterion in
 * task-7.md). Uses its own fixture (`fixtures/git-repo-scripts-preview.ts`)
 * against its OWN dedicated config app (`SCRIPTS_PREVIEW_APP_NAME`,
 * `fixtures/demo-config.ts`) — a private clone of `demo/demo-backend`,
 * separate from the `demo-backend` app entry task-4's
 * `git-repo-branch-switch.ts` owns. Both fixtures used to target the SAME
 * sandboxed `demo-backend` copy (this suite's own git operations are
 * read-only, but its FIXTURE's setup isn't: it creates/checks-out real
 * branches via `git checkout -b`), and `playwright.config.ts`'s
 * `fullyParallel: true` let the two suite files' fixture setups race on the
 * same on-disk repo (`fatal: cannot lock ref ... reference already
 * exists`). Giving this suite its own physical directory (and config app
 * name to address it through) removes the race — this app is never started
 * as a process, since `/git/scripts` only needs a resolvable `repoPath`.
 *
 * That still leaves an in-file race: this file's three tests share ONE git
 * repo instance, and `beforeAll` (`setupGitRepoScriptsPreview`) mutates it
 * (creates/checks-out real branches). `playwright.config.ts`'s
 * `fullyParallel: true` lets Playwright schedule this file's tests across
 * different worker processes, each running its own `beforeAll` — two
 * concurrent `git checkout -b` calls against the same repo raced the same
 * way task-4's fixture did. `serial` mode pins this file to one worker, in
 * order (same fix as `git-branch-stash-conflict.spec.ts`/
 * `git-branch-switch.spec.ts`).
 */
import { test, expect } from '@playwright/test';
import { ensureRuntime, BACKEND_PORT } from '../fixtures/runtime';
import { SCRIPTS_PREVIEW_APP_NAME } from '../fixtures/demo-config';
import {
  setupGitRepoScriptsPreview,
  readCurrentBranch,
  mutateCurrentWorktreeScripts,
  REFRESHED_CURRENT_SCRIPTS,
  type GitRepoScriptsPreviewFixture,
} from '../fixtures/git-repo-scripts-preview';

test.describe.configure({ mode: 'serial' });

const APP_NAME = SCRIPTS_PREVIEW_APP_NAME;

interface ScriptsResponse {
  ref: string;
  source: 'worktree' | 'ref';
  scripts: { name: string }[];
  matched: string[];
  filterError?: string;
}

async function getScripts(ref: string): Promise<ScriptsResponse> {
  const url = `http://127.0.0.1:${BACKEND_PORT}/api/apps/${APP_NAME}/git/scripts?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url);
  expect(res.ok, `GET ${url} -> ${res.status}`).toBeTruthy();
  return (await res.json()) as ScriptsResponse;
}

function scriptNames(body: ScriptsResponse): string[] {
  return body.scripts.map((s) => s.name).sort();
}

test.describe('git branch scripts preview (read-only)', () => {
  let fixture: GitRepoScriptsPreviewFixture;

  test.beforeAll(async () => {
    const runtime = await ensureRuntime();
    fixture = setupGitRepoScriptsPreview(runtime.scriptsPreviewAppDir);
  });

  test('GET .../git/scripts?ref=<other-branch> returns that branch\'s scripts without checking it out', async () => {
    const branchBefore = readCurrentBranch(fixture.repoPath);
    expect(branchBefore).toBe(fixture.currentBranch);

    const body = await getScripts(fixture.otherBranch);

    expect(body.source).toBe('ref');
    expect(body.ref).toBe(fixture.otherBranch);
    expect(scriptNames(body)).toEqual([...fixture.otherScripts].sort());

    // No checkout side effect: the worktree must still be on the branch it
    // was on before the request — `showFileAtRef` never touches HEAD/index.
    const branchAfter = readCurrentBranch(fixture.repoPath);
    expect(branchAfter).toBe(fixture.currentBranch);
    expect(branchAfter).toBe(branchBefore);
  });

  test('ref:\'\' (current worktree) reflects the actual current branch and refreshes after a worktree change', async () => {
    const initial = await getScripts('');
    expect(initial.source).toBe('worktree');
    expect(initial.ref).toBe(fixture.currentBranch);
    expect(scriptNames(initial)).toEqual([...fixture.currentScripts].sort());
    expect(readCurrentBranch(fixture.repoPath)).toBe(fixture.currentBranch);

    // Simulate an out-of-band change to the live worktree (e.g. a developer
    // editing package.json) — never a checkout, just an edit+commit on
    // whatever branch is already HEAD.
    mutateCurrentWorktreeScripts(fixture.repoPath, REFRESHED_CURRENT_SCRIPTS);
    expect(readCurrentBranch(fixture.repoPath)).toBe(fixture.currentBranch);

    // A `refreshScripts`-equivalent re-fetch of the same ref:'' slot must
    // pick up the change — the backend has no cache to invalidate, so this
    // is exactly what re-dispatching fetchScripts({ appName, ref: '' })
    // does client-side.
    const refreshed = await getScripts('');
    expect(refreshed.source).toBe('worktree');
    expect(refreshed.ref).toBe(fixture.currentBranch);
    expect(scriptNames(refreshed)).toEqual(Object.keys(REFRESHED_CURRENT_SCRIPTS).sort());
    expect(scriptNames(refreshed)).not.toEqual(scriptNames(initial));

    // Still no checkout side effect from any of the above.
    expect(readCurrentBranch(fixture.repoPath)).toBe(fixture.currentBranch);
  });

  test('the other branch\'s scripts are unaffected by the current-worktree refresh', async () => {
    const body = await getScripts(fixture.otherBranch);
    expect(body.source).toBe('ref');
    expect(body.ref).toBe(fixture.otherBranch);
    expect(scriptNames(body)).toEqual([...fixture.otherScripts].sort());
    expect(readCurrentBranch(fixture.repoPath)).toBe(fixture.currentBranch);
  });
});

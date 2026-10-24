/**
 * Fixture for `suites/git-branch-stash-conflict.spec.ts` (task-5, design.md
 * §5.4 / analysis.md §3). Operates ONLY on the sandboxed `demo-frontend`
 * repo copy — never `demo-backend`'s or `demo-worker`'s — to avoid cross-
 * suite git-state races when suites run in parallel (design.md §3.4). The
 * repo path is looked up per-test from `fixtures/runtime.ts`'s shared
 * manifest (`demoAppDirs['demo-frontend']`), the same absolute path the
 * sandboxed backend's config points `demo-frontend.repoPath` at.
 *
 * `fixtures/sandbox.ts`'s `copyDemoApps` does a plain recursive `fs.cpSync`
 * of `demo/demo-frontend` — it does NOT `git init` anything (that source
 * directory is `.gitignore`d from Loki's own repo, see root `.gitignore`, so
 * a fresh clone of Loki has no `.git` under it at all). This module makes
 * the sandboxed copy a real git repo with >=2 branches itself
 * (`ensureGitRepoWithBranches`), mirroring `lifecycleOps.test.ts`'s
 * tmpdir-real-git pattern (analysis.md §3/§6 risk #7) rather than depending
 * on any pre-existing `.git` state that may or may not already be on disk.
 *
 * Everything here shells out to real `git` via `child_process.execFileSync`
 * — no mocking, matching `backend/git/gitUtils.ts`'s own approach (it has no
 * mockable seam either).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/** Tracked file dedicated to this fixture's dirty/conflict scenarios — kept
 * separate from `server.js`/`index.html`/`package.json` so this suite never
 * has to reason about (or risk breaking) the demo app's own runnable files. */
export const STASH_FIXTURE_FILE = 'e2e-stash-fixture.txt';

export const BRANCH_A = 'e2e-stash-branch-a';
export const BRANCH_B = 'e2e-stash-branch-b';

const BRANCH_A_BASELINE = 'branch-a baseline content\n';
const BRANCH_B_BASELINE = 'branch-b baseline content\n';

// Even with this file's OWN mutations pinned to a single worker
// (`test.describe.configure({ mode: 'serial' })` below), the sandboxed
// backend itself continuously polls every configured app's git status
// read-only (`getGitInfo`, driven by any open page's `usePolling.ts`, across
// EVERY suite's browser context that happens to be alive at the same
// wall-clock time — not just this file's own) — and on some git versions a
// plain read like `git status`/`rev-parse` can itself take a transient
// `index.lock` to refresh stat info. That collided with this fixture's own
// `checkout -b` (`fatal: ... index.lock: File exists`). Retrying on that
// specific, transient failure (same pattern as
// `fixtures/git-repo-scripts-preview.ts`) rides it out instead of failing
// the whole suite on what's typically a sub-100ms window.
function sleepSync(ms: number): void {
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

function withLockRetry<T>(fn: () => T, retries = 5): T {
  for (let attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= retries || !/index\.lock/.test(msg)) throw err;
      sleepSync(150);
    }
  }
}

function git(repoPath: string, args: string[]): void {
  withLockRetry(() => execFileSync('git', ['-C', repoPath, ...args], { stdio: 'pipe' }));
}

function gitOut(repoPath: string, args: string[]): string {
  return withLockRetry(() => execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf-8' }).trim());
}

function gitOutOrEmpty(repoPath: string, args: string[]): string {
  try {
    return gitOut(repoPath, args);
  } catch {
    return '';
  }
}

function branchExists(repoPath: string, branch: string): boolean {
  try {
    gitOut(repoPath, ['rev-parse', '--verify', '--quiet', branch]);
    return true;
  } catch {
    return false;
  }
}

function commitAll(repoPath: string, message: string): void {
  git(repoPath, ['add', '-A']);
  git(repoPath, ['commit', '-q', '-m', message]);
}

/**
 * Idempotent: safe to call once per test (or once per file in `beforeAll`).
 * Ensures `repoPath` is a git repo with a clean working tree, committed
 * content on every ref, and two branches — `BRANCH_A`/`BRANCH_B` — each
 * seeded with distinct baseline content in `STASH_FIXTURE_FILE`. Leaves the
 * repo checked out on `BRANCH_A`.
 */
export function ensureGitRepoWithBranches(repoPath: string): { branchA: string; branchB: string } {
  const gitDir = path.join(repoPath, '.git');
  if (!fs.existsSync(gitDir)) {
    git(repoPath, ['init', '-q']);
  }
  // Defensive even when `.git` pre-existed (e.g. a copied-over dev-local
  // repo whose config isn't guaranteed to have identity set) — `git commit`
  // fails without these.
  git(repoPath, ['config', 'user.email', 'loki-e2e@example.com']);
  git(repoPath, ['config', 'user.name', 'Loki E2E']);
  // A machine-global `core.autocrlf=true` (common on macOS git installs)
  // silently rewrites this fixture's LF-only content to CRLF on every
  // checkout/stash-apply that touches the worktree — corrupting the exact
  // byte-for-byte round-trip this suite's first test asserts on
  // (`readFixtureFile(repoPath)).toBe(dirtyContent)`). Pin this repo's own
  // config to LF regardless of the host's global setting, the same way
  // `user.email`/`user.name` above are pinned rather than inherited.
  git(repoPath, ['config', 'core.autocrlf', 'false']);

  // Commit whatever the initial copy (server.js/package.json/index.html, or
  // a pre-existing repo's own uncommitted state) left lying around, so HEAD
  // always resolves before we branch off it.
  if (gitOutOrEmpty(repoPath, ['status', '--porcelain'])) {
    commitAll(repoPath, 'e2e: base commit');
  } else {
    try {
      gitOut(repoPath, ['rev-parse', 'HEAD']);
    } catch {
      // Genuinely empty repo, nothing to commit yet — write a placeholder.
      fs.writeFileSync(path.join(repoPath, '.e2e-keep'), '');
      commitAll(repoPath, 'e2e: base commit');
    }
  }

  const baseRef = gitOut(repoPath, ['rev-parse', 'HEAD']);

  for (const [branch, content] of [
    [BRANCH_A, BRANCH_A_BASELINE],
    [BRANCH_B, BRANCH_B_BASELINE],
  ] as const) {
    if (!branchExists(repoPath, branch)) {
      git(repoPath, ['checkout', '-q', '-b', branch, baseRef]);
      fs.writeFileSync(path.join(repoPath, STASH_FIXTURE_FILE), content);
      commitAll(repoPath, `e2e: seed ${branch}`);
    }
  }

  // Always return to a known-clean BRANCH_A at its baseline content — tests
  // add their own dirty/extra commits on top starting from here.
  git(repoPath, ['checkout', '-q', BRANCH_A, '--']);
  fs.writeFileSync(path.join(repoPath, STASH_FIXTURE_FILE), BRANCH_A_BASELINE);
  if (gitOutOrEmpty(repoPath, ['status', '--porcelain'])) {
    git(repoPath, ['checkout', '--', STASH_FIXTURE_FILE]);
  }

  return { branchA: BRANCH_A, branchB: BRANCH_B };
}

/** Resets the repo to a fully clean state on `branch`: drops every stash,
 * discards any dirty/untracked fixture-file changes, checks out `branch`.
 * Run at the start of each scenario so the three tests in the suite don't
 * bleed git state into each other despite sharing one repo instance. */
export function resetRepoState(repoPath: string, branch: string = BRANCH_A): void {
  // `reset --hard` first: the conflict scenario deliberately leaves the
  // working tree with unmerged conflict markers from a `git stash apply`
  // (never an in-progress merge, so there's nothing to `merge --abort`) —
  // plain `checkout <branch>` refuses to run against unmerged paths, so
  // clear the index/worktree back to HEAD before doing anything else.
  git(repoPath, ['reset', '--hard']);
  // Drop all stashes — a leftover stash from a previous scenario must not
  // resurface later via the app's own tag-based resolution.
  git(repoPath, ['stash', 'clear']);
  git(repoPath, ['checkout', '-f', '-q', branch, '--']);
  git(repoPath, ['clean', '-fd', '-q']);
}

/** Overwrites `STASH_FIXTURE_FILE` with new content, directly on disk —
 * simulates a developer editing a tracked file in their editor/terminal,
 * bypassing the app entirely, which is exactly what `runCheckoutFlow`'s live
 * `git status --porcelain` check picks up as "dirty" on the NEXT API call
 * (analysis.md §3: dirty state is always read fresh, never cached). */
export function dirtyWorktree(repoPath: string, content: string): void {
  fs.writeFileSync(path.join(repoPath, STASH_FIXTURE_FILE), content, 'utf-8');
}

export function readFixtureFile(repoPath: string): string {
  return fs.readFileSync(path.join(repoPath, STASH_FIXTURE_FILE), 'utf-8');
}

export function currentBranch(repoPath: string): string {
  return gitOut(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

export interface RawStashEntry {
  ref: string;
  message: string;
}

/** Raw `git stash list`, parsed the same way `backend/git/gitUtils.ts`'s
 * `listStash` does — used by the stale-stash scenario to find the ref to
 * drop out-of-band, and by assertions confirming a stash was/wasn't created. */
export function listStashRaw(repoPath: string): RawStashEntry[] {
  const out = gitOutOrEmpty(repoPath, ['stash', 'list']);
  if (!out) return [];
  return out
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => {
      const m = line.match(/^(stash@\{\d+\}):\s*(.*)$/);
      return m ? { ref: m[1], message: m[2] } : { ref: line, message: '' };
    });
}

/** Finds the stash whose message contains `tagSubstring` (the app tags every
 * auto-stash `loki-orchestrator:<branch>:<ISO-timestamp>`) and drops it
 * directly via `git stash drop` — entirely outside the app, exactly the
 * "someone dropped it in a terminal" scenario analysis.md §3/risk #3
 * describes. Throws if no matching stash is found (test setup bug, not a
 * thing the suite should silently swallow). */
export function dropStashOutOfBandByTag(repoPath: string, tagSubstring: string): void {
  const found = listStashRaw(repoPath).find((s) => s.message.includes(tagSubstring));
  if (!found) {
    throw new Error(`e2e fixture: no stash found matching tag substring "${tagSubstring}" in ${repoPath}`);
  }
  git(repoPath, ['stash', 'drop', found.ref]);
}

/**
 * Commits `content` to `STASH_FIXTURE_FILE` on `branch` and returns to
 * whatever branch was checked out beforehand. Used by the conflict scenario
 * to change `branch`'s committed content AFTER an auto-stash was taken while
 * on that branch, so re-applying the stash on return collides with the new
 * commit instead of applying cleanly.
 */
export function commitOnBranch(repoPath: string, branch: string, content: string, message: string): void {
  const previous = currentBranch(repoPath);
  git(repoPath, ['checkout', '-q', branch, '--']);
  fs.writeFileSync(path.join(repoPath, STASH_FIXTURE_FILE), content, 'utf-8');
  commitAll(repoPath, message);
  if (previous && previous !== branch) {
    git(repoPath, ['checkout', '-q', previous, '--']);
  }
}

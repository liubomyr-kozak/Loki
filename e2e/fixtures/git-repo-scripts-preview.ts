/**
 * Suite-local git-repo fixture for `suites/git-branch-scripts-preview.spec.ts`
 * (task-7, design.md §5.6 / analysis.md §3).
 *
 * Seeds >=2 branches with differing `package.json` `scripts` fields on this
 * suite's OWN dedicated repo copy (`fixtures/runtime.ts`'s
 * `scriptsPreviewAppDir`, config app `SCRIPTS_PREVIEW_APP_NAME` — a private
 * clone of `demo/demo-backend`, separate from the `demo-backend` app copy
 * task-4's `git-repo-branch-switch.ts` fixture targets for its own
 * (mutating) checkout suite).
 *
 * History: this used to target the SAME sandboxed `demo-backend` copy as
 * task-4's fixture (design.md §5.6 signed off on that under the reasoning
 * that this suite's own API calls are read-only, so sharing was safe). That
 * missed that this fixture's own SETUP is not read-only — it runs real
 * `git checkout -b`/`git init` against the shared repo — and
 * `playwright.config.ts`'s `fullyParallel: true` lets both fixtures' setups
 * run at the same wall-clock time, which raced two independent `git`
 * processes writing `.git/refs`/`index.lock` on the same disk (`fatal:
 * cannot lock ref ... reference already exists`). Giving this suite its own
 * physical directory (via `demo-config.ts`'s `copyExtraApp` at sandbox
 * derivation time) removes the race at its root instead of trying to
 * coordinate two out-of-process `git` invocations. This file remains
 * independent of task-4's fixture: it does not import it and does not
 * assume it ran first (or at all).
 *
 * The `e2e-scripts-preview-` branch-name prefix and `index.lock` retry
 * backoff below are now just defense-in-depth (e.g. a stray leftover `git`
 * process from a previous crashed run against the same sandbox dir) rather
 * than the primary race guard.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'loki-e2e',
  GIT_AUTHOR_EMAIL: 'loki-e2e@example.com',
  GIT_COMMITTER_NAME: 'loki-e2e',
  GIT_COMMITTER_EMAIL: 'loki-e2e@example.com',
};

function sleepSync(ms: number): void {
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

function git(repoPath: string, args: string[], retries = 5): string {
  for (let attempt = 0; ; attempt++) {
    try {
      return execFileSync('git', ['-C', repoPath, ...args], { env: GIT_ENV, encoding: 'utf-8' }).trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= retries || !/index\.lock/.test(msg)) throw err;
      sleepSync(150);
    }
  }
}

function branchExists(repoPath: string, branch: string): boolean {
  try {
    git(repoPath, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

function headIsBorn(repoPath: string): boolean {
  try {
    git(repoPath, ['rev-parse', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

function writeScripts(repoPath: string, scripts: Record<string, string>): void {
  const pkgPath = path.join(repoPath, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  pkg.scripts = scripts;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
}

/** Commit whatever's currently dirty in the worktree; no-op (no empty commit) if nothing changed. */
function commitIfDirty(repoPath: string, message: string): void {
  const status = git(repoPath, ['status', '--porcelain']);
  if (!status) return;
  git(repoPath, ['add', '-A']);
  git(repoPath, ['commit', '-m', message]);
}

export const CURRENT_BRANCH = 'e2e-scripts-preview-current';
export const OTHER_BRANCH = 'e2e-scripts-preview-other';

/** Distinct script set committed on `CURRENT_BRANCH` (left checked out at the end of setup — this is "the current worktree"). */
export const CURRENT_SCRIPTS: Record<string, string> = {
  start: 'node server.js',
  'e2e:current-marker': 'echo current',
};

/** Distinct script set committed on `OTHER_BRANCH` (never checked out by this fixture or the suite). */
export const OTHER_SCRIPTS: Record<string, string> = {
  start: 'node server.js',
  'e2e:other-marker': 'echo other',
  build: 'echo build-other',
};

/** A third script set used by the suite's own "refresh reflects a live worktree change" assertion — not written by this fixture. */
export const REFRESHED_CURRENT_SCRIPTS: Record<string, string> = {
  start: 'node server.js',
  'e2e:current-marker': 'echo current',
  'e2e:refreshed-marker': 'echo refreshed',
};

export interface GitRepoScriptsPreviewFixture {
  repoPath: string;
  currentBranch: string;
  otherBranch: string;
  currentScripts: string[];
  otherScripts: string[];
}

/**
 * Idempotent: safe to call more than once against the same `repoPath`
 * (e.g. a Playwright test retry re-running the whole file) — lands on the
 * same two branches with the same scripts rather than erroring.
 *
 * Leaves HEAD checked out on `CURRENT_BRANCH` when it returns.
 */
export function setupGitRepoScriptsPreview(repoPath: string): GitRepoScriptsPreviewFixture {
  const gitDir = path.join(repoPath, '.git');
  if (!fs.existsSync(gitDir)) {
    git(repoPath, ['init']);
  }

  if (!headIsBorn(repoPath)) {
    // Fresh repo, no commits yet (either just `git init`-ed above, or
    // inited-but-uncommitted by something else): commit the demo app's
    // existing files as-is so there's a base commit to branch from.
    commitIfDirty(repoPath, 'e2e: initial commit');
  }

  if (!branchExists(repoPath, CURRENT_BRANCH)) {
    git(repoPath, ['checkout', '-b', CURRENT_BRANCH]);
  } else {
    git(repoPath, ['checkout', CURRENT_BRANCH, '--']);
  }
  writeScripts(repoPath, CURRENT_SCRIPTS);
  commitIfDirty(repoPath, 'e2e: current branch scripts');

  if (!branchExists(repoPath, OTHER_BRANCH)) {
    git(repoPath, ['checkout', '-b', OTHER_BRANCH]);
  } else {
    git(repoPath, ['checkout', OTHER_BRANCH, '--']);
  }
  writeScripts(repoPath, OTHER_SCRIPTS);
  commitIfDirty(repoPath, 'e2e: other branch scripts');

  // Leave HEAD on CURRENT_BRANCH — this is "the current worktree" that the
  // `ref:''` scripts slot (gitSlice.ts:68-79's refreshScripts target) reads.
  git(repoPath, ['checkout', CURRENT_BRANCH, '--']);

  return {
    repoPath,
    currentBranch: CURRENT_BRANCH,
    otherBranch: OTHER_BRANCH,
    currentScripts: Object.keys(CURRENT_SCRIPTS),
    otherScripts: Object.keys(OTHER_SCRIPTS),
  };
}

/** Read-only: the branch actually checked out right now (used to assert a `ref=<other>` GET performed no checkout side effect). */
export function readCurrentBranch(repoPath: string): string {
  return git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

/**
 * Overwrite `package.json`'s `scripts` field on the CURRENTLY checked-out
 * branch and commit — simulates an out-of-band change to the live worktree
 * (e.g. a developer editing package.json) that a subsequent `ref:''` fetch
 * must pick up, standing in for what `refreshScripts` (gitSlice.ts:68-79)
 * re-triggers client-side. Read-only w.r.t. branches/checkout: never
 * switches branches, only edits+commits on whatever is currently HEAD.
 */
export function mutateCurrentWorktreeScripts(repoPath: string, scripts: Record<string, string>): void {
  writeScripts(repoPath, scripts);
  commitIfDirty(repoPath, 'e2e: current worktree scripts changed');
}

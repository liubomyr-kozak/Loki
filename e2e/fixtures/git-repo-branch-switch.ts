/**
 * Suite-exclusive fixture for `suites/git-branch-switch.spec.ts`.
 *
 * Turns the sandboxed `demo-backend` copy (already provisioned by
 * `fixtures/sandbox.ts`'s `copyDemoApps` — see `fixtures/runtime.ts`'s
 * `ensureRuntime()`) into a REAL git repo with at least two branches that
 * each carry a distinguishing commit, then leaves the worktree checked out
 * on the "main" branch in a clean (no dirty state) working tree — the exact
 * precondition design.md §5.3's happy-path checkout suite needs.
 *
 * `demo/demo-backend` in the real repo is itself already a git repo (see
 * `.gitignore`'s `/demo/demo-backend/` entry — it's a nested repo, not
 * tracked by the outer one) with a `main` branch plus a couple of feature
 * branches, and `sandbox.ts#copyDemoApps` uses `fs.cpSync(..., { recursive:
 * true })`, which copies dotdirs (including `.git`) by default — so the
 * sandboxed copy is USUALLY already a real repo. This fixture does not rely
 * on that: it detects whether `repoPath` is a git repo and runs `git init`
 * (+ an initial commit) itself when it isn't, exactly as design.md §5
 * ("fixture must `git init` + create branches ... mirrors
 * `lifecycleOps.test.ts`'s tmpdir-real-git pattern") calls for. Either way
 * it (re)creates its OWN dedicated feature branch off of `main` so the
 * suite never depends on the demo repo's incidental branch topology.
 *
 * Real git commands only (`execFileSync('git', ...)`) — no mocked git seam,
 * per analysis.md §6 risk #7.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { stripPackageJsonScripts } from './sandbox';

export interface GitRepoBranchSwitchFixture {
  /** Absolute path to the sandboxed demo-backend repo copy. */
  repoPath: string;
  /** The branch left checked out when this function returns — clean, no dirty state. */
  mainBranch: string;
  /** A second branch with a distinguishing commit, not checked out. */
  featureBranch: string;
}

const MAIN_BRANCH = 'main';
const FEATURE_BRANCH = 'e2e-branch-switch-target';
const MARKER_FILE = 'E2E_BRANCH_SWITCH_MARKER.txt';

function git(repoPath: string, args: string[]): string {
  return execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf-8' }).trim();
}

function tryGit(repoPath: string, args: string[]): boolean {
  try {
    git(repoPath, args);
    return true;
  } catch {
    return false;
  }
}

function isGitRepo(repoPath: string): boolean {
  return tryGit(repoPath, ['rev-parse', '--is-inside-work-tree']);
}

/** Local-only user identity so `git commit` never depends on the host's global git config (CI boxes rarely have one). */
function ensureLocalIdentity(repoPath: string): void {
  if (!tryGit(repoPath, ['config', 'user.email'])) {
    git(repoPath, ['config', 'user.email', 'loki-e2e@example.com']);
  }
  if (!tryGit(repoPath, ['config', 'user.name'])) {
    git(repoPath, ['config', 'user.name', 'Loki E2E']);
  }
}

function listLocalBranches(repoPath: string): string[] {
  const raw = git(repoPath, ['branch', '--format=%(refname:short)']);
  return raw.split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * Real-run finding: `fixtures/sandbox.ts`'s `stripPackageJsonScripts` (the
 * workaround for `resolveEffective`'s package.json-scripts-shadow-startCommand
 * bug — see that function's own doc comment) only edits the sandboxed copy's
 * `package.json` ON DISK, uncommitted. `demo/demo-backend` is itself a real
 * nested git repo with `scripts.start` committed at its `main` HEAD, so this
 * fixture's own `git checkout -- .` / `clean -fd` cleanup above silently
 * RESTORES the un-stripped, scripts-bearing `package.json` — and every
 * commit this fixture makes afterward (including `FEATURE_BRANCH`'s) carries
 * that restored version forward. Any later suite that starts demo-backend
 * (e.g. groups-and-search.spec.ts's conflict-dialog test, which runs after
 * this file alphabetically under workers:1) then hits the exact bug
 * `stripPackageJsonScripts` exists to avoid: demo-backend never reaches
 * 'running' (observed directly: `apiStart` returns 200 but `waitUntilRunning`
 * times out at 50s with `last status: stopped`). Re-strip and commit it back
 * into history HERE, before `FEATURE_BRANCH` branches off, so the fix is
 * baked into both branches' tracked state and survives every subsequent
 * checkout for the rest of the run — not just this fixture's own setup.
 */
function ensureScriptsStrippedInHistory(repoPath: string): void {
  const pkgPath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(pkgPath)) return;
  const before = fs.readFileSync(pkgPath, 'utf-8');
  stripPackageJsonScripts(repoPath);
  const after = fs.readFileSync(pkgPath, 'utf-8');
  if (before === after) return;
  git(repoPath, ['add', 'package.json']);
  git(repoPath, ['commit', '-m', 'e2e: strip package.json scripts (resolveEffective workaround)', '--no-verify']);
}

/**
 * Idempotent: given the sandboxed `demo-backend` copy at `repoPath`,
 * guarantees it's a real git repo, currently checked out on `main` with a
 * clean working tree, and that `FEATURE_BRANCH` exists with at least one
 * commit `main` doesn't have (a `MARKER_FILE` addition).
 */
export function setupGitRepoBranchSwitch(repoPath: string): GitRepoBranchSwitchFixture {
  if (!isGitRepo(repoPath)) {
    // Fresh init path (design.md §5's "fixture must git init ... branches"):
    // no commits exist yet, so `checkout -b` just renames the unborn HEAD —
    // works regardless of the host's `init.defaultBranch` setting.
    git(repoPath, ['init']);
    git(repoPath, ['checkout', '-b', MAIN_BRANCH]);
    ensureLocalIdentity(repoPath);
    git(repoPath, ['add', '-A']);
    git(repoPath, ['commit', '-m', 'e2e: initial import on ' + MAIN_BRANCH, '--no-verify']);
  } else {
    ensureLocalIdentity(repoPath);
    // Abort a leftover checkout/merge from a previous (crashed) run before
    // touching branches, so this setup never inherits a dirty/conflicted
    // worktree from an earlier suite run against the same sandbox.
    tryGit(repoPath, ['merge', '--abort']);
    tryGit(repoPath, ['checkout', '--', '.']);
    tryGit(repoPath, ['clean', '-fd']);

    const branches = listLocalBranches(repoPath);
    if (branches.includes(MAIN_BRANCH)) {
      git(repoPath, ['checkout', MAIN_BRANCH]);
    } else {
      // The demo repo's own default branch may differ — pin our "main" name
      // to whatever HEAD currently points at instead of assuming one.
      const current = git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      git(repoPath, ['checkout', '-b', MAIN_BRANCH, current]);
    }
  }

  // Must run on `main`, before `FEATURE_BRANCH` is cut from it — see the
  // function's own doc comment for why this is here at all.
  ensureScriptsStrippedInHistory(repoPath);

  // (Re)create the dedicated feature branch fresh off of main every run —
  // never reuse a stale one left over from a previous invocation of this
  // fixture against the same sandbox.
  tryGit(repoPath, ['branch', '-D', FEATURE_BRANCH]);
  git(repoPath, ['checkout', '-b', FEATURE_BRANCH]);
  fs.writeFileSync(
    path.join(repoPath, MARKER_FILE),
    `checked out on ${FEATURE_BRANCH} at ${new Date().toISOString()}\n`,
    'utf-8'
  );
  git(repoPath, ['add', MARKER_FILE]);
  git(repoPath, ['commit', '-m', `e2e: distinguish ${FEATURE_BRANCH} from ${MAIN_BRANCH}`, '--no-verify']);

  // Leave the worktree on main, clean — the happy-path suite's precondition.
  git(repoPath, ['checkout', MAIN_BRANCH]);

  const status = git(repoPath, ['status', '--porcelain']);
  if (status) {
    throw new Error(
      `git-repo-branch-switch fixture: ${repoPath} is not clean after setup (found dirty state):\n${status}`
    );
  }

  return { repoPath, mainBranch: MAIN_BRANCH, featureBranch: FEATURE_BRANCH };
}

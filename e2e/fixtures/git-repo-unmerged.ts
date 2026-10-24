/**
 * Seeds the sandboxed `demo-worker` repo copy into a genuinely unmerged-paths
 * git state, for `suites/git-unmerged-conflict-guard.spec.ts` (design.md
 * §5.5, analysis.md §3, `backend/routes/git.ts:47-70` /
 * `backend/git/gitFlowService.ts:29-37`).
 *
 * Deliberately scoped to `demo-worker` ONLY — task-4's `git-branch-switch`
 * suite and task-5's dirty-checkout/stash suite each own a dedicated repo
 * fixture against `demo-backend`/`demo-frontend` respectively (design.md §5
 * suites 3/4), so this file must never read or write those apps' copies.
 *
 * `demo/demo-worker` (the checked-in source, copied verbatim into the
 * sandbox by `copyDemoApps()`) already ships two real branches —
 * `feature-error-simulation` and `feature-verbose-logging` — that both edit
 * the same lines of `worker.js` (and `package.json`) relative to `main`.
 * Merging one into the other with real `git merge` reliably produces a real
 * conflict, so this fixture runs actual git commands (no mocking), matching
 * `lifecycleOps.test.ts`'s real-subprocess style (analysis.md §6 risk #7).
 */
import { execFile } from 'child_process';

const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export const UNMERGED_BASE_BRANCH = 'feature-error-simulation';
export const UNMERGED_MERGE_BRANCH = 'feature-verbose-logging';

function git(repoPath: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('git', ['-C', repoPath, ...args], { maxBuffer: MAX_BUFFER_BYTES }, (err, stdout, stderr) => {
      if (err) {
        const code =
          typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
            ? (err as unknown as { code: number }).code
            : 1;
        resolve({ code, stdout: stdout ?? '', stderr: stderr || err.message });
        return;
      }
      resolve({ code: 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

async function currentBranch(repoPath: string): Promise<string> {
  const res = await git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return res.stdout.trim();
}

/** Real `git status --porcelain` unmerged-path lines (`UU`/`AA`/... codes), same set `backend/git/gitUtils.ts:getUnmergedFiles` looks for. */
const UNMERGED_CODES = ['UU', 'AA', 'DD', 'AU', 'UA', 'UD', 'DU'];

export async function getUnmergedPaths(repoPath: string): Promise<string[]> {
  const res = await git(repoPath, ['status', '--porcelain']);
  return res.stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .filter((line) => UNMERGED_CODES.includes(line.slice(0, 2)))
    .map((line) => line.slice(3).trim());
}

export async function getStashList(repoPath: string): Promise<string[]> {
  const res = await git(repoPath, ['stash', 'list']);
  return res.stdout.split('\n').filter((line) => line.length > 0);
}

/**
 * Idempotent: safely re-callable (e.g. across a Playwright retry) — first
 * aborts any merge already in progress and force-checks-out the base branch
 * so a prior run's leftover conflict state can't wedge this one, then
 * reproduces the conflict fresh.
 *
 * Returns the branch the repo is left on (still `UNMERGED_BASE_BRANCH`, HEAD
 * never moves — the merge fails before it would) and the conflicted paths.
 */
export async function seedUnmergedConflict(repoPath: string): Promise<{ branch: string; files: string[] }> {
  // Best-effort cleanup of a leftover conflict from a previous attempt.
  await git(repoPath, ['merge', '--abort']);
  await git(repoPath, ['checkout', '-f', UNMERGED_BASE_BRANCH, '--']);
  await git(repoPath, ['clean', '-fd']);

  const preBranch = await currentBranch(repoPath);
  if (preBranch !== UNMERGED_BASE_BRANCH) {
    throw new Error(
      `e2e: git-repo-unmerged fixture expected demo-worker to be on ${UNMERGED_BASE_BRANCH}, got ${preBranch}`
    );
  }

  const mergeResult = await git(repoPath, ['merge', UNMERGED_MERGE_BRANCH]);
  if (mergeResult.code === 0) {
    // The two branches stopped conflicting (e.g. demo fixtures were edited
    // upstream) — fail loudly rather than silently testing a clean checkout.
    throw new Error(
      `e2e: git-repo-unmerged fixture expected 'git merge ${UNMERGED_MERGE_BRANCH}' to conflict against ` +
        `${UNMERGED_BASE_BRANCH} in ${repoPath}, but it merged cleanly. demo-worker's fixture branches no ` +
        `longer produce a real conflict — fixture needs updating.`
    );
  }

  const files = await getUnmergedPaths(repoPath);
  if (files.length === 0) {
    throw new Error(
      `e2e: git-repo-unmerged fixture ran 'git merge ${UNMERGED_MERGE_BRANCH}' in ${repoPath} and it failed ` +
        `(as expected), but 'git status --porcelain' reports no unmerged paths — cannot proceed.`
    );
  }

  const branch = await currentBranch(repoPath);
  return { branch, files };
}

/** Best-effort cleanup so a leftover conflict doesn't wedge other suites sharing the sandbox's demo-worker copy. */
export async function abortUnmergedConflict(repoPath: string): Promise<void> {
  await git(repoPath, ['merge', '--abort']);
}

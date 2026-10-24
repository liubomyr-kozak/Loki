import { execFile } from 'child_process';

const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

const UNMERGED_CODES = ['UU', 'AA', 'DD', 'AU', 'UA', 'UD', 'DU'];

export interface GitInfo {
  branch?: string;
  commit?: string;
  dirty: boolean;
}

export type GitResult = { code: number; stdout: string; stderr: string };

export type StashEntry = { ref: string; message: string };

function git(repoPath: string, args: string[]): Promise<string | undefined> {
  return new Promise(resolve => {
    execFile('git', ['-C', repoPath, ...args], { maxBuffer: MAX_BUFFER_BYTES }, (err, stdout) => {
      if (err) return resolve(undefined);
      resolve(stdout.trim());
    });
  });
}

/**
 * Read-only `git show <ref>:<filePath>` — uses the same non-mutating `git()`
 * runner as `getGitInfo` above (never `withRepoLock`/`runGit`), so it never
 * touches index/worktree and needs no repo lock. Returns `undefined` when the
 * ref or path doesn't exist (git exits non-zero and `git()` swallows the error).
 */
export async function showFileAtRef(repoPath: string, ref: string, filePath: string): Promise<string | undefined> {
  return git(repoPath, ['show', `${ref}:${filePath}`]);
}

export async function getGitInfo(repoPath: string): Promise<GitInfo> {
  const branch = await git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = await git(repoPath, ['rev-parse', '--short', 'HEAD']);
  let dirty = false;
  const status = await git(repoPath, ['status', '--porcelain']);
  if (typeof status === 'string' && status.length > 0) dirty = true;
  return { branch, commit, dirty };
}

function runGit(repoPath: string, args: string[]): Promise<GitResult> {
  return new Promise(resolve => {
    execFile(
      'git',
      ['-C', repoPath, ...args],
      { maxBuffer: MAX_BUFFER_BYTES },
      (err, stdout, stderr) => {
        if (err) {
          const code = typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
            ? (err as unknown as { code: number }).code
            : 1;
          resolve({ code, stdout: stdout ?? '', stderr: stderr || err.message });
          return;
        }
        resolve({ code: 0, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
  });
}

export async function getUnmergedFiles(repoPath: string): Promise<string[]> {
  const res = await runGit(repoPath, ['status', '--porcelain']);
  if (res.code !== 0) return [];
  return res.stdout
    .split('\n')
    .filter(line => line.length > 0)
    .filter(line => UNMERGED_CODES.includes(line.slice(0, 2)))
    .map(line => line.slice(3).trim());
}

export async function listStash(repoPath: string): Promise<StashEntry[]> {
  const res = await runGit(repoPath, ['stash', 'list']);
  if (res.code !== 0) return [];
  return res.stdout
    .split('\n')
    .filter(line => line.length > 0)
    .map((line): StashEntry => {
      const m = line.match(/^(stash@\{\d+\}):\s*(.*)$/);
      return m ? { ref: m[1], message: m[2] } : { ref: line, message: '' };
    });
}

export async function resolveStashRefByTag(repoPath: string, tag: string): Promise<string | null> {
  const stashes = await listStash(repoPath);
  const found = stashes.find(s => s.message.includes(tag));
  return found ? found.ref : null;
}

/** Per-repoPath mutex queue serializing git-touching functions below on the
 * same working tree. `getGitInfo`/`git()` above are intentionally excluded. */
const repoLocks = new Map<string, Promise<unknown>>();

function withRepoLock<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
  const prev = repoLocks.get(repoPath) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const cleanup = run.then(
    () => undefined,
    () => undefined
  );
  repoLocks.set(repoPath, cleanup);
  // Only delete if we're still the tail of the queue — a newer call may have
  // already chained onto `cleanup` and replaced the map entry with its own.
  cleanup.then(() => {
    if (repoLocks.get(repoPath) === cleanup) {
      repoLocks.delete(repoPath);
    }
  });
  return run;
}

export function listBranches(repoPath: string): Promise<string[]> {
  return withRepoLock(repoPath, async () => {
    const res = await runGit(repoPath, ['branch', '--format=%(refname:short)']);
    if (res.code !== 0) return [];
    return res.stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      // detached HEAD prints a pseudo-row like "(HEAD detached at <sha>)" —
      // not a real branch, must not reach the picker/checkout.
      .filter(line => !line.startsWith('('));
  });
}

export function checkoutBranch(repoPath: string, branch: string): Promise<GitResult> {
  // `--` separates the branch name from paths so a branch that collides with
  // a file/dir in the worktree (e.g. a file literally named `develop`) is
  // never misread as a pathspec.
  return withRepoLock(repoPath, () => runGit(repoPath, ['checkout', branch, '--']));
}

export function stashPush(repoPath: string, tag: string): Promise<{ stashRef: string; saved: boolean } & GitResult> {
  return withRepoLock(repoPath, async () => {
    const res = await runGit(repoPath, ['stash', 'push', '-u', '-m', tag]);
    if (res.code !== 0) {
      return { ...res, stashRef: '', saved: false };
    }
    const stashes = await listStash(repoPath);
    const found = stashes.find(s => s.message.includes(tag));
    if (!found) {
      // `git stash push` exited 0 but nothing was actually saved (e.g.
      // submodule/nested-repo-only changes) — not a failure, just nothing
      // to stash. Report that plainly instead of a synthetic error code.
      return { ...res, code: 0, stashRef: '', saved: false };
    }
    return { ...res, stashRef: found.ref, saved: true };
  });
}

export function stashApply(
  repoPath: string,
  stashRef: string
): Promise<{ conflict: boolean; files: string[] } & GitResult> {
  return withRepoLock(repoPath, async () => {
    const res = await runGit(repoPath, ['stash', 'apply', stashRef]);
    const files = await getUnmergedFiles(repoPath);
    const conflict = files.length > 0;
    return { ...res, conflict, files };
  });
}

// caller must already have explicit user confirmation; this function does not gate on that itself.
export function dropStash(repoPath: string, stashRef: string): Promise<GitResult> {
  return withRepoLock(repoPath, () => runGit(repoPath, ['stash', 'drop', stashRef]));
}

export function hasUnmergedPaths(repoPath: string): Promise<boolean> {
  return withRepoLock(repoPath, async () => {
    const files = await getUnmergedFiles(repoPath);
    return files.length > 0;
  });
}

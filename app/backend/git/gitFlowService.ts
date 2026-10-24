import type { Config } from '../../shared/types';
import { getGitInfo, listBranches, checkoutBranch, stashPush, stashApply, dropStash, hasUnmergedPaths, getUnmergedFiles, resolveStashRefByTag, listStash } from './gitUtils';
import { readStashMap, writeStashRecord, removeStashRecord, reconcileStashMap } from './gitStashStore';

// Per-repoPath mutex serializing the composite git flows below (checkout /
// stash apply / stash drop) against each other, so two requests touching the
// same repo can't interleave their steps. Independent from gitUtils' own
// internal per-call lock (which only guards a single git subprocess call) —
// that internal lock is acquired and released within each step below and
// never nests across the outer lock here, so there's no deadlock risk.
const gitFlowLocks = new Map<string, Promise<unknown>>();
function withGitFlowLock<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
  const prev = gitFlowLocks.get(repoPath) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  gitFlowLocks.set(repoPath, run.catch(() => undefined));
  return run;
}

export function readBranchesInfo(config: Config, repoPath: string): Promise<Record<string, unknown>> {
  return withGitFlowLock(repoPath, async () => {
    await reconcileStashMap(config, repoPath);
    const [branches, info] = await Promise.all([listBranches(repoPath), getGitInfo(repoPath)]);
    const current = info.branch ?? 'HEAD';
    const record = readStashMap(config)[repoPath]?.[current];
    return { current, branches, dirty: info.dirty, ...(record ? { stash: record } : {}) };
  });
}

export function runCheckoutFlow(config: Config, repoPath: string, branch: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return withGitFlowLock(repoPath, async (): Promise<{ status: number; body: Record<string, unknown> }> => {
    if (await hasUnmergedPaths(repoPath)) {
      const files = await getUnmergedFiles(repoPath);
      return {
        status: 409,
        body: { ok: false, error: 'unresolved conflict in working tree — resolve in terminal first', files },
      };
    }

    const info = await getGitInfo(repoPath);
    const currentBranch = info.branch ?? 'HEAD';
    let stashed = false;

    // Target already checked out — true no-op, skip stash/checkout entirely
    // so callers (e.g. groupOps) can always dispatch a checkout for the
    // intent branch without first comparing against a possibly-stale cache.
    if (branch === currentBranch) {
      return { status: 200, body: { ok: true, stashed: false } };
    }

    if (info.dirty) {
      const createdAt = new Date().toISOString();
      const tag = `loki-orchestrator:${currentBranch}:${createdAt}`;
      const pushResult = await stashPush(repoPath, tag);
      if (pushResult.code !== 0) {
        await reconcileStashMap(config, repoPath);
        return { status: 200, body: { ok: false, error: pushResult.stderr } };
      }
      if (pushResult.saved) {
        writeStashRecord(config, repoPath, currentBranch, {
          stashRef: pushResult.stashRef,
          tag,
          createdAt,
        });
        stashed = true;
      }
      // else: `dirty` was true but nothing stash-able was actually saved
      // (e.g. submodule/nested-repo-only changes) — proceed to checkout
      // without a stash record instead of aborting.
    }

    // Step 2: checkout the target branch. No auto-revert of the stash on failure.
    const checkoutResult = await checkoutBranch(repoPath, branch);
    if (checkoutResult.code !== 0) {
      await reconcileStashMap(config, repoPath);
      return { status: 200, body: { ok: false, stashed, error: checkoutResult.stderr } };
    }

    // Never dropped here — the record is removed only on a clean apply;
    // the physical stash always stays in `git stash list`.
    const record = readStashMap(config)[repoPath]?.[branch];
    let appliedStash: boolean | undefined;
    let conflict: boolean | undefined;
    let files: string[] | undefined;
    if (record) {
      // Resolve by tag at use time — the recorded stashRef may be stale if
      // another stash push/drop shifted stash@{N} indices since it was
      // written (see resolveStashRefByTag doc comment).
      const freshRef = await resolveStashRefByTag(repoPath, record.tag);
      if (!freshRef) {
        // Recorded stash is gone from `git stash list` (dropped outside the
        // app, e.g. in a terminal) — the record now points at nothing, so
        // drop it too rather than leave a dead pointer around. Checkout
        // itself still succeeded, hence ok:true — but surface a warning so
        // this isn't a silent "your changes vanished" for the user.
        removeStashRecord(config, repoPath, branch);
        await reconcileStashMap(config, repoPath);
        return {
          status: 200,
          body: {
            ok: true,
            stashed,
            appliedStash: false,
            staleStash: true,
            warning: `recorded stash for ${branch} no longer exists in git`,
          },
        };
      }
      const applyResult = await stashApply(repoPath, freshRef);
      appliedStash = true;
      conflict = applyResult.conflict;
      files = applyResult.files;
      if (applyResult.conflict) {
      } else if (applyResult.code !== 0) {
        await reconcileStashMap(config, repoPath);
        return { status: 200, body: { ok: false, stashed, appliedStash, error: applyResult.stderr } };
      } else {
        removeStashRecord(config, repoPath, branch);
      }
    }

    await reconcileStashMap(config, repoPath);
    return { status: 200, body: { ok: true, stashed, appliedStash, conflict, files } };
  });
}

export function runStashApply(config: Config, repoPath: string, stashRef: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return withGitFlowLock(repoPath, async (): Promise<{ status: number; body: Record<string, unknown> }> => {
    const forRepo = readStashMap(config)[repoPath] ?? {};
    const matchingRecord = Object.values(forRepo).find(r => r.stashRef === stashRef || r.tag === stashRef);

    let resolvedRef: string | null = null;
    if (matchingRecord) {
      resolvedRef = await resolveStashRefByTag(repoPath, matchingRecord.tag);
    } else {
      const live = await listStash(repoPath);
      resolvedRef = live.some(s => s.ref === stashRef) ? stashRef : null;
    }

    if (!resolvedRef) {
      return { status: 200, body: { ok: false, error: 'stash not found (stale reference)' } };
    }

    const r = await stashApply(repoPath, resolvedRef);
    await reconcileStashMap(config, repoPath);
    return {
      status: 200,
      body: { ok: r.conflict || r.code === 0, conflict: r.conflict, files: r.files },
    };
  });
}

export function runStashDrop(config: Config, repoPath: string, stashRef: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return withGitFlowLock(repoPath, async (): Promise<{ status: number; body: Record<string, unknown> }> => {
    const forRepo = readStashMap(config)[repoPath] ?? {};
    const matchingRecord = Object.values(forRepo).find(r => r.stashRef === stashRef || r.tag === stashRef);

    let resolvedRef: string | null = null;
    if (matchingRecord) {
      resolvedRef = await resolveStashRefByTag(repoPath, matchingRecord.tag);
    } else {
      const live = await listStash(repoPath);
      resolvedRef = live.some(s => s.ref === stashRef) ? stashRef : null;
    }

    if (!resolvedRef) {
      return { status: 200, body: { ok: false, error: 'stash not found (stale reference)' } };
    }

    const r = await dropStash(repoPath, resolvedRef);
    await reconcileStashMap(config, repoPath);
    if (r.code === 0) {
      return { status: 200, body: { ok: true } };
    }
    return { status: 200, body: { ok: false, error: r.stderr } };
  });
}

---
type: concept
title: Git stash flow contract
timestamp: "2026-07-24T08:16:18Z"
---

# Git stash flow contract

# Git stash flow contract

How the orchestrator's per-app git-flow (auto-stash → checkout → auto-apply)
is structured across `gitFlowService.ts`, `gitStashStore.ts`, `gitUtils.ts`,
and `routes/git.ts`, and why its locking, staleness, and data-loss rules are
shaped the way they are.

## Architecture: `gitFlowService.ts` as a downward leaf

`gitFlowService.ts` was extracted verbatim from `server.ts`. `config` is
passed in as a parameter — never imported — so this service does not depend
on `configState` or any router, keeping it a downward leaf of the git layer
with no new import cycle.

## Two independent locks, no nesting

There are two separate locks in play:

1. `gitFlowService.ts`'s own per-repoPath mutex (`gitFlowLocks`), serializing
   the *composite* flows below (checkout / stash-apply / stash-drop) against
   each other, so two requests touching the same repo can't interleave their
   steps.
2. `gitUtils.ts`'s internal per-call lock, which only guards a single git
   subprocess call.

The outer lock is acquired once per composite flow and never nests across
into the inner one — the inner lock is acquired and released independently
within each step. Because they never nest, there's no deadlock risk between
them. This is also why `gitUtils.ts`'s mutex scope deliberately **excludes**
`getGitInfo()`/`git()` — those are read-only info calls that composite flows
need to run *between* locked mutating steps, so if they were folded into the
same lock scope a flow could deadlock waiting on its own prior step.

## Composite checkout flow

`POST /api/apps/:name/git/checkout` (`routes/git.ts`) runs: auto-stash a
dirty working tree → checkout the target branch → auto-apply any stash
recorded for that branch. Several deliberate non-obvious behaviors inside
`gitFlowService.ts`:

- **Already-on-target is a true no-op.** `runCheckoutFlow` compares `branch`
  against the current branch *before* touching stash or checkout
  (`gitFlowService.ts`'s `runCheckoutFlow`, `branch === currentBranch` check)
  and returns `{ok: true, stashed: false}` immediately. This exists so
  callers (e.g. `groupOps.applyGroupIntentAndStart`) can always dispatch a
  checkout for the intent branch without first comparing against a
  possibly-stale cached `st?.branch` — previously a dirty double-click on the
  already-checked-out branch would stash pointlessly.
- **"Nothing to stash" is not a stash failure.** `stashPush` (`gitUtils.ts`)
  runs `git stash push -u` and then checks `git stash list` for its own tag:
  if the push exited 0 but nothing shows up there (e.g. submodule/nested-repo-
  only changes — those don't produce a stashable diff), it returns
  `{code: 0, saved: false, stashRef: ''}` instead of a synthetic failure code.
  `runCheckoutFlow` only writes a stash record and sets `stashed: true` when
  `pushResult.saved` is true; otherwise it proceeds straight to checkout with
  no stash record at all, rather than aborting on a `dirty=true` repo that
  actually had nothing stash-able.
- **No auto-revert on checkout failure.** If checkout fails after a stash was
  pushed, the stash is *not* automatically re-applied or reverted — the user
  is left with their changes safely stashed rather than the flow guessing at
  a recovery action that could itself fail or lose data.
- **Stash record is dropped on a clean apply — or on a confirmed-stale one.**
  The sidecar stash record (see below) survives every step of the flow
  except two: a successfully-applied stash, and an apply attempt where
  `resolveStashRefByTag` can't find the recorded tag in `git stash list` at
  all (the physical stash was dropped outside the app, e.g. in a terminal).
  In that second case checkout has already succeeded, so `runCheckoutFlow`
  drops the now-dead record (`removeStashRecord`) and returns `ok: true`
  with `staleStash: true` and a `warning` string — not a silent "your
  changes vanished", and not a checkout failure either, since the checkout
  itself worked. Any other interruption (failed apply, failed checkout)
  still leaves the record intact.
- **Stash refs are resolved by tag at use time, not cached.** A `stashRef`
  recorded earlier can go stale — git's stash index shifts whenever another
  stash is pushed/popped/dropped anywhere in the repo, since stashes are a
  single ordered stack (`stash@{0}`, `stash@{1}`, ...). Resolving by tag
  (`resolveStashRefByTag`) at the moment of use, rather than trusting a
  previously recorded `stashRef` index, is what keeps this correct.
- **A pre-existing unmerged-conflict block now returns the file list.** The
  409 short-circuit at the top of `runCheckoutFlow` (any checkout attempted
  while `hasUnmergedPaths(repoPath)` is true, from an earlier conflicted
  auto-apply) includes `files` — the unmerged paths from `getUnmergedFiles`
  — alongside `error` in the body, so the UI can name what needs resolving
  in the terminal instead of a bare "unresolved conflict" string.

## Data-loss gating: confirmation is the caller's job

Both `gitUtils.ts`'s `dropStash()` and `routes/git.ts`'s stash-drop route
document the same invariant: **the caller must already have obtained user
confirmation before this is called.** Neither function itself prompts or
gates on confirmation — `git stash drop` is destructive and irreversible, so
the UI-level confirm step is a hard precondition, not a suggestion, and
moving the confirmation later (or removing it) would let a drop happen
silently.

## Lock-queue cleanup: don't delete a newer caller's lock

`gitUtils.ts`'s internal lock queue only deletes its map entry for a
repo/key if that entry is **still the current one** at cleanup time (an
identity check, not just "the key exists"). Without this check, an
unconditional delete after an earlier caller's lock resolves could remove a
newer caller's in-flight lock entry from the map, letting a third caller
acquire the lock while the newer one still believes it holds it.

## `GitResult`: non-swallowing by contract

`gitUtils.ts`'s `GitResult` type (`{ code, stdout, stderr }`) is documented
as non-swallowing: a git call always resolves, never rejects and never
returns `undefined`. `execFile` errors (non-zero exit, spawn failure) are
mapped into `code`/`stderr` on the result object instead of being thrown away
or left for the caller to catch — callers can rely on always getting a result
object back and branch on `code` rather than wrapping every call in try/catch.

## `gitStashStore.ts`: the sidecar record

A JSON sidecar (`git-stashes.json`) tracks which stash (by tag/ref) belongs
to which `(repoPath, branch)` pair, separate from git's own stash list.

- **`readStashMap`** is a raw read of the sidecar, no git spawn — kept that
  way deliberately so `hasStashForBranch` (used on the status poll path)
  never grows a git dependency. `hasStashForBranch` is documented as the
  *only* function `getAppStatus` (the poll path) may call: it must not import
  `gitUtils`/`runGit`/`listStash`, and nothing it depends on may either, or a
  future refactor could silently add a git spawn to the poll path — which
  runs far more often, and for far more apps at once, than a user-initiated
  git action.
- **Write is not currently atomic.** `writeStashMap` goes through
  `jsonSidecarStore(...).write()` (`backend/config/jsonStore.ts`), which does
  a plain `fs.writeFileSync` — not a temp-file-then-rename swap, and not
  guarded by any lock against a concurrent writer. A crash mid-write can
  still leave a truncated `git-stashes.json`. This is a known, accepted
  limitation, flagged for a follow-up in `jsonStore.ts` itself rather than
  special-cased in this caller.
- **`reconcileStashMap`** compares the sidecar's records for a `repoPath`
  against the live `git stash list` output and silently drops any record
  whose `stashRef`/tag no longer exists in git. It is called from
  picker-open, checkout, and stash-apply/drop flows — **never** from the poll
  path (that's exactly what `hasStashForBranch`'s raw-read restriction above
  protects), and never called by `gitStashStore.ts` itself (callers own
  deciding when reconciliation is worth a git spawn).

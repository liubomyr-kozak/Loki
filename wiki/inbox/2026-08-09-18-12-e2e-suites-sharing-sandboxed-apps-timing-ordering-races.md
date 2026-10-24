---
type: note
title: "e2e suites sharing sandboxed apps: timing/ordering races"
timestamp: "2026-08-09T15:12:32Z"
---

# e2e suites sharing sandboxed apps: timing/ordering races

Loki e2e (Playwright) suites share one sandboxed backend + demo-app processes across suite files; timing/ordering races recur (git-checkout restoring unmocked package.json, cross-suite process state, mount-fetch vs assertion race).

Lesson: any new e2e suite touching a shared demo-app or page-load-time assertion must explicitly wait for the relevant network response/state settle point before asserting (e.g. page.waitForResponse for the mount-time GET /api/apps before baseline assertions), and any fixture doing `git checkout -- .`/reset must re-verify sandbox-specific file patches (like stripPackageJsonScripts) survive the reset — commit patches into the fixture's own git history rather than relying on working-tree-only edits.

Background: backend/apps/effectiveConfig.ts's resolveEffective() auto-selects a package.json script as the environment when none is explicitly chosen, silently shadowing the app config's own startCommand — a real product bug worked around in e2e/fixtures/sandbox.ts's stripPackageJsonScripts(), not fixed in backend code (out of scope).

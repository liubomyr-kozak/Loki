# Directory Update Log

## 2026-10-24
* **Update**: backend/http-server, desktop/tauri-shell, desktop/overview, desktop/api-client, guides/configuration — the backend's own port variable is `LOKI_PORT`, not `PORT`; apps Loki starts get the backend env minus Loki's own variables (`PORT`, `CONFIG_FILE`, `CATALOG_FILE`, `MARKETPLACE_DIR`, `APP_SESSIONS_DIR`, `LOKI_*`), so a dev server no longer starts on Loki's port 9999
* **Creation**: guides/ — the user and contributor documentation moved here from the removed docs/ folder (getting-started, user-guide, configuration, plugins, troubleshooting, development, architecture, releasing), so the wiki is the single source of truth; links rewritten for the new location
* **Update**: guides/troubleshooting — new section for the "Connecting to orchestrator…" hang and the port-9999 fatal dialog; the backend listens on 127.0.0.1:9999
* **Update**: guides/architecture, guides/configuration, guides/plugins — backend address is 127.0.0.1:9999, not localhost; repository layout lists wiki/ as the only documentation folder
* **Update**: backend/http-server — server listens on 127.0.0.1 only and exits 1 on a listen error
* **Update**: desktop/api-client, desktop/overview, desktop/hooks-lib, desktop/tauri-shell — 127.0.0.1:9999 instead of localhost:9999; usePolling retries the first load every second until the config arrives; early_exit_message names the process holding port 9999
* **Update**: backend/plugins — author-contract link points to guides/plugins

## 2026-08-09
* **Creation**: inbox/2026-08-09-18-12-e2e-suites-sharing-sandboxed-apps-timing-ordering-races — e2e suites sharing sandboxed apps: timing/ordering races

## 2026-08-03
* **Creation**: backend/config-core `configLocation.ts` row — documents the new single source of truth for the config's folder and filename (`STATE_DIR_NAME`, `CONFIG_FILE_NAME` = `loki-config.json`, `defaultConfigFile`, `resolveConfigFile`, `configFolder`), the `stateDir := dirname(configFile)` invariant, the dev-vs-packaged folder split, and the deliberate absence of any legacy filename constants
* **Update**: backend/config-core — dropped the `migrateStateDir.ts` table row (the file was deleted; no migration path exists any more, by explicit decision); `loadConfig` row now states that relative `stateFile`/`sessionsDir` resolve against the config file's own folder and are stored relative so the config stays portable, replacing the old "persists a resolved absolute stateFile" claim; `statePaths` row notes `DEFAULT_STATE_FILE` is now an absolute path computed from the default config folder rather than the bare string `state/state.json`; `scan.ts` row renamed `resolveLogsDir` → `resolveSessionsDir`
* **Update**: entities/config-read-write-contract — replaced the "Why loadConfig persists a resolved absolute stateFile on first boot" section with "config folder is the anchor", documenting the invariant `stateDir := dirname(configFile)` (config, state, sidecars and session output share one folder: `<repo>/state/` in dev, Tauri's `app_config_dir()` when packaged, with no nesting) and why paths are stored relative but resolved in memory — resolving against `process.cwd()` broke the packaged app, whose backend is spawned with no `.current_dir()` (cwd `/`), while baking an absolute path in broke portability; removed the `migrateStateDir.ts` section; renamed the `resolveLogsDir` section to `resolveSessionsDir` and added why the concept is *sessions*, not logs (these files are the launched apps' stdout/stderr, and the only output channel a detached spawn has; tmux writes none of them); provider-key allowlist now lists `sessionsDir` under the detached provider, not `logsDir` under tmux; `RESETTABLE` and the default-source-order note updated to `sessionsDir` / `APP_SESSIONS_DIR` / sibling default `sessions`
* **Update**: backend/apps — `configure({ sessionsDir?, resolvePid? })`, `resolveSessionsDir` reuse, and the detached provider's single advanced setting renamed from `logsDir` to `sessionsDir`; the `os.tmpdir()` fallback is unchanged
* **Update**: backend/http-server — boot sequence no longer calls `migrateStateDir()`; it resolves the config path through `configLocation.ts` (`state/loki-config.json`) and deliberately reads no legacy layout; CLI log path and the `RESETTABLE` set updated to `sessionsDir`
* **Update**: backend/plugins — packaged-backend env handoff is now `CONFIG_FILE`/`CATALOG_FILE`/`APP_SESSIONS_DIR`
* **Update**: desktop/settings — Storage row reads `detected?.sessionsDir`
* **Update**: entities/provider-session-lifecycle — the shared resolver contract renamed to `resolveSessionsDir` / `global.sessionsDir` / `detected.sessionsDir`
* **Update**: entities/backend-route-api-reference — reset-endpoint exclusion set and the provider-key collision example use `sessionsDir`; boot description no longer mentions a first-boot migration
* **Deprecation**: rules/spawned-fix-agents-must-use-sonnet-model — moved to global kb-agent scope, not project-specific
* **Deprecation**: inbox/2026-08-03-22-54-spawned-fix-agents-must-use-sonnet-model — promoted to rules/spawned-fix-agents-must-use-sonnet-model
* **Creation**: rules/spawned-fix-agents-must-use-sonnet-model — Spawned fix agents must use Sonnet model
* **Creation**: inbox/2026-08-03-22-54-spawned-fix-agents-must-use-sonnet-model — Spawned fix agents must use Sonnet model

## 2026-08-02
* **Update**: entities/frontend-component-contracts — removed the duplicated H1; replaced the stale 'store/groupOps.ts — parity with legacy App.tsx' section (it described startGroup/stopGroup, neither of which exists any more) with the actual component contract: every start affordance (GroupHeader pill, GroupMenu 'Start group', GroupStartConflictDialog, and useAppRow's single-row runGroupStart) routes through startGroupExclusive rather than applyGroupIntentAndStart, while stop calls stopApps directly; thunk internals cross-linked to desktop/store.md instead of duplicated

## 2026-08-01
* **Update**: plugins/flag-toggle — documented the real file set now on disk under marketplace/flag-toggle (index.ts, flags.ts, resolve.ts, flags.test.ts, manifest v2.0.0); corrected the false 'isFlagApplied parses with JSON.parse instead of eval' claim (the typescript-export branch still evals the recovered value string), replaced non-existent getOrCreateByPath/parseEnableLocal with the real inline dotted walk and findAppBlock/readEnableLocalFlag
* **Update**: entities/frontend-component-contracts — new rule: every free-text input carries autoCorrect/autoCapitalize off, spellCheck false, autoComplete off (identifiers, not prose), applied across all nine inputs
* **Update**: desktop/portals-pickers — AppContextMenu's General section: always-tinted Favorite star, new 'Open in terminal' row reusing TerminalButton's exported openTerminal, .organizeRow hover affordance
* **Update**: desktop/applist — isBusy now ORs git.checkoutPending, start/force-start pass 'selEnv || undefined' (empty env must never reach POST /start), openTerminal is exported and reused by AppContextMenu
* **Update**: desktop/store — appsSlice fetchApps seq-guard (fetchAppsSeq/appliedFetchAppsSeq/pendingFetchAppsSeq drop out-of-order responses); gitSlice checkoutPending + scriptsByApp/scriptsPending slots, conflict cleared on ok:false/rejected, staleStash warning routed through checkoutError, fetchScripts.rejected writes an empty slot so refreshScripts can retry; groupOps documented as applyGroupIntentAndStart/startGroupExclusive with the unconditional intent-branch checkout; replaced the fictional groupsSlice section and stale customGroups listener with the real groupSelectionsSlice and groupOrder-reconcile listener
* **Update**: backend/infra-git-process-ports — gitUtils: listBranches drops the detached-HEAD pseudo-row, checkoutBranch passes 'git checkout <branch> --' so a branch colliding with a path isn't read as a pathspec, getUnmergedFiles is now exported, and stashPush reports {saved} instead of the deleted STASH_TAG_LOOKUP_FAILED_CODE synthetic failure; gitFlowService: already-on-target no-op, stash record written only when saved, 409 body carries files[], stale-record apply returns ok:true + staleStash + warning
* **Update**: entities/git-stash-flow-contract — per-app row pickers fix batch (S1-S4, U23; `.sheriff/runs/RUN-2026-08-01-per-app-row-pickers-loki-deskt`): `stashPush` distinguishes "nothing to stash" (code 0, no tag in `stash list`) from a real failure instead of synthesizing a failure code, so checkout no longer aborts on dirty-but-unstashable (e.g. submodule-only) trees; true no-op checkout when `branch === currentBranch`; stale recorded-stash case (dropped outside the app) now drops the dead record and returns `ok:true, staleStash:true, warning` instead of leaving a dangling pointer; 409 conflict body carries `files[]`.
* **Update**: entities/branch-signal-and-refresh-scope — `useAppRow`'s `liveBranch` priority inverted to `st?.branch ?? branchInfo?.current` (poll-backed signal first, picker cache only as a pre-first-poll fallback) — the old order let the picker-only cache permanently shadow the live signal for rows that never reopened their picker; documented `fetchApps`' new seq-guard (drops stale-order responses) and `git.checkoutPending` driving row busy state during an in-flight checkout.
* **Update**: entities/frontend-picker-selector-contracts — `useCombobox`'s type-ahead `onKeyDown` now appends to `query` only when `!searchEnabled` (previously always-appended plus the controlled `<input>`'s own `onChange` double-wrote every keystroke once search was enabled, e.g. "dev" → "ddeevv" with zero matches); `Backspace` gets the same split.
* **Update**: entities/backend-route-api-reference — `POST /start` documented to drop an empty-string `environment` instead of persisting it; `POST /git/checkout` response documented for `staleStash?`/`warning?` and the 409 body's `files?`.

Root cause map (S1 checkout sometimes fails, S2 UI shows stale branch/env, S3 session start picks up stale branch/env, S4 duplicate matches in branch search) and the full 20-edit changeset are in the run's `phases/diagnose/diagnosis.md` and `phases/fix/changes.md`.

## 2026-07-30
* **Update**: proxy-toggle plugin doc — fixed stale examples/plugins/ path references to marketplace/ (marketplace-by-reference refactor, commit 690ff73).
* **Update**: restart-btn plugin doc — fixed stale examples/plugins/ path references to marketplace/ (marketplace-by-reference refactor, commit 690ff73).
* **Update**: git-log plugin doc — fixed stale examples/plugins/ path references to marketplace/ (marketplace-by-reference refactor, commit 690ff73).
* **Update**: open-site plugin doc — fixed stale examples/plugins/ path references to marketplace/ (marketplace-by-reference refactor, commit 690ff73).
* **Update**: flag-toggle plugin doc — fixed stale examples/plugins/ path references to marketplace/ (marketplace-by-reference refactor, commit 690ff73).
* **Update**: Portals & pickers (desktop) — noted IconPicker.tsx's pre-existing (unrelated to plugin-system fixes) tsc error, confirmed via git-stash bisection in a prior fix-batch run.
* **Update**: Hooks & lib (desktop) — usePolling.ts section rewritten to match current code: fetchPlugins() now included in interval+focus recurring set (was mount-only, should-fix from plugin audit), fixed InstalledPlugin->MarketplacePlugin type reference.
* **Update**: Backend route API reference — plugins.ts table corrected to 10 routes (was missing /api/plugins/:id/activated), fixed response types to MarketplacePlugin, corrected DELETE description from 'remove' to 'deactivate'.
* **Update**: Desktop API Client — plugin endpoint table corrected: removed fictitious /api/plugins/:id/config route, added missing /api/plugins/:id/activated and global /api/plugins/:id/invoke routes, fixed DELETE/enabled descriptions to reflect activated/enabled two-flag model.
* **Update**: Desktop Redux store — pluginsSlice.ts section updated: list is MarketplacePlugin[] not InstalledPlugin[], documented fetchPlugins.rejected (added) and previewPlugin.pending installing=true (fixed), setPluginActivated vs setPluginEnabled as two independent thunks, removePlugin's real deactivate-only behavior.
* **Update**: Dashboard components (desktop) — PluginsPanel/PluginInstallPreview/CatalogRow/AppPluginsSection sections rewritten for current activated+enabled model, single Marketplace section (no more split Catalog/Examples), CatalogRow installs directly without preview modal, removePlugin deactivate-only semantics, AppPluginsSection allPlugins filtered to activated&&enabled.
* **Update**: Config read/write contract — configState.ts section corrected: configMutation.ts mutators are no longer lock-free sync writes; documented the new withFileLock per-path promise-chain serialization.
* **Update**: Backend config & core module map — configMutation.ts row updated: mutateConfigSection now atomic (writeJsonAtomic) and all mutators serialized per-path via withFileLock, closing the install/activate race.
* **Update**: Backend plugin system — rewrote Store/State/Catalog sections for the current activated+enabled two-flag model (config.plugins/config.disabledPlugins, not plugin-state.json), removePlugin->setPluginActivated deactivate semantics, existsSync(dest) install skip-copy, packaged marketplace shipping/resolution (build-packaged-server.js + main.rs MARKETPLACE_DIR), catalog.ts sharing marketplaceDir().
* **Update**: flag-toggle — resolveKey now prefers runningEnvironment over selectedEnvironment for env-map keys, mirroring the onStart write-path override
* **Update**: group-app-intent-contract — drift indicator: chip → hover icon + Popover tooltip (branch/env split fields, portal-rendered fixed positioning); driftSlot shape {active,branch,env} replaces {active,label}

## 2026-07-25
* **Creation**: entities/group-app-intent-contract — per-(group, app) branch & environment intent: the `groupSelections.json` sidecar, opaque-group-tag routes with lazy prune, `AppStatus.runningEnvironment` vs `selectedEnvironment`, the two-store resolution order, and intent-not-isolation (checkout on group start, drift chip + restart)
* **Update**: entities/branch-signal-and-refresh-scope — grouped rows resolve the branch picker from group intent before the live signal; `fetchGroupSelections` is a one-shot boot fetch outside `refreshAll`
* **Update**: entities/config-read-write-contract — `selections.json` is no longer the only env-selection store; `jsonStore.ts` sidecar list and `startApps` note updated for `groupId`/`applyGroupIntentAndStart`
* **Update**: entities/session-providers-effective-config — `selections.json` is the *global* per-app selection, bypassed by group starts via `persistSelection: false`

## 2026-07-24
* **Creation**: plugins/index — per-plugin wiki pages added for the examples/plugins set (flag-toggle, git-log, open-site, proxy-toggle, restart-btn) plus the shared pluginContext.ts helper; wired into root wiki/index.md
* **Update**: full-codebase module coverage: 11 module-map pages, 169 files documented (backend/{config-core,apps,plugins,http-server,infra-git-process-ports}; desktop/{applist,dashboard,settings,portals-pickers,store,hooks-lib}); wired into new wiki/backend/index.md, updated wiki/desktop/index.md and root wiki/index.md
* **Creation**: entities/branch-signal-and-refresh-scope — live branch signal (`apps.apps[].branch`) vs picker-only `branchesByApp`, `refreshAll` scope, env candidates in local state
* **Update**: entities/config-read-write-contract — cross-link the gitSlice `fetchBranches` note to the live branch signal concept
* **Update**: desktop/build-and-icons — `resources-build/` prereq + `server:build:packaged`, `desktop:dev`/`desktop:build` entrypoints, no lint script, test-wiring gaps
* **Update**: index — root index.md turned into a real entry point (intro + oriented subdirectory descriptions)
* **Creation**: entities/flag-toggle-platform-app-model — Flag-toggle platform/app model
* **Creation**: entities/frontend-component-contracts — Frontend component contracts
* **Creation**: entities/git-stash-flow-contract — Git stash flow contract
* **Creation**: entities/provider-session-lifecycle — Provider session lifecycle
* **Creation**: entities/backend-module-boundary-contracts — Backend module boundary contracts
* **Creation**: entities/plugin-agnostic-architecture — Plugin-agnostic architecture

## 2026-07-23
* **Creation**: entities/frontend-picker-selector-contracts — Frontend picker/selector contracts
* **Creation**: entities/backend-route-api-reference — Backend Route/API reference
* **Creation**: entities/session-providers-effective-config — Session providers & effective config
* **Creation**: entities/config-read-write-contract — Config read/write contract

## 2026-07-21
* **Update**: frontend-app — виправлено: app icon = lucide-react через IconPicker, не emoji
* **Update**: frontend-app — додано Visual reference launcher/AppList (кольори/типографія/spacing зі скріншоту)

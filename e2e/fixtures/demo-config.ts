/**
 * Derives a sandboxed `loki-config.json` from `demo/loki-config.json` for a
 * given sandbox directory: absolute `repoPath`s pointing at the sandboxed
 * demo-app copies, dynamically allocated ports for demo-backend/demo-frontend
 * (never the tracked 4001/4002 — avoids CI port collisions), and
 * `global.sessionProvider: "detached"` (the real, shipped, non-fake provider
 * at backend/apps/providers/detachedProvider.ts, id 'detached' — NOT tmux,
 * see design.md §3.1).
 */
import fs from 'fs';
import path from 'path';
import {
  repoRoot,
  copyDemoApps,
  copyExtraApp,
  freePort,
  type DemoAppName,
} from './sandbox';

/**
 * Dedicated config app name for `git-repo-scripts-preview.ts`
 * (`suites/git-branch-scripts-preview.spec.ts`, task-7). Its own physical
 * clone of `demo/demo-backend`, entirely separate from the `demo-backend`
 * app entry that `git-repo-branch-switch.ts` (task-4) owns — both fixtures
 * used to share the ONE sandboxed `demo-backend` copy, but
 * `playwright.config.ts`'s `fullyParallel: true` lets their suite files run
 * at the same wall-clock time, and both fixtures create/checkout real git
 * branches (`git checkout -b`) against it, which raced on-disk (`fatal:
 * cannot lock ref ... reference already exists`). This app is never
 * started as a process (no `startCommand`/`appUrl`/`groups`) — the
 * `/git/scripts` route this suite exercises only ever needs a resolvable
 * `repoPath` on disk, never a running app.
 */
export const SCRIPTS_PREVIEW_APP_NAME = 'demo-backend-scripts-preview';

// Minimal shape we care about — intentionally looser than backend/config's
// full `Config`/`AppConfig` types (no cross-package import from e2e/ into
// backend/ type-land needed for this) but structurally compatible with them.
export interface DemoAppConfigEntry {
  label: string;
  repoPath: string;
  startCommand?: string;
  appUrl?: string;
  dependsOn?: string[];
  groups?: string[];
  icon?: string;
}

export interface DerivedLokiConfig {
  version?: number;
  global: { sessionProvider: string; [key: string]: unknown };
  apps: Record<string, DemoAppConfigEntry>;
  groupOrder?: string[];
  [key: string]: unknown;
}

export interface DerivedDemoConfig {
  /** Absolute path to the written sandboxed loki-config.json. */
  configPath: string;
  /** The config object that was written (already parsed/derived). */
  config: DerivedLokiConfig;
  /** Dynamically allocated ports for the port-bearing demo apps. */
  ports: { demoBackend: number; demoFrontend: number };
  /** Absolute paths to the sandboxed demo-app copies. */
  demoAppDirs: Record<DemoAppName, string>;
  /** Absolute path to the dedicated `demo-backend` clone for `SCRIPTS_PREVIEW_APP_NAME` — see that constant's doc comment. */
  scriptsPreviewAppDir: string;
}

/**
 * Read `demo/loki-config.json` defensively: strip a possible BOM/stray byte
 * before the opening `{` (breakdown note: the file has been seen corrupt in
 * the working tree — analysis.md §6 risk #1) and surface a clear error
 * instead of a cryptic JSON.parse crash if it's not recoverable.
 */
function readDemoConfigTemplate(): DerivedLokiConfig {
  const templatePath = path.join(repoRoot, 'demo', 'loki-config.json');
  const raw = fs.readFileSync(templatePath, 'utf-8');
  const firstBrace = raw.indexOf('{');
  const cleaned = firstBrace > 0 ? raw.slice(firstBrace) : raw;
  try {
    return JSON.parse(cleaned) as DerivedLokiConfig;
  } catch (err) {
    throw new Error(
      `e2e: demo/loki-config.json is not valid JSON even after stripping leading bytes (${templatePath}): ${
        (err as Error).message
      }`
    );
  }
}

/**
 * Given a sandbox directory (created via `createSandbox()`), copy the three
 * demo apps into it and write a derived `loki-config.json` at
 * `<sandboxDir>/state/loki-config.json` (mirrors the dev CONFIG_FILE
 * convention in backend/config/configLocation.ts: config sits in `state/`
 * next to everything it owns).
 *
 * Idempotent-ish: safe to call once per sandbox; callers should not call it
 * twice for the same sandboxDir (ports would be reallocated and the file
 * overwritten, which would desync anything that already read the first
 * result — see global-setup.ts / the webServer bootstrap script for how the
 * single call is coordinated across the run).
 */
export async function deriveDemoConfig(sandboxDir: string): Promise<DerivedDemoConfig> {
  const template = readDemoConfigTemplate();
  const demoAppDirs = copyDemoApps(sandboxDir);

  const [demoBackendPort, demoFrontendPort] = await Promise.all([freePort(), freePort()]);
  const ports = { demoBackend: demoBackendPort, demoFrontend: demoFrontendPort };

  const apps: Record<string, DemoAppConfigEntry> = {};
  for (const [name, entry] of Object.entries(template.apps || {})) {
    const appDir = demoAppDirs[name as DemoAppName];
    const derived: DemoAppConfigEntry = { ...entry, repoPath: appDir ?? entry.repoPath };

    if (name === 'demo-backend') {
      derived.startCommand = `PORT=${demoBackendPort} node server.js`;
      derived.appUrl = `http://localhost:${demoBackendPort}`;
    } else if (name === 'demo-frontend') {
      derived.startCommand = `PORT=${demoFrontendPort} node server.js`;
      derived.appUrl = `http://localhost:${demoFrontendPort}`;
    }
    apps[name] = derived;
  }

  const scriptsPreviewAppDir = copyExtraApp(sandboxDir, 'demo-backend', SCRIPTS_PREVIEW_APP_NAME);
  apps[SCRIPTS_PREVIEW_APP_NAME] = {
    // Deliberately NOT containing "Demo Backend"/"Demo Frontend"/"Demo
    // Worker" as a substring: groups-and-search.spec.ts and others locate
    // rows with Playwright's `hasText` (substring match), so a label like
    // "Demo Backend (...)" would resolve two elements for a "Demo Backend"
    // filter and break those suites' strict-mode single-element locators.
    label: 'E2E Scripts Preview App',
    repoPath: scriptsPreviewAppDir,
  };

  const config: DerivedLokiConfig = {
    ...template,
    global: { ...(template.global || {}), sessionProvider: 'detached' },
    apps,
  };

  const stateDir = path.join(sandboxDir, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const configPath = path.join(stateDir, 'loki-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

  return { configPath, config, ports, demoAppDirs, scriptsPreviewAppDir };
}

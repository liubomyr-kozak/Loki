import fs from 'fs';
import path from 'path';
import { Config } from '../../shared/types';
import { configFolder, resolveConfigFile } from './configLocation';
import { errorMessage } from '../errors';
import { availability as tmuxAvailability, findTmux, getCachedTmuxVersion } from '../apps/providers/tmuxProvider';

const MAX_PACKAGE_JSON_SIZE = 262144;

import type { ScannedScript, ScanResult, ComponentCandidate, DetectedComponentId, DetectedComponent, RuntimePaths, DetectedRuntime } from '../../shared/scan.types';
export type { ScannedScript, ScanResult, ComponentCandidate, DetectedComponentId, DetectedComponent, RuntimePaths, DetectedRuntime } from '../../shared/scan.types';

const RUN_LIKE_RE = /(^|[:-])(dev|start|serve|watch)/i;

const WINDOWS_SHELL_CANDIDATES = ['powershell.exe', 'cmd.exe'];

const UNIX_SHELL_CANDIDATES = ['/bin/zsh', '/bin/bash', '/usr/local/bin/fish', '/opt/homebrew/bin/fish'];

// Config, state and session output all live in the config file's own folder, so
// every path here anchors to that folder rather than re-deriving a
// `state` guess from cwd — which is how Settings ended up pointing at a
// folder that held no config at all.
export function resolveSessionsDir(configFilePath: string | undefined, sessionsDir: string | undefined): string {
  const baseDir = configFilePath ? configFolder(configFilePath) : configFolder(resolveConfigFile());
  return path.resolve(baseDir, sessionsDir ?? 'sessions');
}

export function detectRuntime(configFilePath?: string, config?: Config | null): RuntimePaths {
  const stateDir = configFilePath
    ? configFolder(configFilePath)
    : configFolder(resolveConfigFile());
  const sessionsDir = resolveSessionsDir(configFilePath, config?.global?.sessionsDir);
  const configured = (config?.global?.pluginFolders ?? []).filter((f) => f.trim() !== '');
  const pluginFolders = configured.length > 0
    ? configured.map((f) => path.resolve(stateDir, f))
    : [path.resolve(stateDir, config?.global?.pluginsDir ?? 'plugins')];
  // The first folder receives installs; make sure "open folder" has a target.
  try { fs.mkdirSync(pluginFolders[0], { recursive: true }); } catch { /* shown anyway */ }

  return { stateDir, sessionsDir, pluginFolders };
}

export function detectComponents(_configFile?: string): DetectedComponent[] {
  const tmuxAvail = tmuxAvailability();
  const tmuxCandidates: ComponentCandidate[] = tmuxAvail.available
    ? [{ path: findTmux(), version: getCachedTmuxVersion(), source: 'detected' }]
    : [];
  const components: DetectedComponent[] = [
    {
      id: 'tmux',
      label: 'tmux',
      found: tmuxCandidates.length > 0,
      candidates: tmuxCandidates,
    },
    {
      id: 'node',
      label: 'Node.js',
      found: true,
      candidates: [{ path: process.execPath, version: process.version, source: 'detected' }],
    },
    {
      id: 'shell',
      label: 'Shell',
      found: true,
      candidates: detectShellCandidates(),
    },
  ];
  return components;
}

export function detectShellCandidates(): ComponentCandidate[] {
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec;
    const candidates: ComponentCandidate[] = [];
    const seen = new Set<string>();
    const add = (p: string) => {
      if (seen.has(p)) return;
      seen.add(p);
      candidates.push({ path: p, source: 'detected' });
    };
    if (comspec) add(comspec);
    for (const c of WINDOWS_SHELL_CANDIDATES) add(c);
    return candidates;
  }

  const shellEnv = process.env.SHELL;
  const orderedPaths = shellEnv && fs.existsSync(shellEnv) ? [shellEnv, ...UNIX_SHELL_CANDIDATES] : UNIX_SHELL_CANDIDATES;

  const candidates: ComponentCandidate[] = [];
  const seen = new Set<string>();
  for (const p of orderedPaths) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (fs.existsSync(p)) {
      candidates.push({ path: p, source: 'detected' });
    }
  }
  return candidates;
}

function detectPackageManager(dirPath: string, config: Config): string {
  if (fs.existsSync(path.join(dirPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dirPath, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dirPath, 'package-lock.json'))) return 'npm';
  return config.global?.packageManager ?? 'npm';
}

function buildStartCommand(packageManager: string, scriptName: string): string {
  if (packageManager === 'yarn') return `yarn ${scriptName}`;
  if (packageManager === 'pnpm') return `pnpm ${scriptName}`;
  return `npm run ${scriptName}`;
}

export function scanPackageJson(text: string, packageManager: string, nameFallback: string): ScanResult {
  let pkg: any;
  try {
    pkg = JSON.parse(text);
  } catch (err: unknown) {
    throw new Error(errorMessage(err));
  }

  const name = typeof pkg?.name === 'string' ? pkg.name : nameFallback;
  const rawScripts: Record<string, string> = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};

  const scripts: ScannedScript[] = Object.keys(rawScripts).map((scriptName) => ({
    name: scriptName,
    raw: rawScripts[scriptName],
    startCommand: buildStartCommand(packageManager, scriptName),
    isRunLike: RUN_LIKE_RE.test(scriptName),
  }));

  return { name, dirPath: '', packageManager, scripts, hasPackageJson: true };
}

export function scanProject(dirPath: string, config: Config): ScanResult {
  const pkgPath = path.join(dirPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    // Not a Node project — still importable: the UI asks the user for a
    // start command instead of offering package.json scripts.
    return {
      name: path.basename(dirPath),
      dirPath,
      packageManager: config.global?.packageManager ?? 'npm',
      scripts: [],
      hasPackageJson: false,
    };
  }
  const stat = fs.statSync(pkgPath);
  if (stat.size >= MAX_PACKAGE_JSON_SIZE) {
    throw new Error(`package.json at ${pkgPath} is too large (${stat.size} bytes)`);
  }

  const packageManager = detectPackageManager(dirPath, config);
  const text = fs.readFileSync(pkgPath, 'utf-8');

  let result: ScanResult;
  try {
    result = scanPackageJson(text, packageManager, path.basename(dirPath));
  } catch (err: unknown) {
    throw new Error(`Failed to parse ${pkgPath}: ${errorMessage(err)}`);
  }

  return { ...result, dirPath };
}

export function findAppByRepoPath(config: Config, dirPath: string): { appName: string } | null {
  const target = path.resolve(dirPath);

  for (const appName of Object.keys(config.apps)) {
    const app = config.apps[appName];
    if (app.repoPath && path.resolve(app.repoPath) === target) {
      return { appName };
    }
  }

  return null;
}

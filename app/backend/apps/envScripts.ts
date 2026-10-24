import path from 'path';
import type { Config } from '../../shared/types';
import { resolveEnvFilter, filterScriptNames } from '../../shared/envFilter';
import { scanProject, scanPackageJson, type ScannedScript } from '../config/scan';
import { getGitInfo, listBranches, showFileAtRef } from '../git/gitUtils';
import { resolveEffectiveForApp } from './appManager';

export interface EnvScriptsResult {
  ref: string;
  source: 'worktree' | 'ref';
  scripts: ScannedScript[];
  matched: string[];
  filterError?: string;
}

export async function listEnvScripts(config: Config, appName: string, ref?: string): Promise<EnvScriptsResult> {
  const app = config.apps[appName];
  if (!app) throw new Error(`unknown app: ${appName}`);

  const eff = await resolveEffectiveForApp(config, appName);
  const repoPath = eff.repoPath;
  if (!repoPath) throw new Error(`repoPath not resolved for app: ${appName}`);

  const info = await getGitInfo(repoPath);
  const currentBranch = info.branch ?? 'HEAD';

  let result: ReturnType<typeof scanPackageJson>;
  let source: 'worktree' | 'ref';
  let resolvedRef: string;

  if (!ref || ref === currentBranch) {
    result = scanProject(repoPath, config);
    source = 'worktree';
    resolvedRef = currentBranch;
  } else {
    const branches = await listBranches(repoPath);
    if (!branches.includes(ref)) {
      throw new Error(`unknown branch: ${ref}`);
    }
    const text = await showFileAtRef(repoPath, ref, 'package.json');
    if (text === undefined) {
      throw new Error(`package.json not found at ref ${ref}`);
    }
    // packageManager approximation: detect from the current worktree rather
    // than the historical ref (lockfiles aren't fetched per-ref here).
    const worktreeScan = scanProject(repoPath, config);
    result = scanPackageJson(text, worktreeScan.packageManager, path.basename(repoPath));
    source = 'ref';
    resolvedRef = ref;
  }

  const scriptNames = result.scripts.map(s => s.name);
  const filter = resolveEnvFilter(config.global?.environmentFilterRegex, app.environmentFilter);
  const f = filterScriptNames(scriptNames, filter.regex);

  return {
    ref: resolvedRef,
    source,
    scripts: result.scripts,
    matched: f.ok ? f.matched : scriptNames,
    filterError: f.ok ? undefined : f.error,
  };
}

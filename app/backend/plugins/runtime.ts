import fs from 'fs';
import path from 'path';
import Module from 'module';
import { execFile } from 'child_process';
// Static top-level import (not required lazily inside a function): this is what lets
// esbuild inline the `typescript` package (pure JS, no native addon) into the single-file
// server bundle at build time, so the packaged branch below has it available with no
// node_modules on disk.
import * as ts from 'typescript';
import { Config, HostAPI, PluginModule } from '../../shared/types';
import { getAppOps } from '../core/appOps';
import { readRegistry } from '../process/registry';
import { resolveStateFile } from '../config/statePaths';
import { readState as readPluginCustomState, writeState as writePluginCustomState } from './pluginState';
import { substituteTemplate } from './templating';

let tsHookRegistered = false;

// Directories whose `.ts` files this module owns. Everything else keeps
// whatever handler was already installed (ts-node under `yarn dev`), so the
// hook below cannot change how the *backend's* own lazily-required modules
// are compiled — only plugins.
const pluginRoots = new Set<string>();

type TsExtensionHandler = (mod: NodeModule, filename: string) => void;

// One compiler for plugins in EVERY mode.
//
// This used to branch: if `ts-node/register` resolved (dev checkout) plugins
// were compiled by ts-node, and only the packaged app — where ts-node is
// externalized out of the bundle and physically absent — fell back to
// `ts.transpileModule`. That meant a plugin was type-checked across files
// while you developed it and transpiled per-file, unchecked, once shipped:
// the mode that got tested was never the mode users ran, and a plugin could
// load fine locally and fail only in a build.
//
// Now plugins always take the transpile path, so dev reproduces the shipped
// behaviour exactly. Type-checking plugins is a separate, explicit step
// (`tsc`) rather than a side effect of which mode happened to be running.
function ensureTsRequireHookRegistered(): void {
  if (tsHookRegistered) return;

  const extensions = (Module as unknown as {
    _extensions: Record<string, TsExtensionHandler | undefined>;
  })._extensions;
  const previous = extensions['.ts'];

  extensions['.ts'] = (mod: NodeModule, filename: string) => {
    const owned = [...pluginRoots].some(
      root => filename === root || filename.startsWith(root + path.sep)
    );
    if (!owned && previous) {
      return previous(mod, filename);
    }

    const source = fs.readFileSync(filename, 'utf-8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        skipLibCheck: true,
      },
    });
    (mod as unknown as { paths: string[] }).paths = (Module as unknown as {
      _nodeModulePaths: (dir: string) => string[];
    })._nodeModulePaths(path.dirname(filename));
    (mod as unknown as { _compile: (code: string, filename: string) => void })._compile(outputText, filename);
  };

  tsHookRegistered = true;
}

export function loadPluginModule(dir: string, id: string): PluginModule {
  // require.resolve()/require() treat a relative path that doesn't start with
  // "./" or "/" as a bare module specifier (node_modules lookup), not a file.
  // `dir` may be relative (derived from config.global.stateFile), so resolve
  // it against cwd before building entry paths.
  const absDir = path.resolve(dir);

  // Claim this directory before the hook can run for it — a plugin's own
  // sibling imports are required from inside the entry file's compilation.
  pluginRoots.add(absDir);
  ensureTsRequireHookRegistered();
  const tsEntry = path.join(absDir, 'index.ts');
  const jsEntry = path.join(absDir, 'index.js');
  const entry = fs.existsSync(tsEntry) ? tsEntry : jsEntry;
  if (!fs.existsSync(entry)) {
    throw new Error(`plugin "${id}": no index.ts or index.js found in ${dir}`);
  }

  // Always re-read from disk so enable/disable/reinstall picks up changes.
  // Bust the whole plugin directory's cache, not just the entry file: a
  // multi-file plugin's entry requires sibling modules from the same
  // directory, and those would otherwise keep serving stale code until a
  // full process restart. Deliberately scoped to `absDir` only — code under
  // marketplace/_shared/ is shared across multiple plugins and clearing it
  // here on every single-plugin reload would be an unrelated cache-bust with
  // its own (broader) invalidation concerns.
  const dirPrefix = absDir + path.sep;
  for (const cachedPath of Object.keys(require.cache)) {
    if (cachedPath === absDir || cachedPath.startsWith(dirPrefix)) {
      delete require.cache[cachedPath];
    }
  }
  const resolved = require.resolve(entry);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const raw = require(resolved);
  const candidate: any = raw?.default ?? raw;

  const missing: string[] = [];
  if (typeof candidate?.describe !== 'function') missing.push('describe');
  if (typeof candidate?.invoke !== 'function') missing.push('invoke');
  if (missing.length > 0) {
    throw new Error(`plugin "${id}": missing export ${missing.map(m => `"${m}"`).join('/')}`);
  }

  return candidate as PluginModule;
}

function openUrlInBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: string;
    let args: string[];
    switch (process.platform) {
      case 'darwin':
        cmd = 'open';
        args = [url];
        break;
      case 'win32':
        cmd = 'cmd';
        args = ['/c', 'start', '', url];
        break;
      default:
        cmd = 'xdg-open';
        args = [url];
        break;
    }
    execFile(cmd, args, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function makeHost(config: Config): HostAPI {
  return {
    config: {
      read: () => config,
    },
    apps: {
      start: (appName, sel) => getAppOps().startApp(config, appName, sel),
      stop: (appName) => getAppOps().stopApp(config, appName),
      restart: (appName) => getAppOps().restartApp(config, appName),
      status: async (appName) => {
        const registryPath = resolveStateFile(config);
        const registry = readRegistry(registryPath);
        return getAppOps().getAppStatus(config, appName, registry);
      },
    },
    runProcess: (command, opts) => getAppOps().runProcessInTmux(config, command, opts?.cwd, opts?.window),
    openUrl: (url) => openUrlInBrowser(url),
    readFile: (p) => fs.readFileSync(p, 'utf-8'),
    writeFile: (p, content) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content, 'utf-8');
    },
    readState: (pluginId, appName) => readPluginCustomState(config, pluginId, appName),
    writeState: (pluginId, value, appName) => writePluginCustomState(config, pluginId, value, appName),
    template: (tpl, ctx) => substituteTemplate(tpl, ctx),
  };
}

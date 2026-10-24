import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveEffective } from '../appManager';
import { AppConfig, Config } from '../../../shared/types';

function mkRepo(scripts: Record<string, string> | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-effective-check-'));
  if (scripts) {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'demo', scripts }, null, 2)
    );
  }
  return dir;
}

// 1. Missing package.json: must not throw, must degrade to app.startCommand.
{
  const repoPath = mkRepo(null);
  const app = { label: 'demo', repoPath, startCommand: 'yarn dev' } as unknown as AppConfig;

  let result;
  try {
    result = resolveEffective(app, { environment: 'dev5' });
  } catch (err) {
    throw new Error(`resolveEffective threw for an app whose repoPath has no package.json: ${err}`);
  }

  assert.strictEqual(result.startCommand, 'yarn dev', 'expected fallback to app-level startCommand');
  assert.strictEqual(result.repoPath, repoPath, 'expected repoPath passthrough from app');
  assert.strictEqual(result.environmentKey, undefined, 'expected no resolvable script name');

  console.log('OK: resolveEffective tolerates a repoPath without package.json');
}

// 2. Empty filter regex: pass-all, selects the first script when none requested.
{
  const repoPath = mkRepo({ dev: 'vite', build: 'vite build' });
  const app = { label: 'demo', repoPath, startCommand: 'yarn dev' } as unknown as AppConfig;

  const result = resolveEffective(app, undefined);

  assert.strictEqual(result.environmentKey, 'dev', 'expected first script selected under pass-all filter');
  assert.strictEqual(result.startCommand, 'npm run dev', 'expected startCommand derived from selected script');

  console.log('OK: resolveEffective selects the first script under an empty filter');
}

// 3. Selecting a specific, matched script name.
{
  const repoPath = mkRepo({ dev: 'vite', build: 'vite build' });
  const app = { label: 'demo', repoPath, startCommand: 'yarn dev' } as unknown as AppConfig;

  const result = resolveEffective(app, { environment: 'build' });

  assert.strictEqual(result.environmentKey, 'build', 'expected the requested script to be selected');
  assert.strictEqual(result.startCommand, 'npm run build', 'expected startCommand for the requested script');

  console.log('OK: resolveEffective selects the requested, matched script');
}

// 4. Requested script not present among matched names: falls back to the first match.
{
  const repoPath = mkRepo({ dev: 'vite', build: 'vite build' });
  const app = { label: 'demo', repoPath, startCommand: 'yarn dev' } as unknown as AppConfig;

  const result = resolveEffective(app, { environment: 'nonexistent' });

  assert.strictEqual(result.environmentKey, 'dev', 'expected fallback to first matched script');

  console.log('OK: resolveEffective falls back to the first matched script for an unknown selection');
}

// 5. Invalid persisted regex must not block launch: falls through to all script names.
{
  const repoPath = mkRepo({ dev: 'vite', build: 'vite build' });
  const app = {
    label: 'demo',
    repoPath,
    startCommand: 'yarn dev',
    environmentFilter: { useGlobal: false, filterRegex: '(' },
  } as unknown as AppConfig;

  let result;
  try {
    result = resolveEffective(app, { environment: 'build' });
  } catch (err) {
    throw new Error(`resolveEffective threw for an invalid persisted regex: ${err}`);
  }

  assert.strictEqual(result.environmentKey, 'build', 'expected invalid regex to fall through to all names, still launching');

  console.log('OK: resolveEffective tolerates an invalid persisted filter regex');
}

// 6. Valid regex filters out non-matching scripts.
{
  const repoPath = mkRepo({ dev: 'vite', 'test:unit': 'jest' });
  const app = {
    label: 'demo',
    repoPath,
    startCommand: 'yarn dev',
    environmentFilter: { useGlobal: false, filterRegex: '^dev$' },
  } as unknown as AppConfig;

  const result = resolveEffective(app, { environment: 'test:unit' });

  assert.strictEqual(result.environmentKey, 'dev', 'expected filter to exclude the requested, non-matching script');

  console.log('OK: resolveEffective applies a valid per-app filter regex');
}

// 7. Global filter regex (threaded via optional `config` param) is honored.
{
  const repoPath = mkRepo({ dev: 'vite', build: 'vite build' });
  const app = { label: 'demo', repoPath, startCommand: 'yarn dev' } as unknown as AppConfig;
  const config = { global: { environmentFilterRegex: '^build$' } } as unknown as Config;

  const result = resolveEffective(app, undefined, config);

  assert.strictEqual(result.environmentKey, 'build', 'expected global filter regex to be applied when config is passed');

  console.log('OK: resolveEffective applies the global filter regex when config is provided');
}

console.log('OK: all resolveEffective checks passed');

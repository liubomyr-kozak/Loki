import { Router } from 'express';
import { checkoutRoot } from '../config/checkoutRoot';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { errorMessage } from '../errors';

const router = Router();

const REPO_ROOT = checkoutRoot();

// Tests the precondition directly rather than guessing the run mode: the route
// needs a checkout whose package.json declares the script it shells out to.
function rebuildAvailable(): boolean {
  if (!REPO_ROOT) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8'));
    return Boolean(pkg?.scripts?.['server:build']);
  } catch {
    return false;
  }
}

// Serializes concurrent rebuild requests — a second request while one is
// already running gets 409 instead of racing tsc against itself.
let buildInFlight: Promise<{ code: number; stderr: string }> | null = null;

function runServerBuild(): Promise<{ code: number; stderr: string }> {
  return new Promise(resolve => {
    const windows = process.platform === 'win32';
    const yarn = windows ? 'cmd.exe' : 'yarn';
    const args = windows ? ['/d', '/s', '/c', 'yarn server:build'] : ['server:build'];
    execFile(yarn, args, { cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) {
        const code = typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
          ? (err as unknown as { code: number }).code
          : 1;
        resolve({ code, stderr: stderr || err.message });
        return;
      }
      resolve({ code: 0, stderr: stderr ?? '' });
    });
  });
}

router.post('/api/dev/rebuild', async (req, res) => {
  if (!rebuildAvailable()) {
    return res.status(404).json({
      error:
        'Rebuild is only available when the server runs from a repo checkout — ' +
        'a packaged app has no build toolchain to run.',
    });
  }
  if (buildInFlight) {
    return res.status(409).json({ error: 'Build already in progress' });
  }
  try {
    buildInFlight = runServerBuild();
    const result = await buildInFlight;
    if (result.code !== 0) {
      return res.status(500).json({ error: result.stderr || 'yarn server:build failed' });
    }
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  } finally {
    buildInFlight = null;
  }
});

export default router;

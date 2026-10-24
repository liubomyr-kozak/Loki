/**
 * Coordinates the ONE sandbox created per Playwright test run across three
 * independent Node process boundaries that all need the same answer:
 *
 *   1. `playwright.config.ts`'s `webServer[0].command` (the backend
 *      bootstrap script, `webserver-backend.ts`) — actually spawns the
 *      sandboxed `backend/server.ts`.
 *   2. `global-setup.ts` — health-checks backend+vite before tests run.
 *   3. `global-teardown.ts` — sweeps any detached-provider grandchildren and
 *      removes the sandbox.
 *
 * Why this indirection exists: Playwright starts `webServer` entries BEFORE
 * running `globalSetup` (confirmed behavior, see
 * https://github.com/microsoft/playwright/issues/7597), so `globalSetup`
 * cannot be the thing that first spawns the backend — by the time it runs,
 * the webServer command has already had to know the sandbox's derived
 * CONFIG_FILE path. Both sides therefore call the same idempotent
 * `ensureRuntime()`: whichever runs first creates the sandbox + derives the
 * config once and persists a small manifest at a fixed OS-tmpdir path;
 * everyone after that just reads it back. This avoids two independent
 * `freePort()`/config-derivation calls racing and disagreeing.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { createSandbox, type DemoAppName } from './sandbox';
import { deriveDemoConfig } from './demo-config';

// Loki's desktop UI hardcodes its API base URL (app/src/api.ts:16 —
// `const BASE = 'http://localhost:9999'`), so unlike the demo apps'
// PORT=<dynamic>, the Loki backend itself CANNOT run on a freePort()-chosen
// port without also patching desktop source — out of scope for this e2e
// infra task. We instead treat 9999 as fixed and fail fast if it's already
// occupied, rather than silently reusing a stray process (which could be a
// developer's real `yarn dev` pointed at their real config).
export const BACKEND_PORT = 9999;

// desktop/vite.config.ts hardcodes `server: { port: 1421, strictPort: true }`
// — also fixed for the same reason (no source change in this task's scope).
export const VITE_PORT = 1421;

export interface RuntimeManifest {
  sandboxDir: string;
  configPath: string;
  backendPort: number;
  vitePort: number;
  demoPorts: { demoBackend: number; demoFrontend: number };
  demoAppDirs: Record<DemoAppName, string>;
  /** Absolute path to the dedicated scripts-preview `demo-backend` clone — see `demo-config.ts`'s `SCRIPTS_PREVIEW_APP_NAME`. */
  scriptsPreviewAppDir: string;
  createdAt: number;
  ownerPid: number;
}

const MANIFEST_PATH = path.join(os.tmpdir(), 'loki-e2e-runtime-manifest.json');
const LOCK_PATH = `${MANIFEST_PATH}.lock`;

async function acquireLock(timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: 'wx' });
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (Date.now() - start > timeoutMs) {
        throw new Error(`e2e: timed out waiting for runtime lock at ${LOCK_PATH}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* best effort */
  }
}

function readManifestIfValid(): RuntimeManifest | undefined {
  if (!fs.existsSync(MANIFEST_PATH)) return undefined;
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as RuntimeManifest;
    if (manifest.sandboxDir && fs.existsSync(manifest.sandboxDir) && fs.existsSync(manifest.configPath)) {
      return manifest;
    }
  } catch {
    /* fall through — treat as stale/corrupt */
  }
  return undefined;
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    sock.on('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
  });
}

async function assertPortFree(port: number, label: string): Promise<void> {
  if (await isPortOpen(port)) {
    throw new Error(
      `e2e: port ${port} (${label}) is already in use. This harness always starts a fresh sandboxed ` +
        `process on this port rather than reusing whatever is already listening there — stop the other ` +
        `process (e.g. a local "yarn dev") before running e2e tests.`
    );
  }
}

/**
 * Idempotent: the first caller across the whole run creates the sandbox and
 * writes the manifest; every subsequent caller (in this or another process)
 * reads the same manifest back.
 */
export async function ensureRuntime(): Promise<RuntimeManifest> {
  await acquireLock();
  try {
    const existing = readManifestIfValid();
    if (existing) return existing;

    await assertPortFree(BACKEND_PORT, 'loki backend');
    await assertPortFree(VITE_PORT, 'desktop vite dev server');

    const sandboxDir = createSandbox();
    const derived = await deriveDemoConfig(sandboxDir);

    const manifest: RuntimeManifest = {
      sandboxDir,
      configPath: derived.configPath,
      backendPort: BACKEND_PORT,
      vitePort: VITE_PORT,
      demoPorts: derived.ports,
      demoAppDirs: derived.demoAppDirs,
      scriptsPreviewAppDir: derived.scriptsPreviewAppDir,
      createdAt: Date.now(),
      ownerPid: process.pid,
    };
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
    return manifest;
  } finally {
    releaseLock();
  }
}

/** Non-throwing read for global-teardown — returns undefined if no run ever created a sandbox (e.g. setup failed before creating one). */
export function readRuntimeManifestIfExists(): RuntimeManifest | undefined {
  return readManifestIfValid();
}

export function clearRuntimeManifest(): void {
  try {
    fs.unlinkSync(MANIFEST_PATH);
  } catch {
    /* best effort */
  }
}

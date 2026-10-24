/**
 * Playwright `globalSetup`: makes sure the run's ONE sandbox (tmpdir +
 * derived config + copies of the three demo apps) exists, and blocks test
 * start until both the sandboxed backend and the desktop Vite dev server
 * answer health checks.
 *
 * The actual sandbox creation is shared with `webserver-backend.ts` (the
 * backend `webServer` entry's command) via `fixtures/runtime.ts`'s
 * idempotent `ensureRuntime()` — see that file's header comment for why:
 * Playwright starts `webServer` entries before running `globalSetup`, so by
 * the time this function runs the backend's `webServer` command has
 * (almost always) already created the sandbox; calling `ensureRuntime()`
 * here just reuses it. If for some reason this runs first, it creates the
 * sandbox itself — either order converges on the same one sandbox.
 */
import type { FullConfig } from '@playwright/test';
import { ensureRuntime } from './fixtures/runtime';
import { waitForServer } from './fixtures/sandbox';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const runtime = await ensureRuntime();

  console.log(`[e2e:global-setup] sandbox: ${runtime.sandboxDir}`);
  console.log(`[e2e:global-setup] config:  ${runtime.configPath}`);
  console.log(
    `[e2e:global-setup] ports: backend=${runtime.backendPort} vite=${runtime.vitePort} ` +
      `demo-backend=${runtime.demoPorts.demoBackend} demo-frontend=${runtime.demoPorts.demoFrontend}`
  );

  await Promise.all([
    waitForServer(`http://127.0.0.1:${runtime.backendPort}/api/config`, { deadlineMs: 30000 }),
    // localhost, not 127.0.0.1: Vite binds the IPv6 loopback ([::1]) only on
    // this host (no explicit server.host in desktop/vite.config.ts) — see
    // playwright.config.ts's matching note.
    waitForServer(`http://localhost:${runtime.vitePort}/`, { deadlineMs: 30000 }),
  ]);

  console.log('[e2e:global-setup] backend + vite are up.');
}

import path from 'path';
import { defineConfig, devices } from '@playwright/test';
import { repoRoot } from './fixtures/sandbox';
import { BACKEND_PORT, VITE_PORT } from './fixtures/runtime';

// See design.md §3/§4/§6 and fixtures/runtime.ts's header comment for the
// full rationale behind the webServer/globalSetup split and the fixed
// (non-dynamic) backend/vite ports.
export default defineConfig({
  testDir: './suites',

  // §6: per-test timeout generous enough to cover the worst case (a
  // dependsOn chain's full port-discovery window, suite 2/9 in design.md).
  // Per-assertion (`expect(...).toPass()`) timeouts are left at Playwright's
  // tight default so unrelated suites fail fast — individual suites override
  // locally where they need the longer port-discovery budget.
  timeout: 60_000,

  fullyParallel: true,
  // 1, not the CPU-count default or even a modest cap: every suite file
  // shares ONE sandboxed backend (fixed ports 9999/1421, see
  // fixtures/runtime.ts) and, more importantly, several suites share the
  // SAME demo-app process by name — demo-worker (app-list-lifecycle,
  // session-provider-detached, polling-eventual-consistency) and
  // demo-backend (dependent-app-lifecycle, groups-and-search's
  // conflict-dialog test, plus the git suites' repo). Each suite assumes it
  // owns that app's start/stop state for the duration of its own test, an
  // assumption that is only true if no other suite is running concurrently
  // against the same sandboxed backend. workers: 3 was tried first (see git
  // history) and measurably reduced but did not eliminate cross-suite
  // process-state races — a test would see a sibling suite's demo-worker
  // already running/stopped mid-assertion. Real per-app isolation (giving
  // every suite its own demo-app process registration) is a larger
  // fixtures/demo-config.ts change out of this fix-loop's scope; workers: 1
  // trades wall-clock time for correctness until that's done.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    // localhost, not 127.0.0.1: Vite (no explicit `server.host` in
    // desktop/vite.config.ts) binds the IPv6 loopback ([::1]) only on this
    // host, so an IPv4-literal health check/baseURL never connects.
    baseURL: `http://localhost:${VITE_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  globalSetup: path.join(__dirname, 'global-setup.ts'),
  globalTeardown: path.join(__dirname, 'global-teardown.ts'),

  webServer: [
    {
      // Bootstrap script, not a bare `ts-node app/backend/server.ts`: it derives
      // the sandboxed CONFIG_FILE before booting the real backend in-process
      // (see webserver-backend.ts). Always started fresh — never reused —
      // because "reuse whatever's already on :9999" could silently point
      // tests at a developer's real backend/config instead of the sandbox.
      command: `${path.join(repoRoot, 'node_modules', '.bin', 'ts-node')} ${path.join(__dirname, 'webserver-backend.ts')}`,
      cwd: repoRoot,
      url: `http://127.0.0.1:${BACKEND_PORT}/api/config`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // The repo-root vite.config.ts hardcodes port 1421 (strictPort: true),
      // so this just runs the single package's existing `ui:dev` script
      // (design.md §7).
      command: 'yarn ui:dev',
      cwd: repoRoot,
      url: `http://localhost:${VITE_PORT}`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});

/**
 * `playwright.config.ts` webServer entry for the backend.
 *
 * Not a thin `ts-node app/backend/server.ts` invocation: it first has to make
 * sure the sandbox + derived config exist (see fixtures/runtime.ts for why
 * that can't be deferred to global-setup.ts), THEN boots the real backend
 * in this same process — running it in-process (require, not a child
 * `spawn`) means the SIGTERM Playwright sends to this command when the run
 * ends terminates the server directly, with nothing left to relay/orphan.
 */
import path from 'path';
import { repoRoot } from './fixtures/sandbox';
import { ensureRuntime } from './fixtures/runtime';

async function main(): Promise<void> {
  const runtime = await ensureRuntime();
  process.env.CONFIG_FILE = runtime.configPath;
  process.env.LOKI_PORT = String(runtime.backendPort);
  console.log(`[e2e:webserver-backend] sandbox=${runtime.sandboxDir}`);
  console.log(`[e2e:webserver-backend] CONFIG_FILE=${runtime.configPath} LOKI_PORT=${runtime.backendPort}`);

  // backend/server.ts calls app.listen(...) synchronously at import time —
  // requiring it here (under ts-node) starts the real server in-process.
  require(path.join(repoRoot, 'app', 'backend', 'server.ts'));
}

main().catch((err) => {
  console.error('[e2e:webserver-backend] failed to start:', err);
  process.exit(1);
});

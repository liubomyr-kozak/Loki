import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import type { Config } from '../../shared/types';

// A real, harmless, isolated child process to stand in for a "live pid" in
// the orphan-conflict tests below — NEVER use `process.pid` (this test
// runner's own pid) there: `stopProcessAtKey` sends a real SIGTERM to
// `-entry.pid` (the process GROUP), and doing that to our own pid would
// terminate the test runner itself. Spawned `detached: true` so it's its own
// process-group leader, matching what a real spawned app process would be.
function spawnDummyProcess(): number {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return child.pid!;
}

function killDummyProcess(pid: number): void {
  try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone, or not a group leader here */ }
  try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
}

// Real port discovery polls for up to 30s waiting for a listening port —
// pointless here since the fake provider below never actually spawns a real
// server. Return a port on the first poll so `startApp` only pays one
// PORT_DISCOVERY_POLL_MS tick instead of the full timeout.
vi.mock('../ports/portUtils', () => ({
  discoverPort: async () => 4000,
  getProcessByPort: async () => ({ pid: undefined }),
  killProcessOnPort: async () => {},
  isPortOpen: async () => false,
}));

import { registerProvider, StartArgs } from './sessionProvider';
import { resolveProcessKey } from './effectiveConfig';
import { decideLinkage } from '../../shared/linkage';
import { createInstance, setInstanceEnvOverride } from '../process/instances';
import { readRegistry } from '../process/registry';

// Fake, always-available session provider registered BEFORE lifecycleOps is
// imported, so `startApp` below never touches the real tmux/detached spawn
// machinery — it only needs to prove WHICH KEY each call site uses, not
// actually run a process. `registerProvider` is a no-op if an id is already
// registered, so this only ever registers once even if the test file is
// re-run in watch mode.
let lastStartArgs: StartArgs | undefined;
let lastStoppedName: string | undefined;
// Tracks which names have actually been "started" through this fake, so
// getAppStatus's pre-spawn liveness check correctly reports 'stopped' for a
// process that hasn't started yet (unlike a provider that always claims a
// session is present, which would make startApp return early before ever
// calling `start`).
const liveNames = new Set<string>();
// The pid handed back by the fake provider's `start` — defaults to our own
// pid (harmless: nothing in the first describe block below ever resolves a
// 'stop-old' conflict, so `stopProcessAtKey`'s real SIGTERM path is never
// reached there). The orphan-conflict describe block below points this at a
// real spawned dummy process instead, whenever a test exercises `stop-old`.
let fakePid = process.pid;
registerProvider({
  id: 'fake-test-provider',
  label: 'fake',
  description: 'test-only in-memory provider',
  icon: 'square-terminal',
  platforms: ['darwin', 'linux', 'win32'],
  recommended: false,
  benefits: [],
  availability: () => ({ available: true, reason: '' }),
  start: (a: StartArgs) => {
    lastStartArgs = a;
    liveNames.add(a.name);
    return { pid: fakePid, session: a.name };
  },
  stop: (name: string) => {
    lastStoppedName = name;
    liveNames.delete(name);
  },
  listSessions: () => [],
  sessionAlive: (name: string) => liveNames.has(name),
  getAttachCommand: (name: string) => `attach:${name}`,
  sessionState: (name: string) => ({ present: liveNames.has(name), dead: false, pid: liveNames.has(name) ? fakePid : null }),
  setSessionLabel: () => {},
});

import { startApp, ProcessConflictError } from './lifecycleOps';
import { getAppStatus } from './statusService';
// Side-effect import: registers appOps so runPluginLifecycle's onStart/onStop
// hooks don't print a harmless-but-noisy "AppOps not registered" warning —
// no plugins are configured on the test app, so the hooks themselves are
// no-ops either way.
import './appManager';

// This suite is the ADR's explicit acceptance criterion for §Фаза 2 task 3/6:
// for an app with ZERO instances, the computed process identifier must equal
// the plain app name on every code path task 3 touched — registry key, lock
// key (proven via resolveProcessKey, the same function withStartLock's key
// comes from), session/window name (StartArgs.name), and status lookup. This
// is the regression invariant the whole phase 2 refactor is graded against;
// if it breaks, an app with no clones has silently started behaving
// differently than before this feature existed.
describe('process identifier invariant — no instance ⇒ processKey === appName', () => {
  let dir: string;
  let config: Config;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loki-lifecycle-test-'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'demo-repo', scripts: { dev: 'vite', staging: 'vite --mode staging' } })
    );
    config = {
      apps: {
        demo: {
          label: 'Demo',
          repoPath: dir,
        },
      },
      global: {
        stateFile: path.join(dir, 'state.json'),
        sessionProvider: 'fake-test-provider',
      },
    } as unknown as Config;
    lastStartArgs = undefined;
    lastStoppedName = undefined;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolveProcessKey resolves to {mode: linked, processKey: appName} with no instanceId', () => {
    expect(resolveProcessKey(config, 'demo', undefined, undefined)).toEqual({
      mode: 'linked',
      processKey: 'demo',
    });
  });

  it('resolveProcessKey also collapses to linked/appName for an instanceId that does not resolve to a real instance', () => {
    // e.g. a stale/foreign id, or an instance belonging to a different app —
    // must never accidentally fall through to a detached-shaped key.
    expect(resolveProcessKey(config, 'demo', 'not-a-real-instance-id', undefined)).toEqual({
      mode: 'linked',
      processKey: 'demo',
    });
  });

  it('starting an app with no instance registers state, names the session, and reports status all under the plain app name', async () => {
    await startApp(config, 'demo', undefined, false, true, undefined);

    // Session/window naming (StartArgs.name) — task 3's lifecycleOps change.
    expect(lastStartArgs?.name).toBe('demo');

    // Registry key — task 3's lifecycleOps/registry change.
    const registry = readRegistry(config.global!.stateFile!);
    expect(registry['demo']).toBeDefined();
    expect(registry['demo']!.pid).toBe(process.pid);

    // Status lookup — task 3's statusService change reads registry[processKey].
    const status = await getAppStatus(config, 'demo', registry, undefined, undefined);
    expect(status.process).toBe('running');
    expect(status.instanceId).toBeUndefined();
    expect(status.conflict).toBeUndefined();
  });

  it('decideLinkage (the one shared decision) always returns linked/appName with no instanceId, regardless of environment mismatch', () => {
    expect(
      decideLinkage({ appName: 'demo', instanceId: undefined, appEnvironment: 'dev', instanceEnvironment: 'staging' })
    ).toEqual({ mode: 'linked', processKey: 'demo' });
  });

  it('a real instance whose override matches the app default still resolves linked/appName (no drift ⇒ no distinct process)', () => {
    const instancesPath = path.join(dir, 'instances.json');
    const record = createInstance(instancesPath, 'demo');
    setInstanceEnvOverride(instancesPath, record.id, 'dev'); // same as the app's own default (matched[0])
    // toMatchObject, not toEqual: a REAL instance is resolved and returned
    // alongside the decision (unlike the no-instance / unknown-id cases
    // above, which never look one up) — only mode/processKey are the
    // invariant under test here.
    expect(resolveProcessKey(config, 'demo', record.id, undefined)).toMatchObject({
      mode: 'linked',
      processKey: 'demo',
    });
  });

  it('a real instance whose override diverges from the app default resolves to a DISTINCT processKey (contrast case, not the invariant itself)', () => {
    const instancesPath = path.join(dir, 'instances.json');
    const record = createInstance(instancesPath, 'demo');
    setInstanceEnvOverride(instancesPath, record.id, 'staging'); // app default resolves to 'dev' (matched[0])
    const resolved = resolveProcessKey(config, 'demo', record.id, undefined);
    expect(resolved.mode).toBe('detached');
    expect(resolved.processKey).not.toBe('demo');
    expect(resolved.processKey).toBe(`demo#${record.id}`);
  });
});

// Iteration-2 fix (verifier FAIL, criterion 4/5): `detectOrphanConflict` was
// over-broad — it treated ANY live process at the instance's "other"
// possible key as a conflict, which included the plain `appName` key. Since
// that key is the ORIGINAL's own (shared by every linked instance too), this
// meant a brand-new detached instance's very first start — the ADR's
// headline scenario, "a clone with its own env runs alongside a running
// original" — was blocked by a bogus conflict prompt merely because the
// original was doing its normal thing, and the resulting `status.conflict`
// never cleared while the original stayed up (it wasn't gated on anything
// that could become false). The fix scopes detection to the ONE key that can
// ever genuinely belong to this instance alone: `appName#instanceId` — never
// the shared `appName` key — and only checks it while the instance currently
// resolves linked (a live detached leftover from before it was reconfigured
// back to matching the app's default).
describe('orphan-process conflict — scoped to THIS instance\'s own leftover, not the original\'s normal process', () => {
  let dir: string;
  let config: Config;
  // Every dummy pid spawned during a test, killed unconditionally in
  // afterEach — belt-and-braces on top of whatever stop-old's own kill path
  // does, so a failed assertion never leaks a real background process.
  let dummies: number[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loki-lifecycle-orphan-test-'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'demo-repo', scripts: { dev: 'vite', staging: 'vite --mode staging' } })
    );
    config = {
      apps: {
        demo: {
          label: 'Demo',
          repoPath: dir,
        },
      },
      global: {
        stateFile: path.join(dir, 'state.json'),
        sessionProvider: 'fake-test-provider',
      },
    } as unknown as Config;
    lastStartArgs = undefined;
    lastStoppedName = undefined;
    liveNames.clear();
    dummies = [];
    fakePid = process.pid;
  });

  afterEach(() => {
    dummies.forEach(killDummyProcess);
    fakePid = process.pid;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Every `startApp` call in this block spawns a REAL dummy child first and
  // points the fake provider at its pid — never `process.pid` (see
  // `spawnDummyProcess`'s comment above) — because some of these tests
  // exercise the actual `stopProcessAtKey` SIGTERM path via `resolution:
  // 'stop-old'`.
  async function startWithDummyPid(instanceId?: string, resolution?: 'stop-old' | 'keep-old') {
    const pid = spawnDummyProcess();
    dummies.push(pid);
    fakePid = pid;
    await startApp(config, 'demo', undefined, false, true, instanceId, resolution);
    return pid;
  }

  it('a brand-new detached instance starts cleanly alongside a live original — no conflict prompt in the common case', async () => {
    // The original is running first, same as any real "clone with a
    // different env" flow.
    await startWithDummyPid(undefined);

    const instancesPath = path.join(dir, 'instances.json');
    const record = createInstance(instancesPath, 'demo');
    setInstanceEnvOverride(instancesPath, record.id, 'staging'); // diverges ⇒ resolves detached

    // Must NOT throw ProcessConflictError, and must actually start under its
    // own distinct key alongside the still-running original.
    await startWithDummyPid(record.id);

    const registry = readRegistry(config.global!.stateFile!);
    expect(registry['demo']).toBeDefined(); // original still up
    expect(registry[`demo#${record.id}`]).toBeDefined(); // clone got its own slot

    const status = await getAppStatus(config, 'demo', registry, undefined, record.id);
    expect(status.process).toBe('running');
    expect(status.conflict).toBeUndefined();
  });

  it('a leftover process under this instance\'s OWN previous detached identity surfaces as a conflict once it resolves linked again', async () => {
    const instancesPath = path.join(dir, 'instances.json');
    const record = createInstance(instancesPath, 'demo');
    setInstanceEnvOverride(instancesPath, record.id, 'staging'); // detached
    await startWithDummyPid(record.id);
    expect(readRegistry(config.global!.stateFile!)[`demo#${record.id}`]).toBeDefined();

    // Reconfigure the clone back to the app's own default — it now resolves
    // linked, but its old detached process is still alive (never stopped).
    setInstanceEnvOverride(instancesPath, record.id, null);

    let caught: unknown;
    try {
      await startApp(config, 'demo', undefined, false, true, record.id);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProcessConflictError);
    expect((caught as ProcessConflictError).conflict).toEqual({
      processKey: 'demo',
      otherProcessKey: `demo#${record.id}`,
      label: 'Demo',
    });

    // Nothing was silently started or killed while unresolved.
    const registry = readRegistry(config.global!.stateFile!);
    expect(registry['demo']).toBeUndefined();
    expect(registry[`demo#${record.id}`]).toBeDefined();
  });

  it('resolving with stop-old clears the conflict — it does not linger once its cause is gone', async () => {
    const instancesPath = path.join(dir, 'instances.json');
    const record = createInstance(instancesPath, 'demo');
    setInstanceEnvOverride(instancesPath, record.id, 'staging');
    await startWithDummyPid(record.id); // the leftover that 'stop-old' will reap
    setInstanceEnvOverride(instancesPath, record.id, null); // back to linked

    await startWithDummyPid(record.id, 'stop-old');

    const registry = readRegistry(config.global!.stateFile!);
    expect(registry[`demo#${record.id}`]).toBeUndefined(); // old leftover reaped
    expect(registry['demo']).toBeDefined(); // now running under the linked key

    const status = await getAppStatus(config, 'demo', registry, undefined, record.id);
    expect(status.conflict).toBeUndefined();
  });
});

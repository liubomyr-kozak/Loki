import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './loadConfig';
import { CONFIG_FILE_NAME, STATE_DIR_NAME } from './configLocation';

let root: string;
let configDir: string;
let prevCwd: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'loki-cfg-'));
  configDir = path.join(root, STATE_DIR_NAME);
  fs.mkdirSync(configDir, { recursive: true });
  prevCwd = process.cwd();
});

afterEach(() => {
  process.chdir(prevCwd);
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.APP_SESSIONS_DIR;
});

function write(config: unknown): string {
  const p = path.join(configDir, CONFIG_FILE_NAME);
  fs.writeFileSync(p, JSON.stringify(config));
  return p;
}

describe('loadConfig path resolution', () => {
  it('resolves a relative stateFile against the config folder, not cwd', () => {
    const p = write({ apps: {}, global: { stateFile: 'state.json' } });
    process.chdir(os.tmpdir());

    expect(loadConfig(p).global!.stateFile).toBe(path.join(configDir, 'state.json'));
  });

  it('resolves a relative sessionsDir against the config folder', () => {
    const p = write({ apps: {}, global: { sessionsDir: 'sessions' } });
    process.chdir(os.tmpdir());

    expect(loadConfig(p).global!.sessionsDir).toBe(path.join(configDir, 'sessions'));
  });

  it('leaves an explicit absolute stateFile untouched', () => {
    const abs = path.join(os.tmpdir(), 'elsewhere', 'state.json');
    const p = write({ apps: {}, global: { stateFile: abs } });

    expect(loadConfig(p).global!.stateFile).toBe(abs);
  });

  it('defaults state and logs to siblings of the config file', () => {
    const p = write({ apps: {} });
    process.chdir(os.tmpdir());

    const config = loadConfig(p);

    expect(config.global!.stateFile).toBe(path.join(configDir, 'state.json'));
    expect(config.global!.sessionsDir).toBe(path.join(configDir, 'sessions'));
  });

  it('never nests the state dir inside itself', () => {
    const p = write({ apps: {} });

    // Directory-nesting check, not a bare substring check: STATE_DIR_NAME
    // ('state') is now a textual prefix of the default state filename
    // ('state.json'), so the resolved path legitimately contains the
    // substring "state/state" (".../state/state.json") without any actual
    // nesting. Anchoring on separators on both sides of each segment catches
    // real nesting (".../state/state/...") while ignoring that collision.
    expect(loadConfig(p).global!.stateFile).not.toContain(
      path.sep + STATE_DIR_NAME + path.sep + STATE_DIR_NAME + path.sep
    );
  });

  it('writes a portable (relative) stateFile when auto-creating a missing config', () => {
    const p = path.join(root, 'fresh', STATE_DIR_NAME, CONFIG_FILE_NAME);

    const config = loadConfig(p);

    const onDisk = JSON.parse(fs.readFileSync(p, 'utf-8'));
    expect(path.isAbsolute(onDisk.global.stateFile)).toBe(false);
    expect(config.global!.stateFile).toBe(path.join(path.dirname(p), 'state.json'));
  });
});

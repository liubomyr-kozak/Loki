import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { migrateLegacyConfig } from './migrateLegacyConfig';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'loki-migrate-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('copies the profile without changing the source or breaking repo/state paths', () => {
  const source = path.join(root, 'state');
  const destination = path.join(root, 'profile');
  fs.mkdirSync(path.join(source, '.orchestrator'), { recursive: true });
  const raw = JSON.stringify({ apps: { demo: { label: 'Demo', repoPath: '../demo' } },
    global: { stateFile: path.join(source, '.orchestrator/state.json'), sessionsDir: '../external-logs' } });
  fs.writeFileSync(path.join(source, 'loki-config.json'), raw);
  fs.writeFileSync(path.join(source, '.orchestrator/state.json'), '{"saved":true}');
  migrateLegacyConfig(source, destination);
  const copied = JSON.parse(fs.readFileSync(path.join(destination, 'loki-config.json'), 'utf-8'));
  expect(copied.apps.demo.repoPath).toBe(path.join(root, 'demo'));
  expect(copied.global.stateFile).toBe(path.join('.orchestrator', 'state.json'));
  expect(copied.global.sessionsDir).toBe(path.join(root, 'external-logs'));
  expect(fs.readFileSync(path.join(destination, '.orchestrator/state.json'), 'utf-8')).toBe('{"saved":true}');
  expect(fs.readFileSync(path.join(source, 'loki-config.json'), 'utf-8')).toBe(raw);
  expect(() => migrateLegacyConfig(source, destination)).toThrow('already exists');
});

it('rejects recursive destinations and invalid config before creating a profile', () => {
  const source = path.join(root, 'state');
  fs.mkdirSync(source);
  expect(() => migrateLegacyConfig(source, path.join(source, 'new'))).toThrow('outside');
  fs.writeFileSync(path.join(source, 'loki-config.json'), '{"apps":false}');
  expect(() => migrateLegacyConfig(source, path.join(root, 'profile'))).toThrow();
  expect(fs.existsSync(path.join(root, 'profile'))).toBe(false);
});

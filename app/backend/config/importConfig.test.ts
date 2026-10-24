import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readDroppedConfig } from './importConfig';
import { CONFIG_FILE_NAME } from './configLocation';

let root: string;

const validConfig = { apps: {} };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'loki-import-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeConfigFile(dir: string, contents: string): string {
  const p = path.join(dir, CONFIG_FILE_NAME);
  fs.writeFileSync(p, contents);
  return p;
}

describe('readDroppedConfig', () => {
  it('reads the config directly when given the full file path', () => {
    const filePath = writeConfigFile(root, JSON.stringify(validConfig));

    expect(readDroppedConfig(filePath).apps).toEqual({});
  });

  it('reads the config when given the containing folder', () => {
    writeConfigFile(root, JSON.stringify(validConfig));

    expect(readDroppedConfig(root).apps).toEqual({});
  });

  it('reports a not-found error scoped to the given path for a missing folder', () => {
    const missingDir = path.join(root, 'does-not-exist');

    expect(() => readDroppedConfig(missingDir)).toThrow(
      `${CONFIG_FILE_NAME} not found in ${missingDir}`
    );
  });

  it('reports a not-found error scoped to the given path for a missing file path', () => {
    const missingFile = path.join(root, CONFIG_FILE_NAME);

    expect(() => readDroppedConfig(missingFile)).toThrow(
      `${CONFIG_FILE_NAME} not found at ${missingFile}`
    );
  });

  it('reports invalid JSON distinctly from a missing file', () => {
    const filePath = writeConfigFile(root, '{ not valid json');

    expect(() => readDroppedConfig(filePath)).toThrow(`${CONFIG_FILE_NAME} contains invalid JSON`);
  });

  it('reports a schema mismatch distinctly from invalid JSON', () => {
    const filePath = writeConfigFile(root, JSON.stringify({ apps: 'not-an-object' }));

    expect(() => readDroppedConfig(filePath)).toThrow(
      `${CONFIG_FILE_NAME} does not match the expected config schema`
    );
  });
});

// Import into the user profile must not reinterpret demo/shared repo paths.
it('anchors imported relative repositories to the source config folder', () => {
  const filePath = writeConfigFile(root, JSON.stringify({
    apps: { demo: { label: 'Demo', repoPath: 'demo-backend' } },
  }));
  expect(readDroppedConfig(filePath).apps.demo.repoPath).toBe(path.join(root, 'demo-backend'));
});

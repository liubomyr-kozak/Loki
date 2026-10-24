import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_FILE_NAME, DEV_APP_ID, defaultConfigFile, resolveConfigFile } from './configLocation';

afterEach(() => vi.unstubAllEnvs());

describe('config location', () => {
  it('uses native per-user development directories on all supported platforms', () => {
    expect(defaultConfigFile({ platform: 'darwin', homeDir: '/Users/test', env: {} }))
      .toBe(`/Users/test/Library/Application Support/${DEV_APP_ID}/${CONFIG_FILE_NAME}`);
    expect(defaultConfigFile({ platform: 'win32', homeDir: 'C:\\Users\\test', env: {} }))
      .toBe(`C:\\Users\\test\\AppData\\Roaming\\${DEV_APP_ID}\\${CONFIG_FILE_NAME}`);
    expect(defaultConfigFile({ platform: 'win32', homeDir: 'C:\\Users\\test', env: { APPDATA: 'D:\\Profile' } }))
      .toBe(`D:\\Profile\\${DEV_APP_ID}\\${CONFIG_FILE_NAME}`);
    expect(defaultConfigFile({ platform: 'linux', homeDir: '/home/test', env: { XDG_CONFIG_HOME: '/config' } }))
      .toBe(`/config/${DEV_APP_ID}/${CONFIG_FILE_NAME}`);
    expect(defaultConfigFile({ platform: 'linux', homeDir: '/home/test', env: { XDG_CONFIG_HOME: 'relative' } }))
      .toBe(`/home/test/.config/${DEV_APP_ID}/${CONFIG_FILE_NAME}`);
  });

  it('resolves an explicit file and otherwise uses a cwd-independent default', () => {
    vi.stubEnv('CONFIG_FILE', path.join(os.tmpdir(), 'custom', CONFIG_FILE_NAME));
    expect(resolveConfigFile()).toBe(path.join(os.tmpdir(), 'custom', CONFIG_FILE_NAME));
    vi.stubEnv('CONFIG_FILE', 'custom/config.json');
    expect(resolveConfigFile()).toBe(path.resolve('custom/config.json'));
    vi.stubEnv('CONFIG_FILE', '');
    const before = resolveConfigFile();
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(os.tmpdir());
    try { expect(resolveConfigFile()).toBe(before); } finally { cwd.mockRestore(); }
  });
});

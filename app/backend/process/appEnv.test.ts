import { describe, it, expect } from 'vitest';
import { appEnv, lokiOwnKeys } from './appEnv';

describe('appEnv', () => {
  it("drops Loki's own variables and keeps the rest", () => {
    const env = appEnv({
      PATH: '/usr/bin',
      HOME: '/home/me',
      PORT: '9999',
      LOKI_PORT: '9999',
      LOKI_PACKAGED: '1',
      CONFIG_FILE: '/x/loki-config.json',
      CATALOG_FILE: '/x/catalog.json',
      MARKETPLACE_DIR: '/x/marketplace',
      APP_SESSIONS_DIR: '/x/sessions',
    });
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/me' });
  });

  it('lists the fixed keys plus any LOKI_ ones that are set', () => {
    const keys = lokiOwnKeys({ LOKI_SKIP_SHELL_PATH: '1', PATH: '/usr/bin' });
    expect(keys).toContain('PORT');
    expect(keys).toContain('CONFIG_FILE');
    expect(keys).toContain('LOKI_SKIP_SHELL_PATH');
    expect(keys).not.toContain('PATH');
  });
});

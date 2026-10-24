import { describe, it, expect } from 'vitest';
import { mergeConfigs } from './configMerge';
import type { Config } from '../../shared/types';

function cfg(partial: Partial<Config>): Config {
  return { apps: {}, ...partial };
}

describe('mergeConfigs — merge mode', () => {
  it('keeps an apps key absent from incoming unchanged', () => {
    const current = cfg({ apps: { alpha: { label: 'Alpha', repoPath: '/a' } } });
    const incoming = cfg({ apps: {} });
    const result = mergeConfigs(current, incoming, 'merge');
    expect(result.apps.alpha).toEqual({ label: 'Alpha', repoPath: '/a' });
  });

  it('adds an apps key present only in incoming', () => {
    const current = cfg({ apps: { alpha: { label: 'Alpha' } } });
    const incoming = cfg({ apps: { beta: { label: 'Beta' } } });
    const result = mergeConfigs(current, incoming, 'merge');
    expect(result.apps.alpha).toEqual({ label: 'Alpha' });
    expect(result.apps.beta).toEqual({ label: 'Beta' });
  });

  it('replaces an apps key present in both WHOLE — no per-field merge survives from current', () => {
    const current = cfg({ apps: { alpha: { label: 'Old', repoPath: '/old', startCommand: 'npm start' } } });
    const incoming = cfg({ apps: { alpha: { label: 'New' } } });
    const result = mergeConfigs(current, incoming, 'merge');
    expect(result.apps.alpha).toEqual({ label: 'New' });
    expect(result.apps.alpha).not.toHaveProperty('repoPath');
    expect(result.apps.alpha).not.toHaveProperty('startCommand');
  });

  it('unions top-level arrays (plugins/disabledPlugins/groupOrder), current first, no dupes', () => {
    const current = cfg({
      apps: {},
      plugins: ['p1', 'p2'],
      disabledPlugins: ['d1'],
      groupOrder: ['g1', 'g2'],
    });
    const incoming = cfg({
      apps: {},
      plugins: ['p2', 'p3'],
      disabledPlugins: ['d2'],
      groupOrder: ['g2', 'g3'],
    });
    const result = mergeConfigs(current, incoming, 'merge');
    expect(result.plugins).toEqual(['p1', 'p2', 'p3']);
    expect(result.disabledPlugins).toEqual(['d1', 'd2']);
    expect(result.groupOrder).toEqual(['g1', 'g2', 'g3']);
  });

  it('leaves current array unchanged when incoming array is empty', () => {
    const current = cfg({ apps: {}, plugins: ['p1', 'p2'] });
    const incoming = cfg({ apps: {}, plugins: [] });
    const result = mergeConfigs(current, incoming, 'merge');
    expect(result.plugins).toEqual(['p1', 'p2']);
  });

  it('deep-merges global keys, incoming wins scalar conflicts, current-only keys survive', () => {
    const current = cfg({
      apps: {},
      global: { packageManager: 'npm', defaultShell: '/bin/zsh', sessionsDir: '/sessions' },
    });
    const incoming = cfg({
      apps: {},
      global: { packageManager: 'yarn', nodePath: '/usr/bin/node' },
    });
    const result = mergeConfigs(current, incoming, 'merge');
    expect(result.global).toEqual({
      packageManager: 'yarn',
      defaultShell: '/bin/zsh',
      sessionsDir: '/sessions',
      nodePath: '/usr/bin/node',
    });
  });
});

describe('mergeConfigs — replace mode', () => {
  it('returns incoming deep-equal, regardless of current contents', () => {
    const current = cfg({
      apps: { alpha: { label: 'Alpha' } },
      global: { packageManager: 'npm' },
      plugins: ['p1'],
      groupOrder: ['g1'],
    });
    const incoming = cfg({
      apps: { beta: { label: 'Beta' } },
      global: { packageManager: 'yarn' },
      plugins: ['p2'],
      groupOrder: ['g2'],
    });
    const result = mergeConfigs(current, incoming, 'replace');
    expect(result).toEqual(incoming);
  });
});

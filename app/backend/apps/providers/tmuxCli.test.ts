import { beforeEach, describe, expect, it, vi } from 'vitest';

const { existsSyncMock, execFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn<(path: string) => boolean>(),
  execFileSyncMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { existsSync: existsSyncMock },
  existsSync: existsSyncMock,
}));

vi.mock('child_process', () => ({
  execFileSync: execFileSyncMock,
}));

import { configure, tmux } from './tmuxCli';

describe('tmux', () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    execFileSyncMock.mockReset();
    existsSyncMock.mockReturnValue(false);
    configure({});
    delete process.env.TMUX_BIN;
  });

  it('includes tmux stderr when a command fails', () => {
    const error = Object.assign(
      new Error('Command failed: tmux -S /tmp/test.sock list-panes -t mfe:app -F #{pane_pid}'),
      { stderr: Buffer.from('no server running on /tmp/test.sock\n') }
    );
    execFileSyncMock.mockImplementation(() => {
      throw error;
    });

    configure({ socketPath: '/tmp/test.sock' });

    expect(() => tmux(['list-panes', '-t', 'mfe:app', '-F', '#{pane_pid}'])).toThrow(
      'no server running on /tmp/test.sock'
    );
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'tmux',
      ['-S', '/tmp/test.sock', 'list-panes', '-t', 'mfe:app', '-F', '#{pane_pid}'],
      expect.objectContaining({
        encoding: 'utf-8',
        env: expect.any(Object),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
  });
});

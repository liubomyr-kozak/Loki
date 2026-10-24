import net from 'net';
import { execFile } from 'child_process';

const PORT_CHECK_TIMEOUT_MS = 1000;

const KILL_GRACE_MS = 1000;

const EXEC_TIMEOUT_MS = 5000;

const IS_WIN = process.platform === 'win32';

type Cmd = { file: string; args: string[] };

// Windows has no `lsof`/`ps`. The POSIX calls below do not fail loudly there —
// `execFile` just yields ENOENT, every caller falls into its `err` branch, and
// the functions return "no process found". That reads exactly like a healthy
// empty result, so port conflicts and descendant discovery silently stopped
// working instead of reporting that they could not run.
//
// PowerShell is the substitute: `Get-NetTCPConnection` avoids `netstat`'s
// localized state strings ("LISTENING" is translated on non-English Windows),
// and `Get-CimInstance Win32_Process` is the only mechanism present on every
// supported build that reports a full command line (`wmic` is deprecated and
// missing from recent images; `tasklist` gives the image name only).
function ps(script: string): Cmd {
  return {
    file: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-Command', script],
  };
}

export function isPortOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(PORT_CHECK_TIMEOUT_MS);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

// Uses `execFile` (no shell) with an argument array rather than a
// string-interpolated `exec()` command — `port`/`pid` never pass through a
// shell, so there is no command-injection surface even if a caller ever
// forwarded an untrusted value here.
export function getProcessByPort(port: number): Promise<{ pid: number | null; command?: string }> {
  const listener: Cmd = IS_WIN
    ? ps(
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue |` +
          ' Select-Object -First 1 -ExpandProperty OwningProcess'
      )
    : { file: 'lsof', args: [`-iTCP:${port}`, '-sTCP:LISTEN', '-n', '-P', '-t'] };

  return new Promise(resolve => {
    execFile(listener.file, listener.args, { timeout: EXEC_TIMEOUT_MS }, (err, stdout) => {
      if (err || !stdout) {
        return resolve({ pid: null });
      }
      const pidStr = stdout.trim().split(/\s+/)[0];
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) {
        return resolve({ pid: null });
      }
      // POSIX `ps -o command=` prints the command line and nothing else, but
      // still pads a leading pid column we drop below; the CIM query already
      // returns the bare command line, so nothing is dropped there.
      const describe: Cmd = IS_WIN
        ? ps(
            `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue |` +
              ' Select-Object -ExpandProperty CommandLine'
          )
        : { file: 'ps', args: ['-p', String(pid), '-o', 'pid=', '-o', 'command='] };

      execFile(describe.file, describe.args, { timeout: EXEC_TIMEOUT_MS }, (err2, stdout2) => {
        if (err2 || !stdout2) {
          return resolve({ pid });
        }
        const line = stdout2.trim();
        if (IS_WIN) {
          return resolve({ pid, command: line });
        }
        const parts = line.split(/\s+/);
        parts.shift();
        resolve({ pid, command: parts.join(' ') });
      });
    });
  });
}

export function killProcess(pid: number): Promise<void> {
  return new Promise(resolve => {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return resolve();
    }
    setTimeout(() => {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
      resolve();
    }, KILL_GRACE_MS);
  });
}

export async function killProcessOnPort(port: number): Promise<void> {
  const info = await getProcessByPort(port);
  if (info.pid) {
    await killProcess(info.pid);
  }
}

export function getDescendantPids(rootPid: number): Promise<number[]> {
  // Both commands emit one "<pid> <ppid>" line per process, so the parser
  // below is shared verbatim.
  const listAll: Cmd = IS_WIN
    ? ps(
        'Get-CimInstance Win32_Process |' +
          ' ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }'
      )
    : { file: 'ps', args: ['-eo', 'pid=,ppid='] };

  return new Promise(resolve => {
    execFile(listAll.file, listAll.args, { timeout: EXEC_TIMEOUT_MS }, (err, stdout) => {
      if (err || !stdout) {
        return resolve([rootPid]);
      }
      const childrenOf = new Map<number, number[]>();
      for (const raw of stdout.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        if (parts.length < 2) continue;
        const pid = parseInt(parts[0], 10);
        const ppid = parseInt(parts[1], 10);
        if (isNaN(pid) || isNaN(ppid)) continue;
        if (!childrenOf.has(ppid)) childrenOf.set(ppid, []);
        childrenOf.get(ppid)!.push(pid);
      }
      const result: number[] = [];
      const queue: number[] = [rootPid];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        result.push(cur);
        const children = childrenOf.get(cur) ?? [];
        for (const child of children) queue.push(child);
      }
      resolve(result);
    });
  });
}

export function getListenPort(pids: number[]): Promise<number | null> {
  if (pids.length === 0) return Promise.resolve(null);
  const pidArg = pids.join(',');
  // Windows emits one bare port number per line; lsof's `-Fn` emits
  // `n<address>:<port>` records. Parsed separately, below.
  const listen: Cmd = IS_WIN
    ? ps(
        'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |' +
          ` Where-Object { @(${pidArg}) -contains $_.OwningProcess } |` +
          ' Select-Object -First 1 -ExpandProperty LocalPort'
      )
    : { file: 'lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', pidArg, '-Fn'] };

  return new Promise(resolve => {
    execFile(listen.file, listen.args, { timeout: EXEC_TIMEOUT_MS }, (err, stdout) => {
      if (err || !stdout) {
        return resolve(null);
      }
      for (const raw of stdout.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        if (IS_WIN) {
          const port = parseInt(line, 10);
          if (!isNaN(port) && port > 0) return resolve(port);
          continue;
        }
        if (!line.startsWith('n')) continue;
        const colonIdx = line.lastIndexOf(':');
        if (colonIdx === -1) continue;
        const port = parseInt(line.slice(colonIdx + 1), 10);
        if (!isNaN(port) && port > 0) {
          return resolve(port);
        }
      }
      resolve(null);
    });
  });
}

export async function discoverPort(panePid: number): Promise<number | null> {
  const pids = await getDescendantPids(panePid);
  return getListenPort(pids);
}

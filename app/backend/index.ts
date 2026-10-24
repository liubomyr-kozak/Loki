#!/usr/bin/env node
import readline from 'readline';
import path from 'path';
import fs from 'fs';

import { getConfig, initConfig } from './config/configState';
import { resolveConfigFile } from './config/configLocation';
import { resolveSessionsDir } from './config/scan';
import { getAppStatus, startApp, stopApp, restartApp } from './apps/appManager';
import { readRegistry } from './process/registry';
import { resolveStateFile } from './config/statePaths';
import { errorMessage } from './errors';
import { Config, AppStatus } from '../shared/types';

const args = process.argv.slice(2);
const configFile = args[0] ? path.resolve(args[0]) : resolveConfigFile();
// Keep provider/plugin helpers on the same profile as the CLI argument.
process.env.CONFIG_FILE = configFile;

initConfig(configFile);
const config: Config = getConfig();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

console.log(`Loki Dev Orchestrator loaded configuration from ${path.resolve(configFile)}`);
console.log('Type "help" for a list of commands.');

async function listApps() {
  const registry = readRegistry(resolveStateFile(config));
  const statusMap: Record<string, AppStatus> = {};
  for (const name of Object.keys(config.apps)) {
    const status = await getAppStatus(config, name, registry);
    statusMap[name] = status;
  }
  const title = '🜃 loki';
  console.log();
  console.log(title);
  console.log();
  console.log('Apps');
  const rows: string[][] = [];
  for (const name of Object.keys(config.apps)) {
    const s = statusMap[name];
    const icon = (() => {
      switch (s.process) {
        case 'running': return '✅';
        case 'stopped': return '⏹';
        case 'port-conflict': return '⚠️';
        case 'unhealthy': return '🔴';
        case 'unknown': return '❓';
        default: { const _x: never = s.process; return '❓'; }
      }
    })();
    const colName = `${icon} ${name}`;
    const port = s.port != null ? String(s.port) : '';
    const branch = s.branch ?? '';
    const commit = s.commit ?? '';
    rows.push([colName, port, branch, commit]);
  }
  const headers = ['App', 'Port', 'Branch', 'Commit'];
  const widths = headers.map((h, i) => {
    const maxRow = rows.reduce((m, r) => Math.max(m, r[i].length), h.length);
    return maxRow;
  });
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  console.log(headerLine);
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    const line = row.map((cell, i) => cell.padEnd(widths[i])).join('  ');
    console.log(line);
  }
  console.log();
  console.log('Actions');
  console.log('  start <app> | stop <app> | restart <app> | logs <app>');
  console.log('  status <app> | list | help | quit');
  console.log();
}

async function showStatus(appName: string) {
  const registry = readRegistry(resolveStateFile(config));
  if (!config.apps[appName]) {
    console.log(`Unknown app: ${appName}`);
    return;
  }
  const s = await getAppStatus(config, appName, registry);
  console.log(`Name:   ${s.name}`);
  console.log(`Label:  ${s.label}`);
  console.log(`Status: ${s.process}`);
  if (s.port != null) console.log(`Port:   ${s.port}`);
  if (s.branch) console.log(`Branch: ${s.branch}`);
  if (s.commit) console.log(`Commit: ${s.commit}`);
  if (s.dirty != null) console.log(`Dirty:  ${s.dirty ? 'yes' : 'no'}`);
  if (s.selectedEnvironment) console.log(`Environment: ${s.selectedEnvironment}`);
}

async function showLogs(appName: string, lines: number = 40) {
  // loadConfig always resolves sessionsDir to an absolute path against the
  // config's own folder; the fallback only covers a config loaded some other way.
  const sessionsDir = config.global?.sessionsDir ?? resolveSessionsDir(configFile, undefined);
  const logPath = path.join(sessionsDir, `${appName}.log`);
  if (!fs.existsSync(logPath)) {
    console.log(`Log file not found for ${appName}`);
    return;
  }
  const content = fs.readFileSync(logPath, 'utf-8');
  const allLines = content.split(/\r?\n/);
  const tail = allLines.slice(-lines);
  console.log(tail.join('\n'));
}

function printHelp() {
  console.log(`Available commands:
  list                         List all apps and their status
  status <app>                 Show status of a single app
  start <app>                  Start an app and its dependencies
  stop <app>                   Stop an app
  restart <app>                Restart an app
  logs <app> [lines]           Show last lines of an app's log
  help                         Show this help message
  exit | quit                  Exit the orchestrator
  `);
}

async function handleCommand(input: string): Promise<void> {
  const args = input.trim().split(/\s+/).filter(Boolean);
  if (args.length === 0) return;
  const cmd = args[0].toLowerCase();
  try {
    switch (cmd) {
      case 'list':
        await listApps();
        break;
      case 'status':
        if (args.length < 2) {
          console.log('Usage: status <app>');
        } else {
          await showStatus(args[1]);
        }
        break;
      case 'start':
        if (args.length < 2) {
          console.log('Usage: start <app>');
        } else {
          console.log(`Starting ${args[1]}...`);
          await startApp(config, args[1]);
          console.log(`${args[1]} started`);
        }
        break;
      case 'stop':
        if (args.length < 2) {
          console.log('Usage: stop <app>');
        } else {
          console.log(`Stopping ${args[1]}...`);
          await stopApp(config, args[1]);
          console.log(`${args[1]} stopped`);
        }
        break;
      case 'restart':
        if (args.length < 2) {
          console.log('Usage: restart <app>');
        } else {
          console.log(`Restarting ${args[1]}...`);
          await restartApp(config, args[1]);
          console.log(`${args[1]} restarted`);
        }
        break;
      case 'logs':
        if (args.length < 2) {
          console.log('Usage: logs <app> [lines]');
        } else {
          const count = args.length >= 3 ? parseInt(args[2], 10) : 40;
          await showLogs(args[1], count);
        }
        break;
      case 'help':
        printHelp();
        break;
      case 'exit':
      case 'quit':
        rl.close();
        process.exit(0);
      default:
        console.log(`Unknown command: ${cmd}`);
        printHelp();
        break;
    }
  } catch (err: unknown) {
    console.error('Error:', errorMessage(err));
  }
}

function prompt() {
  rl.question('> ', async (answer: string) => {
    await handleCommand(answer);
    prompt();
  });
}

prompt();
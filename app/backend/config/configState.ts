import { loadConfig } from './loadConfig';
import { resolveConfigFile } from './configLocation';
import { errorMessage } from '../errors';
import type { Config } from '../../shared/types';

let config: Config;
let configFile = resolveConfigFile();

export function getConfigFile(): string {
  return configFile;
}

export function getConfig(): Config {
  return config;
}

export function reloadConfig(): Config {
  config = loadConfig(configFile);
  return config;
}

export function initConfig(file: string = configFile): void {
  configFile = file;
  try {
    config = loadConfig(configFile);
  } catch (err: unknown) {
    console.error('Error loading config:', errorMessage(err));
    process.exit(1);
  }
}

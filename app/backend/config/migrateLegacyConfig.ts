import fs from 'fs';
import { checkoutRoot } from './checkoutRoot';
import path from 'path';
import { CONFIG_FILE_NAME, configFolder, resolveConfigFile } from './configLocation';
import { ConfigSchema } from '../../shared/schema';

// Copy, never move: preserve the old profile and refuse to replace an existing
// destination. Runtime sidecars stay with the config, including custom subdirs.
export function migrateLegacyConfig(sourceDir: string, destinationDir: string): void {
  const source = path.resolve(sourceDir);
  const destination = path.resolve(destinationDir);
  if (destination === source || destination.startsWith(source + path.sep)) {
    throw new Error('Destination must be outside the source directory.');
  }
  if (fs.existsSync(destination)) {
    throw new Error(`Destination already exists: ${destination}. Use Settings import to merge configs instead.`);
  }
  const config = ConfigSchema.parse(JSON.parse(fs.readFileSync(path.join(source, CONFIG_FILE_NAME), 'utf-8')));
  for (const app of Object.values(config.apps)) {
    if (app.repoPath) app.repoPath = path.resolve(source, app.repoPath);
  }
  // Paths inside the old profile follow the copy. External paths stay put.
  for (const key of ['stateFile', 'sessionsDir'] as const) {
    const value = config.global[key];
    if (!value) continue;
    const resolved = path.resolve(source, value);
    const relative = path.relative(source, resolved);
    const inside = relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
    config.global[key] = inside ? relative || '.' : resolved;
  }
  // marketplaceDir was historically relative to the repo working directory.
  if (config.global.marketplaceDir && !path.isAbsolute(config.global.marketplaceDir)) {
    config.global.marketplaceDir = path.resolve(path.dirname(source), config.global.marketplaceDir);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const staging = fs.mkdtempSync(destination + '.migrating-');
  try {
    fs.cpSync(source, staging, { recursive: true });
    fs.writeFileSync(path.join(staging, CONFIG_FILE_NAME), JSON.stringify(config, null, 2) + '\n');
    fs.renameSync(staging, destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const root = checkoutRoot();
  if (!root) throw new Error('Migration must run from a Loki source checkout.');
  const source = path.join(root, 'state');
  const destination = configFolder(resolveConfigFile());
  if (path.basename(resolveConfigFile()) !== CONFIG_FILE_NAME) {
    console.error(`Migration requires a destination named ${CONFIG_FILE_NAME}.`);
    process.exitCode = 1;
  } else {
    try {
      migrateLegacyConfig(source, destination);
      console.log(`Copied ${source} to ${destination}. Original files were retained.`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}

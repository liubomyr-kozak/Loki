import fs from 'fs';
import path from 'path';
import { ConfigSchema } from '../../shared/schema';
import { getConfigFile } from './configState';
import { errorMessage } from '../errors';
import type { Config } from '../../shared/types';

// Reads and validates the config file at (or inside) a dropped/pointed-to
// path. Never writes anything — pure read + validate. Three distinct
// failure modes surface as three distinct, catchable errors (R2-R4):
//  - file missing
//  - invalid JSON
//  - valid JSON that fails ConfigSchema
//
// The caller may pass either a folder (the traditional drag-and-drop case,
// where we look for the config file's basename inside it) or the full path
// to the config file itself (e.g. a user pasting
// "/path/state/loki-config.json" into the import field). We detect
// which one we got instead of blindly joining, so a file-path input doesn't
// produce an absurd "not found in <file>" message.
export function readDroppedConfig(inputPath: string): Config {
  const fileName = path.basename(getConfigFile());

  const looksLikeFile =
    (fs.existsSync(inputPath) && fs.statSync(inputPath).isFile()) || path.basename(inputPath) === fileName;

  const filePath = looksLikeFile ? inputPath : path.join(inputPath, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      looksLikeFile ? `${path.basename(filePath)} not found at ${filePath}` : `${fileName} not found in ${inputPath}`
    );
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    throw new Error(`Could not read ${fileName}: ${errorMessage(err)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`${fileName} contains invalid JSON`);
  }

  const parsed = ConfigSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const at = issue?.path?.length ? ` at ${issue.path.join('.')}` : '';
    throw new Error(`${fileName} does not match the expected config schema${at}: ${issue?.message ?? 'invalid'}`);
  }

  // Importing a profile into another folder must retain its repo locations.
  for (const app of Object.values(parsed.data.apps)) {
    if (app.repoPath) app.repoPath = path.resolve(path.dirname(filePath), app.repoPath);
  }
  return parsed.data as Config;
}

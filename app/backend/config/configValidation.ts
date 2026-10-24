import { AppConfigWriteSchema } from '../../shared/schema';

const KEY_RE = /^[a-z0-9][a-z0-9-]*$/;

export function sanitizeKey(s: string): string {
  if (typeof s !== 'string' || !KEY_RE.test(s)) {
    throw new Error(`Invalid key "${s}": must match ${KEY_RE}`);
  }
  return s;
}

export function validateIconShape(icon: any): void {
  if (typeof icon !== 'string' || !icon) {
    throw new Error(`icon must be a non-empty string`);
  }
}

export function validateAppConfig(app: any): void {
  AppConfigWriteSchema.parse(app);
}

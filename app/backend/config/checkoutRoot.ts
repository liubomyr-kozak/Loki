import fs from 'fs';
import path from 'path';

// Source lives in backend/config; emitted code in dist/backend/config.
// Packaged builds replace LOKI_PACKAGED at bundle time and never rebuild code.
export function checkoutRoot(): string | undefined {
  if (process.env.LOKI_PACKAGED === '1') return undefined;
  for (const relative of ['../..', '../../..']) {
    const candidate = path.resolve(__dirname, relative);
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf-8'));
      if (pkg.name === 'loki-orchestrator' && fs.existsSync(path.join(candidate, 'app/backend/server.ts'))) {
        return candidate;
      }
    } catch { /* not a source checkout */ }
  }
  return undefined;
}

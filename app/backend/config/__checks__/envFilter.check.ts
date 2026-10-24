import assert from 'assert';
import { resolveEnvFilter, compileEnvFilter, filterScriptNames } from '../../../shared/envFilter';

// empty regex '' => all names matched (PASS-ALL)
const passAll = filterScriptNames(['dev', 'build'], '');
assert.strictEqual(passAll.ok, true, 'expected ok:true for empty regex');
if (passAll.ok) {
  assert.deepStrictEqual(passAll.matched, ['dev', 'build'], 'expected pass-all match for empty regex');
}

// '^dev' => only names starting with 'dev'
const devOnly = filterScriptNames(['dev', 'build', 'develop'], '^dev');
assert.strictEqual(devOnly.ok, true, 'expected ok:true for valid regex');
if (devOnly.ok) {
  assert.deepStrictEqual(devOnly.matched, ['dev', 'develop'], 'expected only names starting with dev');
}

// invalid '(' => { ok:false }
const invalid = compileEnvFilter('(');
assert.strictEqual(invalid.ok, false, 'expected ok:false for invalid regex');

const invalidFilter = filterScriptNames(['dev', 'build'], '(');
assert.strictEqual(invalidFilter.ok, false, 'expected ok:false for invalid regex via filterScriptNames');

// resolveEnvFilter: useGlobal=false picks app.filterRegex
const appOnly = resolveEnvFilter('^global', { useGlobal: false, filterRegex: '^app' });
assert.strictEqual(appOnly.regex, '^app', 'expected app.filterRegex when useGlobal=false');
assert.strictEqual(appOnly.source, 'app', 'expected source app when useGlobal=false');

// resolveEnvFilter: useGlobal=true picks global
const globalPicked = resolveEnvFilter('^global', { useGlobal: true, filterRegex: '^app' });
assert.strictEqual(globalPicked.regex, '^global', 'expected globalRegex when useGlobal=true');
assert.strictEqual(globalPicked.source, 'global', 'expected source global when useGlobal=true');

// resolveEnvFilter: app absent => useGlobal defaults true => picks global
const appAbsent = resolveEnvFilter('^global', undefined);
assert.strictEqual(appAbsent.regex, '^global', 'expected globalRegex when app is absent (useGlobal defaults true)');
assert.strictEqual(appAbsent.source, 'global', 'expected source global when app is absent');

console.log('OK: envFilter pass-all, prefix-filter, invalid-regex, and resolveEnvFilter precedence all behave as specified');

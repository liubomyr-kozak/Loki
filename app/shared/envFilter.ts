export interface EnvFilterConfig { useGlobal: boolean; filterRegex?: string }
export interface ResolvedFilter { source: 'global' | 'app' | 'none'; regex: string }

// useGlobal defaults TRUE when app filter absent.
export function resolveEnvFilter(globalRegex: string | undefined, app: EnvFilterConfig | undefined): ResolvedFilter {
  const useGlobal = app?.useGlobal ?? true;
  const regex = useGlobal ? (globalRegex ?? '') : (app?.filterRegex ?? '');
  return { source: regex ? (useGlobal ? 'global' : 'app') : 'none', regex };
}

export type CompileResult = { ok: true; re: RegExp | null } | { ok: false; error: string };
// EMPTY / whitespace-only => {ok:true, re:null} = PASS-ALL. NEVER default to a RUN_LIKE pattern.
export function compileEnvFilter(regex: string): CompileResult {
  if (!regex.trim()) return { ok: true, re: null };
  try { return { ok: true, re: new RegExp(regex) }; }
  catch (e) { return { ok: false, error: (e as Error).message }; }
}

// Pass-all when regex empty/undefined. Typed error on invalid regex (caller decides).
export function filterScriptNames(names: string[], regex: string | undefined):
  { ok: true; matched: string[] } | { ok: false; error: string } {
  const c = compileEnvFilter(regex ?? '');
  if (!c.ok) return c;
  if (c.re === null) return { ok: true, matched: [...names] };
  const re = c.re;
  return { ok: true, matched: names.filter((n) => re.test(n)) };
}

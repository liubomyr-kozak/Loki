import { TemplateContext } from '../../shared/types';

const ALLOWED_VARS = ['name', 'port', 'version', 'environment', 'branch', 'appUrl', 'repoPath', 'toggleState'] as const;

export function substituteTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(ALLOWED_VARS as readonly string[]).includes(key)) return match;
    const value = (ctx as unknown as Record<string, unknown>)[key];
    return value == null ? '' : String(value);
  });
}

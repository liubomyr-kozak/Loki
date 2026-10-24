import { AppConfig, AppSurface, APP_SURFACES } from '../../shared/types';
import { validateIconShape } from './configValidation';
import { compileEnvFilter } from '../../shared/envFilter';

// keep in sync with app/src/lib/constants.ts ALL_ID
const ALL_ID = '__all__';

export function addApp(apps: Record<string, AppConfig>, key: string, appConfig: AppConfig): void {
  if (apps[key]) {
    throw new Error(`App "${key}" already exists`);
  }
  apps[key] = appConfig;
}

export function removeApp(apps: Record<string, AppConfig>, name: string): void {
  if (!apps[name]) {
    throw new Error(`App "${name}" not found`);
  }
  delete apps[name];
  // A dangling dependsOn entry makes the dependent app unstartable
  // (startApp throws on the missing dependency), so it goes with the app.
  for (const other of Object.values(apps)) {
    if (other.dependsOn?.includes(name)) {
      const next = other.dependsOn.filter((d) => d !== name);
      if (next.length === 0) {
        delete other.dependsOn;
      } else {
        other.dependsOn = next;
      }
    }
  }
}

export function patchApp(
  apps: Record<string, AppConfig>,
  name: string,
  patch: Partial<
    Pick<
      AppConfig,
      'label' | 'repoPath' | 'repoUrl' | 'appUrl' | 'dependsOn' | 'surface' | 'icon' | 'groups' | 'plugins' | 'environmentFilter'
    >
  >
): void {
  const app = apps[name];
  if (!app) {
    throw new Error(`App "${name}" not found`);
  }
  if (!patch || typeof patch !== 'object') {
    throw new Error('patch must be an object');
  }

  if ('label' in patch) {
    if (typeof patch.label !== 'string' || !patch.label) {
      throw new Error('label must be a non-empty string');
    }
    app.label = patch.label;
  }

  if ('repoPath' in patch) {
    if (typeof patch.repoPath !== 'string' || !patch.repoPath) {
      throw new Error('repoPath must be a non-empty string');
    }
    app.repoPath = patch.repoPath;
  }

  if ('repoUrl' in patch) {
    if (typeof patch.repoUrl !== 'string') {
      throw new Error('repoUrl must be a string');
    }
    if (patch.repoUrl === '') {
      delete app.repoUrl;
    } else {
      app.repoUrl = patch.repoUrl;
    }
  }

  if ('appUrl' in patch) {
    if (typeof patch.appUrl !== 'string') {
      throw new Error('appUrl must be a string');
    }
    if (patch.appUrl === '') {
      delete app.appUrl;
    } else {
      app.appUrl = patch.appUrl;
    }
  }


  if ('dependsOn' in patch) {
    if (!Array.isArray(patch.dependsOn) || patch.dependsOn.some((d) => typeof d !== 'string')) {
      throw new Error('dependsOn must be an array of strings');
    }
    if (patch.dependsOn.length === 0) {
      delete app.dependsOn;
    } else {
      app.dependsOn = patch.dependsOn;
    }
  }

  if ('surface' in patch) {
    if (!APP_SURFACES.includes(patch.surface as AppSurface)) {
      throw new Error(`surface must be one of: ${APP_SURFACES.join(', ')}`);
    }
    app.surface = patch.surface;
  }

  if ('icon' in patch) {
    if (patch.icon === null) {
      delete app.icon;
    } else {
      validateIconShape(patch.icon);
      app.icon = patch.icon;
    }
  }

  if ('groups' in patch) {
    if (!Array.isArray(patch.groups) || patch.groups.some((g) => typeof g !== 'string' || !g)) {
      throw new Error('groups must be an array of non-empty strings');
    }
    if (patch.groups.some((g) => g === ALL_ID)) {
      throw new Error(`groups must not include the reserved "${ALL_ID}" label`);
    }
    if (patch.groups.length === 0) {
      delete app.groups;
    } else {
      app.groups = patch.groups;
    }
  }

  if ('plugins' in patch) {
    const plugins = patch.plugins;
    if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) {
      throw new Error('plugins must be an object');
    }
    for (const key of Object.keys(plugins)) {
      if (!key) {
        throw new Error('plugins keys must be non-empty strings');
      }
      const value = (plugins as Record<string, unknown>)[key];
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`plugins.${key} must be an object`);
      }
    }
    if (Object.keys(plugins).length === 0) {
      delete app.plugins;
    } else {
      app.plugins = plugins;
    }
  }

  if ('environmentFilter' in patch) {
    const environmentFilter = patch.environmentFilter;
    if (
      !environmentFilter ||
      typeof environmentFilter !== 'object' ||
      Array.isArray(environmentFilter) ||
      typeof environmentFilter.useGlobal !== 'boolean' ||
      (environmentFilter.filterRegex !== undefined && typeof environmentFilter.filterRegex !== 'string')
    ) {
      throw new Error('environmentFilter must be an object of shape { useGlobal: boolean, filterRegex?: string }');
    }
    if (environmentFilter.filterRegex) {
      const c = compileEnvFilter(environmentFilter.filterRegex);
      if (!c.ok) throw new Error('Invalid environment filter regex: ' + c.error);
    }
    app.environmentFilter = environmentFilter;
  }
}

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getConfig, getConfigFile, reloadConfig } from '../config/configState';
import { primeProviders } from '../apps/appManager';
import { errorMessage } from '../errors';
import { scanProject, findAppByRepoPath, detectRuntime, detectComponents, DetectedRuntime } from '../config/scan';
import { mutateConfigFile, addApp, patchApp, removeApp, sanitizeKey, validateAppConfig, mutateGlobalConfigFile, patchGlobalConfig, getGlobalConfigKeys, mutateGroupOrderFile, mutateWholeConfigFile } from '../config/configStore';
import { readDroppedConfig } from '../config/importConfig';
import { mergeConfigs } from '../config/configMerge';
import { listProviderMeta, getProviders } from '../apps/sessionProvider';
import { getInstancesPath, removeAppInstances } from '../process/instances';

// keep in sync with app/src/lib/constants.ts ALL_ID
const ALL_ID = '__all__';

const router = Router();

router.get('/api/config', (req, res) => {
  const config = getConfig();
  res.json({
    workspace: config.workspace,
    global: config.global,
    apps: config.apps || {},
    groupOrder: config.groupOrder || [],
  });
});

router.put('/api/group-order', async (req, res) => {
  try {
    const body = req.body ?? {};
    const groupOrder = body.groupOrder;
    if (!Array.isArray(groupOrder) || groupOrder.some((g: unknown) => typeof g !== 'string' || !g)) {
      return res.status(400).json({ error: 'groupOrder must be an array of non-empty strings' });
    }
    if (groupOrder.some((g: string) => g === ALL_ID)) {
      return res.status(400).json({ error: `groupOrder must not include the reserved "${ALL_ID}" label` });
    }
    await mutateGroupOrderFile(getConfigFile(), () => groupOrder);
    reloadConfig();
    res.json({ ok: true, groupOrder });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.get('/api/config/path', (req, res) => {
  res.json({ path: path.resolve(getConfigFile()) });
});

function globalConfigResponse() {
  const config = getConfig();
  const configFile = getConfigFile();
  const meta = listProviderMeta(config);
  const detected: DetectedRuntime = { components: detectComponents(configFile), ...detectRuntime(configFile, config) };
  return {
    global: config.global ?? {},
    providers: meta.providers,
    activeProvider: meta.activeId,
    recommendedId: meta.recommendedId,
    detected,
  };
}

router.get('/api/config/global', (req, res) => {
  try {
    primeProviders(getConfig());
    res.json(globalConfigResponse());
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/api/config/global/detect', (req, res) => {
  try {
    primeProviders(getConfig());
    const component = req.body?.component;
    for (const provider of getProviders()) {
      if (component === undefined) {
        provider.availability({ bypassCache: true });
      } else if (component === 'tmux' && provider.id === 'tmux') {
        provider.availability({ bypassCache: true });
      }
    }
    res.json(globalConfigResponse());
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.patch('/api/config/global', async (req, res) => {
  try {
    const patch = req.body ?? {};
    await mutateGlobalConfigFile(getConfigFile(), (global) => patchGlobalConfig(global, patch));
    reloadConfig();
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post('/api/config/global/reset', async (req, res) => {
  try {
    const resettableKeys = getGlobalConfigKeys().filter(
      (k) => !['sessionsDir', 'stateFile', 'pluginCatalogUrl', 'pluginsDir', 'pluginFolders'].includes(k)
    );
    await mutateGlobalConfigFile(getConfigFile(), (global) => {
      for (const key of resettableKeys) {
        delete (global as Record<string, unknown>)[key];
      }
    });
    reloadConfig();
    primeProviders(getConfig());
    res.json(globalConfigResponse());
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post('/api/config/reload', (req, res) => {
  try {
    reloadConfig();
    res.json({ ok: true, path: path.resolve(getConfigFile()) });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post('/api/scan', (req, res) => {
  try {
    const config = getConfig();
    const { path: dirPath } = req.body ?? {};
    if (!dirPath || typeof dirPath !== 'string') {
      return res.status(400).json({ error: 'path (string) is required' });
    }
    const project = scanProject(dirPath, config);
    const match = findAppByRepoPath(config, dirPath);

    let existingStartCommands: string[] = [];
    if (match) {
      const app = config.apps[match.appName];
      const commands: string[] = [];
      if (app.startCommand) commands.push(app.startCommand);
      existingStartCommands = commands;
    }

    res.json({ project, match, existingStartCommands });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post('/api/config/apps', async (req, res) => {
  try {
    const { key, app } = req.body ?? {};
    const sanitizedKey = sanitizeKey(key);
    validateAppConfig(app);
    await mutateConfigFile(getConfigFile(), (apps) => addApp(apps, sanitizedKey, app));
    reloadConfig();
    res.json({ ok: true, key: sanitizedKey });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.patch('/api/config/apps/:name', async (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }
    const patch = req.body ?? {};
    await mutateConfigFile(getConfigFile(), (apps) => patchApp(apps, name, patch));
    reloadConfig();
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

// DELETE /api/config/apps/:name does not currently exist even though
// app/src/api.ts's removeApp and DeleteAppSection.tsx already call it —
// this is a pre-existing gap, not something introduced by this task. Added
// now because Phase 1's "removeApp cascades instances" requirement is
// untestable without it.
router.delete('/api/config/apps/:name', async (req, res) => {
  try {
    const { name } = req.params;
    await mutateConfigFile(getConfigFile(), (apps) => removeApp(apps, name));
    reloadConfig();
    const config = getConfig();
    removeAppInstances(getInstancesPath(config), name);
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/api/config/import/inspect', (req, res) => {
  try {
    const { folderPath } = req.body ?? {};
    if (!folderPath || typeof folderPath !== 'string') {
      return res.status(400).json({ error: 'folderPath (string) is required' });
    }
    const incoming = readDroppedConfig(folderPath);
    res.json({ ok: true, appsCount: Object.keys(incoming.apps ?? {}).length });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post('/api/config/import/apply', async (req, res) => {
  try {
    const { folderPath, mode } = req.body ?? {};
    if (!folderPath || typeof folderPath !== 'string') {
      return res.status(400).json({ error: 'folderPath (string) is required' });
    }
    if (mode !== 'merge' && mode !== 'replace') {
      return res.status(400).json({ error: "mode must be 'merge' or 'replace'" });
    }
    // Re-read/re-validate rather than trusting the earlier inspect call
    // (TOCTOU: the source folder may have changed between inspect and apply).
    const incoming = readDroppedConfig(folderPath);
    // Current side is read raw — NOT via ConfigSchema.parse/getConfig() — so
    // a schema-invalid file already on disk (e.g. an app missing `label`)
    // doesn't fail a legal Merge, and loadConfig()'s injected defaults never
    // get written back as if they were user data.
    const currentRaw = fs.readFileSync(path.resolve(getConfigFile()), 'utf-8');
    const current = JSON.parse(currentRaw);
    const merged = mergeConfigs(current, incoming, mode);

    await mutateWholeConfigFile(getConfigFile(), () => merged);
    reloadConfig();
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

export default router;

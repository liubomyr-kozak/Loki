import { Router } from 'express';
import path from 'path';
import { getConfig } from '../config/configState';
import { getAppStatus } from '../apps/appManager';
import { readRegistry } from '../process/registry';
import { resolveStateFile } from '../config/statePaths';
import { errorMessage } from '../errors';
import { listPlugins, installPlugin, setPluginActivated, setPluginEnabled, previewPlugin, pluginDir } from '../plugins/pluginStore';
import { loadPluginModule, makeHost } from '../plugins/runtime';
import { fetchCatalog } from '../plugins/catalog';
import { buildDescriptors } from '../plugins/pluginDescriptorService';
import { AppSurface, PluginContext } from '../../shared/types';

const router = Router();

router.get('/api/plugins', (req, res) => {
  try {
    res.json({ plugins: listPlugins(getConfig()) });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.get('/api/plugins/descriptors', async (req, res) => {
  try {
    res.json(await buildDescriptors(getConfig()));
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/api/plugins/:id/invoke/:appName', async (req, res) => {
  try {
    const config = getConfig();
    const { id, appName } = req.params;
    if (!config.apps[appName]) {
      return res.status(400).json({ error: `app not found: ${appName}` });
    }

    const plugin = listPlugins(config).find(p => p.id === id);
    if (!plugin) {
      return res.status(400).json({ error: `plugin not found: ${id}` });
    }
    if (!plugin.activated) {
      return res.status(400).json({ error: 'plugin is not activated' });
    }
    if (!plugin.enabled) {
      return res.status(400).json({ error: 'plugin is disabled' });
    }

    const input = (req.body && typeof req.body === 'object' && req.body.input !== undefined)
      ? req.body.input
      : {};

    const pluginModule = loadPluginModule(pluginDir(config, id), id);
    const registry = readRegistry(resolveStateFile(config));
    const status = await getAppStatus(config, appName, registry);
    const host = makeHost(config);
    const ctx: PluginContext = {
      scope: 'app',
      app: config.apps[appName],
      status,
      appSurface: config.apps[appName].surface as AppSurface,
      host,
    };

    const result = await pluginModule.invoke(ctx, input);
    res.json({ result: result ?? null });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post('/api/plugins/:id/invoke', async (req, res) => {
  try {
    const config = getConfig();
    const { id } = req.params;

    const plugin = listPlugins(config).find(p => p.id === id);
    if (!plugin) {
      return res.status(400).json({ error: `plugin not found: ${id}` });
    }
    if (!plugin.activated) {
      return res.status(400).json({ error: 'plugin is not activated' });
    }
    if (!plugin.enabled) {
      return res.status(400).json({ error: 'plugin is disabled' });
    }

    const input = (req.body && typeof req.body === 'object' && req.body.input !== undefined)
      ? req.body.input
      : {};

    const pluginModule = loadPluginModule(pluginDir(config, id), id);
    const host = makeHost(config);
    const ctx: PluginContext = {
      scope: 'global',
      host,
    };

    const result = await pluginModule.invoke(ctx, input);
    res.json({ result: result ?? null });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post('/api/plugins/install', async (req, res) => {
  try {
    const { source } = req.body ?? {};
    if (typeof source !== 'string' || !source.trim()) {
      return res.status(400).json({ error: 'source (string) is required' });
    }
    const p = await installPlugin(getConfig(), { source });
    res.json(p);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

// "Remove" in the UI means deactivate: the plugin goes back to the inactive
// marketplace list, nothing is moved/deleted on disk.
router.delete('/api/plugins/:id', async (req, res) => {
  try {
    await setPluginActivated(getConfig(), req.params.id, false);
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post('/api/plugins/:id/activated', async (req, res) => {
  try {
    const { activated } = req.body ?? {};
    if (typeof activated !== 'boolean') return res.status(400).json({ error: 'activated (boolean) is required' });
    const p = await setPluginActivated(getConfig(), req.params.id, activated);
    res.json(p);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post('/api/plugins/:id/enabled', async (req, res) => {
  try {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) is required' });
    const p = await setPluginEnabled(getConfig(), req.params.id, enabled);
    res.json(p);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post('/api/plugins/preview', async (req, res) => {
  try {
    const { source } = req.body ?? {};
    if (typeof source !== 'string' || !source.trim()) {
      return res.status(400).json({ error: 'source (string) is required' });
    }
    const manifest = await previewPlugin(source);
    res.json({ manifest });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.get('/api/plugins/catalog', async (req, res) => {
  try {
    const entries = await fetchCatalog(getConfig());
    res.json({ entries });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

export default router;

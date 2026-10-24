import { Router } from 'express';
import { getConfig } from '../config/configState';
import { getAppStatus, makeStatusContext, startApp, stopApp, restartApp, getAttachCommand, focusAttachedSession, listSessions, resolveProcessKey } from '../apps/appManager';
import { ProcessConflictError } from '../apps/lifecycleOps';
import { readRegistry } from '../process/registry';
import { resolveStateFile, sidecarPath } from '../config/statePaths';
import { errorMessage } from '../errors';
import { writeSelection, AppSelection } from '../process/selections';
import { getInstancesPath, readInstances } from '../process/instances';

const router = Router();

router.get('/api/apps', async (req, res) => {
  try {
    const config = getConfig();
    const registry = readRegistry(resolveStateFile(config));
    const statusMap: Record<string, any> = {};

    const ctx = makeStatusContext(config);
    for (const name of Object.keys(config.apps)) {
      const status = await getAppStatus(config, name, registry, ctx);
      statusMap[name] = status;
    }

    // Detached instances (their effective environment differs from the
    // app's shared default) get their own live runtime state — surface it
    // here too, keyed by instanceId, so a clone row can read its own
    // status instead of the original's without a second round trip. Linked
    // instances (the common case) share the original's entry above and add
    // nothing here.
    const instances = readInstances(getInstancesPath(config));
    for (const instance of Object.values(instances)) {
      if (!config.apps[instance.appName]) continue;
      const resolved = resolveProcessKey(config, instance.appName, instance.id, ctx.selections?.[instance.appName]);
      if (resolved.mode === 'detached') {
        statusMap[instance.id] = await getAppStatus(config, instance.appName, registry, ctx, instance.id);
      }
    }

    res.json(statusMap);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.get('/api/apps/:name', async (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }
    const instanceId = typeof req.query.instanceId === 'string' ? req.query.instanceId : undefined;

    const registry = readRegistry(resolveStateFile(config));
    const status = await getAppStatus(config, name, registry, undefined, instanceId);
    res.json(status);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/api/apps/:name/start', async (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }
    const sel: AppSelection = {};
    if (typeof req.body?.environment === 'string' && req.body.environment !== '') sel.environment = req.body.environment;
    const force = req.body?.force === true;
    const persistSelection = req.body?.persistSelection !== false;
    const instanceId = typeof req.body?.instanceId === 'string' ? req.body.instanceId : undefined;
    const resolution = req.body?.resolution === 'stop-old' || req.body?.resolution === 'keep-old' ? req.body.resolution : undefined;
    try {
      await startApp(config, name, sel, force, persistSelection, instanceId, resolution);
    } catch (err: unknown) {
      // Orphan-process conflict (ADR task 4): not started — respond with
      // the app's current status plus the conflict, the same
      // AppStatus-shaped response as a normal start, so the row can render
      // the confirm/keep/cancel dialog from a field on the status it
      // already holds instead of a differently-shaped error payload.
      if (err instanceof ProcessConflictError) {
        const registry = readRegistry(resolveStateFile(config));
        const status = await getAppStatus(config, name, registry, undefined, instanceId);
        return res.json({ ...status, conflict: err.conflict });
      }
      throw err;
    }
    const registry = readRegistry(resolveStateFile(config));
    const status = await getAppStatus(config, name, registry, undefined, instanceId);
    res.json(status);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/api/apps/:name/stop', async (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }

    const force = req.body?.force === true;
    const instanceId = typeof req.body?.instanceId === 'string' ? req.body.instanceId : undefined;
    await stopApp(config, name, force, instanceId);
    const registry = readRegistry(resolveStateFile(config));
    const status = await getAppStatus(config, name, registry, undefined, instanceId);
    res.json(status);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.get('/api/sessions', async (req, res) => {
  try { res.json(await listSessions(getConfig())); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get('/api/apps/:name/attach-command', (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }
    const controlMode = req.query.mode === 'control' || req.query.control === '1' || req.query.control === 'true';
    const instanceId = typeof req.query.instanceId === 'string' ? req.query.instanceId : undefined;
    // A terminal already attached to the shared session just switches to
    // this app's window; opening another one is what produced a second
    // terminal window per click.
    const focus = req.query.focus === '1' || req.query.focus === 'true';
    if (focus && focusAttachedSession(name, config, instanceId)) {
      return res.json({ command: '', focused: true });
    }
    const command = getAttachCommand(name, config, { controlMode }, instanceId);
    res.json({ command, focused: false });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/api/apps/:name/restart', async (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }

    const instanceId = typeof req.body?.instanceId === 'string' ? req.body.instanceId : undefined;
    await restartApp(config, name, instanceId);
    const registry = readRegistry(resolveStateFile(config));
    const status = await getAppStatus(config, name, registry, undefined, instanceId);
    res.json(status);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/api/apps/:name/environment', async (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }
    const { environment } = req.body ?? {};
    if (!environment) {
      return res.status(400).json({ error: 'environment is required' });
    }
    const selFile = sidecarPath(config, 'selections.json');
    writeSelection(selFile, name, { environment: environment as string });
    const registry = readRegistry(resolveStateFile(config));
    const status = await getAppStatus(config, name, registry);
    res.json(status);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

export default router;

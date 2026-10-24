import { Router } from 'express';
import { getConfig } from '../config/configState';
import { errorMessage } from '../errors';
import { getInstancesPath, readInstances, createInstance, deleteInstance, setInstanceEnvOverride } from '../process/instances';

const router = Router();

router.get('/api/instances', (req, res) => {
  try {
    const config = getConfig();
    res.json(readInstances(getInstancesPath(config)));
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/api/instances', (req, res) => {
  try {
    const config = getConfig();
    const { appName, label } = req.body ?? {};
    if (!appName || !config.apps[appName]) {
      return res.status(404).json({ error: 'App not found' });
    }
    const record = createInstance(getInstancesPath(config), appName, label);
    res.json(record);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

// PATCH body { environment: string | null } — string sets the override,
// null clears it back to "no override" (falls back to the app's shared
// selection). Distinct from `environment: undefined`/missing, which is a
// no-op rather than a clear, so callers must be explicit about clearing.
router.patch('/api/instances/:id/env', (req, res) => {
  try {
    const config = getConfig();
    const { environment } = req.body ?? {};
    if (environment !== null && typeof environment !== 'string') {
      return res.status(400).json({ error: 'environment must be a string or null' });
    }
    const record = setInstanceEnvOverride(getInstancesPath(config), req.params.id, environment);
    if (!record) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    res.json(record);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.delete('/api/instances/:id', (req, res) => {
  try {
    const config = getConfig();
    deleteInstance(getInstancesPath(config), req.params.id);
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

export default router;

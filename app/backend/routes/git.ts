import { Router } from 'express';
import { getConfig } from '../config/configState';
import { resolveEffectiveForApp } from '../apps/appManager';
import { errorMessage } from '../errors';
import { readBranchesInfo, runCheckoutFlow, runStashApply, runStashDrop } from '../git/gitFlowService';
import { listEnvScripts } from '../apps/envScripts';

const router = Router();

router.get('/api/apps/:name/git/scripts', async (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }
    const ref = typeof req.query.ref === 'string' ? req.query.ref : undefined;
    const result = await listEnvScripts(config, name, ref);
    res.json(result);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.get('/api/apps/:name/git/branches', async (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }
    const eff = await resolveEffectiveForApp(config, name);
    const repoPath = eff.repoPath;
    if (!repoPath) {
      return res.status(500).json({ error: 'repoPath not resolved for app' });
    }

    const body = await readBranchesInfo(config, repoPath);
    res.json(body);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/api/apps/:name/git/checkout', async (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }
    const { branch } = req.body ?? {};
    if (!branch) {
      return res.status(400).json({ error: 'branch is required' });
    }
    const eff = await resolveEffectiveForApp(config, name);
    const repoPath = eff.repoPath;
    if (!repoPath) {
      return res.status(500).json({ error: 'repoPath not resolved for app' });
    }

    const result = await runCheckoutFlow(config, repoPath, branch);
    res.status(result.status).json(result.body);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/api/apps/:name/git/stash/apply', async (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }
    const { stashRef } = req.body ?? {};
    if (!stashRef) {
      return res.status(400).json({ error: 'stashRef is required' });
    }
    const eff = await resolveEffectiveForApp(config, name);
    const repoPath = eff.repoPath;
    if (!repoPath) {
      return res.status(500).json({ error: 'repoPath not resolved for app' });
    }

    const result = await runStashApply(config, repoPath, stashRef);
    res.status(result.status).json(result.body);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

// caller must already have user confirmation; this route does not gate on that itself.
router.post('/api/apps/:name/git/stash/drop', async (req, res) => {
  try {
    const config = getConfig();
    const { name } = req.params;
    if (!config.apps[name]) {
      return res.status(404).json({ error: 'App not found' });
    }
    const { stashRef } = req.body ?? {};
    if (!stashRef) {
      return res.status(400).json({ error: 'stashRef is required' });
    }
    const eff = await resolveEffectiveForApp(config, name);
    const repoPath = eff.repoPath;
    if (!repoPath) {
      return res.status(500).json({ error: 'repoPath not resolved for app' });
    }

    const result = await runStashDrop(config, repoPath, stashRef);
    res.status(result.status).json(result.body);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

export default router;

import { Router } from 'express';
import { getConfig } from '../config/configState';
import { errorMessage } from '../errors';
import {
  getGroupSelectionsPath,
  writeGroupIntent,
  deleteGroupIntent,
  renameGroup,
  pruneGroups,
  GroupAppIntent,
} from '../process/groupSelections';

const router = Router();

router.get('/api/group-selections', (req, res) => {
  try {
    const config = getConfig();
    const liveTags = new Set<string>();
    for (const app of Object.values(config.apps)) {
      for (const tag of app.groups ?? []) {
        liveTags.add(tag);
      }
    }
    const file = getGroupSelectionsPath(config);
    const pruned = pruneGroups(file, Array.from(liveTags));
    res.json(pruned);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.put('/api/group-selections/:group/:app', (req, res) => {
  try {
    const config = getConfig();
    const group = decodeURIComponent(req.params.group);
    const app = decodeURIComponent(req.params.app);
    const patch: GroupAppIntent = {};
    if (req.body?.branch !== undefined) patch.branch = req.body.branch;
    if (req.body?.environment !== undefined) patch.environment = req.body.environment;
    const file = getGroupSelectionsPath(config);
    const merged = writeGroupIntent(file, group, app, patch);
    res.json(merged);
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.delete('/api/group-selections/:group/:app', (req, res) => {
  try {
    const config = getConfig();
    const group = decodeURIComponent(req.params.group);
    const app = decodeURIComponent(req.params.app);
    const file = getGroupSelectionsPath(config);
    deleteGroupIntent(file, group, app);
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/api/group-selections/rename', (req, res) => {
  try {
    const config = getConfig();
    const { from, to } = req.body ?? {};
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to are required' });
    }
    const file = getGroupSelectionsPath(config);
    renameGroup(file, from, to);
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error(`${req.method} ${req.path}`, err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

export default router;

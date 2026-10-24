import { importLoginShellPath } from './process/shellEnv';
import express from 'express';
import cors from 'cors';
import { initConfig } from './config/configState';
import { getGlobalConfigKeys } from './config/configStore';
import './apps/providers/tmuxProvider';
import './apps/providers/detachedProvider';
import './apps/providers/initServiceProvider';
import './apps/providers/windowsServiceProvider';
import configRouter from './routes/config';
import appsRouter from './routes/apps';
import gitRouter from './routes/git';
import devRouter from './routes/dev';
import prefsRouter from './routes/prefs';
import pluginsRouter from './routes/plugins';
import groupSelectionsRouter from './routes/groupSelections';
import instancesRouter from './routes/instances';

importLoginShellPath();

getGlobalConfigKeys();

initConfig();

const app = express();
// LOKI_PORT, not PORT: dev servers read PORT, so a generic name would decide
// the port of the apps Loki starts (see process/appEnv.ts).
const PORT = process.env.LOKI_PORT || 9999;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.use(configRouter);
app.use(appsRouter);
app.use(gitRouter);
app.use(devRouter);
app.use(prefsRouter);
app.use(pluginsRouter);
app.use(groupSelectionsRouter);
app.use(instancesRouter);

// 127.0.0.1 only, the address the UI calls: a dev server on [::1]:9999 can no
// longer take the UI's requests, and one on 127.0.0.1:9999 makes listen fail
// (the Tauri shell then names it) instead of a silent "Connecting…".
// Express 5 hands a listen error (e.g. EADDRINUSE) to this callback.
app.listen(Number(PORT), '127.0.0.1', (err?: Error) => {
  if (err) {
    console.error(`Cannot listen on 127.0.0.1:${PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Loki Dev Orchestrator server running on http://127.0.0.1:${PORT}`);
});

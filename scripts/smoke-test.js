"use strict";

/*
 * End-to-end smoke test for the backend and desktop launch modes and the config-location
 * contract (isolated CONFIG_FILE profiles in dev and packaged modes):
 *
 *   dev       ts-node app/backend/server.ts, cwd = tmp sandbox
 *   compiled  tsc output in dist/backend, cwd = tmp sandbox
 *   packaged  esbuild bundle resources/server.js, cwd = filesystem root,
 *             CONFIG_FILE env (mirrors the env the Rust side passes in main.rs)
 *   app       full `yarn desktop:build` + launching what the bundler produced
 *
 * Runs on macOS, Linux and Windows. The `app` stage is the one that differs:
 * macOS launches the `.app`, Linux the AppImage, and Windows the bare release
 * binary (its bundles are installers, which install rather than run) — see
 * `appTarget()` for what that costs in evidence.
 *
 * Usage: node scripts/smoke-test.js [dev] [compiled] [packaged] [app|all]
 * No args = dev + compiled + packaged (fast). `app` only when asked for.
 *
 * Each stage asserts: server comes up, /api/config answers, /api/config/path
 * points at the expected file, the file exists on disk, a PATCH to
 * /api/config/global lands in that file (and is rolled back), and state/logs
 * stay anchored next to the config — never in cwd or /state.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn, execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const results = [];

const IS_WIN = process.platform === "win32";

// The filesystem root — "/" on POSIX, "C:\" (or whatever drive holds the repo)
// on Windows. Used as the "cwd the packaged app inherits", i.e. somewhere that
// is emphatically not the repo, so a server that writes state relative to cwd
// gets caught instead of quietly landing in the checkout.
const FS_ROOT = path.parse(process.cwd()).root;

function crateName() {
  const cargo = fs.readFileSync(
    path.join(repoRoot, "app", "src-tauri", "Cargo.toml"),
    "utf-8"
  );
  const m = cargo.match(/^\s*name\s*=\s*"([^"]+)"/m);
  assert(m, "crate name readable from app/src-tauri/Cargo.toml");
  return m[1];
}

// Where Tauri's `app_config_dir()` lands per OS — it is `dirs::config_dir()`
// joined with the bundle identifier.
function appConfigDir(identifier) {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", identifier);
  }
  if (IS_WIN) {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, identifier);
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, identifier);
}

// Resolve what to actually launch for the `app` stage.
//
// Only macOS and Linux can run what the bundler produced: a `.app` directory,
// and an AppImage (with APPIMAGE_EXTRACT_AND_RUN so no FUSE is needed on CI).
// Windows bundles are NSIS/MSI *installers* — running one installs the app, it
// does not start it — so there the stage falls back to the bare release binary
// and says so. That fallback proves the server boots and the config lands in
// the right place; it does NOT prove resource bundling, because `resource_dir()`
// resolves differently for an unbundled binary. Treat a Windows/Linux-fallback
// pass as weaker evidence than a macOS pass, and do not read it as "bundling
// works here".
function appTarget() {
  const releaseDir = path.join(repoRoot, "app", "src-tauri", "target", "release");
  const bundleRoot = path.join(releaseDir, "bundle");
  const bare = path.join(releaseDir, IS_WIN ? `${crateName()}.exe` : crateName());

  if (process.platform === "darwin") {
    const macDir = path.join(bundleRoot, "macos");
    const appName = fs.readdirSync(macDir).find((f) => f.endsWith(".app"));
    assert(appName, `.app bundle found in ${macDir}`);
    const macosDir = path.join(macDir, appName, "Contents", "MacOS");
    return { binary: path.join(macosDir, fs.readdirSync(macosDir)[0]), env: {}, bundled: true };
  }

  if (!IS_WIN) {
    const appImageDir = path.join(bundleRoot, "appimage");
    const appImage = fs.existsSync(appImageDir)
      ? fs.readdirSync(appImageDir).find((f) => f.endsWith(".AppImage"))
      : undefined;
    if (appImage) {
      return {
        binary: path.join(appImageDir, appImage),
        env: { APPIMAGE_EXTRACT_AND_RUN: "1" },
        bundled: true,
      };
    }
  }

  assert(fs.existsSync(bare), `release binary exists: ${bare}`);
  return { binary: bare, env: {}, bundled: false };
}

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
  log(`ok: ${msg}`);
}

// macOS: /var is a symlink to /private/var — compare real paths.
function samePath(a, b) {
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  return real(a) === real(b);
}

async function pollUntil(fn, deadlineMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return fn();
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.on("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
  });
}

async function waitForServer(port, child, deadlineMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    if (child && child.exitCode !== null) {
      throw new Error(`server process exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/config`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server did not answer on :${port} within ${deadlineMs}ms`);
}

async function killAndWait(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const deadline = Date.now() + 5000;
  while (child.exitCode === null && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function assertConfigApi(port, expectedConfigPath) {
  const base = `http://127.0.0.1:${port}`;

  const cfgRes = await fetch(`${base}/api/config`);
  assert(cfgRes.ok, `GET /api/config -> ${cfgRes.status}`);
  const cfg = await cfgRes.json();
  assert(typeof cfg.apps === "object" && cfg.apps !== null, "config has apps object");
  assert(typeof cfg.global === "object" && cfg.global !== null, "config has global object");

  const catalogResponse = await fetch(`${base}/api/plugins/catalog`);
  assert(catalogResponse.ok, "GET /api/plugins/catalog -> 200");
  const catalog = await catalogResponse.json();
  assert(Array.isArray(catalog.entries) && catalog.entries.length > 0, "marketplace resolves independently of cwd");

  const pathRes = await fetch(`${base}/api/config/path`);
  assert(pathRes.ok, `GET /api/config/path -> ${pathRes.status}`);
  const { path: reportedPath } = await pathRes.json();
  assert(
    samePath(reportedPath, expectedConfigPath),
    `config path is ${expectedConfigPath} (got ${reportedPath})`
  );
  assert(fs.existsSync(expectedConfigPath), `config file exists on disk: ${expectedConfigPath}`);

  // Write check: PATCH a harmless global key, confirm it lands in the file,
  // then roll it back (null deletes the key in patchGlobalConfig).
  const before = JSON.parse(fs.readFileSync(expectedConfigPath, "utf-8"));
  const hadValue = before.global && "packageManager" in before.global ? before.global.packageManager : undefined;
  const marker = `smoke-${process.pid}`;
  try {
    const patchRes = await fetch(`${base}/api/config/global`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageManager: marker }),
    });
    assert(patchRes.ok, `PATCH /api/config/global -> ${patchRes.status}`);
    // The route responds before the queued file write lands (mutate* helpers
    // are async and not awaited in routes/config.ts) — poll briefly.
    const written = await pollUntil(() => {
      const after = JSON.parse(fs.readFileSync(expectedConfigPath, "utf-8"));
      return after.global && after.global.packageManager === marker;
    });
    assert(written, `PATCH value written into ${expectedConfigPath}`);
  } finally {
    await fetch(`${base}/api/config/global`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageManager: hadValue === undefined ? null : hadValue }),
    }).catch(() => {});
  }

  const reloadRes = await fetch(`${base}/api/config/reload`, { method: "POST" });
  assert(reloadRes.ok, `POST /api/config/reload -> ${reloadRes.status}`);
  const reload = await reloadRes.json();
  assert(samePath(reload.path, expectedConfigPath), "reload reports same config path");
}

function snapshotRootState() {
  // Guard: a packaged run whose cwd is the filesystem root must never create
  // a `state` directory there.
  return fs.existsSync(path.join(FS_ROOT, "state"));
}

async function stageDev(compiled = false) {
  if (compiled) {
    execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", repoRoot], {
      cwd: repoRoot, stdio: "inherit",
    });
  }
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "loki-smoke-dev-"));
  const port = await freePort();
  const expectedConfig = path.join(sandbox, "state", "loki-config.json");
  log(`dev: sandbox=${sandbox} port=${port}`);

  const child = spawn(
    process.execPath,
    compiled
      ? [path.join(repoRoot, "dist", "backend", "server.js")]
      : [require.resolve("ts-node/dist/bin.js"), path.join(repoRoot, "app", "backend", "server.ts")],
    {
      cwd: sandbox,
      env: { ...process.env, LOKI_PORT: String(port), CONFIG_FILE: expectedConfig },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  try {
    await waitForServer(port, child);
    assert(fs.existsSync(expectedConfig), `config auto-created at ${expectedConfig}`);
    const cfg = JSON.parse(fs.readFileSync(expectedConfig, "utf-8"));
    assert(
      !cfg.global || !path.isAbsolute(cfg.global.stateFile || ""),
      "auto-created stateFile is relative (portable)"
    );
    assert(
      !fs.existsSync(path.join(sandbox, "state", "state")),
      "no nested state/state"
    );
    await assertConfigApi(port, expectedConfig);
    const stateFile = path.join(sandbox, "state", "state.json");
    // state.json is written lazily; its *configured* location is what matters.
    const loaded = JSON.parse(fs.readFileSync(expectedConfig, "utf-8"));
    const stateRel = (loaded.global && loaded.global.stateFile) || "state.json";
    assert(
      path.resolve(path.dirname(expectedConfig), stateRel) === stateFile,
      "stateFile resolves next to config"
    );
  } catch (err) {
    console.error(output.slice(-3000));
    throw err;
  } finally {
    await killAndWait(child);
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

async function stagePackaged() {
  log("packaged: building bundle (yarn server:build:packaged)...");
  execFileSync(process.execPath, [path.join(repoRoot, "scripts", "build-packaged-server.js")], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  const resourcesDir = path.join(repoRoot, "dist", "resources");
  const serverJs = path.join(resourcesDir, "server.js");
  assert(fs.existsSync(serverJs), `bundle exists: ${serverJs}`);

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "loki-smoke-pkg-"));
  const port = await freePort();
  const expectedConfig = path.join(sandbox, "loki-config.json");
  const rootStateBefore = snapshotRootState();
  log(`packaged: sandbox=${sandbox} port=${port}`);

  const child = spawn(process.execPath, [serverJs], {
    // The packaged Rust side sets no current_dir, so the child inherits
    // whatever the launcher had — "/" for a macOS .app. FS_ROOT is the
    // per-OS stand-in for "not the repo".
    cwd: FS_ROOT,
    env: {
      ...process.env,
      LOKI_PORT: String(port),
      CONFIG_FILE: expectedConfig,
      APP_LOG_DIR: path.join(sandbox, "logs"),
      CATALOG_FILE: path.join(resourcesDir, "catalog.json"),
      MARKETPLACE_DIR: path.join(resourcesDir, "marketplace"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  try {
    await waitForServer(port, child);
    assert(fs.existsSync(expectedConfig), `config auto-created at CONFIG_FILE: ${expectedConfig}`);
    assert(
      !fs.existsSync(path.join(sandbox, "state")),
      "no state nesting next to CONFIG_FILE"
    );
    await assertConfigApi(port, expectedConfig);
    const loaded = JSON.parse(fs.readFileSync(expectedConfig, "utf-8"));
    const stateRel = (loaded.global && loaded.global.stateFile) || "state.json";
    assert(
      path.resolve(path.dirname(expectedConfig), stateRel) === path.join(sandbox, "state.json"),
      "stateFile resolves next to CONFIG_FILE"
    );
    assert(
      snapshotRootState() === rootStateBefore,
      `nothing appeared in ${path.join(FS_ROOT, "state")} despite cwd=${FS_ROOT}`
    );
  } catch (err) {
    console.error(output.slice(-3000));
    throw err;
  } finally {
    await killAndWait(child);
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

async function stageApp() {
  if (await portInUse(9999)) {
    throw new Error(
      "port 9999 is already in use — the packaged app hardcodes it (Rust main.rs). Stop whatever runs there first."
    );
  }

  log("app: full tauri build (yarn desktop:build) — this is slow...");
  execFileSync(IS_WIN ? "cmd.exe" : "yarn", IS_WIN ? ["/d", "/s", "/c", "yarn desktop:build"] : ["desktop:build"], { cwd: repoRoot, stdio: "inherit" });

  const target = appTarget();
  if (!target.bundled) {
    log(
      `app: WARNING — launching the unbundled release binary (${process.platform}). ` +
        "This checks startup and config location only; resource bundling is NOT proven here."
    );
  }
  log(`app: launching ${target.binary}`);

  const tauriConf = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "app", "src-tauri", "tauri.conf.json"), "utf-8")
  );
  const identifier = tauriConf.identifier;
  assert(identifier, "tauri.conf.json has identifier");
  const expectedConfig = path.join(appConfigDir(identifier), "loki-config.json");

  // Non-destructive: back up the user's real config if present, restore after.
  const backup = fs.existsSync(expectedConfig)
    ? fs.readFileSync(expectedConfig, "utf-8")
    : null;
  if (backup !== null) log(`app: existing user config backed up in memory (${expectedConfig})`);

  const child = spawn(target.binary, [], {
    env: { ...process.env, ...target.env, CONFIG_FILE: expectedConfig },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  try {
    await waitForServer(9999, child, 60000);
    assert(fs.existsSync(expectedConfig), `config exists in app_config_dir: ${expectedConfig}`);
    await assertConfigApi(9999, expectedConfig);
  } catch (err) {
    console.error(output.slice(-3000));
    throw err;
  } finally {
    await killAndWait(child);
    if (backup !== null) {
      fs.writeFileSync(expectedConfig, backup);
      log("app: user config restored");
    }
  }
}

const STAGES = { dev: stageDev, compiled: () => stageDev(true), packaged: stagePackaged, app: stageApp };

async function main() {
  let requested = process.argv.slice(2);
  if (requested.includes("all")) requested = ["dev", "compiled", "packaged", "app"];
  if (requested.length === 0) requested = ["dev", "compiled", "packaged"];
  const unknown = requested.filter((s) => !STAGES[s]);
  if (unknown.length) {
    console.error(`unknown stage(s): ${unknown.join(", ")} (valid: dev, compiled, packaged, app, all)`);
    process.exit(2);
  }

  for (const name of requested) {
    log(`=== stage: ${name} ===`);
    try {
      await STAGES[name]();
      results.push({ name, ok: true });
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
    }
  }

  console.log("\n=== smoke summary ===");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  — ${r.error}`}`);
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

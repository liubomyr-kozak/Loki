"use strict";

/*
 * Prerequisite check for the desktop build.
 *
 * Contract, borrowed from CodexMonitor's doctor: this script DETECTS AND
 * REPORTS, it never installs anything. Repos that install prerequisites on
 * your behalf are how a machine ends up with three Node versions and no idea
 * which one the app uses.
 *
 * Every failure prints what is wrong, what is needed, and the per-OS command
 * to fix it — a check that only says "missing" moves the problem instead of
 * solving it.
 *
 * Usage: node scripts/doctor.js [--strict]
 *   --strict  exit 1 on any failure, so it can gate a script chain
 */

const { execFileSync } = require("child_process");

const strict = process.argv.includes("--strict");
const IS_WIN = process.platform === "win32";

// Matches backend/plugins/pluginStore.ts, which uses `fetch` unpolyfilled, and
// MIN_NODE_MAJOR in app/src-tauri/src/main.rs. Keep the three in step.
const MIN_NODE_MAJOR = 18;

const failures = [];

function ok(msg) {
  console.log(`  ok   ${msg}`);
}

function fail(what, why, fixes) {
  console.log(`  FAIL ${what}`);
  console.log(`       ${why}`);
  for (const line of fixes) console.log(`       → ${line}`);
  failures.push(what);
}

function run(cmd, args) {
  try {
    const useCmd = IS_WIN && cmd === "yarn";
    return execFileSync(useCmd ? "cmd.exe" : cmd,
      useCmd ? ["/d", "/s", "/c", "yarn --version"] : args,
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function checkGit() {
  const version = run("git", ["--version"]);
  if (version) return ok(version);
  fail("git", "required for repository and branch operations", [
    "macOS: xcode-select --install",
    "Windows: winget install --id Git.Git -e",
    "Linux: install git using your distro package manager",
  ]);
}

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= MIN_NODE_MAJOR) {
    ok(`node ${process.versions.node}`);
    return;
  }
  fail(
    "node",
    `found ${process.versions.node}, need ${MIN_NODE_MAJOR} or newer (the backend uses global fetch)`,
    [
      "macOS:   brew install node",
      "Linux:   use your distro package or https://github.com/nvm-sh/nvm",
      "Windows: winget install OpenJS.NodeJS.LTS",
    ]
  );
}

function checkYarn() {
  // The repo pins yarn 4 through `packageManager` and does not vendor the
  // binary under .yarn/releases — so Corepack (or a separately installed
  // Yarn 4) is a genuine prerequisite, not an implementation detail.
  const version = run("yarn", ["--version"]);
  if (!version) {
    fail("yarn", "not found on PATH; this repo pins yarn 4 via packageManager", [
      "corepack enable    (if missing: npm install --global corepack)",
      "or install Yarn 4 directly: https://yarnpkg.com/getting-started/install",
    ]);
    return;
  }
  const major = Number(version.split(".")[0]);
  if (major < 4) {
    fail("yarn", `found ${version}, need 4.x (packageManager pins it)`, [
      "corepack enable    then re-run — Corepack honours the pin automatically",
    ]);
    return;
  }
  ok(`yarn ${version}`);
}

function checkCargo() {
  // The Tauri CLI shells out to cargo. Previously the desktop script prepended
  // ~/.cargo/bin to PATH inline — POSIX-only syntax that silently made this a
  // hidden requirement on Windows. It is now an explicit, checked one.
  const version = run("cargo", ["--version"]);
  if (!version) {
    fail("cargo", "not found on PATH; the Tauri shell is a Rust binary", [
      "install Rust: https://rustup.rs",
      "then make sure ~/.cargo/bin (%USERPROFILE%\\.cargo\\bin on Windows) is on PATH",
    ]);
    return;
  }
  ok(version);
}

console.log("[doctor] checking desktop build prerequisites (detect only — nothing is installed)");
checkNode();
checkYarn();
checkCargo();
checkGit();

if (failures.length === 0) {
  console.log("[doctor] basic prerequisites present; run yarn tauri info to inspect native dependencies");
  process.exit(0);
}

console.log(`[doctor] ${failures.length} missing: ${failures.join(", ")}`);
if (strict) {
  console.log("[doctor] --strict: stopping here rather than failing later with a confusing error");
  process.exit(1);
}
process.exit(0);

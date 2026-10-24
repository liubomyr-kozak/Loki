"use strict";

/*
 * Recreates the demo apps' git repositories.
 *
 * Why this exists: Loki orchestrates git repos, so the three demo apps under
 * `demo/` have to BE git repos — the git-log / git-actions plugins and the
 * branch switcher have nothing to show otherwise. Their `.git` directories
 * were created by hand on one machine, and git never stores a nested `.git`
 * in the outer repository. So a fresh `git clone` of Loki produced demo apps
 * that were plain files with no history and no branches: the demo silently
 * did not work for anyone but the person who first set it up.
 *
 * The feature branches are the demo content — "switch demo-backend to
 * feature-error-mode and watch it restart" is the whole point — so they are
 * checked in as patches under `demo/.repo-seeds/<app>/<branch>.patch`
 * (produced by `git format-patch`, which carries the commit message, author
 * and date, so a rebuilt repo is not an approximation).
 *
 * Non-destructive by construction: an app that already has a `.git` is left
 * completely alone. Use --force to rebuild one anyway — that DELETES its
 * existing history, so it asks for the flag explicitly.
 *
 * Usage: node scripts/init-demo-repos.js [--force]
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const demoDir = path.join(repoRoot, "demo");
const seedsDir = path.join(demoDir, ".repo-seeds");
const force = process.argv.includes("--force");

function log(msg) {
  console.log(`[demo-repos] ${msg}`);
}

function git(cwd, args, input) {
  return execFileSync("git", args, {
    cwd,
    input,
    encoding: "utf-8",
    stdio: input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
}

// The app directories are exactly the ones the demo config names, so the two
// cannot drift apart into "a repo nobody uses" or "an app with no repo".
function demoApps() {
  const config = JSON.parse(fs.readFileSync(path.join(demoDir, "loki-config.json"), "utf-8"));
  return Object.values(config.apps).map((app) => app.repoPath);
}

function seedPatches(app) {
  const dir = path.join(seedsDir, app);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".patch"))
    .sort()
    .map((f) => ({ branch: path.basename(f, ".patch"), file: path.join(dir, f) }));
}

function buildRepo(app) {
  const dir = path.join(demoDir, app);
  const gitDir = path.join(dir, ".git");

  if (!fs.existsSync(dir)) {
    log(`SKIP ${app}: no such directory`);
    return;
  }

  if (fs.existsSync(gitDir)) {
    if (!force) {
      log(`skip ${app}: already a git repo (use --force to rebuild from seeds)`);
      return;
    }
    log(`${app}: --force, removing existing history`);
    fs.rmSync(gitDir, { recursive: true, force: true });
  }

  // Mail patches use LF. Pin text normalization inside each standalone repo,
  // including clones checked out as CRLF and machines without a Git config.
  const attributes = path.join(dir, ".gitattributes");
  if (!fs.existsSync(attributes)) fs.writeFileSync(attributes, "* text=auto eol=lf\n");
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["add", "-A"]);
  git(dir, [
    "-c",
    "user.name=Loki Demo",
    "-c",
    "user.email=demo@loki.local",
    "commit",
    "-q",
    "-m",
    `Initial commit: ${app}`,
  ]);

  const patches = seedPatches(app);
  for (const { branch, file } of patches) {
    git(dir, ["checkout", "-q", "-b", branch, "main"]);
    // `git am` replays the patch as a real commit with the recorded message,
    // so the branch reads the same as the hand-made original did.
    git(dir, ["-c", "user.name=Loki Demo", "-c", "user.email=demo@loki.local", "am", "-q"], fs.readFileSync(file));
  }
  git(dir, ["checkout", "-q", "main"]);

  log(`${app}: main + ${patches.length} branch(es) [${patches.map((p) => p.branch).join(", ")}]`);
}

const apps = demoApps();
log(`${apps.length} demo app(s) from demo/loki-config.json`);
for (const app of apps) buildRepo(app);
log("done");

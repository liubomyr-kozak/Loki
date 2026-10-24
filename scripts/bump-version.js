"use strict";

/*
 * Auto version bump (git pre-commit hook).
 * On every commit this bumps the MINOR version (x.y.z -> x.(y+1).0) in lockstep across
 *   package.json, app/src-tauri/tauri.conf.json, app/src-tauri/Cargo.toml, then git-adds them
 *   so the bump lands in the same commit. Source of truth: root package.json version.
 * Guards (skip bump): rebase/merge in progress, or nothing "real" staged besides the version files.
 * Accepted, documented limitations (by design — bump fires on EVERY commit):
 *   - Rebasing branches that each carry bump commits will conflict on these 3 files.
 *   - `git commit --amend` that stages NEW content bumps again (a minor number is skipped);
 *     an --amend with no new content does NOT bump.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function bumpMinor(version) {
  const [major, minor] = version.split(".").map(Number);
  return `${major}.${minor + 1}.0`;
}

function isRebaseOrMergeInProgress() {
  const check = (gitPathArg) => {
    try {
      const p = execSync(`git rev-parse --git-path ${gitPathArg}`, {
        encoding: "utf8",
      }).trim();
      return fs.existsSync(p);
    } catch {
      return false;
    }
  };
  if (check("rebase-merge")) return true; // interactive/merge-based rebase in progress
  if (check("rebase-apply")) return true; // am-based rebase (or `git am`) in progress
  try {
    execSync("git rev-parse -q --verify MERGE_HEAD", {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true; // MERGE_HEAD exists -> a merge commit is being made
  } catch {
    return false; // MERGE_HEAD absent -> not a merge commit
  }
}

function main() {
  const repoRoot = path.join(__dirname, "..");
  const rootPkgPath = path.join(repoRoot, "package.json");
  const tauriConfPath = path.join(repoRoot, "app", "src-tauri", "tauri.conf.json");
  const cargoTomlPath = path.join(repoRoot, "app", "src-tauri", "Cargo.toml");

  // a. Top-of-script idempotency short-circuit: if HEAD's version already bumped
  // and all three version files are already staged, this invocation is a no-op.
  try {
    const headPkgRaw = execSync("git show HEAD:package.json", {
      encoding: "utf8",
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const headPkg = JSON.parse(headPkgRaw);
    const headTarget = bumpMinor(headPkg.version);

    const stagedRawShort = execSync("git diff --cached --name-only", {
      encoding: "utf8",
      cwd: repoRoot,
    });
    const stagedAbsShort = new Set(
      stagedRawShort
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => path.resolve(repoRoot, f))
    );

    const allThreeStaged =
      stagedAbsShort.has(path.resolve(rootPkgPath)) &&
      stagedAbsShort.has(path.resolve(tauriConfPath)) &&
      stagedAbsShort.has(path.resolve(cargoTomlPath));

    const workingPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));

    if (allThreeStaged && workingPkg.version === headTarget) {
      process.exit(0);
    }
  } catch {
    // no HEAD (first commit) or other failure reading HEAD state -> fall through
    // to the normal flow below.
  }

  // b. Rebase/merge-in-progress guard.
  if (isRebaseOrMergeInProgress()) {
    process.exit(0);
  }

  // c. "No real change staged" guard (combined FR-5/FR-6/FR-7-amend guard).
  const VERSION_FILES = new Set([
    path.resolve(rootPkgPath),
    path.resolve(tauriConfPath),
    path.resolve(cargoTomlPath),
  ]);

  const stagedRaw = execSync("git diff --cached --name-only", {
    encoding: "utf8",
    cwd: repoRoot,
  });
  const stagedAbs = stagedRaw
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => path.resolve(repoRoot, f));

  const realChanges = stagedAbs.filter((f) => !VERSION_FILES.has(f));

  if (realChanges.length === 0) {
    process.exit(0);
  }

  // d. Read current version and compute target.
  const rootPkgRaw = fs.readFileSync(rootPkgPath, "utf8");
  const rootPkg = JSON.parse(rootPkgRaw);
  const current = rootPkg.version;
  const target = bumpMinor(current);

  // e. Write all three files in lockstep.
  rootPkg.version = target;
  fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");

  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
  tauriConf.version = target;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");

  const cargoRaw = fs.readFileSync(cargoTomlPath, "utf8");
  const cargoNew = cargoRaw.replace(
    /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]*(")/,
    `$1${target}$2`
  );
  fs.writeFileSync(cargoTomlPath, cargoNew);

  // f. git add the three files.
  execSync(
    `git add ${JSON.stringify(rootPkgPath)} ${JSON.stringify(
      tauriConfPath
    )} ${JSON.stringify(cargoTomlPath)}`,
    { cwd: repoRoot }
  );
}

// g. Exit code contract: never exit non-zero.
try {
  main();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(0);
}

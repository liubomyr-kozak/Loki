"use strict";

/*
 * Puts a pinned, checksum-verified Node.js runtime into dist/resources/node/
 * so the packaged app runs its backend without a Node install on the user's
 * machine. The Rust side looks for it first (bundled_node() in
 * app/src-tauri/src/main.rs) and only falls back to discover_node()'s ladder
 * when it is missing or does not run.
 *
 *   dist/resources/node/node        (macOS / Linux)
 *   dist/resources/node/node.exe    (Windows)
 *
 * The target comes from the Tauri CLI, which exports TAURI_ENV_PLATFORM and
 * TAURI_ENV_ARCH to beforeBuildCommand, so `yarn build --target
 * x86_64-apple-darwin` on an Apple Silicon machine bundles an x64 Node. Run
 * directly, it falls back to the current machine.
 *
 * Downloads are cached in node_modules/.cache/loki-node/ and verified against
 * the SHA-256 sums pinned below (copied from nodejs.org's SHASUMS256.txt for
 * NODE_VERSION). Bumping the version means replacing every sum.
 *
 * Usage: node scripts/bundle-node-runtime.js
 *   LOKI_BUNDLE_NODE=0  skip and remove any bundled runtime (installer then
 *                       needs Node 18+ on the target machine)
 */

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const NODE_VERSION = "22.23.3";

// Key: `${platform}-${arch}` in Node's own naming.
const DIST = {
  "darwin-arm64": {
    file: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    sha256: "23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53",
  },
  "darwin-x64": {
    file: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    sha256: "8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8",
  },
  "linux-arm64": {
    file: `node-v${NODE_VERSION}-linux-arm64.tar.gz`,
    sha256: "5ced2d48d1d7198739b7f86804de0171aefb6823b684b12341d3321afc3cb0b2",
  },
  "linux-x64": {
    file: `node-v${NODE_VERSION}-linux-x64.tar.gz`,
    sha256: "1084aa36196bba4c3a5e69a1ee388a6e4ff729dad09445fbcd434b28fe3c24af",
  },
  // Windows publishes the bare executable, so no archive tool is needed there.
  "win-arm64": {
    file: "win-arm64/node.exe",
    sha256: "b5a3165ec6f24c0b1fe2a10fed58e03f6c1d7d141beb3b225ff030ceac6c5eb5",
  },
  "win-x64": {
    file: "win-x64/node.exe",
    sha256: "9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e",
  },
};

const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "dist", "resources", "node");
const cacheDir = path.join(repoRoot, "node_modules", ".cache", "loki-node");

function target() {
  const platform = {
    darwin: "darwin",
    macos: "darwin",
    windows: "win",
    win32: "win",
    linux: "linux",
  }[process.env.TAURI_ENV_PLATFORM || process.platform];
  const arch = {
    aarch64: "arm64",
    arm64: "arm64",
    x86_64: "x64",
    x64: "x64",
  }[process.env.TAURI_ENV_ARCH || process.arch];
  return platform && arch ? `${platform}-${arch}` : null;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function download(entry, dest) {
  if (fs.existsSync(dest) && sha256(dest) === entry.sha256) {
    console.log(`[bundle-node] using cached ${path.basename(dest)}`);
    return;
  }
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${entry.file}`;
  console.log(`[bundle-node] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  const tmp = `${dest}.part`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  const actual = sha256(tmp);
  if (actual !== entry.sha256) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`checksum mismatch for ${entry.file}: expected ${entry.sha256}, got ${actual}`);
  }
  fs.renameSync(tmp, dest);
}

async function main() {
  if (process.env.LOKI_BUNDLE_NODE === "0") {
    fs.rmSync(outDir, { recursive: true, force: true });
    console.log("[bundle-node] LOKI_BUNDLE_NODE=0: not bundling Node; the installed app will need Node 18+");
    return;
  }

  const key = target();
  const entry = key && DIST[key];
  if (!entry) {
    throw new Error(
      `no pinned Node build for ${key || `${process.platform}/${process.arch}`}; ` +
        "set LOKI_BUNDLE_NODE=0 to build without a bundled runtime"
    );
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const archive = path.join(cacheDir, `${key}-${path.basename(entry.file)}`);
  await download(entry, archive);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const isWin = key.startsWith("win-");
  const binOut = path.join(outDir, isWin ? "node.exe" : "node");
  if (isWin) {
    fs.copyFileSync(archive, binOut);
  } else {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "loki-node-"));
    try {
      const inner = `${path.basename(entry.file, ".tar.gz")}/bin/node`;
      execFileSync("tar", ["-xzf", archive, "-C", stage, inner], { stdio: "inherit" });
      fs.copyFileSync(path.join(stage, inner), binOut);
      fs.chmodSync(binOut, 0o755);
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }

  // Node's license must ship with its binary.
  const license = path.join(outDir, "LICENSE.txt");
  fs.writeFileSync(
    license,
    `Node.js v${NODE_VERSION} is bundled under the MIT license and third-party ` +
      `licenses listed at https://github.com/nodejs/node/blob/v${NODE_VERSION}/LICENSE\n`
  );

  console.log(`[bundle-node] wrote ${binOut} (Node ${NODE_VERSION}, ${key})`);
}

main().catch((err) => {
  console.error(`[bundle-node] ${err.message}`);
  process.exit(1);
});

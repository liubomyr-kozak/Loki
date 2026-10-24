"use strict";

/*
 * Packaged-app server build (task-3, Д-3/Д-8).
 *
 * Bundles backend/server.ts into a single CJS file via esbuild, plus copies the
 * plugin catalog and the marketplace plugin trees (manifest.json + code) next
 * to it, all landing under a `resources/` subfolder whose relative layout the
 * Rust side depends on verbatim (`resource_dir().join("resources")` in
 * app/src-tauri/src/main.rs):
 *
 *   dist/resources/server.js
 *   dist/resources/catalog.json
 *   dist/resources/marketplace/catalog.json
 *   dist/resources/marketplace/<plugin-id>/...
 *
 * This script is the SINGLE owner of that layout. `tauri.conf.json`
 * deliberately mirrors the whole directory with one entry
 * (`"../../dist/resources/": "resources/"`) rather than listing files:
 * an itemised list is a second declaration of the same layout, and it drifted
 * — `marketplace/` was written here but never listed there, so every plugin
 * silently failed to load in packaged builds while the catalog still listed
 * them. Add files here; the bundler follows automatically.
 *
 * The catalog and marketplace plugin trees now live under the repo-root
 * `marketplace/` directory (the marketplace-by-reference refactor removed the
 * old `examples/` directory entirely — plugins are loaded directly from
 * `marketplace/<id>/` with no install-copy step).
 *
 * `typescript` is intentionally left to be inlined by esbuild (static
 * `import * as ts from 'typescript'` in backend/plugins/runtime.ts, task-2's
 * packaged fallback transpile hook) — do NOT add `--external:typescript`.
 *
 * `ts-node` is externalized because nothing reaches it any more: plugin
 * loading now uses `ts.transpileModule` in every mode (backend/plugins/
 * runtime.ts), so dev and packaged compile plugins identically instead of the
 * old split where only packaged builds took the transpile path. Externalizing
 * keeps a dev-only, TS-compiler-heavy package out of the bundle.
 */

const fs = require("fs");
const path = require("path");
const { buildSync } = require("esbuild");

const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "dist", "resources");
const serverOut = path.join(outDir, "server.js");
const marketplaceSrc = path.join(repoRoot, "marketplace");
const catalogSrc = path.join(marketplaceSrc, "catalog.json");
const catalogOut = path.join(outDir, "catalog.json");
const marketplaceOut = path.join(outDir, "marketplace");
const pkgOut = path.join(outDir, "package.json");

fs.mkdirSync(outDir, { recursive: true });

buildSync({
  entryPoints: [path.join(repoRoot, "app", "backend", "server.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["ts-node"],
  define: { "process.env.LOKI_PACKAGED": '"1"' },
  outfile: serverOut,
});

fs.copyFileSync(catalogSrc, catalogOut);

// Ship the actual marketplace plugin trees (manifest.json + code) alongside
// catalog.json — without this, the packaged app's marketplaceDir() resolves
// to an empty (or nonexistent) directory and every plugin silently fails to
// load, even though the catalog lists them.
fs.rmSync(marketplaceOut, { recursive: true, force: true });
fs.cpSync(marketplaceSrc, marketplaceOut, {
  recursive: true,
  filter: (src) => path.basename(src) !== "_archive",
});

// Node resolves a file's module type (CJS vs ESM) from the nearest ancestor
// `package.json`'s `"type"` field, walking *up* the directory tree — not from
// the bundler's output format. This bundle is CJS (esbuild `--format=cjs`), so
// any ancestor package.json declaring `"type": "module"` would make Node load
// it as ESM and crash immediately with "ReferenceError: require is not defined
// in ES module scope" — both when run in place from the repo build dir and
// inside the packaged app, whose install path Node still walks up through.
// (The old `desktop/package.json` used to be exactly such an ancestor; the
// single-package merge removed it, but the install path is outside our
// control, so keep pinning.) Pin this directory's module type explicitly so
// `server.js` is always interpreted as CommonJS regardless of ancestors.
fs.writeFileSync(pkgOut, JSON.stringify({ type: "commonjs" }, null, 2) + "\n");

console.log(`[build-packaged-server] wrote ${serverOut}`);
console.log(`[build-packaged-server] wrote ${catalogOut}`);
console.log(`[build-packaged-server] wrote ${marketplaceOut}`);
console.log(`[build-packaged-server] wrote ${pkgOut}`);

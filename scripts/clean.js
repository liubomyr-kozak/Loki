"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
// Generated JS outputs only. Cargo keeps its incremental cache in target/.
for (const relative of ["dist"]) {
  fs.rmSync(path.join(root, relative), { recursive: true, force: true });
  console.log(`[clean] ${relative}`);
}

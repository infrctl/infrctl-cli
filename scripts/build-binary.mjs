#!/usr/bin/env node
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

const targets = {
  "linux-x64": "node20-linux-x64",
  "linux-arm64": "node20-linux-arm64",
  "darwin-x64": "node20-macos-x64",
  "darwin-arm64": "node20-macos-arm64",
  "win32-x64": "node20-win-x64"
};

function platformKey() {
  const override = process.env.INFRCTL_BINARY_PLATFORM;

  if (override) {
    return override;
  }

  return `${process.platform}-${process.arch}`;
}

function runNodeScript(script, args) {
  execFileSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: "inherit",
    env: process.env
  });
}

const key = platformKey();
const target = process.env.PKG_TARGET ?? targets[key];

if (!target) {
  console.error(`Unsupported binary target: ${key}`);
  console.error(`Supported targets: ${Object.keys(targets).join(", ")}`);
  process.exit(1);
}

const binaryName = process.env.INFRCTL_BINARY_NAME ?? `infrctl-${key}`;
const exeName = key.startsWith("win32") ? "infrctl.exe" : "infrctl";
const outDir = join(root, "dist-bin", binaryName);
const outFile = join(outDir, exeName);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

runNodeScript(require.resolve("tsup/dist/cli-default.js"), [
  "--config",
  "tsup.binary.config.ts"
]);
runNodeScript(require.resolve("@yao-pkg/pkg/lib-es5/bin.js"), [
  "dist-standalone/standalone.cjs",
  "--targets",
  target,
  "--output",
  outFile
]);

if (!key.startsWith("win32")) {
  chmodSync(outFile, 0o755);
}

console.log(`Built ${outFile}`);

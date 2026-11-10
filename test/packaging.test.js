import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fixture, repoRoot } from "../test-support/fixtures.js";

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, npm_config_update_notifier: "false" }
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

function npm(args, cwd) {
  // npm test supplies npm_execpath, avoiding a shell and working on Windows too.
  return process.env.npm_execpath
    ? run(process.execPath, [process.env.npm_execpath, ...args], cwd)
    : run(process.platform === "win32" ? "npm.cmd" : "npm", args, cwd);
}

test("packed artifact installs offline and exposes a working CLI and API", async (t) => {
  const root = await fixture(t);
  const archiveDir = path.join(root, "artifacts");
  const consumerDir = path.join(root, "consumer");
  const cache = path.join(root, "npm-cache");
  await fs.mkdir(archiveDir);
  await fs.mkdir(consumerDir);
  await fs.writeFile(path.join(consumerDir, "package.json"), JSON.stringify({ name: "smoke-consumer", private: true }));

  const [pack] = JSON.parse(npm(["--cache", cache, "pack", "--json", "--ignore-scripts", "--offline", "--pack-destination", archiveDir], repoRoot));
  const paths = new Set(pack.files.map((file) => file.path));
  for (const file of ["package.json", "bin/release-doctor.js", "src/index.js", "src/cli.js", "src/fs.js", "src/report.js", "README.md", "LICENSE"]) {
    assert(paths.has(file), `Published artifact is missing ${file}`);
  }
  for (const file of paths) {
    assert(!/^(test\/|test-support\/|\.github\/|node_modules\/)/.test(file), `Unwanted artifact file: ${file}`);
    assert(!file.endsWith(".tgz"), `Nested tarball in artifact: ${file}`);
  }

  npm(["--cache", cache, "install", "--ignore-scripts", "--offline", "--no-audit", "--no-fund", path.join(archiveDir, pack.filename)], consumerDir);
  const manifest = JSON.parse(await fs.readFile(path.join(consumerDir, "node_modules", "release-doctor", "package.json"), "utf8"));
  const bin = path.join(consumerDir, "node_modules", "release-doctor", "bin", "release-doctor.js");
  assert.equal(run(process.execPath, [bin, "--version"], consumerDir).trim(), manifest.version);
  const report = JSON.parse(run(process.execPath, [bin, "--json", "--strict", "--no-ci", root], consumerDir));
  assert.equal(report.status, "pass");
  if (process.platform !== "win32") {
    const installedCommand = path.join(consumerDir, "node_modules", ".bin", "release-doctor");
    assert.equal(run(installedCommand, ["--version"], consumerDir).trim(), manifest.version);
  }
  assert.equal(run(process.execPath, ["--input-type=module", "-e", "import { runDoctor } from 'release-doctor'; console.log(typeof runDoctor)"], consumerDir).trim(), "function");
});

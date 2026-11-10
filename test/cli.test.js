import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { main } from "../src/cli.js";
import { fixture, repoRoot, writeJson } from "../test-support/fixtures.js";

async function invoke(args) {
  let stdout = "";
  let stderr = "";
  const status = await main(args, {
    stdout: { write: (text) => { stdout += text; } },
    stderr: { write: (text) => { stderr += text; } }
  });
  return { status, stdout, stderr };
}

test("help exits successfully without inspecting a package", async () => {
  const result = await invoke(["--help", "/missing/project"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.equal(result.stderr, "");
});

test("version matches the package manifest", async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  const result = await invoke(["--version"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${pkg.version}\n`);
});

for (const args of [["--unknown"], ["one", "two"]]) {
  test(`invalid arguments exit 2: ${args.join(" ")}`, async () => {
    const result = await invoke(args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Usage:/);
  });
}

test("a clean fixture passes normal and strict modes with JSON-only stdout", async (t) => {
  const root = await fixture(t);
  for (const strict of [[], ["--strict"]]) {
    const result = await invoke(["--json", "--no-ci", ...strict, root]);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "pass");
    assert.deepEqual(report.counts, { error: 0, warning: 0, info: 0 });
  }
});

test("warnings exit 0 normally and 1 with strict mode without changing report severity", async (t) => {
  const root = await fixture(t, { description: "" });
  for (const strict of [false, true]) {
    const result = await invoke(["--json", "--no-ci", ...(strict ? ["--strict"] : []), root]);
    assert.equal(result.status, strict ? 1 : 0);
    assert.equal(JSON.parse(result.stdout).status, "warn");
  }
});

test("malformed manifests return parseable diagnostics and exit 1, not a runtime crash", async (t) => {
  const root = await fixture(t);
  await writeJson(root, "package.json", null);
  const result = await invoke(["--json", root]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).issues[0].code, "PKG_JSON_INVALID");
});

test("no-ci skips both workflow and npmrc checks", async (t) => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, ".npmrc"), "package-lock=false\n");
  const normal = JSON.parse((await invoke(["--json", root])).stdout);
  assert(normal.issues.some((issue) => issue.code === "CI_WORKFLOW_MISSING"));
  assert(normal.issues.some((issue) => issue.code === "NPMRC_PACKAGE_LOCK_DISABLED"));
  const skipped = await invoke(["--json", "--strict", "--no-ci", root]);
  assert.equal(skipped.status, 0);
  assert.equal(JSON.parse(skipped.stdout).status, "pass");
});

test("executable wrapper preserves clean exit codes and accepts paths with spaces", async (t) => {
  const root = await fixture(t);
  const nested = path.join(root, "path with spaces");
  await fs.mkdir(nested);
  const result = spawnSync(process.execPath, [path.join(repoRoot, "bin", "release-doctor.js"), "--json", "--no-ci", nested], {
    encoding: "utf8",
    timeout: 10000
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).root, root);
});

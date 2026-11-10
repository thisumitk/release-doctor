import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { runDoctor } from "../src/index.js";
import { formatReport } from "../src/report.js";
import { fixture, writeJson } from "../test-support/fixtures.js";

function codes(report) {
  return new Set(report.issues.map((issue) => issue.code));
}

for (const value of [null, [], "manifest", 42, true]) {
  test(`rejects a non-object manifest: ${JSON.stringify(value)}`, async (t) => {
    const root = await fixture(t);
    await writeJson(root, "package.json", value);
    const report = await runDoctor(root);
    assert.equal(report.status, "fail");
    assert.equal(report.counts.error, 1);
    assert.equal(report.packages.length, 0);
    assert(codes(report).has("PKG_JSON_INVALID"));
  });

  test(`rejects a non-object npm lockfile: ${JSON.stringify(value)}`, async (t) => {
    const root = await fixture(t);
    await writeJson(root, "package-lock.json", value);
    const report = await runDoctor(root, { ci: false });
    assert.equal(report.counts.error, 1);
    assert(codes(report).has("LOCKFILE_INVALID_JSON"));
  });
}

for (const filename of ["package.json", "package-lock.json"]) {
  test(`reports malformed JSON in ${filename}`, async (t) => {
    const root = await fixture(t);
    await fs.writeFile(path.join(root, filename), "{ invalid JSON }");
    const report = await runDoctor(root, { ci: false });
    assert(codes(report).has(filename === "package.json" ? "PKG_JSON_INVALID" : "LOCKFILE_INVALID_JSON"));
  });
}

test("reports a missing manifest without throwing", async (t) => {
  const root = await fixture(t);
  await fs.rm(path.join(root, "package.json"));
  const report = await runDoctor(root);
  assert.deepEqual([...codes(report)], ["PKG_JSON_MISSING"]);
});

test("invalid files entries do not crash allowlist checks", async (t) => {
  const root = await fixture(t, { files: [null, 42, {}, "", "index.js"] });
  const report = await runDoctor(root, { ci: false });
  assert.equal(report.issues.filter((issue) => issue.code === "FILES_ENTRY_INVALID").length, 4);
  assert(!codes(report).has("ENTRYPOINT_EXCLUDED_FROM_FILES"));
});

test("a bin directory produces a diagnostic rather than a read error", async (t) => {
  const root = await fixture(t, { bin: "bin", files: ["index.js", "bin"] });
  await fs.mkdir(path.join(root, "bin"));
  const report = await runDoctor(root, { ci: false });
  assert(codes(report).has("BIN_NOT_FILE"));
});

test("bin shebang and executable checks produce actionable diagnostics", async (t) => {
  const root = await fixture(t, { bin: "cli.js", files: ["index.js", "cli.js"] });
  await fs.writeFile(path.join(root, "cli.js"), "console.log('hello');\n", { mode: 0o644 });
  const report = await runDoctor(root, { ci: false });
  assert(codes(report).has("BIN_SHEBANG_MISSING"));
  if (process.platform !== "win32") assert(codes(report).has("BIN_NOT_EXECUTABLE"));
});

test("entrypoints cannot traverse outside the package", async (t) => {
  const root = await fixture(t, { main: "./../outside.js" });
  const report = await runDoctor(root, { ci: false });
  assert(codes(report).has("ENTRYPOINT_OUTSIDE_PACKAGE"));
});

test("nested conditional exports are checked and null exclusions are ignored", async (t) => {
  const root = await fixture(t, {
    exports: { ".": { import: "./index.js", require: "./missing.cjs" }, "./private": null }
  });
  const report = await runDoctor(root, { ci: false });
  const missing = report.issues.filter((issue) => issue.code === "ENTRYPOINT_MISSING_FILE");
  assert.equal(missing.length, 1);
  assert.match(missing[0].message, /exports\.\.\.require/);
});

test("stale lockfile identity and dependency metadata are reported", async (t) => {
  const root = await fixture(t);
  await writeJson(root, "package-lock.json", {
    lockfileVersion: 3,
    packages: { "": { name: "old-name", version: "0.0.1", dependencies: { old: "1.0.0" } } }
  });
  const report = await runDoctor(root, { ci: false });
  for (const code of ["LOCKFILE_NAME_STALE", "LOCKFILE_VERSION_STALE", "LOCKFILE_DEPENDENCIES_STALE"]) {
    assert(codes(report).has(code));
  }
});

test("literal npm tokens never appear in JSON or human-readable reports", async (t) => {
  const root = await fixture(t);
  const token = "npm_fake_test_value_not_a_credential";
  await fs.writeFile(path.join(root, ".npmrc"), `//registry.npmjs.org/:_authToken=${token}\n`);
  const report = await runDoctor(root);
  assert(codes(report).has("NPMRC_TOKEN_LITERAL"));
  assert(!JSON.stringify(report).includes(token));
  assert(!formatReport(report).includes(token));
});

test("environment placeholders and commented tokens do not trigger literal-token warnings", async (t) => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, ".npmrc"), [
    "# _authToken=fake-comment",
    "; _authToken=fake-comment",
    "//registry.npmjs.org/:_authToken=${NPM_TOKEN}"
  ].join("\n"));
  assert(!codes(await runDoctor(root)).has("NPMRC_TOKEN_LITERAL"));
});

test("diagnostics never run package lifecycle scripts", async (t) => {
  const script = "node -e \"require('node:fs').writeFileSync('executed.txt', 'unsafe')\"";
  const root = await fixture(t, {
    scripts: { test: script, preinstall: script, install: script, postinstall: script, prepare: script, prepack: script, prepublishOnly: script }
  });
  const before = (await fs.readdir(root)).sort();
  await runDoctor(root, { ci: false });
  assert.deepEqual((await fs.readdir(root)).sort(), before);
});

test("workspace patterns deduplicate packages and no-workspaces skips discovery", async (t) => {
  const root = await fixture(t, { workspaces: ["packages/*", "packages/a"] });
  const child = path.join(root, "packages", "a");
  await fs.mkdir(child, { recursive: true });
  await writeJson(child, "package.json", { name: "child", version: "1.0.0" });
  assert.equal((await runDoctor(root, { ci: false })).packages.length, 2);
  assert.equal((await runDoctor(root, { ci: false, workspaces: false })).packages.length, 1);
});

test("nested paths resolve to the nearest package", async (t) => {
  const root = await fixture(t);
  const nested = path.join(root, "src", "nested");
  await fs.mkdir(nested, { recursive: true });
  assert.equal((await runDoctor(nested, { ci: false })).root, root);
});

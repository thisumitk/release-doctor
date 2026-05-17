import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runDoctor } from "../src/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("reports a clean package with no release blockers", async () => {
  const root = await fixture("clean-package");
  await writePackage(root, {
    name: "clean-package",
    version: "1.0.0",
    description: "Clean package",
    main: "./index.js",
    bin: {
      "clean-package": "bin/clean-package.js"
    },
    files: ["index.js", "bin", "README.md", "LICENSE", "CHANGELOG.md"],
    scripts: { test: "node --test" },
    license: "MIT",
    engines: { node: ">=20" },
    packageManager: "npm@11.4.2",
    repository: { type: "git", url: "https://example.com/repo.git" }
  });
  await fs.mkdir(path.join(root, "bin"));
  const binPath = path.join(root, "bin", "clean-package.js");
  await fs.writeFile(binPath, "#!/usr/bin/env node\nconsole.log('clean');\n");
  await fs.chmod(binPath, 0o755);
  await fs.writeFile(path.join(root, "index.js"), "export const value = 1;\n");
  await fs.writeFile(path.join(root, "README.md"), "# Clean Package\n");
  await fs.writeFile(path.join(root, "LICENSE"), "MIT\n");
  await fs.writeFile(path.join(root, "CHANGELOG.md"), "# Changelog\n");
  await fs.writeFile(path.join(root, "package-lock.json"), JSON.stringify({
    name: "clean-package",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "clean-package",
        version: "1.0.0"
      }
    }
  }, null, 2));
  await fs.mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await fs.writeFile(path.join(root, ".github", "workflows", "ci.yml"), [
    "name: CI",
    "on: [push]",
    "jobs:",
    "  test:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: actions/setup-node@v4",
    "      - run: npm ci",
    "      - run: npm test"
  ].join("\n"));

  const report = await runDoctor(root);

  assert.equal(report.status, "pass");
  assert.equal(report.counts.error, 0);
  assert.equal(report.counts.warning, 0);
});

test("detects common npm release blockers", async () => {
  const root = await fixture("broken-package");
  await writePackage(root, {
    name: "Broken Package",
    version: "1",
    private: true,
    main: "./dist/index.js",
    files: ["src"],
    scripts: { test: "echo \"Error: no test specified\" && exit 1" },
    dependencies: {
      "Broken Package": "1.0.0",
      leftpad: "*",
      local: "file:../local"
    },
    devDependencies: {
      leftpad: "^1.0.0"
    }
  });
  await fs.mkdir(path.join(root, "src"));

  const report = await runDoctor(root, { ci: false });
  const codes = new Set(report.issues.map((item) => item.code));

  assert.equal(report.status, "fail");
  assert(codes.has("PKG_PRIVATE"));
  assert(codes.has("PKG_NAME_INVALID"));
  assert(codes.has("PKG_VERSION_INVALID"));
  assert(codes.has("DEPS_SELF_REFERENCE"));
  assert(codes.has("DEPS_UNPINNED_RANGE"));
  assert(codes.has("DEPS_LOCAL_PATH_PUBLISH"));
  assert(codes.has("DEPS_CONFLICTING_RANGES"));
  assert(codes.has("ENTRYPOINT_MISSING_FILE"));
  assert(codes.has("ENTRYPOINT_EXCLUDED_FROM_FILES"));
  assert(codes.has("SCRIPT_TEST_PLACEHOLDER"));
});

test("discovers workspaces and reports dependency drift", async () => {
  const root = await fixture("workspace-package");
  await writePackage(root, {
    name: "workspace-root",
    version: "1.0.0",
    description: "Workspace root",
    private: false,
    workspaces: ["packages/*"],
    main: "./index.js",
    files: ["index.js", "README.md", "LICENSE", "CHANGELOG.md"],
    scripts: { test: "node --test" },
    license: "MIT",
    engines: { node: ">=20" },
    packageManager: "npm@11.4.2"
  });
  await addRequiredFiles(root);
  await fs.mkdir(path.join(root, "packages", "a"), { recursive: true });
  await fs.mkdir(path.join(root, "packages", "b"), { recursive: true });
  await writePackage(path.join(root, "packages", "a"), workspacePackage("a", "^1.0.0"));
  await writePackage(path.join(root, "packages", "b"), workspacePackage("b", "^2.0.0"));
  await addRequiredFiles(path.join(root, "packages", "a"));
  await addRequiredFiles(path.join(root, "packages", "b"));
  await fs.writeFile(path.join(root, "package-lock.json"), JSON.stringify({
    name: "workspace-root",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "workspace-root",
        version: "1.0.0"
      }
    }
  }, null, 2));

  const report = await runDoctor(root, { ci: false });
  const codes = new Set(report.issues.map((item) => item.code));

  assert.equal(report.packages.length, 3);
  assert(codes.has("WORKSPACE_DEPENDENCY_DRIFT"));
});

test("CLI emits JSON and exits non-zero for release blockers", async () => {
  const root = await fixture("cli-broken");
  await writePackage(root, {
    name: "cli-broken",
    version: "0.0.0",
    private: true
  });

  const result = spawnSync(process.execPath, [path.join(repoRoot, "bin", "release-doctor.js"), "--json", root], {
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "fail");
  assert(report.issues.some((item) => item.code === "PKG_PRIVATE"));
});

async function fixture(name) {
  return fs.mkdtemp(path.join(os.tmpdir(), `release-doctor-${name}-`));
}

async function writePackage(root, contents) {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "package.json"), `${JSON.stringify(contents, null, 2)}\n`);
}

async function addRequiredFiles(root) {
  await fs.writeFile(path.join(root, "index.js"), "export const value = 1;\n");
  await fs.writeFile(path.join(root, "README.md"), "# Fixture\n");
  await fs.writeFile(path.join(root, "LICENSE"), "MIT\n");
  await fs.writeFile(path.join(root, "CHANGELOG.md"), "# Changelog\n");
}

function workspacePackage(name, sharedRange) {
  return {
    name: `workspace-${name}`,
    version: "1.0.0",
    description: `Workspace ${name}`,
    main: "./index.js",
    files: ["index.js", "README.md", "LICENSE", "CHANGELOG.md"],
    scripts: { test: "node --test" },
    dependencies: {
      shared: sharedRange
    },
    license: "MIT",
    engines: { node: ">=20" },
    repository: { type: "git", url: "https://example.com/repo.git" }
  };
}

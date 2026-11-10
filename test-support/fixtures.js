import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function fixture(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-doctor-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pkg = {
    name: "fixture-package",
    version: "1.0.0",
    description: "Deterministic test fixture",
    main: "./index.js",
    files: ["index.js", "README.md", "LICENSE", "CHANGELOG.md"],
    scripts: { test: "node --test" },
    license: "MIT",
    engines: { node: ">=20" },
    packageManager: "npm@11.14.1",
    repository: { type: "git", url: "https://example.com/fixture.git" },
    ...overrides
  };
  await writeJson(root, "package.json", pkg);
  await writeJson(root, "package-lock.json", {
    name: pkg.name,
    version: pkg.version,
    lockfileVersion: 3,
    packages: { "": { name: pkg.name, version: pkg.version } }
  });
  await Promise.all([
    fs.writeFile(path.join(root, "index.js"), "export const value = 1;\n"),
    fs.writeFile(path.join(root, "README.md"), "# Fixture\n"),
    fs.writeFile(path.join(root, "LICENSE"), "MIT\n"),
    fs.writeFile(path.join(root, "CHANGELOG.md"), "# Changelog\n")
  ]);
  return root;
}

export async function writeJson(root, filename, value) {
  await fs.writeFile(path.join(root, filename), `${JSON.stringify(value, null, 2)}\n`);
}

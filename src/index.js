import path from "node:path";
import { issue, createReport } from "./report.js";
import {
  expandWorkspacePatterns,
  fileMode,
  findNearestPackageRoot,
  hasAnyFile,
  isDirectory,
  patternToRegex,
  pathExists,
  readDirFiles,
  readJson,
  readText,
  toPosix
} from "./fs.js";

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies"
];
const LOCKFILES = [
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"]
];

export async function runDoctor(startPath = process.cwd(), options = {}) {
  const startedAt = Date.now();
  const root = findNearestPackageRoot(path.resolve(startPath));
  const issues = [];
  const packages = [];

  const rootPackage = loadPackage(root, root, issues);
  if (!rootPackage) {
    return createReport({ root, packages, issues, startedAt });
  }

  packages.push(rootPackage);

  if (options.workspaces !== false) {
    packages.push(...loadWorkspaces(rootPackage, issues));
  }

  for (const packageContext of packages) {
    checkManifest(packageContext, issues);
    checkRepositoryFiles(packageContext, issues);
    checkDependencyHealth(packageContext, issues);
    checkEntrypoints(packageContext, issues);
    checkScripts(packageContext, issues);
    checkPackageFileList(packageContext, issues);
  }

  checkRootLockfiles(rootPackage, issues);

  if (options.ci !== false) {
    checkNpmrc(rootPackage, issues);
    checkCi(rootPackage, issues);
  }

  checkWorkspaceDependencyDrift(packages, issues);

  return createReport({ root, packages, issues, startedAt });
}

function loadPackage(packageRoot, repoRoot, issues) {
  const manifestPath = path.join(packageRoot, "package.json");
  if (!pathExists(manifestPath)) {
    issues.push(issue({
      severity: "error",
      code: "PKG_JSON_MISSING",
      category: "manifest",
      title: "package.json is missing",
      message: "Release Doctor needs a package.json to evaluate npm publish readiness.",
      recommendation: "Create a package.json before preparing a release.",
      packagePath: relativePackagePath(repoRoot, packageRoot),
      file: "package.json"
    }));
    return null;
  }

  const parsed = readJson(manifestPath);
  if (!parsed.ok) {
    issues.push(issue({
      severity: "error",
      code: "PKG_JSON_INVALID",
      category: "manifest",
      title: "package.json is invalid JSON",
      message: parsed.error.message,
      recommendation: "Fix the JSON syntax so npm can read the manifest.",
      packagePath: relativePackagePath(repoRoot, packageRoot),
      file: "package.json"
    }));
    return null;
  }

  const packageJson = parsed.value;
  return {
    root: repoRoot,
    packageRoot,
    relativePath: relativePackagePath(repoRoot, packageRoot),
    packageJson,
    name: packageJson.name || "(unnamed)",
    version: packageJson.version || "(unversioned)"
  };
}

function loadWorkspaces(rootPackage, issues) {
  const patterns = getWorkspacePatterns(rootPackage.packageJson.workspaces);
  if (patterns.length === 0) return [];

  const matches = expandWorkspacePatterns(rootPackage.packageRoot, patterns);
  const workspaces = [];
  const seen = new Set();

  for (const [pattern, directories] of matches) {
    if (directories.length === 0) {
      issues.push(issue({
        severity: "warning",
        code: "WORKSPACE_PATTERN_EMPTY",
        category: "workspaces",
        title: "Workspace pattern does not match any packages",
        message: `The workspace pattern "${pattern}" did not match any package.json files.`,
        recommendation: "Remove stale workspace patterns or add the missing package.",
        packagePath: ".",
        file: "package.json"
      }));
      continue;
    }

    for (const directory of directories) {
      if (seen.has(directory)) continue;
      seen.add(directory);
      const workspace = loadPackage(directory, rootPackage.packageRoot, issues);
      if (workspace) workspaces.push(workspace);
    }
  }

  return workspaces;
}

function checkManifest(context, issues) {
  const pkg = context.packageJson;
  const packageFile = "package.json";

  if (pkg.private === true) {
    issues.push(contextIssue(context, {
      severity: "error",
      code: "PKG_PRIVATE",
      category: "manifest",
      title: "Package is marked private",
      message: "npm refuses to publish packages with private set to true.",
      recommendation: "Remove private or set it to false for packages intended to publish.",
      file: packageFile
    }));
  }

  if (!isNonEmptyString(pkg.name)) {
    issues.push(contextIssue(context, {
      severity: "error",
      code: "PKG_NAME_MISSING",
      category: "manifest",
      title: "Package name is missing",
      message: "Published npm packages require a package name.",
      recommendation: "Add a valid name field to package.json.",
      file: packageFile
    }));
  } else if (!isValidPackageName(pkg.name)) {
    issues.push(contextIssue(context, {
      severity: "error",
      code: "PKG_NAME_INVALID",
      category: "manifest",
      title: "Package name is invalid",
      message: "The package name does not match npm naming rules.",
      recommendation: "Use lowercase URL-safe characters, optionally scoped as @scope/name.",
      file: packageFile,
      evidence: pkg.name
    }));
  }

  if (!isNonEmptyString(pkg.version)) {
    issues.push(contextIssue(context, {
      severity: "error",
      code: "PKG_VERSION_MISSING",
      category: "manifest",
      title: "Package version is missing",
      message: "Published npm packages require a version.",
      recommendation: "Add a semantic version to package.json.",
      file: packageFile
    }));
  } else if (!SEMVER_RE.test(pkg.version)) {
    issues.push(contextIssue(context, {
      severity: "error",
      code: "PKG_VERSION_INVALID",
      category: "manifest",
      title: "Package version is not valid semver",
      message: "npm requires versions to be valid semantic versions.",
      recommendation: "Use a version like 1.2.3 or 1.2.3-beta.1.",
      file: packageFile,
      evidence: pkg.version
    }));
  }

  if (!isNonEmptyString(pkg.description)) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "PKG_DESCRIPTION_MISSING",
      category: "metadata",
      title: "Package description is missing",
      message: "A missing description makes the published package harder to discover and review.",
      recommendation: "Add a concise description field.",
      file: packageFile
    }));
  }

  if (!isNonEmptyString(pkg.license)) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "PKG_LICENSE_MISSING",
      category: "metadata",
      title: "Package license is missing",
      message: "Consumers and registries rely on the license metadata.",
      recommendation: "Add a license field and include a LICENSE file.",
      file: packageFile
    }));
  }

  if (!pkg.repository) {
    issues.push(contextIssue(context, {
      severity: "info",
      code: "PKG_REPOSITORY_MISSING",
      category: "metadata",
      title: "Repository metadata is missing",
      message: "Repository metadata helps users audit source and report issues.",
      recommendation: "Add a repository field.",
      file: packageFile
    }));
  }

  if (!pkg.engines || !pkg.engines.node) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "PKG_ENGINES_NODE_MISSING",
      category: "compatibility",
      title: "Node engine range is missing",
      message: "A release without engines.node can be installed on unsupported Node versions.",
      recommendation: "Declare the supported Node.js versions in engines.node.",
      file: packageFile
    }));
  }

  if (context.relativePath === "." && !pkg.packageManager) {
    issues.push(contextIssue(context, {
      severity: "info",
      code: "PKG_MANAGER_MISSING",
      category: "reproducibility",
      title: "packageManager is missing",
      message: "The package manager version is not pinned for contributors or CI.",
      recommendation: "Add packageManager, for example npm@11.x, pnpm@9.x, or yarn@4.x.",
      file: packageFile
    }));
  }

  if (isScopedPackage(pkg.name) && !hasPublicPublishConfig(pkg)) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "PKG_SCOPED_ACCESS_MISSING",
      category: "publishing",
      title: "Scoped package does not declare public publish access",
      message: "New scoped npm packages publish as private unless --access public or publishConfig.access is used.",
      recommendation: "Set publishConfig.access to public for public scoped packages.",
      file: packageFile
    }));
  }
}

function checkRepositoryFiles(context, issues) {
  if (!hasAnyFile(context.packageRoot, ["README.md", "README", "readme.md"])) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "README_MISSING",
      category: "metadata",
      title: "README file is missing",
      message: "npm displays the README as the package landing page.",
      recommendation: "Add a README with installation, usage, and release notes links."
    }));
  }

  if (!hasAnyFile(context.packageRoot, ["LICENSE", "LICENSE.md", "LICENSE.txt", "license"])) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "LICENSE_FILE_MISSING",
      category: "metadata",
      title: "License file is missing",
      message: "The manifest declares licensing separately from the package artifact.",
      recommendation: "Include a LICENSE file in the published package."
    }));
  }

  if (!hasAnyFile(context.packageRoot, ["CHANGELOG.md", "HISTORY.md", "RELEASES.md"])) {
    issues.push(contextIssue(context, {
      severity: "info",
      code: "CHANGELOG_MISSING",
      category: "release-process",
      title: "Changelog is missing",
      message: "A changelog gives maintainers and users a clear release history.",
      recommendation: "Add CHANGELOG.md or link release notes from the README."
    }));
  }
}

function checkDependencyHealth(context, issues) {
  const pkg = context.packageJson;
  const seen = new Map();

  for (const section of DEPENDENCY_SECTIONS) {
    const dependencies = pkg[section];
    if (dependencies === undefined) continue;

    if (!isPlainObject(dependencies)) {
      issues.push(contextIssue(context, {
        severity: "error",
        code: "DEPS_SECTION_INVALID",
        category: "dependencies",
        title: `${section} must be an object`,
        message: `The ${section} field must map package names to version specifiers.`,
        recommendation: `Change ${section} to an object.`,
        file: "package.json"
      }));
      continue;
    }

    for (const [dependencyName, spec] of Object.entries(dependencies)) {
      if (dependencyName === pkg.name) {
        issues.push(contextIssue(context, {
          severity: "error",
          code: "DEPS_SELF_REFERENCE",
          category: "dependencies",
          title: "Package depends on itself",
          message: "A package cannot resolve itself as a dependency after publish.",
          recommendation: "Remove the self dependency.",
          file: "package.json",
          evidence: `${section}.${dependencyName}`
        }));
      }

      if (typeof spec !== "string" || spec.trim() === "") {
        issues.push(contextIssue(context, {
          severity: "error",
          code: "DEPS_SPEC_INVALID",
          category: "dependencies",
          title: "Dependency specifier is invalid",
          message: `The specifier for ${dependencyName} in ${section} must be a non-empty string.`,
          recommendation: "Use a valid npm version, range, tag, alias, file, git, or workspace spec.",
          file: "package.json"
        }));
        continue;
      }

      const specIssue = classifyDependencySpec(section, dependencyName, spec);
      if (specIssue) {
        issues.push(contextIssue(context, {
          ...specIssue,
          file: "package.json",
          evidence: `${section}.${dependencyName}: ${spec}`
        }));
      }

      const previous = seen.get(dependencyName);
      if (previous && previous.spec !== spec) {
        issues.push(contextIssue(context, {
          severity: "error",
          code: "DEPS_CONFLICTING_RANGES",
          category: "dependencies",
          title: "Dependency has conflicting version ranges",
          message: `${dependencyName} is declared in ${previous.section} as ${previous.spec} and in ${section} as ${spec}.`,
          recommendation: "Keep a package in one dependency section or align the ranges intentionally.",
          file: "package.json"
        }));
      } else if (!previous) {
        seen.set(dependencyName, { section, spec });
      }
    }
  }

  const peerDependencies = pkg.peerDependencies;
  if (isPlainObject(peerDependencies)) {
    for (const [peerName, peerRange] of Object.entries(peerDependencies)) {
      const devRange = pkg.devDependencies?.[peerName];
      if (!devRange && !pkg.optionalDependencies?.[peerName]) {
        issues.push(contextIssue(context, {
          severity: "warning",
          code: "PEER_NOT_TEST_INSTALLED",
          category: "dependencies",
          title: "Peer dependency is not installed for local tests",
          message: `${peerName} is declared as a peer dependency but is absent from devDependencies.`,
          recommendation: "Add the peer to devDependencies so tests run against a real version.",
          file: "package.json",
          evidence: `${peerName}@${peerRange}`
        }));
      }
    }
  }

  const peerMeta = pkg.peerDependenciesMeta;
  if (peerMeta !== undefined && !isPlainObject(peerMeta)) {
    issues.push(contextIssue(context, {
      severity: "error",
      code: "PEER_META_INVALID",
      category: "dependencies",
      title: "peerDependenciesMeta must be an object",
      message: "npm expects peerDependenciesMeta to map peer names to metadata objects.",
      recommendation: "Change peerDependenciesMeta to an object.",
      file: "package.json"
    }));
  } else if (isPlainObject(peerMeta)) {
    for (const peerName of Object.keys(peerMeta)) {
      if (!peerDependencies || !Object.hasOwn(peerDependencies, peerName)) {
        issues.push(contextIssue(context, {
          severity: "warning",
          code: "PEER_META_WITHOUT_PEER",
          category: "dependencies",
          title: "peerDependenciesMeta references a missing peer",
          message: `${peerName} appears in peerDependenciesMeta but not peerDependencies.`,
          recommendation: "Remove the stale metadata entry or add the matching peer dependency.",
          file: "package.json"
        }));
      }
    }
  }
}

function checkEntrypoints(context, issues) {
  const pkg = context.packageJson;
  const targets = collectEntrypointTargets(pkg);

  if (targets.length === 0 && pkg.private !== true) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "ENTRYPOINT_MISSING",
      category: "publishing",
      title: "No package entrypoint is declared",
      message: "Published packages normally expose main, exports, bin, or type declarations.",
      recommendation: "Declare the files consumers should import or execute in package.json.",
      file: "package.json"
    }));
  }

  for (const target of targets) {
    if (target.value.includes("*")) continue;
    if (target.value.startsWith("#")) continue;

    if (!isValidRelativeEntrypoint(target)) {
      issues.push(contextIssue(context, {
        severity: "error",
        code: "ENTRYPOINT_NOT_RELATIVE",
        category: "publishing",
        title: "Package entrypoint must be relative",
        message: `${target.field} points to ${target.value}, which is not a relative package path.`,
        recommendation: "Use a path beginning with ./ for files published with the package.",
        file: "package.json"
      }));
      continue;
    }

    const normalized = path.normalize(target.value.startsWith("./") ? target.value : `./${target.value}`);
    const resolved = path.resolve(context.packageRoot, normalized);
    if (!resolved.startsWith(context.packageRoot + path.sep) && resolved !== context.packageRoot) {
      issues.push(contextIssue(context, {
        severity: "error",
        code: "ENTRYPOINT_OUTSIDE_PACKAGE",
        category: "publishing",
        title: "Package entrypoint points outside the package",
        message: `${target.field} resolves outside the package root.`,
        recommendation: "Point entrypoints to files inside the package.",
        file: "package.json",
        evidence: target.value
      }));
      continue;
    }

    if (!pathExists(resolved)) {
      issues.push(contextIssue(context, {
        severity: "error",
        code: "ENTRYPOINT_MISSING_FILE",
        category: "publishing",
        title: "Declared entrypoint file is missing",
        message: `${target.field} points to ${target.value}, but that file does not exist.`,
        recommendation: "Build the file before publishing or update package.json to the correct path.",
        file: "package.json"
      }));
      continue;
    }

    if (target.kind === "bin") {
      checkBinTarget(context, target, resolved, issues);
    }
  }
}

function checkScripts(context, issues) {
  const pkg = context.packageJson;
  const scripts = pkg.scripts;

  if (scripts !== undefined && !isPlainObject(scripts)) {
    issues.push(contextIssue(context, {
      severity: "error",
      code: "SCRIPTS_INVALID",
      category: "release-process",
      title: "scripts must be an object",
      message: "npm expects scripts to map command names to shell commands.",
      recommendation: "Change scripts to an object.",
      file: "package.json"
    }));
    return;
  }

  if (!scripts || !isNonEmptyString(scripts.test)) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "SCRIPT_TEST_MISSING",
      category: "release-process",
      title: "Test script is missing",
      message: "A package without a test script is easier to release with broken behavior.",
      recommendation: "Add a test script that CI can run before publishing.",
      file: "package.json"
    }));
  } else if (/no test specified|exit 1/i.test(scripts.test)) {
    issues.push(contextIssue(context, {
      severity: "error",
      code: "SCRIPT_TEST_PLACEHOLDER",
      category: "release-process",
      title: "Test script is still the npm placeholder",
      message: "The test script exits with the default placeholder failure.",
      recommendation: "Replace it with real tests or remove the failing placeholder.",
      file: "package.json"
    }));
  }

  const targets = collectEntrypointTargets(pkg);
  const targetsDist = targets.some((target) => target.value.startsWith("./dist/") || target.value.startsWith("dist/"));
  if (targetsDist && !scripts?.build && !scripts?.prepare && !scripts?.prepack) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "SCRIPT_BUILD_MISSING_FOR_DIST",
      category: "release-process",
      title: "Dist entrypoint has no build hook",
      message: "The package points to dist files but does not define build, prepare, or prepack.",
      recommendation: "Add a build script and run it from CI or prepack.",
      file: "package.json"
    }));
  }

  if (scripts?.prepublish) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "SCRIPT_PREPUBLISH_DEPRECATED",
      category: "release-process",
      title: "prepublish script is deprecated for release builds",
      message: "prepublish also runs during npm install in older npm versions, which can surprise consumers.",
      recommendation: "Use prepublishOnly, prepare, or prepack depending on the intended lifecycle.",
      file: "package.json"
    }));
  }
}

function checkPackageFileList(context, issues) {
  const pkg = context.packageJson;

  if (pkg.files !== undefined && !Array.isArray(pkg.files)) {
    issues.push(contextIssue(context, {
      severity: "error",
      code: "FILES_FIELD_INVALID",
      category: "publishing",
      title: "files field must be an array",
      message: "npm expects files to list publishable package paths.",
      recommendation: "Change files to an array of paths or remove it.",
      file: "package.json"
    }));
    return;
  }

  if (!pkg.files && !pathExists(path.join(context.packageRoot, ".npmignore"))) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "PACKAGE_CONTENTS_UNBOUNDED",
      category: "publishing",
      title: "Published package contents are not bounded",
      message: "Without files or .npmignore, npm may include tests, configs, fixtures, and local artifacts.",
      recommendation: "Add a files allowlist for the intended package contents.",
      file: "package.json"
    }));
    return;
  }

  if (!Array.isArray(pkg.files)) return;

  for (const entry of pkg.files) {
    if (typeof entry !== "string" || entry.trim() === "") {
      issues.push(contextIssue(context, {
        severity: "error",
        code: "FILES_ENTRY_INVALID",
        category: "publishing",
        title: "files contains an invalid entry",
        message: "Every files entry must be a non-empty string.",
        recommendation: "Remove invalid files entries.",
        file: "package.json"
      }));
      continue;
    }

    if (entry.includes("*")) continue;
    const cleanEntry = entry.replace(/^\.\//, "");
    if (!pathExists(path.join(context.packageRoot, cleanEntry))) {
      issues.push(contextIssue(context, {
        severity: "warning",
        code: "FILES_ENTRY_MISSING",
        category: "publishing",
        title: "files entry does not exist",
        message: `${entry} is listed in files but does not exist on disk.`,
        recommendation: "Remove stale files entries or generate the missing path before publish.",
        file: "package.json"
      }));
    }
  }

  for (const target of collectEntrypointTargets(pkg)) {
    if (!isValidRelativeEntrypoint(target) || target.value.includes("*")) continue;
    const relative = target.value.replace(/^\.\//, "");
    if (!isIncludedByFiles(relative, pkg.files)) {
      issues.push(contextIssue(context, {
        severity: "error",
        code: "ENTRYPOINT_EXCLUDED_FROM_FILES",
        category: "publishing",
        title: "Entrypoint is excluded from files allowlist",
        message: `${target.field} points to ${target.value}, but files does not include it.`,
        recommendation: "Add the entrypoint path or its parent directory to files.",
        file: "package.json"
      }));
    }
  }
}

function checkRootLockfiles(rootContext, issues) {
  const found = LOCKFILES
    .filter(([file]) => pathExists(path.join(rootContext.packageRoot, file)));

  if (found.length === 0) {
    issues.push(contextIssue(rootContext, {
      severity: "warning",
      code: "LOCKFILE_MISSING",
      category: "reproducibility",
      title: "No package manager lockfile found",
      message: "CI and contributors can install different transitive dependency versions without a lockfile.",
      recommendation: "Commit the lockfile for the package manager used by this project."
    }));
    return;
  }

  if (found.length > 1) {
    issues.push(contextIssue(rootContext, {
      severity: "warning",
      code: "LOCKFILE_MULTIPLE_MANAGERS",
      category: "reproducibility",
      title: "Multiple package manager lockfiles found",
      message: `Found ${found.map(([file]) => file).join(", ")}.`,
      recommendation: "Keep one package-manager lockfile unless the project intentionally supports several managers."
    }));
  }

  const packageManager = parsePackageManager(rootContext.packageJson.packageManager);
  if (packageManager) {
    const expected = lockfilesForPackageManager(packageManager.name);
    const hasExpected = found.some(([file]) => expected.includes(file));
    if (!hasExpected) {
      issues.push(contextIssue(rootContext, {
        severity: "warning",
        code: "LOCKFILE_MANAGER_MISMATCH",
        category: "reproducibility",
        title: "Lockfile does not match packageManager",
        message: `packageManager declares ${packageManager.name}, but found ${found.map(([file]) => file).join(", ")}.`,
        recommendation: `Commit the ${packageManager.name} lockfile or update packageManager.`,
        file: "package.json"
      }));
    }
  }

  const npmLock = found.find(([file]) => file === "package-lock.json" || file === "npm-shrinkwrap.json");
  if (!npmLock) return;

  const lockPath = path.join(rootContext.packageRoot, npmLock[0]);
  const parsed = readJson(lockPath);
  if (!parsed.ok) {
    issues.push(contextIssue(rootContext, {
      severity: "error",
      code: "LOCKFILE_INVALID_JSON",
      category: "reproducibility",
      title: `${npmLock[0]} is invalid JSON`,
      message: parsed.error.message,
      recommendation: "Regenerate the lockfile with npm install --package-lock-only.",
      file: npmLock[0]
    }));
    return;
  }

  const rootLockPackage = parsed.value.packages?.[""];
  if (!rootLockPackage) return;

  if (rootLockPackage.name && rootLockPackage.name !== rootContext.packageJson.name) {
    issues.push(contextIssue(rootContext, {
      severity: "warning",
      code: "LOCKFILE_NAME_STALE",
      category: "reproducibility",
      title: "Lockfile package name is stale",
      message: `Lockfile root package is ${rootLockPackage.name}, but package.json is ${rootContext.packageJson.name}.`,
      recommendation: "Regenerate the lockfile.",
      file: npmLock[0]
    }));
  }

  if (rootLockPackage.version && rootLockPackage.version !== rootContext.packageJson.version) {
    issues.push(contextIssue(rootContext, {
      severity: "warning",
      code: "LOCKFILE_VERSION_STALE",
      category: "reproducibility",
      title: "Lockfile package version is stale",
      message: `Lockfile root version is ${rootLockPackage.version}, but package.json is ${rootContext.packageJson.version}.`,
      recommendation: "Regenerate the lockfile after version changes.",
      file: npmLock[0]
    }));
  }

  for (const field of DEPENDENCY_SECTIONS) {
    if (!sameDependencyMap(rootContext.packageJson[field], rootLockPackage[field])) {
      issues.push(contextIssue(rootContext, {
        severity: "warning",
        code: "LOCKFILE_DEPENDENCIES_STALE",
        category: "reproducibility",
        title: "Lockfile dependency metadata is stale",
        message: `${field} in ${npmLock[0]} does not match package.json.`,
        recommendation: "Regenerate the lockfile after dependency changes.",
        file: npmLock[0],
        evidence: field
      }));
    }
  }
}

function checkNpmrc(rootContext, issues) {
  const npmrcPath = path.join(rootContext.packageRoot, ".npmrc");
  if (!pathExists(npmrcPath)) return;

  const text = readText(npmrcPath);
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) return;

    if (/authToken\s*=/.test(trimmed) && !/\$\{?[A-Z0-9_]+\}?/.test(trimmed)) {
      issues.push(contextIssue(rootContext, {
        severity: "error",
        code: "NPMRC_TOKEN_LITERAL",
        category: "security",
        title: ".npmrc appears to contain a literal auth token",
        message: "Publishing tokens must not be committed to source control.",
        recommendation: "Replace the token with an environment variable such as ${NPM_TOKEN}.",
        file: ".npmrc",
        evidence: `line ${index + 1}`
      }));
    }

    if (/^package-lock\s*=\s*false$/i.test(trimmed)) {
      issues.push(contextIssue(rootContext, {
        severity: "warning",
        code: "NPMRC_PACKAGE_LOCK_DISABLED",
        category: "reproducibility",
        title: "package-lock is disabled",
        message: "Disabling package-lock makes npm installs less reproducible.",
        recommendation: "Remove package-lock=false unless this is intentional.",
        file: ".npmrc",
        evidence: `line ${index + 1}`
      }));
    }
  });
}

function checkCi(rootContext, issues) {
  const workflowsDir = path.join(rootContext.packageRoot, ".github", "workflows");
  if (!isDirectory(workflowsDir)) {
    issues.push(contextIssue(rootContext, {
      severity: "warning",
      code: "CI_WORKFLOW_MISSING",
      category: "ci",
      title: "GitHub Actions workflow is missing",
      message: "No .github/workflows directory was found.",
      recommendation: "Add CI that installs dependencies, runs tests, and verifies release artifacts."
    }));
    return;
  }

  const workflowFiles = readDirFiles(workflowsDir)
    .filter((name) => /\.(ya?ml)$/i.test(name));

  if (workflowFiles.length === 0) {
    issues.push(contextIssue(rootContext, {
      severity: "warning",
      code: "CI_WORKFLOW_MISSING",
      category: "ci",
      title: "GitHub Actions workflow file is missing",
      message: "The workflows directory does not contain any YAML workflow files.",
      recommendation: "Add a workflow that runs package checks before publishing."
    }));
    return;
  }

  const combined = workflowFiles
    .map((file) => readText(path.join(workflowsDir, file)))
    .join("\n");

  if (!/npm\s+(ci|install)|pnpm\s+install|yarn\s+install|bun\s+install/i.test(combined)) {
    issues.push(contextIssue(rootContext, {
      severity: "warning",
      code: "CI_INSTALL_STEP_MISSING",
      category: "ci",
      title: "CI install step was not detected",
      message: "The workflows do not appear to install package dependencies.",
      recommendation: "Add npm ci or the equivalent package-manager install command.",
      file: ".github/workflows"
    }));
  }

  if (!/npm\s+(run\s+)?(test|check)|pnpm\s+(run\s+)?(test|check)|yarn\s+(test|check)|bun\s+(test|run\s+check)/i.test(combined)) {
    issues.push(contextIssue(rootContext, {
      severity: "warning",
      code: "CI_TEST_STEP_MISSING",
      category: "ci",
      title: "CI test step was not detected",
      message: "The workflows do not appear to run tests.",
      recommendation: "Run the package test script in CI.",
      file: ".github/workflows"
    }));
  }

  const hasPublish = /npm\s+publish/i.test(combined);
  if (hasPublish) {
    if (!/npm\s+(run\s+)?(test|check)|pnpm\s+(run\s+)?(test|check)|yarn\s+(test|check)|bun\s+(test|run\s+check)/i.test(combined)) {
      issues.push(contextIssue(rootContext, {
        severity: "warning",
        code: "CI_PUBLISH_WITHOUT_CHECKS",
        category: "ci",
        title: "Publish workflow does not appear to run checks",
        message: "A workflow that publishes should run tests or a check script first.",
        recommendation: "Run npm test, npm run check, or equivalent before npm publish.",
        file: ".github/workflows"
      }));
    }

    const hasTrustedPublishing = /id-token:\s*write/i.test(combined);
    const hasToken = /NODE_AUTH_TOKEN|NPM_TOKEN|npm_token/i.test(combined);
    if (!hasTrustedPublishing && !hasToken) {
      issues.push(contextIssue(rootContext, {
        severity: "warning",
        code: "CI_PUBLISH_AUTH_MISSING",
        category: "ci",
        title: "Publish authentication was not detected",
        message: "npm publish appears in CI without trusted publishing or an npm token.",
        recommendation: "Use npm trusted publishing with id-token: write or provide NODE_AUTH_TOKEN from secrets.",
        file: ".github/workflows"
      }));
    }
  }

  const packageManager = parsePackageManager(rootContext.packageJson.packageManager);
  if (packageManager && ["pnpm", "yarn"].includes(packageManager.name) && !/corepack\s+enable/i.test(combined)) {
    issues.push(contextIssue(rootContext, {
      severity: "warning",
      code: "CI_COREPACK_MISSING",
      category: "ci",
      title: "Corepack enable step was not detected",
      message: `${packageManager.name} is declared in packageManager, but CI does not appear to enable Corepack.`,
      recommendation: "Run corepack enable before installing dependencies.",
      file: ".github/workflows"
    }));
  }
}

function checkWorkspaceDependencyDrift(packages, issues) {
  if (packages.length <= 1) return;

  const ranges = new Map();
  for (const context of packages) {
    for (const section of DEPENDENCY_SECTIONS) {
      const dependencies = context.packageJson[section];
      if (!isPlainObject(dependencies)) continue;

      for (const [dependencyName, spec] of Object.entries(dependencies)) {
        if (typeof spec !== "string") continue;
        if (!ranges.has(dependencyName)) ranges.set(dependencyName, []);
        ranges.get(dependencyName).push({
          packagePath: context.relativePath,
          section,
          spec
        });
      }
    }
  }

  for (const [dependencyName, entries] of ranges) {
    const distinct = new Set(entries.map((entry) => entry.spec));
    if (distinct.size <= 1) continue;

    issues.push(issue({
      severity: "info",
      code: "WORKSPACE_DEPENDENCY_DRIFT",
      category: "workspaces",
      title: "Workspace packages use different dependency ranges",
      message: `${dependencyName} is declared with ${distinct.size} different ranges across the workspace.`,
      recommendation: "Align ranges when packages are intended to release together.",
      packagePath: ".",
      evidence: entries.map((entry) => `${entry.packagePath}:${entry.section}=${entry.spec}`).join("; ")
    }));
  }
}

function classifyDependencySpec(section, dependencyName, spec) {
  const trimmed = spec.trim();

  if (trimmed === "*" || trimmed === "latest") {
    return {
      severity: "warning",
      code: "DEPS_UNPINNED_RANGE",
      category: "dependencies",
      title: "Dependency range is too broad",
      message: `${dependencyName} in ${section} uses ${trimmed}, which can install unexpected breaking changes.`,
      recommendation: "Use a bounded semver range."
    };
  }

  if (/^workspace:/i.test(trimmed) && section !== "devDependencies") {
    return {
      severity: "error",
      code: "DEPS_WORKSPACE_PROTOCOL_PUBLISH",
      category: "dependencies",
      title: "Publishable dependency uses workspace protocol",
      message: "workspace: ranges can leak into published manifests when the package manager does not rewrite them.",
      recommendation: "Ensure the release process rewrites workspace ranges or use normal semver ranges for published dependencies."
    };
  }

  if (/^(file|link):/i.test(trimmed) && section !== "devDependencies") {
    return {
      severity: "error",
      code: "DEPS_LOCAL_PATH_PUBLISH",
      category: "dependencies",
      title: "Publishable dependency points to a local path",
      message: "file: and link: dependencies do not resolve for package consumers after publish.",
      recommendation: "Publish the dependency separately and depend on a registry version."
    };
  }

  if (/^git\+|^github:|^gitlab:|^bitbucket:/i.test(trimmed) && section !== "devDependencies") {
    return {
      severity: "warning",
      code: "DEPS_GIT_SPEC_PUBLISH",
      category: "dependencies",
      title: "Published dependency uses a git specifier",
      message: "Git dependencies can make installs slower, less reproducible, and unavailable in restricted environments.",
      recommendation: "Prefer registry versions for published dependencies."
    };
  }

  return null;
}

function checkBinTarget(context, target, resolved, issues) {
  const firstLine = readText(resolved).split(/\r?\n/, 1)[0];
  if (!firstLine.startsWith("#!")) {
    issues.push(contextIssue(context, {
      severity: "error",
      code: "BIN_SHEBANG_MISSING",
      category: "publishing",
      title: "CLI bin file is missing a shebang",
      message: `${target.value} will not execute correctly as an npm-installed command.`,
      recommendation: "Start the bin file with #!/usr/bin/env node.",
      file: "package.json"
    }));
  }

  if (process.platform !== "win32" && (fileMode(resolved) & 0o111) === 0) {
    issues.push(contextIssue(context, {
      severity: "warning",
      code: "BIN_NOT_EXECUTABLE",
      category: "publishing",
      title: "CLI bin file is not executable",
      message: `${target.value} does not have an executable mode bit.`,
      recommendation: "Run chmod +x on the bin file before publishing.",
      file: "package.json"
    }));
  }
}

function isValidRelativeEntrypoint(target) {
  if (target.kind !== "bin") return target.value.startsWith("./");
  if (target.value.startsWith("./")) return true;
  if (target.value.startsWith("../") || target.value === "..") return false;
  if (path.isAbsolute(target.value) || /^[A-Za-z]:[\\/]/.test(target.value)) return false;
  return !target.value.startsWith(".");
}

function collectEntrypointTargets(pkg) {
  const targets = [];
  addStringTarget(targets, "main", pkg.main, "entry");
  addStringTarget(targets, "module", pkg.module, "entry");
  addStringTarget(targets, "browser", typeof pkg.browser === "string" ? pkg.browser : undefined, "entry");
  addStringTarget(targets, "types", pkg.types, "types");
  addStringTarget(targets, "typings", pkg.typings, "types");

  if (typeof pkg.bin === "string") {
    addStringTarget(targets, "bin", pkg.bin, "bin");
  } else if (isPlainObject(pkg.bin)) {
    for (const [name, value] of Object.entries(pkg.bin)) {
      addStringTarget(targets, `bin.${name}`, value, "bin");
    }
  }

  collectExports(targets, "exports", pkg.exports);
  return dedupeTargets(targets);
}

function collectExports(targets, field, value) {
  if (typeof value === "string") {
    addStringTarget(targets, field, value, "entry");
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectExports(targets, `${field}[${index}]`, entry));
    return;
  }

  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (child === null) continue;
    collectExports(targets, `${field}.${key}`, child);
  }
}

function addStringTarget(targets, field, value, kind) {
  if (typeof value === "string" && value.trim() !== "") {
    targets.push({ field, value, kind });
  }
}

function dedupeTargets(targets) {
  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.field}:${target.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isIncludedByFiles(relativePath, files) {
  if (!Array.isArray(files)) return true;
  const normalized = toPosix(relativePath).replace(/^\/+/, "");
  const alwaysIncluded = /^(package\.json|readme(\..*)?|license(\..*)?)$/i;
  if (alwaysIncluded.test(normalized)) return true;

  return files.some((entry) => {
    const clean = entry.replace(/^\.\//, "").replace(/\/+$/, "");
    if (clean.includes("*")) {
      return patternToRegex(clean).test(normalized);
    }

    return normalized === clean || normalized.startsWith(`${clean}/`);
  });
}

function getWorkspacePatterns(workspaces) {
  if (Array.isArray(workspaces)) {
    return workspaces.filter((item) => typeof item === "string");
  }

  if (isPlainObject(workspaces) && Array.isArray(workspaces.packages)) {
    return workspaces.packages.filter((item) => typeof item === "string");
  }

  return [];
}

function contextIssue(context, input) {
  return issue({
    ...input,
    packageName: context.name,
    packagePath: context.relativePath
  });
}

function relativePackagePath(root, packageRoot) {
  const relative = toPosix(path.relative(root, packageRoot));
  return relative || ".";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isValidPackageName(name) {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.length > 214) return false;
  if (name.startsWith(".") || name.startsWith("_")) return false;
  if (/[A-Z\s]/.test(name)) return false;
  if (name.startsWith("@")) {
    return /^@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*$/.test(name);
  }
  return /^[a-z0-9][a-z0-9._~-]*$/.test(name);
}

function isScopedPackage(name) {
  return typeof name === "string" && name.startsWith("@");
}

function hasPublicPublishConfig(pkg) {
  return pkg.publishConfig && pkg.publishConfig.access === "public";
}

function parsePackageManager(value) {
  if (typeof value !== "string") return null;
  const match = /^(npm|pnpm|yarn|bun)@/.exec(value);
  if (!match) return null;
  return { name: match[1] };
}

function sameDependencyMap(left, right) {
  const leftObject = isPlainObject(left) ? left : {};
  const rightObject = isPlainObject(right) ? right : {};
  const leftEntries = Object.entries(leftObject).sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
  const rightEntries = Object.entries(rightObject).sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function lockfilesForPackageManager(name) {
  if (name === "npm") return ["package-lock.json", "npm-shrinkwrap.json"];
  if (name === "pnpm") return ["pnpm-lock.yaml"];
  if (name === "yarn") return ["yarn.lock"];
  if (name === "bun") return ["bun.lockb", "bun.lock"];
  return [];
}

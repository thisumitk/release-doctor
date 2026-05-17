import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "coverage",
  ".next",
  ".turbo",
  ".cache"
]);

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function pathExists(filePath) {
  return fs.existsSync(filePath);
}

export function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function readJson(filePath) {
  try {
    return { ok: true, value: JSON.parse(readText(filePath)) };
  } catch (error) {
    return { ok: false, error };
  }
}

export function findFiles(root, predicate, options = {}) {
  const maxDepth = options.maxDepth ?? 6;
  const results = [];

  function walk(current, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(fullPath, depth + 1);
        }
        continue;
      }

      if (entry.isFile() && predicate(fullPath, entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(root, 0);
  return results;
}

export function findNearestPackageRoot(start) {
  let current = path.resolve(start);
  if (isFile(current)) current = path.dirname(current);

  while (true) {
    if (pathExists(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

export function findPackageJsons(root, maxDepth = 5) {
  return findFiles(root, (_fullPath, name) => name === "package.json", { maxDepth })
    .filter((filePath) => path.dirname(filePath) !== root);
}

export function patternToRegex(pattern) {
  const normalized = pattern.replace(/\\/g, "/").replace(/\/+$/, "");
  let source = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      source += "[^/]+";
      continue;
    }

    if ("\\^$+?.()|{}[]".includes(char)) {
      source += `\\${char}`;
      continue;
    }

    source += char;
  }

  return new RegExp(`^${source}$`);
}

export function expandWorkspacePatterns(root, patterns) {
  const packageJsons = findPackageJsons(root);
  const directories = packageJsons.map((filePath) => path.dirname(filePath));
  const matches = new Map();

  for (const pattern of patterns) {
    const regex = patternToRegex(pattern);
    const matchedDirectories = directories.filter((directory) => {
      const relative = toPosix(path.relative(root, directory));
      return regex.test(relative);
    });

    matches.set(pattern, matchedDirectories);
  }

  return matches;
}

export function hasAnyFile(root, names) {
  return names.some((name) => pathExists(path.join(root, name)));
}

export function readDirFiles(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function fileMode(filePath) {
  try {
    return fs.statSync(filePath).mode;
  } catch {
    return 0;
  }
}

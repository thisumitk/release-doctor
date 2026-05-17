import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctor } from "./index.js";
import { formatReport } from "./report.js";

export async function main(argv = process.argv.slice(2), streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const stderr = streams.stderr ?? process.stderr;

  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error.message}\n\n${helpText()}`);
    return 2;
  }

  if (parsed.help) {
    stdout.write(helpText());
    return 0;
  }

  if (parsed.version) {
    stdout.write(`${readOwnPackage().version}\n`);
    return 0;
  }

  try {
    const report = await runDoctor(parsed.path, {
      ci: parsed.ci,
      workspaces: parsed.workspaces
    });

    if (parsed.json) {
      stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      stdout.write(formatReport(report, { root: process.cwd() }));
    }

    if (report.counts.error > 0) return 1;
    if (parsed.strict && report.counts.warning > 0) return 1;
    return 0;
  } catch (error) {
    stderr.write(`release-doctor failed: ${error.stack || error.message}\n`);
    return 2;
  }
}

function parseArgs(argv) {
  const parsed = {
    path: process.cwd(),
    json: false,
    strict: false,
    ci: true,
    workspaces: true,
    help: false,
    version: false
  };

  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--version" || arg === "-v") {
      parsed.version = true;
      continue;
    }

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--strict") {
      parsed.strict = true;
      continue;
    }

    if (arg === "--no-ci") {
      parsed.ci = false;
      continue;
    }

    if (arg === "--no-workspaces") {
      parsed.workspaces = false;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positional.push(arg);
  }

  if (positional.length > 1) {
    throw new Error("Only one project path can be provided.");
  }

  if (positional.length === 1) {
    parsed.path = positional[0];
  }

  return parsed;
}

function readOwnPackage() {
  const current = path.dirname(fileURLToPath(import.meta.url));
  const packagePath = path.resolve(current, "..", "package.json");
  return JSON.parse(readFileSync(packagePath, "utf8"));
}

function helpText() {
  return `Release Doctor

Usage:
  release-doctor [project-path] [options]

Options:
  --json             Print a machine-readable JSON report.
  --strict           Exit non-zero when warnings are present.
  --no-ci            Skip CI and .npmrc checks.
  --no-workspaces    Only inspect the nearest package.json.
  -v, --version      Print the CLI version.
  -h, --help         Show this help.

Exit codes:
  0  No errors were detected.
  1  Release blockers were detected, or warnings in --strict mode.
  2  Invalid CLI usage or an unexpected runtime failure.
`;
}

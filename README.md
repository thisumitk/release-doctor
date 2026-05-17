# Release Doctor

[![CI](https://github.com/thisumitk/release-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/thisumitk/release-doctor/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/release-doctor.svg)](https://www.npmjs.com/package/release-doctor)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Release Doctor is a lightweight command line utility for npm package maintainers. It scans a package or npm workspace before release and reports issues that commonly break `npm publish`, CI verification, or downstream installs.

## Install

```sh
npm install --save-dev release-doctor
```

Run it from any package directory:

```sh
npx release-doctor .
```

Or add a project script:

```json
{
  "scripts": {
    "release:doctor": "release-doctor --strict ."
  }
}
```

For CI, use strict mode so warnings fail the job:

```sh
npx release-doctor --strict .
```

You can also run without installing:

```sh
npm exec release-doctor -- .
```

## GitHub Actions

```yaml
name: Release checks

on:
  pull_request:
  push:
    branches: [main]

jobs:
  release-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx release-doctor --strict .
```

## What It Checks

Release Doctor focuses on static checks that are safe to run before dependencies are installed:

- npm manifest correctness: package name, version, private packages, license, engines, repository metadata, package manager pinning, scoped package publish access.
- Publish surface: `main`, `exports`, `types`, `bin`, missing entrypoint files, CLI shebangs, executable bits, and `files` allowlist coverage.
- Dependency hazards: conflicting dependency ranges across dependency sections, self dependencies, wildcard ranges, local path dependencies, workspace protocol leaks, peer dependencies missing from local test installs, and stale peer metadata.
- Release process: missing or placeholder test scripts, deprecated `prepublish`, dist entrypoints without build hooks, missing README, license file, and changelog.
- Reproducibility: missing or stale lockfiles and package-manager mismatches.
- CI readiness: missing GitHub Actions workflows, missing install/test steps, publish workflows without checks, missing publish authentication, and Corepack setup for pnpm or Yarn.
- Workspace drift: npm workspace package discovery and dependency range drift across packages.
- Security hygiene: committed literal npm tokens in `.npmrc`.

## Example Output

```text
Release Doctor FAIL for .
1 package(s), 2 error(s), 1 warning(s), 0 info

.
  [error] ENTRYPOINT_MISSING_FILE: Declared entrypoint file is missing (package.json)
    main points to ./dist/index.js, but that file does not exist.
    Fix: Build the file before publishing or update package.json to the correct path.
```

## CLI

```text
release-doctor [project-path] [options]

Options:
  --json             Print a machine-readable JSON report.
  --strict           Exit non-zero when warnings are present.
  --no-ci            Skip CI and .npmrc checks.
  --no-workspaces    Only inspect the nearest package.json.
  -v, --version      Print the CLI version.
  -h, --help         Show help.
```

Exit code `0` means no release blockers were detected. Exit code `1` means errors were found, or warnings were found in `--strict` mode. Exit code `2` means invalid CLI usage or an unexpected runtime failure.

## JSON Reports

Use `--json` when another tool needs to consume the result:

```sh
npx release-doctor --json .
```

The JSON output includes package summaries, issue counts, severity, category, stable issue codes, recommendations, and evidence when available.

## Usage Guide

See [docs/USAGE.md](docs/USAGE.md) for local development workflows, CI examples, JSON consumption, and troubleshooting.

## Development

```sh
npm ci
npm test
npm run check
```

The package intentionally has no runtime dependencies.

## Releasing

Maintainers can publish from a GitHub release. The release workflow runs `npm ci`, `npm run check`, and `npm publish --provenance`.

Manual releases are guarded by `prepublishOnly`, which runs the full check suite before `npm publish`.

See [docs/RELEASE.md](docs/RELEASE.md) for the release checklist, changelog format, and npm publishing options.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Please keep new checks deterministic and avoid executing target package scripts unless the user explicitly opts in.

## Security

Please report security issues privately through GitHub security advisories when available, or by contacting the maintainer listed on npm.

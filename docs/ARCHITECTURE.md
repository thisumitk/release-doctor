# Architecture and boundaries

Release Doctor is a dependency-free, read-only diagnostic engine with a small CLI adapter. It reports likely release problems; it does not publish, install target dependencies, build targets, or run their lifecycle scripts.

## Execution path

1. `bin/release-doctor.js` passes arguments and output streams to `src/cli.js` and preserves the returned exit code.
2. `src/cli.js` parses flags, invokes `runDoctor`, and selects human-readable or JSON output. Strict mode changes the exit decision, not diagnostic severity.
3. `src/index.js` finds the nearest package, discovers workspace packages, runs checks, and collects issues. Invalid root manifests produce a report rather than continuing with partial package state.
4. `src/fs.js` provides filesystem reads and limited workspace/glob matching. Discovery skips dependency, version-control, and common build/cache directories.
5. `src/report.js` counts and sorts issues by severity, package path, and code. The report includes timing fields, so complete JSON reports are not byte-identical between runs.

The exported API is `runDoctor(projectPath, { ci, workspaces })`. Both options default to enabled. The function returns the same report used by the CLI; it does not print or set a process exit code.

## Why static checks

A release check should be usable before a package's dependencies are installed. Reading manifests and repository files keeps this tool small and avoids executing code from the package being inspected. The test suite contains lifecycle scripts that would leave a marker if invoked and verifies that diagnosis does not execute them.

This is not a sandbox or a full security scanner. Filesystem links, operating-system permissions, large inputs, and I/O failures still matter. Inspect untrusted repositories in an appropriately isolated environment.

## Known limits

- CI checks currently search workflow text. They do not parse YAML or prove job order, conditions, matrix expansion, action inputs, or reusable-workflow behavior. A passing diagnostic is not proof that CI runs on the intended Node version. This repository's CI asserts its selected runtime explicitly.
- The `files` check is an approximation, not npm's complete packlist implementation. npm automatically includes some files and applies ignore and glob rules beyond this tool's matcher. Review the actual tarball with `npm pack --dry-run` before releasing a target package.
- Workspace matching supports simple `*` and `**` patterns with bounded discovery depth, not every package manager's glob semantics.
- Export targets containing wildcards are not expanded. Conditional exports are inspected statically rather than resolved for every consumer environment.
- Dependency checks compare declared strings, not semantic-version range intersections or a resolved dependency graph.
- Registry availability, package ownership, publication permissions, and network/authentication failures are not checked.
- `--no-ci` also skips `.npmrc` checks. Use it only if that reduced scope is intentional.
- Node.js 20, 22, and 24 are the explicitly tested runtime majors. Declaring `>=20` does not mean every future runtime or operating system has been verified.

These boundaries are deliberate reasons to combine Release Doctor with real tests, a verified runtime matrix, and a packed-artifact smoke test rather than treat its pass status as a publication guarantee.

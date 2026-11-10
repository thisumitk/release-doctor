# Reproducing verification

Use a supported Node.js runtime and its bundled npm. There are no runtime or development dependencies to download.

```sh
node --version
npm --version
npm ci
npm run check
npm run test:coverage
```

`npm run check` runs JavaScript syntax checks, the entire test suite, and a strict self-check of this repository. `npm run lint` is a syntax check, not a style or type checker. `npm run test:coverage` uses Node's built-in experimental coverage reporting; the exact totals can vary by Node version.

## What the suites prove

- `test/release-doctor.test.js`: a clean package, common release blockers, workspace drift, and a failing CLI process.
- `test/cli.test.js`: help/version, argument errors, normal versus strict warning handling, JSON-only stdout, malformed manifest diagnostics, optional checks, and executable invocation with spaces in a path.
- `test/robustness.test.js`: malformed and non-object JSON, invalid file-list entries, directory-valued bins, shebang/mode checks, path traversal, conditional exports, stale lockfiles, token redaction, non-execution of lifecycle scripts, and workspace discovery.
- `test/packaging.test.js`: creates a real npm tarball, checks its contents, installs it into an isolated consumer offline, and runs the installed CLI and public API. On POSIX it also invokes npm's installed command link.

Every filesystem fixture registers cleanup, including when an assertion fails. The packaging test uses a temporary npm cache and disables lifecycle scripts, audit, funding requests, and network installation. It never runs `npm publish` and does not need an npm token. The isolated pack/install subprocesses explicitly disable inherited npm dry-run mode so the publication dry run can still exercise real temporary artifacts; this does not change the parent publication mode. Both inherited modes are tested. Its subprocess timeout is 30 seconds per command.

To focus on a suite:

```sh
node --test test/robustness.test.js
npm test -- test/cli.test.js
```

## CI runtime evidence

The CI workflow checks out the repository before `actions/setup-node`, because npm caching needs the checked-out lockfile. `node-version` and `cache` belong to setup-node, not checkout.

The Node.js 20, 22, and 24 jobs each assert that `process.versions.node` matches their matrix entry before installing dependencies. Inspect the **Verify selected Node.js runtime** step in each job and the test summary for the same commit. A green job label alone is not proof that the intended runtime was used.

The release workflow similarly checks Node.js 24, configures the npm registry through setup-node, and installs the pinned npm version before checks. Publishing is separate from test execution and requires the documented release authorization and npm configuration.

## Before a release

```sh
npm run check
npm run release:dry-run
```

The dry run exercises the publication lifecycle but does not upload a package. npm may still query the registry and reject an already-published version; a version-conflict error after passing lifecycle checks is not a test failure. Run it again with the intended, reviewed release version before publishing. Review the file list and version, and verify the actual CI results for the commit being released. See [RELEASE.md](RELEASE.md).

A passing suite is bounded evidence, not proof of all npm semantics. See [ARCHITECTURE.md](ARCHITECTURE.md) for what the diagnostic engine does not validate.

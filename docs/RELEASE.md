# Release Process

This project supports two release paths:

1. Preferred: create a GitHub release and let `.github/workflows/release.yml` publish to npm with provenance.
2. Manual fallback: run `npm publish` locally from a clean checkout.

## Required Access

- GitHub write access to `thisumitk/release-doctor`.
- npm publish access to the `release-doctor` package.
- For the GitHub release workflow, configure one of:
  - npm trusted publishing for `thisumitk/release-doctor`, workflow `Release`, and package `release-doctor`.
  - An `NPM_TOKEN` repository secret with publish access.

If both are available, the workflow uses `NPM_TOKEN`. If `NPM_TOKEN` is not configured, it publishes through trusted publishing using the job's OIDC identity.

## Version Checklist

Before publishing:

```sh
git pull --ff-only
npm ci
npm run check
npm run release:dry-run
```

Then update:

- `package.json` version.
- `package-lock.json` version metadata.
- `CHANGELOG.md` with the release date, highlights, fixes, and breaking changes.

Use semantic versioning:

- Patch for bug fixes and new diagnostics that do not change CLI behavior.
- Minor for new checks, flags, or report fields.
- Major for breaking CLI, JSON report, or Node.js support changes.

## Changelog Format

```md
## 0.2.0 - 2026-06-01

### Added

- New check for stale package manager lockfiles.

### Fixed

- Improve handling of npm canonical bin paths.
```

## GitHub Release

1. Push the release commit and tag.
2. Create or publish a GitHub release from the tag.
3. Include release notes copied from `CHANGELOG.md`.
4. Confirm the `Release` workflow succeeds.
5. Confirm npm shows the new version:

```sh
npm view release-doctor version
```

## Manual npm Release

Manual publishing runs `prepublishOnly`, so the full check suite runs before upload:

```sh
npm publish
```

For a final local verification without publishing:

```sh
npm run release:dry-run
```

## After Publishing

- Verify `npx release-doctor --version`.
- Confirm the README and package metadata render correctly on npm.
- Open a follow-up issue for any release notes, docs, or workflow problems found after publication.

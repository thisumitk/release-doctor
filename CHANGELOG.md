# Changelog

## Unreleased

### Fixed

- Keep offline artifact checks working when publication dry runs inherit npm dry-run mode.

- Apply Node.js version, npm cache, and registry inputs to setup-node after checkout in both workflows.
- Assert the selected Node.js runtime so a green matrix job cannot silently test the runner default.
- Report malformed manifest and lockfile shapes, invalid file-list entries, and directory-valued CLI bins without crashing.

### Added

- CLI contract, malformed-input, token-redaction, lifecycle-safety, and offline packed-artifact regression tests.
- Built-in coverage command and reproducible testing and architecture documentation.

## 0.1.0 - 2026-05-18

### Added

- Initialize Release Doctor as a dependency-free npm release diagnostics CLI.
- Add manifest, publish surface, dependency, CI, lockfile, workspace, and security checks.
- Add human-readable and JSON reports.
- Add GitHub Actions CI, release automation, contributor documentation, and npm publish safeguards.

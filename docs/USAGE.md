# Usage Guide

Release Doctor is designed to run before `npm publish` and in CI jobs that protect release branches.

## Run Locally

From the package you want to check:

```sh
npx release-doctor .
```

Fail on warnings as well as errors:

```sh
npx release-doctor --strict .
```

Inspect a workspace package from any nested directory:

```sh
npx release-doctor packages/my-package
```

Skip CI workflow checks when diagnosing a package outside GitHub Actions:

```sh
npx release-doctor --no-ci .
```

## Add to a Project

Install as a development dependency:

```sh
npm install --save-dev release-doctor
```

Add a release check script:

```json
{
  "scripts": {
    "release:doctor": "release-doctor --strict .",
    "prepublishOnly": "npm run test && npm run release:doctor"
  }
}
```

## CI Integration

For GitHub Actions:

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

## JSON Output

Use JSON for bots, dashboards, or custom release gates:

```sh
npx release-doctor --json . > release-doctor-report.json
```

The report includes:

- `status`: `pass`, `warn`, or `fail`.
- `packages`: discovered root and workspace packages.
- `counts`: issue counts by severity.
- `issues`: stable issue codes, category, recommendation, and evidence.

## Exit Codes

- `0`: no errors were found.
- `1`: errors were found, or warnings were found with `--strict`.
- `2`: invalid CLI usage or an unexpected runtime failure.

## Troubleshooting

If the tool reports a missing built file, run your package build before diagnosing or point `main`, `exports`, `types`, and `bin` to files that exist in the published package.

If CI checks are noisy for a non-GitHub project, run with `--no-ci`.

If workspace dependency drift is intentional, keep the output as an informational release review item and document the reason in your release notes.

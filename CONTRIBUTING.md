# Contributing

Thanks for helping improve Release Doctor.

## Development Setup

```sh
npm ci
npm run check
npm run test:coverage
```

The project intentionally avoids runtime dependencies. Prefer Node.js standard library APIs unless a dependency clearly improves correctness or maintainability.

See [docs/TESTING.md](docs/TESTING.md) for each suite's scope and isolated artifact checks, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and known limits.

## Adding Checks

- Keep checks deterministic and safe to run in untrusted package directories.
- Do not execute target package lifecycle scripts from the diagnostic engine.
- Return stable issue codes so CI consumers can suppress or track findings.
- Include a clear recommendation for every issue.
- Add focused tests for clean and failing fixtures, including malformed input.
- Register temporary-file cleanup with `t.after`, even for tests expected to fail.
- Preserve CLI exit codes and JSON-only stdout. Do not echo authentication values into diagnostics.

## Pull Requests

Before opening a pull request, run:

```sh
npm run check
```

Use concise commits and describe the release issue your change detects or fixes.

## Documentation

- User-facing usage belongs in `README.md`.
- Release process details belong in `docs/RELEASE.md`.
- Every new issue code should have a clear title, message, recommendation, and test coverage.

## Compatibility

Release Doctor supports Node.js 20 and newer. CI explicitly selects and asserts Node.js 20, 22, and 24 before running the full check suite. The publish workflow uses Node.js 24 and the pinned npm version.

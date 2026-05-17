# Contributing

Thanks for helping improve Release Doctor.

## Development Setup

```sh
npm ci
npm run check
```

The project intentionally avoids runtime dependencies. Prefer Node.js standard library APIs unless a dependency clearly improves correctness or maintainability.

## Adding Checks

- Keep checks deterministic and safe to run in untrusted package directories.
- Do not execute target package lifecycle scripts from the diagnostic engine.
- Return stable issue codes so CI consumers can suppress or track findings.
- Include a clear recommendation for every issue.
- Add focused tests for clean and failing fixtures.

## Pull Requests

Before opening a pull request, run:

```sh
npm run check
```

Use concise commits and describe the release issue your change detects or fixes.

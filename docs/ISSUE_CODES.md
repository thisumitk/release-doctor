# Issue Codes

Release Doctor reports stable issue codes for CI systems, dashboards, and release checklists.

## Manifest

| Code | Meaning |
| --- | --- |
| `PKG_JSON_MISSING` | No `package.json` was found. |
| `PKG_JSON_INVALID` | `package.json` could not be parsed as JSON. |
| `PKG_PRIVATE` | `private: true` prevents npm publication. |
| `PKG_NAME_MISSING` | The package has no `name`. |
| `PKG_NAME_INVALID` | The package name does not follow npm naming rules. |
| `PKG_VERSION_MISSING` | The package has no `version`. |
| `PKG_VERSION_INVALID` | The version is not valid semver. |

## Metadata

| Code | Meaning |
| --- | --- |
| `PKG_DESCRIPTION_MISSING` | The package has no description. |
| `PKG_LICENSE_MISSING` | The manifest has no license field. |
| `PKG_REPOSITORY_MISSING` | Repository metadata is missing. |
| `PKG_ENGINES_NODE_MISSING` | Supported Node.js versions are not declared. |
| `PKG_MANAGER_MISSING` | The root package does not pin a package manager. |
| `README_MISSING` | No README file was found. |
| `LICENSE_FILE_MISSING` | No license file was found. |
| `CHANGELOG_MISSING` | No changelog or release notes file was found. |

## Publishing

| Code | Meaning |
| --- | --- |
| `PKG_SCOPED_ACCESS_MISSING` | A scoped package does not declare public publish access. |
| `ENTRYPOINT_MISSING` | No package entrypoint is declared. |
| `ENTRYPOINT_NOT_RELATIVE` | An entrypoint does not resolve to a package-relative path. |
| `ENTRYPOINT_OUTSIDE_PACKAGE` | An entrypoint resolves outside the package root. |
| `ENTRYPOINT_MISSING_FILE` | A declared entrypoint file does not exist. |
| `ENTRYPOINT_EXCLUDED_FROM_FILES` | A declared entrypoint is excluded from the `files` allowlist. |
| `FILES_FIELD_INVALID` | The `files` field is not an array. |
| `FILES_ENTRY_INVALID` | A `files` entry is invalid. |
| `FILES_ENTRY_MISSING` | A `files` entry does not exist on disk. |
| `PACKAGE_CONTENTS_UNBOUNDED` | The package has neither `files` nor `.npmignore`. |
| `BIN_SHEBANG_MISSING` | A CLI bin file is missing a shebang. |
| `BIN_NOT_EXECUTABLE` | A CLI bin file is not executable on POSIX systems. |

## Dependencies

| Code | Meaning |
| --- | --- |
| `DEPS_SECTION_INVALID` | A dependency section is not an object. |
| `DEPS_SELF_REFERENCE` | The package depends on itself. |
| `DEPS_SPEC_INVALID` | A dependency specifier is empty or invalid. |
| `DEPS_CONFLICTING_RANGES` | The same dependency has conflicting ranges across sections. |
| `DEPS_UNPINNED_RANGE` | A dependency uses `*` or `latest`. |
| `DEPS_WORKSPACE_PROTOCOL_PUBLISH` | A published dependency uses the `workspace:` protocol. |
| `DEPS_LOCAL_PATH_PUBLISH` | A published dependency uses `file:` or `link:`. |
| `DEPS_GIT_SPEC_PUBLISH` | A published dependency uses a git-hosted specifier. |
| `PEER_NOT_TEST_INSTALLED` | A peer dependency is not installed for local tests. |
| `PEER_META_INVALID` | `peerDependenciesMeta` is not an object. |
| `PEER_META_WITHOUT_PEER` | Peer metadata references a missing peer dependency. |

## Release Process

| Code | Meaning |
| --- | --- |
| `SCRIPTS_INVALID` | `scripts` is not an object. |
| `SCRIPT_TEST_MISSING` | No test script is defined. |
| `SCRIPT_TEST_PLACEHOLDER` | The test script still contains the npm placeholder. |
| `SCRIPT_BUILD_MISSING_FOR_DIST` | Dist entrypoints exist without a build, prepare, or prepack hook. |
| `SCRIPT_PREPUBLISH_DEPRECATED` | The deprecated `prepublish` lifecycle is used. |

## Reproducibility

| Code | Meaning |
| --- | --- |
| `LOCKFILE_MISSING` | No package-manager lockfile was found. |
| `LOCKFILE_MULTIPLE_MANAGERS` | Multiple package-manager lockfiles were found. |
| `LOCKFILE_MANAGER_MISMATCH` | The lockfile does not match `packageManager`. |
| `LOCKFILE_INVALID_JSON` | An npm lockfile is invalid JSON. |
| `LOCKFILE_NAME_STALE` | The npm lockfile root package name is stale. |
| `LOCKFILE_VERSION_STALE` | The npm lockfile root package version is stale. |
| `LOCKFILE_DEPENDENCIES_STALE` | Lockfile dependency metadata differs from `package.json`. |
| `NPMRC_PACKAGE_LOCK_DISABLED` | `.npmrc` disables package-lock generation. |

## CI And Security

| Code | Meaning |
| --- | --- |
| `CI_WORKFLOW_MISSING` | GitHub Actions workflow files are missing. |
| `CI_INSTALL_STEP_MISSING` | CI does not appear to install dependencies. |
| `CI_TEST_STEP_MISSING` | CI does not appear to run tests or checks. |
| `CI_PUBLISH_WITHOUT_CHECKS` | A publish workflow does not appear to run checks first. |
| `CI_PUBLISH_AUTH_MISSING` | A publish workflow lacks detected npm authentication. |
| `CI_COREPACK_MISSING` | pnpm or Yarn is used without detected Corepack setup. |
| `NPMRC_TOKEN_LITERAL` | `.npmrc` appears to contain a committed literal auth token. |

## Workspaces

| Code | Meaning |
| --- | --- |
| `WORKSPACE_PATTERN_EMPTY` | A workspace pattern matched no packages. |
| `WORKSPACE_DEPENDENCY_DRIFT` | Workspace packages use different dependency ranges. |

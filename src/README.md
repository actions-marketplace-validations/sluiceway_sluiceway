# Source layout

| Path | What lives there | May import `@actions/*` or GitHub glue |
|---|---|---|
| `main.ts` | Entry point of the action. Reads the `mode` input and dispatches. | Yes |
| `mode.ts` | The list of modes and the dispatch table. | Yes |
| `core/` | Pure logic: types, config, discovery, hashing, the dependency graph. | No |
| `adapters/` | The adapter interface and one directory per infrastructure tool. | No |
| `github/` | Everything that talks to GitHub: the issue, permissions, deployment records, event parsing. | Yes |
| `render/` | Turns scan results into the dashboard body: rows, markers, the size budget. | Yes |

## The boundary

`core/` and `adapters/` never import `@actions/*`, `@octokit/*`, anything under `github/`, or the entry point. They never read a GitHub event payload either. What they need is passed in as plain data. This keeps them reusable outside a GitHub Actions run.

Two things enforce it:

- Biome's `noRestrictedImports` rule, scoped to those two directories in `biome.json`.
- `test/boundary.test.ts`, which scans every import in those directories.

Most directories are empty for now. They fill up from milestone M1 on.

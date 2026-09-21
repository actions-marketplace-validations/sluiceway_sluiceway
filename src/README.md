# Source layout

| Path | What lives there | May import `@actions/*` or GitHub glue |
|---|---|---|
| `main.ts` | Entry point of the action. Reads the `mode` input and dispatches. | Yes |
| `mode.ts` | The list of modes and the dispatch table. | Yes |
| `core/` | Pure logic: types, config, which discovered stacks exist (`ignore`, one id per stack), the diff hash, the claim rule, the tick rule, attribution. | No |
| `adapters/` | The adapter interface, the process runner every tool is started through, the tool environment, and one directory per infrastructure tool. | No |
| `github/` | Everything that talks to GitHub: the issue, permissions, deployment records, event parsing. | Yes |
| `render/` | Turns scan results into the dashboard body: rows, markers, the size budget. | No |

## The boundary

`core/`, `adapters/` and `render/` never import `@actions/*`, `@octokit/*`, anything under `github/` or `modes/`, or the entry point. They never read a GitHub event payload either. What they need is passed in as plain data. This keeps them reusable outside a GitHub Actions run. Rendering is inside the boundary because the core renders the diff itself (record 0002), so a hosted version would reuse it.

Two things enforce it:

- Biome's `noRestrictedImports` rule, scoped to those three directories in `biome.json`.
- `test/boundary.test.ts`, which scans every import in those directories.

Most directories are empty for now. They fill up from milestone M1 on.

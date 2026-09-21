# Contributing

Thanks for wanting to help. This page says how to set up, what the rules are and how a change gets merged.

## Before you start

- For anything larger than a small fix, open an issue first so the direction is agreed before you write code.
- Read [CONTEXT.md](CONTEXT.md). It fixes the words used in code, docs and the dashboard. Each term lists words to avoid.
- Skim [docs/adr](docs/adr). A change that goes against a decision record needs a new record, not only a pull request.
- Check [docs/later.md](docs/later.md). It lists what was left out of v1 on purpose.

## Setup

You need [Bun](https://bun.sh). The version is pinned in `.bun-version`. Use that exact version, because it decides the bytes of `dist/`.

```sh
bun install
```

## Commands

| Command | What it does |
|---|---|
| `bun run lint` | Biome lint and format check. |
| `bun run lint:fix` | The same, and writes the fixes. |
| `bun run typecheck` | TypeScript, strict, no emit. |
| `bun run test` | Unit tests with `bun test`. |
| `bun run build:schema` | Writes `schema/sluiceway.schema.json` from the Zod schema in `src/core/config.ts`. |
| `bun run check:schema` | Generates, then fails if `schema/` differs from what is committed. |
| `bun run build` | Bundles `src/main.ts` into `dist/index.js` for the Node runtime of GitHub Actions. |
| `bun run check:dist` | Builds, then fails if `dist/` differs from what is committed. |
| `bun run check` | All of the above, as CI runs them. |

## dist/ is committed

GitHub runs a JavaScript action straight from the repository, so the bundle in `dist/` is part of the source. When you change anything under `src/`, or a runtime dependency, or the Bun version:

```sh
bun run build
git add dist
```

CI fails when `dist/` does not match the source. Never edit `dist/` by hand.

The JSON schema of `sluiceway.yaml` works the same way. It is generated from the Zod schema that config loading uses, committed, and checked in CI. When you change `src/core/config.ts`:

```sh
bun run build:schema
git add schema
```

Never edit `schema/sluiceway.schema.json` by hand.

## Rules for code

- TypeScript, strict, ESM.
- `src/core/`, `src/adapters/` and `src/render/` never import `@actions/*`, `@octokit/*`, anything under `src/github/` or `src/modes/`, or the entry point. They never read a GitHub event payload. A lint rule and `test/boundary.test.ts` enforce this. See [src/README.md](src/README.md).
- No property value ever leaves an adapter. Do not add a field that could hold one.
- Do not print, log or store anything from the environment.
- Ask in an issue before you add a runtime dependency. Everything in `dependencies` ends up in the bundle that every user downloads on every run.
- No license headers in source files. The [LICENSE](LICENSE) file covers the repository.

## Rules for words

This applies to docs, comments, error messages and everything the dashboard shows.

- Plain and direct. Short sentences. No marketing language.
- No em-dashes.
- Use the terms from [CONTEXT.md](CONTEXT.md), and not the words it says to avoid.

## Commits and pull requests

- [Conventional commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`, `test:`, `build:`, `ci:`, `chore:`, `refactor:`. The release notes and the version number are built from them.
- Small commits that each do one thing.
- One pull request per topic. Say what is in it and how you checked it.
- Workflows pin every third-party action by commit SHA with the version in a comment, and ask for the smallest `permissions:` that work.

## Decision records

A decision that is hard to reverse, surprising without context and the result of a real trade-off gets a short record in `docs/adr/`, numbered in order. When a decision leaves something out of v1, add a line to [docs/later.md](docs/later.md) in the same change.

## Releases

[release-please](https://github.com/googleapis/release-please) keeps a release pull request open on `main`. Merging it creates the tag and the GitHub release, and moves the major tag (such as `v1`) to the new release.

## License

By contributing you agree that your contribution is licensed under [Apache-2.0](LICENSE).

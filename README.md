# Sluiceway

Sluiceway keeps one GitHub issue, the dashboard, that shows which infrastructure stacks have changes waiting. You tick a stack's box and a GitHub Actions run deploys exactly that stack.

It is a GitHub Action and nothing else. There is no server, no database and no hosted part. Previews and deploys run in your own runners.

> [!WARNING]
> Sluiceway is not usable yet. This repository holds the project scaffold. Every mode fails with "not implemented yet". Watch the releases to hear when that changes.

## How it works

1. After a merge to the default branch, and on a schedule, a **scan** previews the stacks in the repo.
2. The scan writes the results to the dashboard issue: one row per stack, with a checkbox on every stack that has changes waiting.
3. A person ticks a box. That is a request to deploy that stack exactly as the row shows it.
4. Sluiceway checks that the person is allowed to tick that stack, then previews the stack again. It deploys only if the fresh preview still matches what the row showed.
5. The row goes back to in sync, or shows why the deploy failed.

The issue is a rendered view and never the source of truth. What is pending is always worked out again from a fresh preview.

Pulumi is the first supported tool. The adapter interface is built so that OpenTofu and Terraform can follow.

[CONTEXT.md](CONTEXT.md) defines the words used here and in the code.

## Modes

One action, four modes, chosen with the `mode` input.

| Mode | What it does | Runs the infrastructure tool |
|---|---|---|
| `scan` | Previews stacks and brings the dashboard up to date. | Yes |
| `resolve` | Reacts to a tick: checks who ticked, records the deploy and hands the stack to `apply`. | No |
| `apply` | Previews the stack again and deploys it if nothing moved since the tick. | Yes |
| `settle` | Gives a deploy a result when its workflow run ended without reporting one. | No |

## Inputs

| Input | Default | What it is |
|---|---|---|
| `mode` | required | One of `scan`, `resolve`, `apply`, `settle`. |
| `concurrency` | `4` | How many previews a scan runs at the same time. |
| `preview-timeout` | `10` | Time limit for one preview, in minutes. |
| `github-token` | the workflow token | Leave it at the default. Sluiceway always acts as the workflow's own `GITHUB_TOKEN`. A GitHub App token or a personal access token is not supported. |

## Usage

<!-- PLACEHOLDER: consumer workflow example. Do not copy the example from docs/brief.md. It is outdated. -->

> [!NOTE]
> **Placeholder.** The example workflow is not written yet. It arrives together with the first working modes. The decision records in [docs/adr](docs/adr) already fix its permissions, deployment records and concurrency groups, and the example will follow them.

## Configuration

<!-- PLACEHOLDER: sluiceway.yaml reference. -->

> [!NOTE]
> **Placeholder.** Sluiceway will read an optional `sluiceway.yaml`. Its reference arrives with config loading.

## Credentials

Sluiceway never holds credentials. That is five promises you can check against the code:

1. **No credential inputs.** The action takes one secret, the GitHub token. No input and no config key ever carries a cloud, backend or secret manager credential.
2. **Never read by name.** No Sluiceway code reads a credential variable. Your workflow prepares the environment, and it goes to the tool as one opaque block.
3. **Never stored, never sent.** Nothing from the environment reaches the issue, deployment records, job summaries, artifacts or caches. The only network calls are to the GitHub API and whatever the tool itself makes.
4. **Only the modes that run the tool need credentials.** `scan` and `apply` run the tool. `resolve` and `settle` never do, so the job that reacts to an issue edit holds no infrastructure secrets.
5. **A hosted version would keep all of this.** The tool always runs in your own runners.

The dashboard shows resource types, resource names and the names of changed properties. It never shows a property value, whether or not the tool marks it secret.

## Documentation

- [CONTEXT.md](CONTEXT.md): the glossary.
- [docs/adr](docs/adr): the decision records. Where a record and the brief disagree, the record wins.
- [docs/brief.md](docs/brief.md): the original project brief, kept as written.
- [docs/later.md](docs/later.md): what was left out of v1, and why.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)

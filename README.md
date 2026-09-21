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
| `deployment-id` | required in `apply` | The deployment record to deploy. It comes from the `matrix` output of `resolve`. Not in `action.yml` yet. |

## Outputs

| Output | Set by | What it is |
|---|---|---|
| `matrix` | `resolve` | A JSON list with one `{ stack, environment, deployment }` entry per deploy that was started, or `[]`. Not in `action.yml` yet. |

## Usage

The modes do not work yet (see the warning at the top). This is the workflow they are being built for. Put it in `.github/workflows/sluiceway.yml` on the default branch.

```yaml
name: sluiceway

on:
  push:
    branches: [main]
  schedule:
    - cron: "0 6 * * *" # keep this: the daily full scan is part of the design
  workflow_dispatch:
  issues:
    types: [edited]

# This block is everything Sluiceway can do in your repo.
permissions:
  contents: read
  issues: write
  deployments: write
  actions: write

jobs:
  scan:
    if: github.event_name != 'issues'
    runs-on: ubuntu-latest
    concurrency: sluiceway-scan
    steps:
      - uses: actions/checkout@v7
      - uses: pulumi/actions@v7 # without a command this only installs the CLI
        with:
          pulumi-version: ^3.229.0
      # Install what your programs need, once, for example: npm ci
      # Load your credentials and your state backend settings into the job
      # environment here. Sluiceway passes the environment to the tool and
      # never looks inside. Whatever loads a secret must also mask it.
      - uses: sluiceway/sluiceway@v0
        with:
          mode: scan

  resolve:
    if: github.event_name == 'issues' && contains(github.event.issue.labels.*.name, 'sluiceway')
    runs-on: ubuntu-latest
    concurrency: sluiceway-resolve
    outputs:
      matrix: ${{ steps.resolve.outputs.matrix }}
    steps:
      - uses: actions/checkout@v7
      # No tool and no credentials in this job. It never runs the tool.
      - id: resolve
        uses: sluiceway/sluiceway@v0
        with:
          mode: resolve

  apply:
    needs: resolve
    if: needs.resolve.outputs.matrix != '' && needs.resolve.outputs.matrix != '[]'
    strategy:
      fail-fast: false
      matrix:
        include: ${{ fromJson(needs.resolve.outputs.matrix) }}
    runs-on: ubuntu-latest
    concurrency:
      group: sluiceway-apply-${{ matrix.stack }}
      queue: max
    steps:
      - uses: actions/checkout@v7
      - uses: pulumi/actions@v7
        with:
          pulumi-version: ^3.229.0
      # Same install and credential steps as in the scan job. These
      # credentials must be able to change things.
      - uses: sluiceway/sluiceway@v0
        with:
          mode: apply
          deployment-id: ${{ matrix.deployment }}

  settle:
    needs: [resolve, apply]
    if: always() && needs.resolve.outputs.matrix != '' && needs.resolve.outputs.matrix != '[]'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: sluiceway/sluiceway@v0
        with:
          mode: settle
```

What the parts are for:

- **`actions: write`** lets the rescan box start a scan, and lets a scan see whether a run is still on its way. `id-token: write` is not in the block. Add it only to the jobs that run the tool, and only if your credential step uses OIDC.
- **`sluiceway-scan`** makes scans run one at a time. A running scan finishes, and of the waiting ones only the newest runs.
- **`sluiceway-resolve`** does the same for ticks. Any `resolve` run handles every ticked box it finds, so a replaced run loses nothing. Replaced runs show as cancelled in the Actions list. That is normal.
- **`queue: max`** on `apply` keeps a waiting deploy from being cancelled by a newer one. Never add `cancel-in-progress` to this job.
- **The `if:` on `resolve`** keeps an edit of an ordinary issue from starting a runner. If you change `dashboard.label`, change it here too.
- **`resolve` hands `apply` a deployment record.** It creates one record per ticked stack in GitHub's Deployments list and puts `{ stack, environment, deployment }` in `matrix`. `apply` deploys only while that record is still open. "Re-run failed jobs" therefore deploys nothing. To try again, tick the box again.
- **`settle`** gives a deploy a result when its job was cancelled or rejected, so a row never stays "deploying" for ever.
- **`v0`** is the moving tag until 1.0.0. Pin a commit SHA instead if you want to review every update.

Self-hosted runners work the same way: change `runs-on` for `scan` and `apply`. They need runner version 2.328.0 or newer, and ARM32 is not supported. `resolve` and `settle` hold no infrastructure secrets, so they can stay on hosted runners.

### With GitHub Environments

The tick is always a gate. Where your plan has environments, they make it a stronger one: store the credentials that can change things as secrets of an environment that is limited to the default branch, and add required reviewers where you have them. Give every stack an `environment` in `sluiceway.yaml`, and add this to the `apply` job:

```yaml
    environment:
      name: ${{ matrix.environment }}
      deployment: false # Sluiceway already records the deploy
```

GitHub lists an environment for every name a deployment record uses, so your repo settings will show one named `sluiceway` (or the names you configured) even if you never use the feature. That entry is only a label.

Without `deployment: false` GitHub records every deploy a second time. Custom deployment protection rules do not work with `deployment: false`. If you use them, leave it out and accept the second record. Sluiceway ignores it.

## Configuration

<!-- PLACEHOLDER: sluiceway.yaml reference. -->

> [!NOTE]
> **Placeholder.** Sluiceway reads an optional `sluiceway.yaml` at the repo root. The full reference arrives with the docs of M2. Until then the keys are listed in [docs/build-plan.md](docs/build-plan.md), section 3, and [schema/sluiceway.schema.json](schema/sluiceway.schema.json) describes them for editors. Unknown keys are an error.

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
- [docs/build-plan.md](docs/build-plan.md): what is being built, in which order, and how it is proven.
- [docs/adr](docs/adr): the decision records. Where a record and the brief disagree, the record wins.
- [docs/later.md](docs/later.md): what was left out of v1, and why.
- [docs/acceptance.md](docs/acceptance.md): the checklist that proves v1 against its first real user.
- [docs/brief.md](docs/brief.md): the original project brief, kept as history. Do not build from it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)

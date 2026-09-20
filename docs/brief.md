> Original project brief, kept as written on 2026-09-20. Where research or later decisions correct it, the correction wins. See the planning map: https://github.com/sluiceway/sluiceway/issues/1

# Sluiceway: agent brief

You are bootstrapping a new open source project called **Sluiceway**. Read this whole file before writing code. Where this brief says "verify", check current docs instead of trusting this text or your training data.

## 1. What it is

Sluiceway is "Renovate's Dependency Dashboard, but for infrastructure deploys".

After code is merged to the default branch, Sluiceway previews every IaC stack in the repo and maintains ONE self-updating GitHub issue (the dashboard) that shows which stacks have pending changes. A human ticks checkboxes in that issue. Ticking a box triggers a GitHub Actions run that deploys exactly the selected stacks. The same dashboard also shows drift (reality changed outside of code), found by scheduled scans.

Mental model: ArgoCD's "OutOfSync, click to sync", but for Pulumi/OpenTofu, and the UI lives entirely inside GitHub.

A sluiceway is a channel with a gate where someone controls what flows through. Changes queue up behind the gate, you decide what passes.

### Why this exists (positioning)

Existing tools (Atlantis, Terrateam, Digger/OpenTaco, Terramate, Pulumi Cloud) are PR-centric: plan on PR, apply on comment or auto-apply on merge. They treat issues as drift alerts at best. Nobody models "merged but not yet deployed" as a first-class queue you pick from, and nobody uses a GitHub issue as the actual control panel. That is the gap.

Principles that follow from this:

1. **The issue is the product.** Its readability and UX matter more than any other feature.
2. **Zero backend.** v1 is a GitHub Action only. No server, no database, no hosted component.
3. **Never hold credentials.** Everything runs in the user's own runners (often self-hosted, on private networks). Sluiceway only passes env through to the IaC tool.
4. **The issue is a rendered view, never the source of truth.** Truth is always recomputed by previewing again.
5. **Pulumi first, OpenTofu/Terraform second.** Adapter interface from day one, one implementation.

### Non-goals for v1

- No hosted app, web UI, GitHub App, Slack, policy engine, cost estimation.
- No per-resource selection (no `--target`). Granularity is one checkbox per stack.
- No PR plan comments. Other tools do that well already.
- No GitLab/Bitbucket.

## 2. Tech stack and conventions

- TypeScript, strict mode. ESM.
- **Bun** for install, scripts, tests (`bun test`) and bundling. The action itself runs on GitHub's Node runtime, so bundle with `bun build --target=node` into `dist/`. Verify the current recommended `runs.using` Node version for JavaScript actions and use it.
- `dist/` is committed (required for JS actions). CI must fail if `dist/` is out of date.
- Biome for lint and format.
- `@actions/core`, `@actions/github` (Octokit). Zod (or Valibot) for config and for parsing tool JSON output.
- No em-dashes in docs or UI strings. Plain, direct wording. No marketing fluff in the README.
- License: Apache-2.0 (owner may change this, ask before adding license headers everywhere).
- Conventional commits. release-please (or changesets) for releases, with a moving major tag (`v1`) as is standard for actions.
- Add a Renovate config for the repo itself.

## 3. Architecture

Keep a hard boundary between pure core logic and GitHub/Actions glue. A hosted version may reuse the core later, so `core/` and `adapters/` must not import `@actions/*` or read GitHub event payloads.

```
sluiceway/
  action.yml                  # single action, `mode` input: scan | resolve | apply
  src/
    main.ts                   # entry, dispatches on mode
    core/
      types.ts                # Stack, NormalizedDiff, ScanResult, Selection
      config.ts               # load + validate sluiceway.yaml
      discover.ts             # find stacks
      hash.ts                 # stable hash of a NormalizedDiff
      graph.ts                # dependency graph, topological layers
    adapters/
      adapter.ts              # Adapter interface
      pulumi/                 # only implementation in v1
    github/
      issue.ts                # find/create/update/pin dashboard issue
      permissions.ts          # actor permission checks
      deployments.ts          # Deployments API + job summaries
      event.ts                # parse `issues.edited` payload
    render/
      dashboard.ts            # ScanResult[] -> markdown body
      markers.ts              # hidden marker encode/decode
      truncate.ts             # body size budget
  examples/
    pulumi-basic/             # 2-3 tiny stacks, local backend, no cloud creds
  test/
    fixtures/                 # recorded tool JSON output
  docs/
  .github/workflows/          # ci.yml, release.yml, e2e.yml
```

### Adapter interface

```ts
interface Adapter {
  id: "pulumi" | "opentofu";
  discover(root: string, config: Config): Promise<Stack[]>;
  preview(stack: Stack): Promise<NormalizedDiff>;        // code vs state
  detectDrift(stack: Stack): Promise<NormalizedDiff>;    // state vs reality, must not mutate
  apply(stack: Stack): Promise<ApplyResult>;
}

interface NormalizedDiff {
  stackId: string;                       // e.g. "infra/proxmox:prod"
  changes: Array<{
    urn: string;
    type: string;
    name: string;
    op: "create" | "update" | "replace" | "delete";
    changedKeys: string[];               // property names only, never values
  }>;
  summary: { create: number; update: number; replace: number; delete: number };
  rendered: string;                      // human-readable diff, secrets masked
}
```

### Pulumi adapter: decide this first (spike)

Two options. Do a short spike and write the decision into `docs/decisions/0001-pulumi-driver.md`.

- **A. Shell out to the `pulumi` CLI with `--json`.** Small bundle, no native deps. Default choice unless the spike shows a blocker.
- **B. Pulumi Automation API (`@pulumi/pulumi/automation`).** Nicer typed API, but it wraps the CLI anyway and the SDK pulls in gRPC/protobuf, which is known to be painful to bundle into a single-file action.

Either way the `pulumi` CLI must be on PATH. Document that users add Pulumi's setup step before Sluiceway. Verify current CLI flags for: JSON preview output, refresh in preview-only mode (for drift without mutating state), and non-interactive apply. Do not build on Pulumi's saved update plans unless you verify they are no longer experimental.

Backend and secrets are the user's business: Sluiceway passes env through (`PULUMI_ACCESS_TOKEN`, `PULUMI_BACKEND_URL`, `PULUMI_CONFIG_PASSPHRASE`, cloud creds via OIDC). It must work with self-managed backends (S3/MinIO, file), not just Pulumi Cloud.

Discovery: find `Pulumi.yaml` files, then `Pulumi.<stack>.yaml` next to them. Zero config should work for the common case.

## 4. The three modes

### `scan` (on push to default branch, on schedule, on manual dispatch)

1. Load config, discover stacks.
2. For each stack: `preview`. On schedule (or when `drift: true`): also `detectDrift`.
3. Compute a stable hash per diff (URNs + ops + changed keys, sorted; never values).
4. Attribute pending changes to merges where possible: commits since the stack's last successful Sluiceway deployment that touched the stack's path, linked to their PRs.
5. Render and upsert the dashboard issue. Write a job summary with the full untruncated diffs.

A failing preview for one stack must not abort the scan. Show it on the dashboard as an error row with a link to the run.

### `resolve` (on `issues: edited`)

1. Ignore unless the edited issue is the dashboard (label + hidden root marker + authored by the bot identity).
2. Diff `changes.body.from` against the current body. Only boxes that went from unchecked to checked count.
3. **Authorize the actor.** Look up `sender`'s repo permission via the API. Require `write` or higher by default (configurable per stack to `admin` or a list of users/teams). Unauthorized: untick the box, add a comment explaining why, exit.
4. Read stack id and hash from the row's hidden marker. Reject stack ids that discovery doesn't know.
5. Output a JSON matrix: `[{ stack, environment, expectedHash }]`.
6. Immediately re-render the selected rows as "deploying" with no checkbox, so two people can't trigger the same stack twice.

Note: edits made with `GITHUB_TOKEN` don't trigger workflows, so re-rendering won't cause loops. Verify this still holds, and add an explicit sender check anyway.

Also support a Renovate-style "rescan" checkbox at the bottom of the issue that triggers `scan` via `workflow_dispatch`.

### `apply` (matrix job, one per selected stack)

1. Preview again. Compute hash. If it differs from `expectedHash`: abort, do not apply, re-render with the new diff and a note that the change moved since it was approved.
2. Apply.
3. Record a GitHub Deployment + status for the stack's environment, write a job summary, comment on the dashboard only on failure.
4. Re-scan that stack and re-render.

This design is intentionally stateless: the hash lives in the issue marker, and the real check is always a fresh preview. A forged hash can only ever approve what the current preview actually shows, and only by someone who already has permission.

### Example consumer workflow (ship this in the README)

```yaml
name: sluiceway
on:
  push: { branches: [main] }
  schedule: [{ cron: "0 6 * * *" }]
  issues: { types: [edited] }
  workflow_dispatch:

permissions:
  contents: read
  issues: write
  deployments: write
  id-token: write

jobs:
  scan:
    if: github.event_name != 'issues'
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: pulumi/actions@v6        # verify current version, install only
      - uses: sluiceway/sluiceway@v1
        with: { mode: scan }

  resolve:
    if: github.event_name == 'issues'
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.r.outputs.matrix }}
    steps:
      - uses: actions/checkout@v4
      - id: r
        uses: sluiceway/sluiceway@v1
        with: { mode: resolve }

  apply:
    needs: resolve
    if: needs.resolve.outputs.matrix != '[]'
    strategy:
      fail-fast: false
      matrix:
        include: ${{ fromJson(needs.resolve.outputs.matrix) }}
    runs-on: self-hosted
    environment: ${{ matrix.environment }}
    concurrency: sluiceway-${{ matrix.stack }}
    steps:
      - uses: actions/checkout@v4
      - uses: pulumi/actions@v6
      - uses: sluiceway/sluiceway@v1
        with:
          mode: apply
          stack: ${{ matrix.stack }}
          expected-hash: ${{ matrix.expectedHash }}
```

GitHub Environments (required reviewers, branch rules, scoped secrets) are the real approval gate for production. The checkbox is the trigger, not the security boundary. Say this clearly in the docs.

## 5. Config: `sluiceway.yaml`

Optional. Everything has defaults.

```yaml
dashboard:
  title: "Sluiceway dashboard"
  label: sluiceway
  pin: true
stacks:
  - path: infra/proxmox
    stack: prod
    environment: homelab-prod       # GitHub Environment name
    dependsOn: []
    approvers: write                # write | admin | [users/teams]
  - path: infra/k8s
    stack: prod
    environment: homelab-prod
    dependsOn: ["infra/proxmox:prod"]
ignore:
  - "**/examples/**"
drift:
  enabled: true
```

Generate a JSON schema from the Zod schema and publish it so editors autocomplete.

## 6. The dashboard issue (spend the most care here)

Sections, in this order:

1. **Header line:** counts (N pending, N drifted, N in sync, N failing), last scan time, commit SHA, link to the run.
2. **Pending from merges:** one row per stack with a checkbox.
3. **Drift:** same row format, clearly labeled as changes that happened outside of code.
4. **Deploying / failed:** rows without checkboxes, with run links.
5. **In sync:** collapsed `<details>`.
6. **Recently deployed:** last 5 to 10, who ticked it, when, run link.
7. **Footer:** rescan checkbox, link to docs, Sluiceway version.

Row format:

```md
- [ ] **infra/proxmox:prod** · `+2 ~1 -0` · from #123 by @robbe · [preview](run-url)
  <!-- sluiceway:row stack="infra/proxmox:prod" hash="3fa9c1e2" -->
  <details><summary>Show changes</summary>

  (rendered diff, secrets masked)

  </details>
```

Rules:

- Use GitHub alert blocks (`> [!WARNING]`) on rows that contain `replace` or `delete`. Destroys must be impossible to miss.
- Never render property values that the tool marks as secret. When in doubt, show keys only.
- Issue bodies cap at 65,536 characters. Implement a size budget: truncate per-stack diffs first, then collapse to summary-only rows, always linking to the job summary for the full diff. Test this with a 100-stack fixture.
- Find the dashboard by label + a root marker (`<!-- sluiceway:dashboard v1 -->`). Create it if missing. Pin it if configured (GraphQL `pinIssue`, verify).
- Rendering must be deterministic: same input, byte-identical output. Skip the API call when the body didn't change.
- Snapshot-test the renderer heavily.

## 7. Security checklist

- Actor permission check in `resolve` (see above). Test the unauthorized path.
- Trust nothing from the issue body except: which row was ticked, and the hash. Both are validated against discovery and a fresh preview.
- Minimal `permissions:` in all example workflows.
- Public repos: diffs in a public issue can leak infra details. Add a `dashboard.redact: true` mode (summary counts only) and warn in the docs.
- Pin third-party actions by SHA in this repo's own workflows.
- Never log env vars. Mask anything that looks like a token in captured tool output.

## 8. Milestones

**M0: repo bootstrap**
Repo scaffold, Bun + Biome + tsconfig, `action.yml`, CI (lint, typecheck, test, dist-up-to-date check), release workflow, README skeleton, LICENSE, CONTRIBUTING, SECURITY.md, issue templates, Renovate config.

**M1: scan + render (read-only)**
Config, Pulumi discovery, preview, normalized diff, hashing, dashboard render + upsert, job summaries. `examples/pulumi-basic` using only credential-free providers (e.g. `random`, `command`) and a local file backend so e2e runs in CI without cloud access. Done when: pushing to the example repo updates a correct dashboard.

**M2: resolve + apply**
Event parsing, permission check, matrix output, stale-hash abort, apply, Deployments API, "deploying" state, failure handling, rescan checkbox. Done when: ticking a box deploys exactly that stack and the dashboard returns to in sync.

**M3: drift + dependencies**
Scheduled drift detection, drift section, dependency graph. Dependency rule for v1: if a ticked stack has an upstream with pending changes that is not ticked, refuse and explain on the dashboard. If both are ticked, only dispatch the first topological layer, mark the rest "queued behind X", and re-trigger `resolve` after the layer succeeds (via `workflow_dispatch`, which `GITHUB_TOKEN` is allowed to trigger, verify).

**M4: polish for public launch**
Docs site or solid README, screenshots/GIF of the dashboard, redact mode, 100-stack size test, merge queue (`merge_group`) note, v1.0.0 tag, Marketplace listing.

**Later, not now:** OpenTofu adapter, auto-detect Pulumi StackReferences for the dependency graph, hosted GitHub App with an org-wide dashboard.

## 9. Testing

- Unit: config, discovery, hashing (order independence), graph, marker encode/decode, event diffing (which boxes changed), truncation.
- Snapshot: dashboard renderer across fixtures (empty, all in sync, mixed, errors, huge).
- Adapter: parse recorded real `pulumi` JSON output stored in `test/fixtures`. Record them from the example project, don't hand-write them.
- E2E (M1+): workflow in this repo that runs `scan` against `examples/pulumi-basic` with a local backend.
- Octokit calls go through a thin wrapper so they can be faked without network.

## 10. How to work

1. Start with M0 and the Pulumi driver spike, nothing else. Open a PR per milestone chunk, small commits.
2. Write the decision records in `docs/decisions/` as you go (driver choice, stateless hash design, dependency handling).
3. When something in this brief conflicts with how GitHub or Pulumi actually behave today, the real behavior wins. Note the deviation in the PR description.
4. Ask the owner before: changing the license, adding a runtime dependency heavier than ~1 MB bundled, adding any network call that isn't the GitHub API or the IaC tool, or expanding scope beyond the current milestone.

## 11. Owner setup (manual, outside the agent's reach)

- Create the `sluiceway` GitHub org and the `sluiceway/sluiceway` repo. Reserve the `sluiceway` npm name with a placeholder package.
- Check `sluiceway.dev` / `.sh`.
- First real user is the owner's Pulumi-managed homelab, on self-hosted runners (actions-runner-controller on the cluster). Treat self-hosted runners and self-managed Pulumi backends as first-class from day one.

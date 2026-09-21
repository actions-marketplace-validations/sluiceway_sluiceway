# Not in v1

One list of everything that was considered and left out of v1, so planning for v2 starts from a complete picture. Each line says what it is, why it is not in v1, and where that was decided. The decision record holds the detail; this file only points.

Rule: whenever a decision leaves something out of v1, add a line here in the same change.

## Deferred, door left open

Left out of v1 on purpose, and v1 was shaped so these can be added without a breaking change.

| What | Why not in v1 | Decided in |
|---|---|---|
| OpenTofu and Terraform adapter | One adapter first. The core terms, diff shape and adapter interface were checked against OpenTofu on paper. | Brief, 0006, 0007 |
| Drift detection and the drift section | Needs the core loop working first. The marker format and row states already have room for drift rows. | Brief M3, 0009 |
| Stack dependencies and "queued behind X" | Same. The marker format has room for the queued state. | Brief M3, 0009 |
| Detecting dependencies from Pulumi stack references | Comes after manual `dependsOn`. | Brief |
| A named `refresh` option (preview, re-preview and deploy with refresh, so a deploy also repairs drift) | Belongs with the drift design. It would be one named option that applies to all three calls so the hash stays honest. | 0015 |
| Showing property values, also as an opt-in list of properties | Needs nested property paths, which reopens the diff shape. The hash rule keeps it possible. | 0021, 0007, 0008 |
| A finer `dashboard.redact` (per stack, or a middle level such as types without names) | One boolean is enough to launch. | 0023 |
| Teams in the tick rule | The workflow token cannot read team membership, and a second stored token breaks the credential promises. The `org/team` syntax is reserved and fails with a clear message. | 0018, 0017 |
| A GitHub App token or PAT as the bot identity | One identity in v1. It would arrive as a new optional input, together with an identity input and a loop guard. | 0017 |
| Spreading one scan over several runners (sharding) | One job with a bounded pool is enough for now. A shard would be a narrowed scan, so no new merge rule is needed. | 0011, 0012 |
| An `id:` override for a stack in `sluiceway.yaml` | A second source of identity that has to be kept unique. The id is always derived in v1. | 0006 |
| Starting a deploy without a person ticking (unattended deploys of chosen stacks) | If it comes, it is a real entry point such as `workflow_dispatch` with a stack input, where GitHub records who started it. Not a bot ticking boxes. | 0018 |
| An off-switch for the dashboard's personality | Not decided yet. Waits on the mascot and voice work. | Map, not yet specified |

## Rejected on principle

Not planned. Bringing one of these back means reopening the decision named here, not just scheduling work.

| What | Why | Decided in |
|---|---|---|
| A command wrapper or per-stack hooks around the tool | The workflow prepares the environment. A wrapper resolves secrets again for every call and makes Sluiceway responsible for the user's tooling. | 0013 |
| Generic extra tool arguments | Arbitrary flags can make the preview and the deploy disagree, which breaks the hash. Only named adapter options. | 0015 |
| A pattern-based mask for things that look like tokens | No property value ever leaves the adapter, so there is nothing to mask. | 0021, 0022 |
| A built-in second approval (a second person who also has to tick) | GitHub's required reviewers do this. Without locked-in credentials it would not be real protection. | 0020 |
| Detecting deploys made outside Sluiceway | They are legal. The next scan simply shows the truth. | 0016 |
| Holding or storing any credential | The five credential promises. | 0014 |
| The Pulumi Automation API as the driver | 13.9 MB bundle, still needs the CLI, and its preview result lacks per-resource steps. | 0001 |
| Per-resource selection (`--target`) | Granularity is one checkbox per stack. | Brief non-goals |
| Plan comments on pull requests | Other tools do that well already. | Brief non-goals |

## Bigger efforts, each its own plan

| What | Note |
|---|---|
| A hosted GitHub App with an org-wide dashboard | A control plane only. Previews and deploys always run in the user's own runners. It reuses the open source core. |
| GitLab and Bitbucket | The UI is a GitHub issue, so this is a different product surface. |
| Slack and other notifications, a policy engine, cost estimation | Non-goals for v1 in the brief. |
| Docs site and Marketplace launch | Part of the public launch, after the core loop is proven. |

# `resolve` hands `apply` a deployment record, and `settle` finds its own

Records 0003 and 0019 say that `resolve` creates the deployment record and passes it on, and that `apply` deploys only on an open record. No record named the inputs and outputs that carry this through a workflow. The brief's names (`stack`, `expected-hash`, a matrix of `{ stack, environment, expectedHash }`) no longer fit: the approved hash lives on the record (0003), so handing it over a second time would give two sources for one fact. This record fixes the names.

`resolve` has one output, `matrix`: a JSON array with one entry per deploy it started.

```json
[{ "stack": "apps/grafana:prod", "environment": "sluiceway", "deployment": 1234567890 }]
```

`apply` has one input of its own, `deployment-id`. It reads the record and takes everything from it: the stack id from the `task`, the approved hash and the ticker from the payload. `stack` and `environment` are in the matrix entry for the workflow, not for the action: the per stack concurrency group needs the stack id (0006), and the optional job level `environment:` key needs a name (0003, 0020).

A `stack` input on `apply` next to `deployment-id` was rejected. `apply` would have to check that the two agree, and a mismatch could only ever be a mistake in the workflow file. An `expected-hash` input was rejected for the reason above.

`settle` takes no input. It reads the open deployment records whose payload carries the run id of its own workflow run and gives each the result `error` (0003). Handing it the matrix was rejected: a `resolve` that failed after it created a record has no output to hand over, and that is one of the cases `settle` exists for.

The two names the bootstrap chose stay: the `github-token` input, which is also what `pulumi/actions` and most other actions call it, and `preview-timeout` in whole minutes.

## Consequences

- `action.yml` in v1 has five inputs: `mode`, `concurrency`, `preview-timeout`, `github-token`, `deployment-id`. It has one output, `matrix`, which only `resolve` sets.
- `resolve` always sets `matrix`, to `[]` when it started nothing. It sets the output directly after it created the records and before it writes the body, so a failed body write does not lose the hand-off.
- `deployment-id` is required in `apply` mode and an error in every other mode. A record that is not Sluiceway's (its `task` does not start with `sluiceway:`), or whose stack discovery does not know, deploys nothing and the job goes red.
- The `environment` in a matrix entry is the label on the record: the stack's configured environment, else the fixed name `sluiceway` (0003).
- A workflow run has at most 256 matrix jobs. `resolve` starts at most 256 deploys in one run, in stack id order. Ticks beyond that are cleared with the note that asks for a fresh tick (0025).
- The example workflow's groups are `sluiceway-scan`, `sluiceway-resolve` and `sluiceway-apply-<stack id>`. Only the last one uses `queue: max` (0025).
- The `apply` job is green only when the stack deployed. It goes red when the tool failed, when the change moved since the tick (0008), and when the record had already ended (0019). This is the rule of 0012 seen from the other side: a person who opens a green `apply` job must be able to read it as "this went out".
- The `settle` job in the example runs with `if: always()` and only when `resolve` started at least one deploy, so a refused tick or a rescan costs no third runner.
- The per stack time limit of 0012 is the config key `previewTimeout` on a stack's entry, in whole minutes like the input.
- A later `stack` input for a deploy without a tick (`docs/later.md`) stays free, because nothing uses that name now.

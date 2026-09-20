# Deploy facts live in GitHub's Deployments API

A preview can recompute what is pending, but not that a deploy is running, how the last one ended, or who ticked it. Those deploy facts are stored as GitHub deployment records that Sluiceway creates and reads back, and nowhere else. Markers in the issue body were rejected because any writer or hand edit can clobber them and the issue must stay a rendered view. Workflow run queries were rejected because a run is not tied to a stack and records neither the ticker nor the approved hash. GitHub is the database, so "zero backend" still holds.

## Consequences

- One record per deploy attempt of one stack, tagged `task: sluiceway:<stackId>`. The payload is versioned (`v: 1`) and carries the approved hash, the ticker and the run id. The run link and a short failure reason go on the final status. Sluiceway only ever reads records whose task starts with `sluiceway:`.
- `resolve` creates the record with status `queued` before it emits the matrix, not `apply`. Otherwise nothing durable says "this stack is taken" between the tick and the apply job starting, which can be hours on self-hosted runners. `apply` sets `in_progress`, then `success`, `failure`, or `error` when the hash moved.
- In every mode, a stack whose latest record is `queued` or `in_progress` renders as deploying with no checkbox, whatever the preview says. A second tick for that stack is dropped.
- A record is never ended by a timeout, because a job can wait on a reviewer for days. Liveness is tied to the workflow run: any render that meets an open deployment whose run has completed writes `error` ("the run ended without reporting a result"). A `settle` job (`needs: apply`, `if: always()`) does the same within seconds of a cancel or a rejection. This adds a fourth mode.
- Statuses are written with `auto_inactive: false`, and `inactive` is read as "succeeded, then superseded". Without this, one stack succeeding would flip the latest status of every other stack in the same environment.
- The environment on a record is only a label: the stack's configured environment, else the fixed name `sluiceway`. The record does not depend on the GitHub Environments feature, which is plan-gated on private repos. The job-level `environment:` key is optional and, where used, set with `deployment: false` so GitHub does not create a second record. Users of custom deployment protection rules cannot use `deployment: false` and will see a duplicate record with `task: deploy`, which Sluiceway ignores.
- The record carries the default-branch head SHA that `resolve` and `apply` run on, with `auto_merge: false` and `required_contexts: []`. "Commits since the last successful deploy of this stack" is the range from that SHA to HEAD.
- Reads are bounded: one GraphQL page of the newest deployments per environment name, then one REST call filtered by `task` for any pending stack not on that page. In-sync stacks need no lookup. "Recently deployed" is the newest successful records on the same page.
- Only the latest status of a record survives 90 days. Nothing the dashboard needs sits in the pruned history.
- The workflow needs `deployments: write` and `actions: read` (already covered by `actions: write`).

Research: https://github.com/sluiceway/sluiceway/blob/research/github-actions-behaviors/docs/research/github-actions-behaviors.md

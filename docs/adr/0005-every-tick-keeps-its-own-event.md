# Every tick keeps its own event, and nothing deploys without a named ticker

The Renovate research recommended a fully level-triggered `resolve`: wake on the event, read the live body, act on every ticked row. That survives cancelled runs but loses attribution. A tick inherited from a cancelled run has no known ticker, so there is nobody to check permission against and nothing to record as "who ticked it". We chose a hybrid instead: `resolve` runs under `concurrency: { group: sluiceway-resolve, queue: max }`, so runs go one at a time and none is cancelled, and each run acts only on the ticks in its own event.

A run acts on a row only when all of these hold: the tick is in this event's own diff (unticked in `changes.body.from`, ticked now), the row is still ticked in the live body with the same stack id and hash, discovery knows the stack, and the stack has no open deployment. The ticker is always the event's `sender`. Their permission is checked and their login is written into the deployment payload. One authorization rule covers every stack, including those limited to `admin` or to named users.

## Consequences

- The live-body check covers staleness. An untick before the run starts, a re-run replaying an old payload, or a row whose hash changed all fall out as nothing to do.
- A tick can still be orphaned: the event was dropped, or the run crashed before it created the deployment record. Every scan sweeps for these. A row is an orphan when it is ticked, its stack has no open deployment, and no `issues`-triggered run of the workflow is queued or in progress. The scan renders it unticked with a note asking for a fresh tick. If a `resolve` run is still pending, the scan carries the tick through untouched.
- Orphan ticks are cleared, never deployed. This departs from the research, which suggested handing swept ticks to `resolve`. A swept tick has no attributable human, and asking for a second tick is cheap.
- A tick is a commit, not a toggle. Unticking after `resolve` has created the record does not stop the deploy.

Research: https://github.com/sluiceway/sluiceway/blob/research/renovate-dashboard-mechanics/docs/research/renovate-dashboard-mechanics.md

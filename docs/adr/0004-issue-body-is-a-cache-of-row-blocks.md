# The issue body is a cache of row blocks, written without a lock

Four modes write the dashboard body, but only `scan` has fresh previews for every stack, and GitHub has neither a partial update nor a compare-and-swap for issue bodies. So `scan` regenerates the whole body, while `resolve`, `apply` and `settle` fetch the live body, replace only the row blocks of their own stacks, and carry every other row through byte for byte. Re-previewing everything in every writer was rejected as far too slow for a tick. Persisting the last scan result as an artifact was rejected because it adds a second store with its own expiry that goes stale the moment an apply finishes.

The issue stays a rendered view. Nothing is decided from a cached row. The only things read from the body for action are a tick and a hash, and both are checked against discovery and a fresh preview before anything deploys. The worst a stale row can cause is an apply that aborts because the change moved.

## Consequences

- Every row is one self-delimiting block whose marker carries stack id, hash and row state, so a block can be moved between sections without understanding its content. The header counts are derivable from the markers alone.
- One row renderer is shared by all modes: the same inputs give a byte-identical row whoever writes it. "Regenerate, never patch" means never patch inside a row. Swapping whole rows is fine.
- There is no global write lock. Actions concurrency groups work per job, so a lock would hold ticks hostage for the length of a scan. Instead every mode writes the same way: do all slow work first, then read the live body and the open deployments, build the body, skip the write if it is byte-identical, write, and read back to verify. If the body is not what was written (another writer got in, or GitHub silently dropped an oversized body), repeat from the late read, at most three times.
- Scans never overlap: the scan job uses `concurrency: sluiceway-scan` with the default queue and no `cancel-in-progress`. A running scan finishes, and only the newest waiting scan survives.
- At its late read the scan defers to fresher facts. A stack with an open deployment renders as deploying. A stack with a Sluiceway deployment that changed after the scan started keeps its live row, because the scan's preview of it predates the deploy.
- A write lost in the remaining window heals itself. A "deploying" row that reverts to pending is repaired by the next tick (dropped because the record is open), by `apply`, or by `settle`. A finished row that reverts to a stale diff leads to an apply that aborts and renders the fresh diff. The dashboard can be briefly wrong. A deploy never is, because deploy safety rests on the deployment record and the hash check, not on the body.

Research: https://github.com/sluiceway/sluiceway/blob/research/renovate-dashboard-mechanics/docs/research/renovate-dashboard-mechanics.md

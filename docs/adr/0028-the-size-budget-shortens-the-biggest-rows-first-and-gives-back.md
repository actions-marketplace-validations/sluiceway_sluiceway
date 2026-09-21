# The size budget shortens the biggest rows first, gives back what fits, and never lists half the destroys

An issue body that is too large is dropped without an error (rendering research), and record 0024 fixed what must survive when a row shrinks. This record fixes the numbers, the steps and which rows give way. It was judged on a rendered fixture of 92 stacks whose full body was 335,856 characters and whose shortened body was 54,711.

The renderer aims at 58,000 characters, the headroom Renovate keeps under the same limit. A body over 65,536 characters or over 262,144 UTF-8 bytes is never written. Both are counted on the final body. The target leaves room for a late row swap by `resolve`, `apply` or `settle` to grow the body a little without going over.

A pending row has four levels:

0. In full.
1. The named pull requests on the attribution line are replaced by a count: `from 3 pull requests, and 4 changes outside this stack · compare`. The compare link stays (0026).
2. The fold is replaced by one line, `48 other changes not listed here, see the summary`. Every delete and replace line is still there.
3. No change lines at all. A row with a delete or replace reads `:warning: **deletes 451, too many to list here.** Read the [summary](url) before you tick.` Any other row reads `Changes not listed here, see the [summary](url)`.

Listing the first twenty deletes and then `and 431 more` was rejected. Which twenty a reader sees would be an accident of sort order, and a partial list can be taken for the whole. The delete and replace lines of a row are all there or none are, and then the warning carries the full count (0024). Taking the checkbox away from such a row was rejected too: a large teardown would then be impossible to deploy from the dashboard, while the summary shows it in full one click away.

Rows do not all drop to the same level. That was rejected because one stack with 450 changes would take the details away from 40 small rows. Instead, level by level, the biggest rows give way first until the body fits, and then small rows get their details back while there is room.

## Consequences

- The steps: render everything at level 0. While the body is over the target, go through levels 1, 2 and 3 in turn, and within a level move rows to it in order of rendered size, biggest first, until the body fits. Then go through the rows from smallest full size to biggest and give each the lowest level at which the body still fits. Ties are broken by stack id, so the same input gives the same body.
- When any row is shortened, a top level note under the header says how many of the pending rows are shortened, that the summary shows every change, and that deletes and replaces are the last thing to be cut. A top level `> [!NOTE]` renders there, because it is outside any list.
- A shortened row keeps its checkbox and its hash. The hash covers the whole diff whatever the row shows, the same safe direction as under redact (0023). The ticker approves the diff as the summary shows it.
- The first line is never shortened, so the counts with their bold replaces and deletes survive every level, and so do the `destroys` and `failed` marker keys (0027).
- Only pending rows are shortened. Every other kind of row is one to three lines. If the body is still over the hard limit with every pending row at level 3, the scan fails with a clear message and the old body stays. A level 3 row is about 550 characters, most of it links and the marker, and an in sync row about 110. So that point lies at roughly 100 stacks that are all pending at once. A further level that also drops links was left out of v1 (`docs/later.md`).
- A writer that swaps rows (0004, 0011) has a diff only for its own rows. If its body comes out over the hard limit it shortens its own rows and never touches a carried row. If that is not enough it dispatches a scan, which can shorten everything.
- A redacted dashboard (0023) has nothing to shorten. Its rows are already about the size of level 3.
- The summary has no budget and is never shortened (0021). Amended by 0037: it has a budget of its own, far larger than the body's, and the job log holds what does not fit.
- The 58 stack fixture with two very large rows used 57 percent of the hard limit, so a dashboard of that size normally shows every row in full. Shortening is for the day a shared change makes everything pending at once (0010).

Prototype: the over budget issue in the private lab repo, generated from the `prototype/dashboard` branch.

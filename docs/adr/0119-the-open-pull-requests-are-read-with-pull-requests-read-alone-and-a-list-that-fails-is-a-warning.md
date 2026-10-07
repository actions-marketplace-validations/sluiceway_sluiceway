# The open pull requests are read with `pull-requests: read` alone, and a list that fails is a warning

> Amends 0054 (the permission of the list) and 0081 (how a failure under a pending state is read). Issue 292.

From 2026-09-27 on, every scan of a private homelab repo with merge and deploy on logged `The open pull requests could not be read` with GitHub's `Resource not accessible by integration`, and told the user to add `pull-requests: read`. The workflow already had it: its block was the one in `docs/workflow.md`. The line was info only, so nothing on the dashboard or the run said that no update was ever listed. The repo had 16 open Renovate pull requests and none of them got a box.

The cause was proven on 2026-10-06 and 2026-10-07 on two throwaway repos, each with one open pull request that had a check run and a commit status, and a token with the documented block:

- On the public `sluiceway/release-verify` every part of the query read. A token reads a public repo's data without the permission.
- On a private repo made for the purpose, GitHub refused each commit status among the rollup's contexts, at `statusCheckRollup.contexts.nodes.<n>`, even when the query asked only for its `__typename`. Check runs read, because `checks: write` covers them. With `statuses: read` added, the list read and the scan listed the pull request.
- On the private repo, with the same token, the rollup's `state` and its `checkRunCountsByState` and `statusContextCountsByState` read.
- Without `pull-requests: read`, GitHub refused `repository.pullRequests` itself.

Renovate's `renovate/stability-days` is a commit status, so a Renovate pull request often has one.

## Decision

- **The query reads the checks as counts.** It asks for the rollup's state and, under its contexts, the counts of check runs and of commit statuses by state, never the contexts themselves. `pull-requests: read` is enough, on a private repo too, and no workflow of the docs changes.
- **The rule of 0081 stays, read from the counts.** Under a pending state, a check run counted in any state but success, neutral, skipped, in progress, pending, queued or waiting failed, and so did a commit status counted as failure or error. A check run that completed with no conclusion counts as completed, and failed, as before.
- **A refusal names the permission only when it says which.** The GitHub port turns a GraphQL answer whose errors are all `FORBIDDEN` into one error that gives GitHub's words, the number of refused parts and the path of the first. When GitHub refused `repository.pullRequests`, it names `pull-requests: read`. The scan and `resolve` name that permission, and for any other error name none.
- **A list that fails is a warning, and the summary says so.** The scan writes the warning "Open pull requests not read" on the run, and a line under the counts of its summary: `> **The open pull requests could not be read.**` with the reason, that the updates on the dashboard are kept as an earlier scan left them, and the permission when it is known. The scan goes on, as 0054 has it.
- **The fake GitHub refuses a query for the contexts themselves**, as a private repo does with the documented block, so a query that asks for them again fails there. The scans of `sluiceway/examples` and `sluiceway/release-verify` have no open pull request when they scan, and both repos are public, so neither would show it.

## Rejected

- **`statuses: read` in every workflow of the docs, and a warning from the check without it.** It widens every user's token for something a count already says, and every repo that copied the old block stays broken until someone edits it.
- **Reading the checks through `checkSuites`.** It reads, but it holds check runs only, and a commit status such as `renovate/stability-days` is what holds a Renovate pull request back.
- **A line on the dashboard.** The section the line would sit in shows what an earlier scan listed, which is still true. Left out (`docs/later.md`).

## Consequences

- A repo with merge and deploy on gets its updates listed with the workflow it has.
- A scan whose list fails is no longer quiet: its run carries a warning, and its summary says why.

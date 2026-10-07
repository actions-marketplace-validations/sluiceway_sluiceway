# A run that failed says so under the scan line, and the next scan counts the runs that failed

> Amends 0012 (a problem in the config writes one line on the dashboard before the job fails), 0017 (one more request per scan), 0029, 0086 and 0108 (two more lines under the scan line), 0009 (three optional keys on the root marker) and 0077 (the Sluiceway step of the one-step workflow has `if: ${{ !cancelled() }}`, and the action has a `job-status` input). Built as slice 5.56, for issue 293. Decided by the owner on 2026-10-07.

Found in the acceptance walk-through of 2026-10-06. Twice the dashboard looked current while it was not:

- In the homelab, the step that loads the env file, before Sluiceway, failed on every run from 2026-10-05 12:19 to 2026-10-06 10:50. Four red runs and no scan, and the dashboard showed the scan of the day before with nothing to say a day of scans had failed.
- In `sluiceway/release-verify`, a `sluiceway.yaml` that both ignores a stack and gives it a `stacks:` entry turned the scan red. The issue kept the previous scan and said nothing about the broken config.

Record 0086 puts a line under the scan line when a run waits for a runner. This is the same family: the dashboard should not look fresh when the last scans did not happen.

## What Sluiceway can see

- **A step before Sluiceway fails.** GitHub skips every later step, so no Sluiceway code runs in that run. Only two things can say anything: a later run that works, from the workflow's own run history as in 0086, or the Sluiceway step itself, when the workflow lets it run after a failure.
- **A problem in the config.** Sluiceway runs, and the problem ends it before anything is written (0012). The run is there to say so, but it has no config it can trust: not the label that finds the dashboard, not the layout that draws it.

## Decision

The owner chose both for the first case, and a line from the run itself for the second.

- **The Sluiceway step runs after a failed step, and then only says so.** The one-step workflow, the README, the manual, the examples and what `init` writes put `if: ${{ !cancelled() }}` on the Sluiceway step, and the scan job of the split workflow gets it too. A new input, `job-status`, defaults to `${{ job.status }}`, as `job-id` defaults to `${{ job.check_run_id }}` (0044). When it says `failure`, the step does none of its work, in any mode: no scan, no `resolve`, no deploy. It puts one line right under the scan line and ends. The job is red already, for its own reason, so the step does not fail too. `cancelled` does no work and writes nothing. A value GitHub never gives fails the step, so a typo cannot make a step run its mode after a failure.
- **A problem in the config puts the same kind of line there**, naming the file as the repo spells it, and then fails the job with the problem as before. Every problem a `ConfigError` names counts: one in the file itself, and one between the file and the stacks discovery found, as in release-verify.
- **The lines say what happened, never why**:

  `The last run of this dashboard's workflow failed before Sluiceway ran, on 2026-10-06 10:50 UTC+2 · [run](…)`

  `The last run of this dashboard's workflow found a problem in sluiceway.yaml, on 2026-10-06 10:50 UTC+2 · [run](…)`

  The time is when the step saw it, in the repo's zone with its offset (0089). The problem itself stays in the job log: it is the config's own text, and the run that has it is one click away.
- **The failed run splices the line into the live body and draws nothing again.** It finds the dashboard by `dashboard.label` and the zone by `dashboard.timeZone`: from the config when it loads, else from the two keys as the file writes them when they make sense, else `sluiceway` and UTC. It puts the line right under the scan line, in place of the line an earlier failed run put there, and leaves every other byte as it was, through the write loop (0004). It never creates or reopens a dashboard, and a body that is not of this version, or has no scan line, is left alone.
- **No key on the root marker.** The line is only text. Every writer that draws the body again loaded its config, so its run got as far as Sluiceway, and the line is no longer true: it draws the body without it. That is the next scan's first write (0108) or any `resolve` and `apply` that writes. A `resolve` with nothing to do writes nothing, as before.
- **The next scan counts the runs that failed since the scan before.** Every scan lists the runs of its own workflow that ended, once a job, next to the queued runs of 0086: `GET /repos/{owner}/{repo}/actions/workflows/{file}/runs?status=completed&per_page=100`, `listEndedRuns` on the port, with `actions: read`. At its late read it counts those that ended as `failure`, `timed_out` or `startup_failure`, started after the `scan-at` of the live body and no later than its own start, and are not its own run. A cancelled run was stopped by a person or its concurrency group, and says nothing about the setup. One line under the scan line names the newest:

  `[4 runs of this dashboard's workflow](…/actions/runs/903) failed since the scan before this one, the newest on 2026-10-06 10:50 UTC+2.`

  It is written on the root marker as `runs-failed` (the count), `runs-failed-newest` (the run id) and `runs-failed-at` (when it started, ISO 8601), after every older key. Every other writer carries it, as it carries the waiting run. The next scan writes what it counts, so the line goes with the scan after. A first scan has no scan before and counts nothing.
- **The order under the scan line**: the line of a failed run, a scan that is running (0108), a run that waits for a runner (0086), the runs that failed, then a deploy freeze (0115). The line of a failed run is right under the scan line because it says that line is old.
- **The job log says each**: `The dashboard says this run failed before Sluiceway ran, under the scan line, until a run gets as far as Sluiceway (record 0120): <url>`, with `found a problem in sluiceway.yaml` and `until a run reads sluiceway.yaml again` for the config, and `3 runs of sluiceway.yml failed since the scan before this one. The dashboard says so under the scan line until the next scan (record 0120): <url>`.

### It is a line, never a state

None of the lines is a row, a row state, a header state or a count. Nothing is decided from them, and no notification is sent. A read of the runs that fails leaves the count out and says why in the job log, as 0086 does. A splice that fails, or finds no dashboard, is one line of the job log. Neither ever turns a job red or keeps it green: the job ends as it would have.

### Never from a pull request

A pull request is not the default branch, and its config is not the repo's yet. The check, and auto mode on `pull_request` or `pull_request_target`, write nothing on a failed step or a problem in the config. `init` writes nothing either.

## Consequences

- One request more per scan. The worst case of 0017, 0086, 0108 and 0119 becomes 414 requests on the first try of a scan of 100 stacks and 818 with three tries, still below 1,000.
- A workflow from before this record has no `if:` on the Sluiceway step. Its failed runs say nothing at the time, and the next scan counts them. Adding the `if:` is the whole upgrade.
- A step after Sluiceway that fails is not before it: the Sluiceway step did its work. The next scan counts that run among the failed ones, which is true.
- When no run of the workflow starts at all, such as a workflow file that does not parse, nothing of Sluiceway runs and the scan line stops moving. GitHub ends such runs as `startup_failure`, so the next scan that does start counts them.
- The `job-status` default relies on the runner evaluating `job` in the default of an action input, as `job-id` already does. A runner that gave it empty would run the step as before, and a step with `if: ${{ !cancelled() }}` would then try its mode after a failure and fail on what the failed step did not do.

## Rejected

- **A separate step with `if: failure()` and a mode of its own.** A second Sluiceway step in every workflow, and one that also runs after Sluiceway's own step failed, which it would then have to tell apart.
- **Reading the job's steps from the API to see an earlier failure.** A request on every run, a guess at which job is this one, and nothing to go on when the read fails. The expression is GitHub's own answer, at no cost.
- **Drawing the body again on a problem in the config, with defaults.** The layout, the sections and the zone are config: a body drawn with the defaults would move every section for one red run.
- **A key on the root marker for the failed run's line.** Nothing reads it: every writer that draws the body again is the sign that the line is over.
- **A comment on the dashboard.** It notifies everyone who follows the issue, on every failed run.
- **The problem's text on the dashboard.** It is the config's own words, which can be long, and the run's log already holds it.

import type { getOctokit } from "@actions/github";
import type { GitHubPort } from "./port.ts";

type Octokit = ReturnType<typeof getOctokit>;

// The call of the orphan tick sweep (record 0025), the one that finds a run
// waiting for a runner (record 0086) and the one that counts the runs that
// failed (record 0120) on real GitHub. As in octokit-port.ts, each is one call
// and a translation.
export type RunCalls = Pick<GitHubPort, "listIssuesRuns" | "listQueuedRuns" | "listEndedRuns">;

export function runCalls(octokit: Octokit, repo: { owner: string; repo: string }): RunCalls {
  return {
    async listIssuesRuns(workflow) {
      // GitHub takes the file name of a workflow where it asks for an id, and
      // lists runs newest first. Checked against real GitHub on 2026-09-21.
      const { data } = await octokit.rest.actions.listWorkflowRuns({
        ...repo,
        workflow_id: workflow,
        event: "issues",
        per_page: 100,
      });
      return data.workflow_runs.map((run) => ({
        id: String(run.id),
        completed: run.status === "completed",
      }));
    },

    async listQueuedRuns(workflow) {
      const { data } = await octokit.rest.actions.listWorkflowRuns({
        ...repo,
        workflow_id: workflow,
        status: "queued",
        per_page: 100,
      });
      return data.workflow_runs.map((run) => ({
        id: String(run.id),
        status: run.status ?? "",
        // A re-run waits from when its newest attempt was asked for, which
        // `run_started_at` gives. `created_at` is the first attempt's.
        since: run.run_started_at ?? run.created_at,
      }));
    },

    async listEndedRuns(workflow) {
      const { data } = await octokit.rest.actions.listWorkflowRuns({
        ...repo,
        workflow_id: workflow,
        status: "completed",
        per_page: 100,
      });
      return data.workflow_runs.map((run) => ({
        id: String(run.id),
        status: run.status ?? "",
        // When the run, or its newest attempt, started, as for a queued run.
        since: run.run_started_at ?? run.created_at,
        conclusion: run.conclusion ?? undefined,
      }));
    },
  };
}

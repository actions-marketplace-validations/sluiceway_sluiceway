// The runs of the dashboard's own workflow that failed since the scan the
// dashboard showed before (record 0120). A run that failed before Sluiceway
// ran, or on a broken config, wrote nothing, so the dashboard looked as fresh
// as the scan before it. The next scan that works says how many there were and
// names the newest. It decides nothing.

import type { FailedRunsFacts } from "../render/marker.ts";
import type { RunOfTheWorkflow } from "./waiting-run.ts";

export type { FailedRunsFacts };

// How a run that did not do its work ends. A cancelled run was stopped by a
// person or by its concurrency group, and says nothing about the setup.
export const FAILED_CONCLUSIONS: readonly string[] = ["failure", "timed_out", "startup_failure"];

// The runs that ended failed and started after the scan before and no later
// than this one, with the newest of them. Without a scan before, or with a
// time edited by hand that does not parse, there is nothing to count from.
export function failedRuns(
  runs: readonly RunOfTheWorkflow[],
  previousScanAt: string | undefined,
  now: Date,
  ownRunId: string,
): FailedRunsFacts | undefined {
  const after = new Date(previousScanAt ?? "").getTime();
  if (Number.isNaN(after)) return undefined;
  const failed = runs
    .filter(
      (run) =>
        run.status === "completed" &&
        FAILED_CONCLUSIONS.includes(run.conclusion ?? "") &&
        run.id !== ownRunId,
    )
    .map((run) => ({ id: run.id, at: new Date(run.since) }))
    .filter(({ at }) => at.getTime() > after && at.getTime() <= now.getTime())
    .sort(
      (a, b) =>
        b.at.getTime() - a.at.getTime() ||
        b.id.length - a.id.length ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );
  const [newest] = failed;
  if (!newest) return undefined;
  return { run: newest.id, at: newest.at.toISOString(), count: failed.length };
}

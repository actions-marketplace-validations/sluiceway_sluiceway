// A run that failed before Sluiceway ran, or on a problem in its config, puts
// one line right under the scan line (record 0120). Without it the dashboard
// looked as fresh as the scan before, while no scan could run. The run has no
// config it can trust, so it does not draw the body again: it splices the line
// into the live body, finds the dashboard by the label it can still read, and
// never creates one. The next writer that loads the config draws the body
// without it. The line decides nothing, and a write that fails is one line of
// the job log: the run is red already, for its own reason.

import { dashboardSettingsOf } from "../core/config-file.ts";
import { findDashboard } from "../github/dashboard.ts";
import type { JobLog } from "../github/job-log.ts";
import type { GitHubPort } from "../github/port.ts";
import { writeBody } from "../github/write-loop.ts";
import { type RunFailedFacts, runFailedLine, spliceRunFailed } from "../render/failed-run.ts";
import { urlPart } from "../render/images.ts";

export interface RunFailedContext {
  // The checked-out repo, which may lack the config or hold a broken one.
  root: string;
  github: GitHubPort;
  log: Pick<JobLog, "info">;
  // `https://github.com/<owner>/<repo>`.
  repoUrl: string;
  runId: string;
  now: () => Date;
}

export type WhyRunFailed = { why: "step" } | { why: "config"; file: string };

// The modes that write the dashboard. Auto mode on a pull request runs the
// check, which never does: a pull request is not the default branch.
export function writesDashboard(mode: string, event: string): boolean {
  if (mode === "auto") return event !== "pull_request" && event !== "pull_request_target";
  return mode === "scan" || mode === "resolve" || mode === "apply" || mode === "settle";
}

export async function sayRunFailed(context: RunFailedContext, why: WhyRunFailed): Promise<void> {
  const { log } = context;
  const settings = dashboardSettingsOf(context.root);
  const facts: RunFailedFacts = { ...why, run: context.runId, at: context.now().toISOString() };
  const line = runFailedLine(facts, context.repoUrl, settings.timeZone);
  try {
    const dashboard = await findDashboard(context.github, settings.label);
    if (dashboard === undefined) {
      log.info(
        `The dashboard could not say this run failed: there is no open dashboard with the label ${settings.label} (record 0120).`,
      );
      return;
    }
    let spliced = true;
    await writeBody(context.github, dashboard.number, (body) => {
      const next = spliceRunFailed(body, line);
      spliced = next !== undefined;
      return next ?? body;
    });
    if (!spliced) {
      log.info(
        "The dashboard could not say this run failed: its body is not one this version wrote, or has no scan line (record 0120).",
      );
      return;
    }
  } catch (error) {
    log.info(
      `The dashboard could not say this run failed: ${error instanceof Error ? error.message : error} (record 0120).`,
    );
    return;
  }
  const what =
    why.why === "step" ? "failed before Sluiceway ran" : `found a problem in ${why.file}`;
  const until =
    why.why === "step"
      ? "until a run gets as far as Sluiceway"
      : `until a run reads ${why.file} again`;
  log.info(
    `The dashboard says this run ${what}, under the scan line, ${until} (record 0120): ${context.repoUrl}/actions/runs/${urlPart(context.runId)}`,
  );
}

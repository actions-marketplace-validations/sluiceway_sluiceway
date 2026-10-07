// The words about runs of the dashboard's own workflow that failed (record
// 0120). A run that fails before Sluiceway ran, or on a broken config, writes
// no scan, so the dashboard looked as fresh as the scan before it. Two lines
// say so: one that the run itself puts right under the scan line, and one that
// the next scan that works writes, with how many failed since the scan before.
// They say what is true, that a run failed, and never why: the run's log does.

import { urlPart } from "./images.ts";
import { MARKER_VERSION, parseDashboard, type RootFacts } from "./marker.ts";
import { minuteAt } from "./time.ts";

function runUrl(run: string, repoUrl: string): string {
  return `${repoUrl}/actions/runs/${urlPart(run)}`;
}

// The line under the scan line, from the root marker. The count links the
// newest run, the one to open. The time stands alone, so it says its offset in
// the repo's zone (record 0089). Facts edited by hand that give no time leave
// the line out.
export function failedRunsLine(
  root: RootFacts,
  repoUrl: string,
  timeZone?: string,
): string | undefined {
  const facts = root.failedRuns;
  if (facts === undefined || facts.count < 1) return undefined;
  const at = new Date(facts.at);
  if (Number.isNaN(at.getTime())) return undefined;
  const runs = facts.count === 1 ? "1 run" : `${facts.count} runs`;
  const when = facts.count === 1 ? "on" : "the newest on";
  return `[${runs} of this dashboard's workflow](${runUrl(facts.run, repoUrl)}) failed since the scan before this one, ${when} ${minuteAt(at, timeZone)}.`;
}

// The job log line of the scan that counted them.
export function failedRunsLogLine(
  facts: { run: string; count: number },
  workflow: string,
  repoUrl: string,
): string {
  const runs = facts.count === 1 ? "1 run" : `${facts.count} runs`;
  return `${runs} of ${workflow} failed since the scan before this one. The dashboard says so under the scan line until the next scan (record 0120): ${runUrl(facts.run, repoUrl)}`;
}

// Why the run failed, as far as Sluiceway can tell: a step before its own
// failed, or its config, `file`, has a problem.
export type RunFailedFacts =
  | { run: string; at: string; why: "step" }
  | { run: string; at: string; why: "config"; file: string };

const RUN_FAILED_START = "The last run of this dashboard's workflow ";

// The line the failed run puts right under the scan line.
export function runFailedLine(facts: RunFailedFacts, repoUrl: string, timeZone?: string): string {
  const what =
    facts.why === "step" ? "failed before Sluiceway ran" : `found a problem in ${facts.file}`;
  return `${RUN_FAILED_START}${what}, on ${minuteAt(new Date(facts.at), timeZone)} · [run](${runUrl(facts.run, repoUrl)})`;
}

// The live body with `line` right under the scan line, in place of the line
// an earlier failed run put there. Nothing else changes: the run that failed
// has no config it can trust, so it does not draw the body again. Every writer
// that draws it again leaves the line out, because that writer's run did not
// fail before it. A body that is not one this version wrote, or that has no
// scan line, gives nothing.
export function spliceRunFailed(body: string, line: string): string | undefined {
  const paragraphs = body.replace(/\r\n?/g, "\n").split("\n\n");
  const root = parseDashboard(paragraphs[0] ?? "").root;
  if (root?.version !== MARKER_VERSION) return undefined;
  const scan = paragraphs.findIndex((one) => one.startsWith("Scanned "));
  if (scan < 0) return undefined;
  const replaces = paragraphs[scan + 1]?.startsWith(RUN_FAILED_START) ? 1 : 0;
  paragraphs.splice(scan + 1, replaces, line);
  return paragraphs.join("\n\n");
}

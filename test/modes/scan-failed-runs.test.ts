import { describe, expect, test } from "bun:test";
import { scan } from "../../src/modes/scan.ts";
import { parseDashboard } from "../../src/render/marker.ts";
import { change, dashboardBody, harness, pending, REPO_URL, tableAdapter } from "./harness.ts";

// Record 0120: a scan counts the runs of its own workflow that failed since
// the scan the dashboard showed before, and says so under the scan line. The
// harness's first scan runs at 2026-09-21 06:00 UTC as run 4242.

const TABLE = { "app:prod": pending("app:prod", change("bucket")) };

function later(start: number): () => Date {
  let reads = 0;
  return () => new Date(start + 500 * reads++);
}

const NEXT_DAY = Date.UTC(2026, 8, 22, 11, 0, 0);

function setup() {
  return harness(tableAdapter(TABLE));
}

function failed(github: ReturnType<typeof setup>["github"], id: string, since: string): void {
  github.seedWorkflowRun("sluiceway.yml", {
    id,
    status: "completed",
    since,
    conclusion: "failure",
  });
}

describe("the runs that failed since the scan before", () => {
  test("a day of failed runs: the next scan that works counts them under the scan line", async () => {
    const { context, github, log } = setup();
    await scan(context);
    failed(github, "901", "2026-09-21T12:19:00Z");
    failed(github, "902", "2026-09-21T18:00:00Z");
    failed(github, "903", "2026-09-22T10:50:00Z");
    github.seedWorkflowRun("sluiceway.yml", {
      id: "900",
      status: "completed",
      since: "2026-09-21T05:00:00Z",
      conclusion: "failure",
    });

    const before = github.requests.length;
    await scan({ ...context, runId: "4250", now: later(NEXT_DAY) });

    const body = dashboardBody(github);
    const paragraphs = body.split("\n\n");
    const at = paragraphs.findIndex((one) => one.startsWith("Scanned ["));
    expect(paragraphs[at + 1]).toBe(
      `[3 runs of this dashboard's workflow](${REPO_URL}/actions/runs/903) failed since the scan before this one, the newest on 2026-09-22 10:50 UTC.`,
    );
    expect(parseDashboard(body).root?.failedRuns).toEqual({
      run: "903",
      at: "2026-09-22T10:50:00.000Z",
      count: 3,
    });
    expect(log.lines).toContain(
      `3 runs of sluiceway.yml failed since the scan before this one. The dashboard says so under the scan line until the next scan (record 0120): ${REPO_URL}/actions/runs/903`,
    );
    expect(github.requests.slice(before).filter((one) => one === "listEndedRuns")).toHaveLength(1);
  });

  test("the scan after that one says nothing, since no run failed in between", async () => {
    const { context, github } = setup();
    await scan(context);
    failed(github, "901", "2026-09-21T12:19:00Z");
    await scan({ ...context, runId: "4250", now: later(NEXT_DAY) });
    expect(dashboardBody(github)).toContain("failed since the scan before this one");

    await scan({ ...context, runId: "4251", now: later(NEXT_DAY + 3_600_000) });

    expect(dashboardBody(github)).not.toContain("failed since the scan before");
  });

  test("the first scan of a dashboard has no scan before, and says nothing", async () => {
    const { context, github } = setup();
    failed(github, "901", "2026-09-21T05:00:00Z");

    await scan(context);

    expect(dashboardBody(github)).not.toContain("failed since the scan before");
  });

  test("a read GitHub refuses leaves the line out, says why in the job log, and the scan goes on", async () => {
    const { context, github, log } = setup();
    await scan(context);
    github.failEndedRuns(403);

    await scan({ ...context, runId: "4250", now: later(NEXT_DAY) });

    expect(dashboardBody(github)).toContain("app:prod");
    expect(
      log.lines.some((line) =>
        line.startsWith("The runs of sluiceway.yml that ended could not be read:"),
      ),
    ).toBe(true);
    expect(log.warnings).toEqual([]);
  });
});

import { describe, expect, test } from "bun:test";
import { failedRuns } from "../../src/core/failed-runs.ts";
import type { RunOfTheWorkflow } from "../../src/core/waiting-run.ts";

// Record 0120: a scan counts the runs of its own workflow that failed since
// the scan the dashboard showed before it, and names the newest.

const PREVIOUS = "2026-10-05T10:00:00Z";
const NOW = new Date("2026-10-06T11:00:00Z");

function run(id: string, since: string, conclusion = "failure"): RunOfTheWorkflow {
  return { id, status: "completed", since, conclusion };
}

describe("the runs that failed since the scan before", () => {
  test("none: nothing", () => {
    expect(failedRuns([], PREVIOUS, NOW, "4242")).toBeUndefined();
  });

  test("the count, and the newest named with when it started", () => {
    const runs = [
      run("903", "2026-10-06T10:50:00Z"),
      run("902", "2026-10-06T04:00:00Z"),
      run("901", "2026-10-05T12:19:00Z"),
    ];
    expect(failedRuns(runs, PREVIOUS, NOW, "4242")).toEqual({
      run: "903",
      at: "2026-10-06T10:50:00.000Z",
      count: 3,
    });
  });

  test("a run that failed before the scan before, or that started after this scan, is not counted", () => {
    const runs = [
      run("904", "2026-10-06T11:05:00Z"),
      run("902", "2026-10-06T04:00:00Z"),
      run("900", "2026-10-05T09:59:00Z"),
    ];
    expect(failedRuns(runs, PREVIOUS, NOW, "4242")).toEqual({
      run: "902",
      at: "2026-10-06T04:00:00.000Z",
      count: 1,
    });
  });

  test("a run that timed out, or that GitHub could not start, failed too; a cancelled one did not", () => {
    const runs = [
      run("903", "2026-10-06T10:50:00Z", "cancelled"),
      run("902", "2026-10-06T04:00:00Z", "startup_failure"),
      run("901", "2026-10-05T12:19:00Z", "timed_out"),
      run("900", "2026-10-05T12:00:00Z", "success"),
    ];
    expect(failedRuns(runs, PREVIOUS, NOW, "4242")).toEqual({
      run: "902",
      at: "2026-10-06T04:00:00.000Z",
      count: 2,
    });
  });

  test("the scan's own run is never one, nor a run that has not ended", () => {
    const runs = [
      run("4242", "2026-10-06T10:59:00Z"),
      { id: "905", status: "in_progress", since: "2026-10-06T10:58:00Z" },
    ];
    expect(failedRuns(runs, PREVIOUS, NOW, "4242")).toBeUndefined();
  });

  test("no scan before, or one whose time does not parse: nothing to count from", () => {
    const runs = [run("903", "2026-10-06T10:50:00Z")];
    expect(failedRuns(runs, undefined, NOW, "4242")).toBeUndefined();
    expect(failedRuns(runs, "yesterday", NOW, "4242")).toBeUndefined();
  });

  test("two that started at the same moment: the higher id is the newest", () => {
    const runs = [run("901", "2026-10-06T10:50:00Z"), run("1000", "2026-10-06T10:50:00Z")];
    expect(failedRuns(runs, PREVIOUS, NOW, "4242")?.run).toBe("1000");
  });
});

import { describe, expect, test } from "bun:test";
import { type BodyInput, renderBody } from "../../src/render/body.ts";
import { failedRunsLine, runFailedLine, spliceRunFailed } from "../../src/render/failed-run.ts";
import { parseDashboard, type RootFacts, rootMarker } from "../../src/render/marker.ts";

// Record 0120: the runs of the dashboard's own workflow that failed since the
// scan before get one line under the scan line, and a run that fails before
// Sluiceway ran or on a broken config puts one line right under the scan line
// itself. Written out by hand.

const REPO_URL = "https://github.com/example-org/infra";
const SCAN = {
  scanSha: "8c41f0e7d2b94a6f1e3c5d7a9b0c2e4f6a8b1d3c",
  scanRun: "17034455121",
  scanAt: "2026-10-06T11:02:41Z",
};
const SCAN_LINE = `Scanned [\`8c41f0e\`](${REPO_URL}/commit/8c41f0e7d2b94a6f1e3c5d7a9b0c2e4f6a8b1d3c) on 2026-10-06 11:02 UTC · [run](${REPO_URL}/actions/runs/17034455121)`;
const FAILED = { run: "17034000903", at: "2026-10-06T10:50:00.000Z", count: 4 };
const FAILED_URL = `${REPO_URL}/actions/runs/17034000903`;

function body(root: RootFacts, personality = true): string {
  const input: BodyInput = {
    root,
    rows: [],
    recentlyDeployed: [],
    repoUrl: REPO_URL,
    actionRef: "v0.1.0",
    personality,
  };
  return renderBody(input);
}

function paragraphs(text: string): string[] {
  return text.split("\n\n").map((one) => one.trim());
}

describe("the failed runs on the root marker", () => {
  test("are written after every older key, and read back", () => {
    const line = rootMarker({ ...SCAN, failedRuns: FAILED });
    expect(line).toBe(
      '<!-- sluiceway:dashboard v="1" scan-sha="8c41f0e7d2b94a6f1e3c5d7a9b0c2e4f6a8b1d3c" scan-run="17034455121" scan-at="2026-10-06T11:02:41Z" runs-failed="4" runs-failed-newest="17034000903" runs-failed-at="2026-10-06T10:50:00.000Z" -->',
    );
    expect(parseDashboard(line).root?.failedRuns).toEqual(FAILED);
  });

  test("none: no keys, and nothing read back", () => {
    expect(rootMarker(SCAN)).not.toContain("runs-failed");
    expect(parseDashboard(rootMarker(SCAN)).root?.failedRuns).toBeUndefined();
  });

  test("keys edited by hand that miss one, or a count that is not a number, read as none", () => {
    const edited = (pairs: string) =>
      parseDashboard(`<!-- sluiceway:dashboard v="1" scan-run="1"${pairs} -->`).root?.failedRuns;
    expect(edited(' runs-failed="2" runs-failed-newest="7"')).toBeUndefined();
    expect(
      edited(' runs-failed="lots" runs-failed-newest="7" runs-failed-at="2026-10-06T10:50:00Z"'),
    ).toBeUndefined();
  });
});

describe("the line about failed runs", () => {
  test("several: the count links the newest, and says when it started", () => {
    expect(failedRunsLine({ ...SCAN, failedRuns: FAILED }, REPO_URL)).toBe(
      `[4 runs of this dashboard's workflow](${FAILED_URL}) failed since the scan before this one, the newest on 2026-10-06 10:50 UTC.`,
    );
  });

  test("one", () => {
    expect(failedRunsLine({ ...SCAN, failedRuns: { ...FAILED, count: 1 } }, REPO_URL)).toBe(
      `[1 run of this dashboard's workflow](${FAILED_URL}) failed since the scan before this one, on 2026-10-06 10:50 UTC.`,
    );
  });

  test("in the repo's zone, with its offset", () => {
    expect(failedRunsLine({ ...SCAN, failedRuns: FAILED }, REPO_URL, "Europe/Brussels")).toContain(
      "the newest on 2026-10-06 12:50 UTC+2.",
    );
  });

  test("a time edited by hand that does not parse leaves the line out", () => {
    expect(
      failedRunsLine({ ...SCAN, failedRuns: { ...FAILED, at: "yesterday" } }, REPO_URL),
    ).toBeUndefined();
  });

  test("sits under the scan line, under a running scan and a waiting run", () => {
    const text = body({
      ...SCAN,
      failedRuns: FAILED,
      waitingRun: { run: "17034000999", since: "2026-10-06T10:30:00.000Z", more: 0 },
      scanRunning: { run: "17034455122", since: "2026-10-06T11:10:00.000Z" },
    });
    const all = paragraphs(text);
    const at = all.indexOf(SCAN_LINE);
    expect(all[at + 1]).toStartWith("A scan is running since");
    expect(all[at + 2]).toStartWith("[A run of this dashboard's workflow]");
    expect(all[at + 3]).toStartWith("[4 runs of this dashboard's workflow]");
    expect(all[at + 4]).toBe("</div>");
  });

  test("without a header it is its own paragraph too", () => {
    const all = paragraphs(body({ ...SCAN, failedRuns: FAILED }, false));
    expect(all[all.indexOf(SCAN_LINE) + 1]).toStartWith("[4 runs of this dashboard's workflow]");
  });
});

describe("the line a run that failed puts on the dashboard", () => {
  const STEP = { run: "17034000904", at: "2026-10-06T10:50:00Z", why: "step" } as const;

  test("a step before Sluiceway failed", () => {
    expect(runFailedLine(STEP, REPO_URL)).toBe(
      `The last run of this dashboard's workflow failed before Sluiceway ran, on 2026-10-06 10:50 UTC · [run](${REPO_URL}/actions/runs/17034000904)`,
    );
  });

  test("a problem in the config file, named as the repo spells it", () => {
    expect(
      runFailedLine({ ...STEP, why: "config", file: "sluiceway.yml" }, REPO_URL, "Europe/Brussels"),
    ).toBe(
      `The last run of this dashboard's workflow found a problem in sluiceway.yml, on 2026-10-06 12:50 UTC+2 · [run](${REPO_URL}/actions/runs/17034000904)`,
    );
  });

  test("is spliced right under the scan line, and nothing else changes", () => {
    for (const personality of [true, false]) {
      const before = body({ ...SCAN, failedRuns: FAILED }, personality);
      const line = runFailedLine(STEP, REPO_URL);
      const after = spliceRunFailed(before, line);
      if (after === undefined) throw new Error("not spliced");
      const all = paragraphs(after);
      expect(all[all.indexOf(SCAN_LINE) + 1]).toBe(line);
      expect(after.replace(`${line}\n\n`, "")).toBe(before);
    }
  });

  test("a second failed run takes the place of the first one's line", () => {
    const before = body(SCAN);
    const first = spliceRunFailed(before, runFailedLine(STEP, REPO_URL)) ?? "";
    const second = runFailedLine(
      { ...STEP, run: "17034000905", why: "config", file: "sluiceway.yaml" },
      REPO_URL,
    );
    const after = spliceRunFailed(first, second) ?? "";
    expect(after.replace(`${second}\n\n`, "")).toBe(before);
    expect(after).not.toContain("failed before Sluiceway ran");
  });

  test("line endings a person's edit left are read as plain ones", () => {
    const before = body(SCAN).replaceAll("\n", "\r\n");
    const line = runFailedLine(STEP, REPO_URL);
    expect(spliceRunFailed(before, line)).toBe(spliceRunFailed(body(SCAN), line) ?? "");
  });

  test("the next writer draws the body again, without it", () => {
    const spliced = spliceRunFailed(body(SCAN), runFailedLine(STEP, REPO_URL)) ?? "";
    const root = parseDashboard(spliced).root;
    expect(root?.scanRun).toBe(SCAN.scanRun);
    expect(
      body({ scanSha: SCAN.scanSha, scanRun: SCAN.scanRun, scanAt: SCAN.scanAt }),
    ).not.toContain("The last run");
  });

  test("a body that is not one this version wrote, or has no scan line, is left alone", () => {
    const line = runFailedLine(STEP, REPO_URL);
    expect(spliceRunFailed("", line)).toBeUndefined();
    expect(spliceRunFailed("A dashboard a person wrote.", line)).toBeUndefined();
    expect(
      spliceRunFailed(
        body(SCAN).replace('<!-- sluiceway:dashboard v="1"', '<!-- sluiceway:dashboard v="2"'),
        line,
      ),
    ).toBeUndefined();
    expect(spliceRunFailed(rootMarker(SCAN), line)).toBeUndefined();
  });
});

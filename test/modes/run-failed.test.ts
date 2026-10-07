import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { dashboardSettingsOf } from "../../src/core/config-file.ts";
import { sayRunFailed, writesDashboard } from "../../src/modes/run-failed.ts";
import { scan } from "../../src/modes/scan.ts";
import {
  change,
  dashboardBody,
  harness,
  pending,
  REPO_URL,
  repoRoot,
  tableAdapter,
} from "./harness.ts";

// Record 0120: a run that fails before Sluiceway ran, or on a problem in its
// config, puts one line right under the scan line, and the next run that gets
// as far as Sluiceway with a config it can read takes it away.

const TABLE = { "app:prod": pending("app:prod", change("bucket")) };
const AT = new Date("2026-10-06T10:50:00Z");
const STEP_LINE = `The last run of this dashboard's workflow failed before Sluiceway ran, on 2026-10-06 10:50 UTC · [run](${REPO_URL}/actions/runs/7001)`;

async function scanned(config?: string) {
  const setup = harness(tableAdapter(TABLE), config === undefined ? {} : { config });
  await scan(setup.context);
  return setup;
}

function failing(setup: Awaited<ReturnType<typeof scanned>>, root = setup.context.root) {
  return {
    root,
    github: setup.github,
    log: setup.log,
    repoUrl: REPO_URL,
    runId: "7001",
    now: () => AT,
  };
}

function under(body: string): string | undefined {
  const paragraphs = body.split("\n\n");
  return paragraphs[paragraphs.findIndex((one) => one.startsWith("Scanned [")) + 1];
}

describe("a run that failed before Sluiceway ran", () => {
  test("puts its line right under the scan line, and says so in the job log", async () => {
    const setup = await scanned();
    const before = dashboardBody(setup.github);

    await sayRunFailed(failing(setup), { why: "step" });

    const body = dashboardBody(setup.github);
    expect(under(body)).toBe(STEP_LINE);
    expect(body.replace(`${STEP_LINE}\n\n`, "")).toBe(before);
    expect(setup.log.lines).toContain(
      `The dashboard says this run failed before Sluiceway ran, under the scan line, until a run gets as far as Sluiceway (record 0120): ${REPO_URL}/actions/runs/7001`,
    );
  });

  test("the next scan takes it away with its first write", async () => {
    const setup = await scanned();
    await sayRunFailed(failing(setup), { why: "step" });

    await scan({ ...setup.context, runId: "4243" });

    expect(dashboardBody(setup.github)).not.toContain("The last run of this dashboard's workflow");
  });

  test("in the repo's zone, and on the dashboard its label finds", async () => {
    const setup = await scanned(
      "dashboard:\n  label: infra-dashboard\n  timeZone: Europe/Brussels\n",
    );

    await sayRunFailed(failing(setup), { why: "step" });

    expect(under(dashboardBody(setup.github))).toStartWith(
      "The last run of this dashboard's workflow failed before Sluiceway ran, on 2026-10-06 12:50 UTC+2",
    );
  });
});

describe("a run that found a problem in the config", () => {
  test("finds the dashboard by the label the broken file still names, and names the file", async () => {
    const setup = await scanned("dashboard:\n  label: infra-dashboard\n");
    writeFileSync(
      join(setup.context.root, "sluiceway.yaml"),
      "dashboard:\n  label: infra-dashboard\n  timeZone: Europe/Brussels\nignore: 3\n",
    );

    await sayRunFailed(failing(setup), { why: "config", file: "sluiceway.yaml" });

    expect(under(dashboardBody(setup.github))).toBe(
      `The last run of this dashboard's workflow found a problem in sluiceway.yaml, on 2026-10-06 12:50 UTC+2 · [run](${REPO_URL}/actions/runs/7001)`,
    );
  });

  test("a second failed run takes the place of the first one's line", async () => {
    const setup = await scanned();
    await sayRunFailed(failing(setup), { why: "step" });
    await sayRunFailed(failing(setup), { why: "config", file: "sluiceway.yaml" });

    const body = dashboardBody(setup.github);
    expect(under(body)).toStartWith(
      "The last run of this dashboard's workflow found a problem in sluiceway.yaml",
    );
    expect(body).not.toContain("failed before Sluiceway ran");
  });
});

describe("what it never does", () => {
  test("no dashboard yet: nothing is created, and the job log says why", async () => {
    const setup = harness(tableAdapter(TABLE));

    await sayRunFailed(failing(setup), { why: "step" });

    expect(setup.github.requests).toEqual(["listIssues"]);
    expect(setup.log.lines).toContain(
      "The dashboard could not say this run failed: there is no open dashboard with the label sluiceway (record 0120).",
    );
  });

  test("a write GitHub refuses is one line of the job log, never an error", async () => {
    const setup = await scanned();
    const refusing = {
      listIssues: () => Promise.reject(new Error("Bad credentials")),
    } as unknown as typeof setup.github;

    await sayRunFailed({ ...failing(setup), github: refusing }, { why: "step" });

    expect(setup.log.lines).toContain(
      "The dashboard could not say this run failed: Bad credentials (record 0120).",
    );
  });
});

describe("the dashboard settings a run can still read", () => {
  test("a config that loads: its label and zone", () => {
    const root = repoRoot("dashboard:\n  label: ops\n  timeZone: Europe/Brussels\n");
    expect(dashboardSettingsOf(root)).toEqual({ label: "ops", timeZone: "Europe/Brussels" });
  });

  test("no config: the defaults", () => {
    expect(dashboardSettingsOf(repoRoot())).toEqual({ label: "sluiceway", timeZone: undefined });
  });

  test("a config with a problem elsewhere: the two keys as written, when they make sense", () => {
    const root = repoRoot("dashboard:\n  label: ops\n  timeZone: Not/AZone\nstacks: 3\n");
    expect(dashboardSettingsOf(root)).toEqual({ label: "ops", timeZone: undefined });
  });

  test("a file that is not YAML at all: the defaults", () => {
    const root = repoRoot("dashboard: [\n  : :\n");
    expect(dashboardSettingsOf(root)).toEqual({ label: "sluiceway", timeZone: undefined });
  });
});

describe("which runs write it", () => {
  test("every mode that writes the dashboard, and auto unless the event is a pull request", () => {
    for (const mode of ["scan", "resolve", "apply", "settle"]) {
      expect(writesDashboard(mode, "push")).toBe(true);
    }
    expect(writesDashboard("auto", "schedule")).toBe(true);
    expect(writesDashboard("auto", "issues")).toBe(true);
    expect(writesDashboard("auto", "pull_request")).toBe(false);
    expect(writesDashboard("check", "push")).toBe(false);
    expect(writesDashboard("init", "push")).toBe(false);
  });
});

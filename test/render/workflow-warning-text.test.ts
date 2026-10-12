import { describe, expect, test } from "bun:test";
import type { CheckReport } from "../../src/core/check.ts";
import type { WorkflowNote, WorkflowWarning } from "../../src/core/workflow-check.ts";
import { checkParts, workflowWarningText } from "../../src/render/check.ts";

// The words of every workflow warning and note, one of each kind and each
// variant. The tests of the workflow check assert which kind it finds; these
// pin what a person reads for it, in the job log and the summary.

const P = ".github/workflows/sluiceway.yml";

const WARNINGS: WorkflowWarning[] = [
  { kind: "unreadable", path: P },
  { kind: "unknown-mode", path: P, job: "scan", mode: "deploy" },
  { kind: "unreleased-ref", path: P, job: "scan", ref: "main" },
  { kind: "mixed-refs", path: P, refs: ["v0", "v0.8.0"] },
  { kind: "missing-trigger", path: P, trigger: "push" },
  { kind: "missing-trigger", path: P, trigger: "schedule" },
  { kind: "missing-trigger", path: P, trigger: "workflow_dispatch" },
  { kind: "missing-trigger", path: P, trigger: "issues" },
  { kind: "forbidden-trigger", path: P, trigger: "pull_request" },
  { kind: "forbidden-trigger", path: P, trigger: "pull_request", auto: true },
  { kind: "missing-job", path: P, mode: "settle" },
  { kind: "boxes-do-nothing", path: P },
  { kind: "no-permissions", path: P, job: "scan", mode: "scan", needs: ["contents: read"] },
  { kind: "no-permissions", path: P, job: "sluiceway", mode: "auto", needs: ["actions: write"] },
  {
    kind: "missing-permissions",
    path: P,
    job: "apply",
    mode: "apply",
    missing: ["deployments: write"],
  },
  { kind: "preview-on-target", path: P, job: "check" },
  { kind: "no-concurrency", path: P, job: "scan", mode: "scan" },
  { kind: "no-concurrency", path: P, job: "resolve", mode: "resolve" },
  { kind: "no-concurrency", path: P, job: "apply", mode: "apply" },
  { kind: "no-concurrency", path: P, job: "sluiceway", mode: "auto" },
  { kind: "auto-no-queue", path: P, job: "sluiceway" },
  { kind: "auto-cancels", path: P, job: "sluiceway" },
  { kind: "apply-group-shared", path: P, job: "apply" },
  { kind: "apply-no-queue", path: P, job: "apply" },
  { kind: "apply-cancels", path: P, job: "apply" },
  { kind: "no-status-check", path: P, job: "apply", mode: "apply" },
  { kind: "no-status-check", path: P, job: "settle", mode: "settle" },
  { kind: "settle-skips-apply", path: P, job: "settle", apply: "apply-merged" },
  { kind: "no-merged-apply", path: P },
  { kind: "no-on-merge-apply", path: P },
  { kind: "scan-no-matrix-output", path: P, job: "apply-merged", scan: "scan" },
];

const NOTES: WorkflowNote[] = [
  { kind: "no-preview-pages", path: P, job: "scan" },
  { kind: "called", path: P },
];

const EMPTY: CheckReport = {
  stacks: [],
  ignore: [],
  unclaimed: [],
  suggested: [],
  shared: [],
  phases: [],
  reads: [],
  inputs: [],
};

describe("the words of the workflow check", () => {
  test("every warning", () => {
    expect(WARNINGS.map(workflowWarningText)).toMatchSnapshot();
  });

  test("every warning and note, as the summary of the check shows them", () => {
    const part = checkParts({
      report: EMPTY,
      workflows: { workflows: [], warnings: WARNINGS, notes: NOTES },
      credentials: { stacks: [], jobs: [] },
      unrelated: [],
      hasConfigFile: true,
    }).at(-2);
    expect(part?.summary).toMatchSnapshot();
  });
});

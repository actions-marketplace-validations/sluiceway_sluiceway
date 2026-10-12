import { describe, expect, test } from "bun:test";
import { settle } from "../../src/modes/settle.ts";
import { handedOn, runApply } from "./apply-harness.ts";
import { ACTION_REF, change, pending, steppingClock } from "./harness.ts";
import { ALICE, matrix, scanned, tick, WORKFLOW, wake } from "./resolve-harness.ts";

// Every writer of the dashboard names the deploy freezes by its own clock
// (record 0115). The freeze here starts three days after the harness clock,
// so it is shown and holds nothing back yet. `resolve` has no clock in these
// tests and reads the real one, after the freeze, so its write drops the line:
// the row swap of `apply` or `settle`, on the harness clock, writes it again.

const TABLE = {
  "app:prod": pending("app:prod", change("web")),
  "network:prod": pending("network:prod", change("vpc")),
};

const SOON = `freezes:
  - from: 2026-09-24T00:00
    to: 2026-09-26T00:00
    reason: Launch week
`;

const LINE =
  "Deploy freeze from 2026-09-24 00:00 UTC until 2026-09-26 00:00 UTC (Launch week): every deploy waits while it holds.";

const freezeLines = (body: string) =>
  body.split("\n").filter((line) => line.includes("Launch week"));

describe("the freeze line of a row swap", () => {
  test("apply writes it", async () => {
    const h = await handedOn(TABLE, ["app:prod"], { config: SOON });
    expect(freezeLines(h.github.issue(h.number).body)).toEqual([]);

    await runApply(h);

    expect(freezeLines(h.github.issue(h.number).body)).toEqual([LINE]);
  });

  test("settle writes it with the failure line", async () => {
    const h = await scanned(TABLE, {
      config: `${SOON}stacks:\n  - path: app\n    dependsOn: [network:prod]\n`,
    });
    tick(h, ALICE, ["app:prod", "network:prod"]);
    await wake(h);
    expect(freezeLines(h.github.issue(h.number).body)).toEqual([]);
    const first = (matrix(h) as { deployment: number }[])[0]?.deployment ?? 0;
    h.github.addDeploymentStatus(first, { state: "failure", autoInactive: false });

    await settle({
      root: h.context.root,
      adapter: h.adapter,
      github: h.github,
      log: h.log,
      repoUrl: h.context.repoUrl,
      runId: h.context.runId,
      event: h.context.event,
      workflow: WORKFLOW,
      actionRef: ACTION_REF,
      now: steppingClock(),
    });

    const body = h.github.issue(h.number).body;
    expect(body).toContain("last deploy failed: a stack it depends on did not deploy");
    expect(freezeLines(body)).toEqual([LINE]);
  });
});

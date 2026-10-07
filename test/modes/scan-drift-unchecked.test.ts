import { describe, expect, test } from "bun:test";
import { scan } from "../../src/modes/scan.ts";
import { parseDashboard } from "../../src/render/marker.ts";
import { change, dashboardBody, harness, inSync, pending, SHA, tableAdapter } from "./harness.ts";

// Record 0121: a stack whose drift check failed says so on its row, quietly:
// `drift not checked`. No state, no hash, no box of its own. A push that
// previews the stack checks it again, as it does a stack with known drift.

const ON = "drift:\n  enabled: true\n";
const OLD = "1111111111111111111111111111111111111111";
const TABLE = {
  "app:prod": pending("app:prod", change("motd")),
  "network:dev": inSync("network:dev"),
  "site:prod": inSync("site:prod"),
};
const FAILS = {
  ok: false as const,
  reason: { kind: "tool-error" as const, exitCode: 255 },
  detail: [],
  toolLog: "error: the token expired\n",
};

function rowLine(body: string, id: string): string | undefined {
  return body.split("\n").find((line) => line.includes(`stack="${id}"`));
}

describe("a drift check that fails", () => {
  test("an in-sync row says drift not checked, with the marker key, and keeps its state", async () => {
    const adapter = tableAdapter(TABLE, {}, {}, { "network:dev": FAILS });
    const { context, github } = harness(adapter, { config: ON, event: "schedule" });
    await scan(context);

    const body = dashboardBody(github);
    expect(rowLine(body, "network:dev")).toBe(
      '- network:dev · drift not checked <!-- sluiceway:row stack="network:dev" state="in-sync" drift-check="failed" -->',
    );
    const row = parseDashboard(body).rows.find((one) => one.stackId === "network:dev");
    expect(row).toMatchObject({ state: "in-sync", driftUnchecked: true });
    expect(rowLine(body, "site:prod")).not.toContain("drift not checked");
  });

  test("a pending row says it after its counts, and its hash does not change", async () => {
    const plain = harness(tableAdapter(TABLE), { config: ON, event: "schedule" });
    await scan(plain.context);
    const hashOf = (body: string) =>
      parseDashboard(body).rows.find((one) => one.stackId === "app:prod");

    const adapter = tableAdapter(TABLE, {}, {}, { "app:prod": FAILS });
    const { context, github } = harness(adapter, { config: ON, event: "schedule" });
    await scan(context);

    const body = dashboardBody(github);
    expect(rowLine(body, "app:prod")).toContain("1 update · drift not checked · [preview]");
    const failed = hashOf(body);
    const before = hashOf(dashboardBody(plain.github));
    expect(failed?.known && failed.hash).toBe(before?.known ? before.hash : "");
  });

  test("the next check that works takes it away", async () => {
    const first = harness(tableAdapter(TABLE, {}, {}, { "network:dev": FAILS }), {
      config: ON,
      event: "schedule",
    });
    await scan(first.context);

    await scan({ ...first.context, adapter: tableAdapter(TABLE, {}, {}, {}), runId: "4243" });

    expect(rowLine(dashboardBody(first.github), "network:dev")).not.toContain("drift not checked");
  });

  test("a push that previews the stack checks it again, so the note does not come and go", async () => {
    const first = harness(tableAdapter(TABLE, {}, {}, { "network:dev": FAILS }), {
      config: ON,
      event: "schedule",
      sha: OLD,
      runId: "4000",
    });
    await scan(first.context);

    const adapter = tableAdapter(TABLE, {}, {}, { "network:dev": FAILS });
    first.github.seedComparison(OLD, SHA, {
      status: "ahead",
      files: [{ path: "network/Pulumi.yaml" }, { path: "site/index.ts" }],
    });
    const { log, context } = harness(adapter);
    await scan({
      ...first.context,
      adapter,
      log,
      now: context.now,
      sha: SHA,
      runId: "4242",
      event: "push",
    });

    expect(adapter.driftChecked).toEqual(["network:dev"]);
    expect(rowLine(dashboardBody(first.github), "network:dev")).toContain("drift not checked");
  });
});

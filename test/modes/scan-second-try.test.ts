import { describe, expect, test } from "bun:test";
import type { PreviewResult } from "../../src/adapters/adapter.ts";
import { ScanFailedError, scan } from "../../src/modes/scan.ts";
import { parseDashboard } from "../../src/render/marker.ts";
import {
  change,
  dashboardBody,
  failing,
  harness,
  inSync,
  JOB_URL,
  pending,
  tableAdapter,
} from "./harness.ts";

// Record 0117: a preview that failed is tried once more in the same scan,
// after one short pause, and only a preview that failed twice is a preview
// failure. The job log shows the tool's last lines right under the line that
// says a preview failed.

function rowStates(body: string): Record<string, string> {
  return Object.fromEntries(parseDashboard(body).rows.map((row) => [row.stackId, row.state]));
}

// Fails the first time it is asked and answers the second time.
function once(first: PreviewResult, second: PreviewResult): () => Promise<PreviewResult> {
  let asked = 0;
  return async () => (asked++ === 0 ? first : second);
}

// The clock of the harness moves with every read, and previews run side by
// side, so the seconds of a line are not what these tests are about.
function timeless(lines: string[]): string[] {
  return lines.map((line) => line.replace(/ in \d+\.\d s: /, " in N s: "));
}

function pausing(): { pauses: number[]; pause: (ms: number) => Promise<void> } {
  const pauses: number[] = [];
  return { pauses, pause: async (ms) => void pauses.push(ms) };
}

const BUSY: PreviewResult = {
  ok: false,
  reason: { kind: "stack-busy" },
  detail: [],
  toolLog: "Error: Error acquiring the state lock\n",
};

describe("a preview that failed", () => {
  test("is tried once more after one short pause, and a second try that works gives its row", async () => {
    const adapter = tableAdapter({
      "a:prod": pending("a:prod", change("x")),
      "b:prod": once(failing("error: 502 Bad Gateway\n"), inSync("b:prod")),
      "c:prod": once(failing(), pending("c:prod", change("y"))),
    });
    const { pauses, pause } = pausing();
    const { context, github, log } = harness(adapter, { pause, strict: true });

    await scan(context);

    expect(adapter.previewed).toEqual(["a:prod", "b:prod", "c:prod", "b:prod", "c:prod"]);
    expect(pauses).toEqual([10_000]);
    expect(rowStates(dashboardBody(github))).toEqual({
      "a:prod": "pending",
      "b:prod": "in-sync",
      "c:prod": "pending",
    });
    expect(log.warnings).toEqual([]);
    expect(log.lines).toContain(
      "2 previews did not work and are tried once more after a pause of 10 s: b:prod, c:prod.",
    );
    expect(timeless(log.lines.filter((line) => line.startsWith("Previewed b:prod")))).toEqual([
      "Previewed b:prod in N s: preview failed, the tool exited with an error (exit code 255)",
      "Previewed b:prod again in N s: in sync",
    ]);
    // The group of the stack keeps the first try, reason and words.
    const group = log.groups.find(({ title }) => title === "b:prod");
    expect(group?.lines).toEqual([
      "no changes",
      "The first try failed: the tool exited with an error (exit code 255)",
      "The tool's own words on the first try:",
      "error: 502 Bad Gateway",
    ]);
  });

  test("twice is a preview failure, and the run says it was tried twice", async () => {
    const adapter = tableAdapter({
      "a:prod": inSync("a:prod"),
      "b:prod": once(failing("error: first\n"), failing("error: second\n")),
    });
    const { pauses, pause } = pausing();
    const { context, github, log } = harness(adapter, { pause });

    await scan(context);

    expect(adapter.previewed).toEqual(["a:prod", "b:prod", "b:prod"]);
    expect(pauses).toEqual([10_000]);
    expect(dashboardBody(github)).toContain(
      `- **b:prod** · preview failed: the tool exited with an error (exit code 255) · [run](${JOB_URL})`,
    );
    expect(log.warnings).toEqual([
      {
        title: "Preview failed",
        message:
          "🔴 The preview of b:prod failed twice: the tool exited with an error (exit code 255).",
      },
    ]);
    expect(log.groups.find(({ title }) => title === "b:prod")?.lines).toEqual([
      "preview failed twice: the tool exited with an error (exit code 255)",
      "The tool's own words:",
      "error: second",
      "The first try failed: the tool exited with an error (exit code 255)",
      "The tool's own words on the first try:",
      "error: first",
    ]);
  });

  test("for a reason a second run cannot change is not tried again", async () => {
    const adapter = tableAdapter({
      "a:prod": inSync("a:prod"),
      "b:prod": { ok: false, reason: { kind: "stack-not-found" }, detail: [], toolLog: "" },
    });
    const { pauses, pause } = pausing();
    const { context, log } = harness(adapter, { pause });

    await scan(context);

    expect(adapter.previewed).toEqual(["a:prod", "b:prod"]);
    expect(pauses).toEqual([]);
    expect(log.warnings.map(({ message }) => message)).toEqual([
      "🔴 The preview of b:prod failed: the stack does not exist in the backend.",
    ]);
  });

  test("with every other preview of the scan is not tried again: the environment is broken", async () => {
    const adapter = tableAdapter({ "a:prod": failing(), "b:prod": failing() });
    const { pauses, pause } = pausing();
    const { context, log } = harness(adapter, { pause });

    await expect(scan(context)).rejects.toBeInstanceOf(ScanFailedError);

    expect(adapter.previewed).toEqual(["a:prod", "b:prod"]);
    expect(pauses).toEqual([]);
    expect(log.lines).toContain(
      "Every preview failed, so none is tried again: that nearly always means the environment is broken.",
    );
  });
});

describe("the job log of a failed preview", () => {
  test("shows what the tool wrote right under the line that says it failed, behind the stack id", async () => {
    const adapter = tableAdapter({
      "a:prod": inSync("a:prod"),
      "b:prod": {
        ok: false,
        reason: { kind: "stack-not-found" },
        detail: [],
        toolLog: "warning: old\nerror: no stack named 'prod' found\n",
      },
    });
    const { context, log } = harness(adapter, pausing());

    await scan(context);

    const at = timeless(log.lines).indexOf(
      "Previewed b:prod in N s: preview failed, the stack does not exist in the backend",
    );
    expect(at).toBeGreaterThan(-1);
    expect(log.lines.slice(at + 1, at + 4)).toEqual([
      "What the tool wrote for b:prod:",
      "[b:prod] warning: old",
      "[b:prod] error: no stack named 'prod' found",
    ]);
  });

  test("shows the last 20 lines of a tool that wrote more, and says where the rest is", async () => {
    const words = Array.from({ length: 57 }, (_, index) => `line ${index + 1}\n`).join("");
    const adapter = tableAdapter({
      "a:prod": inSync("a:prod"),
      "b:prod": { ok: false, reason: { kind: "stack-not-found" }, detail: [], toolLog: words },
    });
    const { context, log } = harness(adapter, pausing());

    await scan(context);

    const at = log.lines.indexOf(
      "The last 20 of the 57 lines the tool wrote for b:prod, which the group of the stack holds in full:",
    );
    expect(at).toBeGreaterThan(-1);
    expect(log.lines[at + 1]).toBe("[b:prod] line 38");
    expect(log.lines[at + 20]).toBe("[b:prod] line 57");
    expect(log.lines[at + 21]).not.toMatch(/^\[b:prod\] line/);
  });

  test("says so when the tool wrote nothing", async () => {
    const adapter = tableAdapter({
      "a:prod": inSync("a:prod"),
      "b:prod": { ok: false, reason: { kind: "stack-not-found" }, detail: [], toolLog: "" },
    });
    const { context, log } = harness(adapter, pausing());

    await scan(context);

    expect(log.lines).toContain("The tool wrote nothing for b:prod.");
  });
});

describe("a stack whose lock another update holds", () => {
  test("is tried once more, and one that is free by then gets the row of its preview", async () => {
    const adapter = tableAdapter({
      "a:prod": inSync("a:prod"),
      "b:prod": once(BUSY, pending("b:prod", change("x"))),
    });
    const { context, github, log } = harness(adapter, pausing());

    await scan(context);

    expect(rowStates(dashboardBody(github))).toEqual({ "a:prod": "in-sync", "b:prod": "pending" });
    expect(timeless(log.lines)).toContain(
      "Previewed b:prod in N s: busy, another update holds the stack's lock",
    );
  });

  test("twice is busy, not failed: its row says so, nothing warns, and strict stays green", async () => {
    const adapter = tableAdapter({ "a:prod": inSync("a:prod"), "b:prod": BUSY });
    const { context, github, log } = harness(adapter, { ...pausing(), strict: true });

    await scan(context);

    expect(adapter.previewed).toEqual(["a:prod", "b:prod", "b:prod"]);
    const body = dashboardBody(github);
    expect(body).toContain(
      `- **b:prod** · busy: another update holds the stack's lock, the next scan previews it · [run](${JOB_URL}) <!-- sluiceway:row stack="b:prod" state="preview-failed" busy="true" -->`,
    );
    expect(body).not.toContain("preview failed:");
    expect(body).not.toContain("## Preview failed");
    expect(body).toContain('<img alt="Sluiceway: everything is in sync, 1 stack is busy"');
    expect(body).toContain("🟢&nbsp;1 in sync · ⚪&nbsp;1 busy");
    expect(body).toContain(
      "## Busy\n\nAnother update held the lock of this stack when the scan ran, so it was not previewed. The next scan previews it.\n\n- **b:prod**",
    );
    expect(log.warnings).toEqual([]);
    expect(log.lines).toContain(
      "b:prod is busy: another update holds the stack's lock. It was tried twice. Its row says busy, and the next scan previews it.",
    );
  });

  test("with every other preview failed still leaves the job to the failures alone", async () => {
    const adapter = tableAdapter({ "a:prod": BUSY, "b:prod": BUSY });
    const { context, github } = harness(adapter, pausing());

    await scan(context);

    expect(rowStates(dashboardBody(github))).toEqual({
      "a:prod": "preview-failed",
      "b:prod": "preview-failed",
    });
    expect(dashboardBody(github)).toContain("⚪&nbsp;2 busy");
  });
});

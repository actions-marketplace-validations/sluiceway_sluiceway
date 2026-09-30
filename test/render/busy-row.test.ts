import { describe, expect, test } from "bun:test";
import type { PreviewResult } from "../../src/core/tool-result.ts";
import { dashboardFacts } from "../../src/render/dashboard-facts.ts";
import { parseDashboard } from "../../src/render/marker.ts";
import { previewOutcome, previewRow, previewSummary } from "../../src/render/preview-result.ts";
import { renderRow } from "../../src/render/row.ts";
import { renderSummary } from "../../src/render/summary.ts";
import { busyLine } from "../../src/render/voice.ts";

// Record 0117: a stack whose lock another update holds is busy, not failed.
// Its row has the state of a preview failure, which is what a reader that
// does not know the `busy` key draws, and the dashboard tells the two apart
// by that key.

const LINKS = { summary: "https://example.test/run", log: "https://example.test/job" };
const BUSY: PreviewResult = {
  ok: false,
  reason: { kind: "stack-busy" },
  detail: [],
  toolLog: "Error: Error acquiring the state lock\n",
};
const FAILED: PreviewResult = {
  ok: false,
  reason: { kind: "tool-error", exitCode: 1 },
  detail: [],
  toolLog: "",
};

function rows(...results: [string, PreviewResult][]) {
  const body = results.map(([id, result]) => renderRow(previewRow(id, result, LINKS))).join("\n");
  return parseDashboard(body).rows;
}

describe("the row of a busy stack", () => {
  test("says busy, what holds it and what happens next, and never that it failed", () => {
    expect(renderRow(previewRow("net:prod", BUSY, LINKS))).toBe(
      [
        '- **net:prod** · busy: another update holds the stack\'s lock, the next scan previews it · [run](https://example.test/job) <!-- sluiceway:row stack="net:prod" state="preview-failed" busy="true" -->',
        "  <!-- /sluiceway:row -->",
      ].join("\n"),
    );
  });

  test("reads back as busy, and a preview failure does not", () => {
    const [busy, failed] = rows(["a:prod", BUSY], ["b:prod", FAILED]);
    expect(busy).toMatchObject({ state: "preview-failed", busy: true });
    expect(failed).toMatchObject({ state: "preview-failed" });
    expect(failed && "busy" in failed).toBe(false);
  });

  test("is only ever a row of the state preview-failed: the key on any other row is not read", () => {
    const [row] = parseDashboard(
      '- a:prod <!-- sluiceway:row stack="a:prod" state="in-sync" busy="true" -->\n  <!-- /sluiceway:row -->',
    ).rows;
    expect(row && "busy" in row).toBe(false);
  });

  test("is what the job log calls it", () => {
    expect(previewOutcome(BUSY)).toBe("busy, another update holds the stack's lock");
  });
});

describe("the dashboard with a busy stack", () => {
  test("is not failing: the busy row is counted and listed apart from the preview failures", () => {
    const facts = dashboardFacts(rows(["a:prod", BUSY]));
    expect(facts.headerState).toBe("in-sync");
    expect(facts.counts).toMatchObject({ previewFailed: 0, busy: 1 });
    expect(facts.previewFailed).toEqual([]);
    expect(facts.busy.map((row) => row.stackId)).toEqual(["a:prod"]);
  });

  test("is still failing when another preview failed", () => {
    const facts = dashboardFacts(rows(["a:prod", BUSY], ["b:prod", FAILED]));
    expect(facts.headerState).toBe("failing");
    expect(facts.counts).toMatchObject({ previewFailed: 1, busy: 1 });
  });

  test("says above its busy rows what happened and what comes next, for one and for more", () => {
    expect(busyLine(1)).toBe(
      "Another update held the lock of this stack when the scan ran, so it was not previewed. The next scan previews it.",
    );
    expect(busyLine(2)).toBe(
      "Another update held the lock of each of these stacks when the scan ran, so they were not previewed. The next scan previews them.",
    );
  });
});

describe("the summary of a scan with a busy stack", () => {
  test("counts and lists it as busy, not as a preview failure", () => {
    const { text } = renderSummary(
      [previewSummary("a:prod", BUSY), previewSummary("b:prod", FAILED)],
      { jobLogUrl: "https://example.test/job" },
    );
    expect(text).toContain("2 stacks previewed: 1 preview failed, 1 busy.");
    expect(text).toContain("- Preview failed: [b:prod](#user-content-sluiceway-b-3a-prod)");
    expect(text).toContain("- Busy: [a:prod](#user-content-sluiceway-a-3a-prod)");
    expect(text).toContain(
      "### Busy\n\n- <a id=\"sluiceway-a-3a-prod\"></a>**a:prod** · another update holds the stack's lock · the tool's own words are in the [job log](https://example.test/job), in the group <code>a:prod</code>",
    );
    expect(text.indexOf("### Preview failed")).toBeLessThan(text.indexOf("### Busy"));
  });
});

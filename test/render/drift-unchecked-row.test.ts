import { describe, expect, test } from "bun:test";
import { parseDashboard, rowMarker } from "../../src/render/marker.ts";
import { renderRow } from "../../src/render/row.ts";

// Record 0121: the quiet note of a row whose drift check failed. Written out
// by hand.

describe("drift not checked", () => {
  test("the marker key comes after every older key, and reads back", () => {
    const marker = rowMarker({ stackId: "network:dev", state: "in-sync", driftUnchecked: true });
    expect(marker).toBe(
      '<!-- sluiceway:row stack="network:dev" state="in-sync" drift-check="failed" -->',
    );
    expect(
      parseDashboard(`- network:dev ${marker}\n  <!-- /sluiceway:row -->`).rows[0],
    ).toMatchObject({
      driftUnchecked: true,
    });
  });

  test("a row without it reads as checked", () => {
    const marker = rowMarker({ stackId: "network:dev", state: "in-sync" });
    expect(marker).not.toContain("drift-check");
    expect(
      parseDashboard(`- network:dev ${marker}\n  <!-- /sluiceway:row -->`).rows[0],
    ).not.toHaveProperty("driftUnchecked");
  });

  test("an in-sync row", () => {
    expect(renderRow({ state: "in-sync", stackId: "network:dev", driftUnchecked: true })).toBe(
      [
        '- network:dev · drift not checked <!-- sluiceway:row stack="network:dev" state="in-sync" drift-check="failed" -->',
        "  <!-- /sluiceway:row -->",
      ].join("\n"),
    );
  });
});

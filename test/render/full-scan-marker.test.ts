import { describe, expect, test } from "bun:test";
import { parseDashboard, rootMarker } from "../../src/render/marker.ts";

// Record 0011 gives the root marker two more keys, written by full scans and
// carried through by every other writer. The line is the one record 0029
// was judged on.
const LINE =
  '<!-- sluiceway:dashboard v="1" scan-sha="8c41f0e7d2b94a6f1e3c5d7a9b0c2e4f6a8b1d3c" scan-run="17034455121" scan-at="2026-09-21T10:02:41Z" full-scan-at="2026-09-21T06:00:12Z" full-scan-run="17031200455" -->';

const FACTS = {
  scanSha: "8c41f0e7d2b94a6f1e3c5d7a9b0c2e4f6a8b1d3c",
  scanRun: "17034455121",
  scanAt: "2026-09-21T10:02:41Z",
  fullScanAt: "2026-09-21T06:00:12Z",
  fullScanRun: "17031200455",
};

describe("the last full scan on the root marker", () => {
  test("is written after the scan facts, in a fixed order", () => {
    expect(rootMarker(FACTS)).toBe(LINE);
  });

  test("is read back", () => {
    expect(parseDashboard(LINE).root).toEqual({ version: 1, ...FACTS });
  });

  test("is left out when it is not known", () => {
    const { fullScanAt: _at, fullScanRun: _run, ...scan } = FACTS;
    expect(rootMarker(scan)).toBe(
      '<!-- sluiceway:dashboard v="1" scan-sha="8c41f0e7d2b94a6f1e3c5d7a9b0c2e4f6a8b1d3c" scan-run="17034455121" scan-at="2026-09-21T10:02:41Z" -->',
    );
    expect(parseDashboard(rootMarker(scan)).root?.fullScanAt).toBe(undefined);
    expect(parseDashboard(rootMarker(scan)).root?.fullScanRun).toBe(undefined);
  });
});

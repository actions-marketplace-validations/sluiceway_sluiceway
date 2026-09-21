import { expect, test } from "bun:test";
import { utcMinute } from "../../src/render/time.ts";

// Absolute UTC times, so the same input always gives the same bytes (0029).
test("a time is written in UTC to the minute, cut and not rounded", () => {
  expect(utcMinute(new Date("2026-09-21T08:52:59.999Z"))).toBe("2026-09-21 08:52 UTC");
  expect(utcMinute(new Date("2026-01-02T03:04:05+05:30"))).toBe("2026-01-01 21:34 UTC");
});

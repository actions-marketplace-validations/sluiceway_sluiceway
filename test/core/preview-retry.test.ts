import { describe, expect, test } from "bun:test";
import type { PreviewFailureReason } from "../../src/core/failure-reason.ts";
import { previewFailureText } from "../../src/core/failure-reason.ts";
import {
  isBusy,
  PREVIEW_RETRY_PAUSE_SECONDS,
  worthASecondTry,
} from "../../src/core/preview-retry.ts";

// Record 0117: a preview that failed is tried once more in the same scan,
// when a second run of the tool can come out another way. The rule reads the
// reason, which is a fact of Sluiceway's own, and never the tool's words.

describe("which failed previews get a second try", () => {
  const again: PreviewFailureReason[] = [
    { kind: "tool-error", exitCode: 1 },
    { kind: "tool-error", exitCode: null },
    { kind: "authentication-error" },
    { kind: "resource-error" },
    { kind: "tool-timed-out" },
    { kind: "stack-busy" },
  ];
  for (const reason of again) {
    test(`${previewFailureText(reason)}: tried again`, () => {
      expect(worthASecondTry(reason)).toBe(true);
    });
  }

  // What a second run of the same commit cannot change, a time limit that
  // would be spent twice, and a bug of Sluiceway's own.
  const once: PreviewFailureReason[] = [
    { kind: "stack-not-found" },
    { kind: "configuration-error" },
    { kind: "timed-out", minutes: 10 },
    { kind: "unreadable-output" },
    { kind: "output-too-large", megabytes: 64 },
    { kind: "unknown-step" },
    { kind: "internal-error" },
    { kind: "env-file-not-loaded" },
  ];
  for (const reason of once) {
    test(`${previewFailureText(reason)}: not tried again`, () => {
      expect(worthASecondTry(reason)).toBe(false);
    });
  }

  test("the pause before the second try is short", () => {
    expect(PREVIEW_RETRY_PAUSE_SECONDS).toBe(10);
  });
});

describe("a busy stack", () => {
  test("is one whose lock another update holds, in fixed words", () => {
    expect(previewFailureText({ kind: "stack-busy" })).toBe(
      "another update holds the stack's lock",
    );
  });

  test("is told apart from a failure by its reason alone", () => {
    expect(isBusy({ ok: false, reason: { kind: "stack-busy" } })).toBe(true);
    expect(isBusy({ ok: false, reason: { kind: "tool-error", exitCode: 1 } })).toBe(false);
    expect(isBusy({ ok: true })).toBe(false);
  });
});

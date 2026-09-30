// The second try of a failed preview (record 0117). A registry that answers
// 502 once, a lock another update holds for a few seconds, a network that
// drops a request: a preview can fail for a reason that is gone a moment
// later, and a row that says failed until the next scan makes a repo look
// broken that is not. So the scan tries a failed preview once more after a
// short pause, and only a preview that failed twice is a preview failure.

import type { PreviewFailureReason } from "./failure-reason.ts";

// One pause per scan, before the second tries, however many there are.
export const PREVIEW_RETRY_PAUSE_SECONDS = 10;

// Whether a second run of the tool can come out another way. Decided from the
// reason, a fact of Sluiceway's own (record 0022), never from the tool's
// words. Left out: what the same commit gives again (a stack the backend does
// not hold, a configuration the tool refuses, output Sluiceway cannot read or
// hold, a step it does not know, an env file that does not load), the time
// limit of the preview, which a second try would spend a second time, and a
// bug of Sluiceway's own.
export function worthASecondTry(reason: PreviewFailureReason): boolean {
  switch (reason.kind) {
    case "tool-error":
    case "authentication-error":
    case "resource-error":
    case "tool-timed-out":
    case "stack-busy":
      return true;
    case "stack-not-found":
    case "configuration-error":
    case "timed-out":
    case "unreadable-output":
    case "output-too-large":
    case "unknown-step":
    case "internal-error":
    case "env-file-not-loaded":
    case "in-summary":
      return false;
  }
}

// A stack whose lock another update holds is busy, not failed (record 0117):
// nothing is wrong with it, and the scan could not look.
export function isBusy(
  result: { ok: true } | { ok: false; reason: PreviewFailureReason },
): boolean {
  return !result.ok && result.reason.kind === "stack-busy";
}

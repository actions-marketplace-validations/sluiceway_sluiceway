// Why a preview failed, from the short fixed list of record 0022. Only facts
// that Sluiceway produced itself are filled in: an exit code, a time limit.
// Never a word the tool wrote.
export type PreviewFailureReason =
  // exitCode is null when the tool could not be started or a signal ended it.
  | { kind: "tool-error"; exitCode: number | null }
  | { kind: "timed-out"; minutes: number }
  | { kind: "unreadable-output" }
  | { kind: "unknown-step" };

// The reason as a row, an annotation or a deployment status shows it. Display
// text only: nothing is ever decided from it.
export function previewFailureText(reason: PreviewFailureReason): string {
  switch (reason.kind) {
    case "tool-error":
      return reason.exitCode === null
        ? "The tool exited with an error."
        : `The tool exited with an error (exit code ${reason.exitCode}).`;
    case "timed-out":
      return `The preview timed out after ${reason.minutes} ${reason.minutes === 1 ? "minute" : "minutes"}.`;
    case "unreadable-output":
      return "The tool's output could not be read.";
    case "unknown-step":
      return "The tool reported a step that Sluiceway does not know.";
  }
}

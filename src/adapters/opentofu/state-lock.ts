// A state lock that another run of the tool holds (record 0117). The plan
// takes the lock, and while a deploy of the same stack runs it cannot: the
// tool exits with 1, the code of every other failed plan, and writes one
// diagnostic to its JSON log whose summary is a fixed phrase of its own
// (OpenTofu and Terraform, `Error acquiring the state lock`, the same for the
// local backend and the remote ones, and in the recorded `state-locked`
// scenario of both). The exit code cannot tell it apart, so this is the one
// place where a reason is picked from the tool's words (record 0022 as
// amended by 0117): the summary of an error diagnostic, compared whole. What
// a program writes itself lands in a detail, a warning or a plain line, and
// none of those is read. Nothing of the words is shown: the reason is a
// constant, and a phrase the tool changes gives the tool error of before.
const STATE_LOCK_SUMMARY = "Error acquiring the state lock";

export function stateLockHeld(planStdout: string): boolean {
  for (const line of planStdout.split(/\r?\n/)) {
    if (!line.includes(STATE_LOCK_SUMMARY)) continue;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof message !== "object" || message === null) continue;
    const { type, diagnostic } = message as {
      type?: unknown;
      diagnostic?: { severity?: unknown; summary?: unknown } | null;
    };
    if (
      type === "diagnostic" &&
      diagnostic?.severity === "error" &&
      diagnostic.summary === STATE_LOCK_SUMMARY
    ) {
      return true;
    }
  }
  return false;
}

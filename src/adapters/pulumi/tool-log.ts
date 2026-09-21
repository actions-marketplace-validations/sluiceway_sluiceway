// Control sequences (colour, cursor) and operating system commands (titles,
// links), by their ECMA-48 grammar.
const ANSI_ESCAPES = new RegExp(
  [
    "\\u001b\\[[0-?]*[ -/]*[@-~]",
    "\\u001b\\][^\\u0007\\u001b]*(?:\\u0007|\\u001b\\\\)",
    "\\u001b[@-Z\\\\^_]",
  ].join("|"),
  "g",
);

// The tool's words go to the job log as they are, with ANSI escapes stripped
// (record 0022). Its diagnostics hold escapes even when colour is turned off.
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPES, "");
}

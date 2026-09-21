// Which of the six pictures the header shows (record 0031). A pure function of
// the row markers, so every writer can compute it for rows it only carries
// through. It decides nothing.

import type { ParsedRow } from "./marker.ts";

// In the order in which they win: bad news first.
export const HEADER_STATES = [
  "plain",
  "failing",
  "deploying",
  "pending",
  "first-run",
  "in-sync",
] as const;
export type HeaderState = (typeof HEADER_STATES)[number];

// Every scan ends with one row for every stack (record 0011), so a body with
// no row at all is a scan that found no stacks. A row of a state this version
// does not know takes no part in any other rule.
export function headerState(rows: readonly ParsedRow[]): HeaderState {
  if (rows.length === 0) return "first-run";
  const known = rows.filter((row) => row.known);
  const is = (state: string) => known.some((row) => row.state === state);

  // A stack that is deleting something right now must not run under a
  // grinning gate, so deploying rows count as well as pending ones.
  const destroying = known.some(
    (row) => (row.state === "pending" || row.state === "deploying") && row.destroys > 0,
  );
  if (destroying) return "plain";
  if (is("preview-failed") || known.some((row) => row.failed)) return "failing";
  if (is("deploying")) return "deploying";
  if (is("pending")) return "pending";
  return "in-sync";
}

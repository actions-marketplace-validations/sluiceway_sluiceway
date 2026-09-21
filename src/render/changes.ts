import type { Change, Diff } from "../core/diff.ts";
import { byCodeUnit } from "./row.ts";

// The order every list of changes has (record 0024): deletes, then replaces,
// then the rest, each sorted by address by code unit.
export interface OrderedChanges {
  deletes: Change[];
  replaces: Change[];
  others: Change[];
}

export function orderChanges(diff: Diff): OrderedChanges {
  const changes = [...diff.changes].sort((a, b) => byCodeUnit(a.address, b.address));
  return {
    deletes: changes.filter((change) => change.op === "delete"),
    replaces: changes.filter((change) => change.op === "replace"),
    others: changes.filter((change) => change.op !== "delete" && change.op !== "replace"),
  };
}

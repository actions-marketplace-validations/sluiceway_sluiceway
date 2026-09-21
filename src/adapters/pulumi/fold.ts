import type { Change, Op, Tracking } from "../../core/diff.ts";
import type { PreviewStep } from "./schema.ts";

// From the tool's step ops to what a change says (record 0007), settled from
// the recordings of both CLI versions. "drop" is a step that changes nothing.
// A step op that is not here fails the preview. It is never shown as in sync.
const STEP_OPS: Record<string, { op: Op; tracking?: Tracking } | "drop"> = {
  // Every resource that stays as it is. The root stack resource is one of
  // them, also when only the stack's outputs change (record 0036).
  same: "drop",
  // No recording holds these two. Record 0007 names them as steps that change
  // nothing: a read of a resource the stack does not manage, and a refresh.
  read: "drop",
  refresh: "drop",
  create: { op: "create" },
  update: { op: "update" },
  // One step for either replace order. The tool only splits a replace into
  // its create and its delete when asked to, and the adapter never asks.
  replace: { op: "replace" },
  delete: { op: "delete" },
  import: { op: "none", tracking: "import" },
};

// What the tool calls a delete of a resource with retainOnDelete: the record
// goes and the real object stays.
const FORGET = { op: "none", tracking: "forget" } as const;

export type Folded =
  | { ok: true; changes: Change[] }
  // The detail names a place in the tool's output and what was expected
  // there, never what was found (record 0021).
  | { ok: false; reason: "unreadable-output" | "unknown-step"; detail: string[] };

export function foldSteps(steps: PreviewStep[]): Folded {
  const changes: Change[] = [];
  const unknown: string[] = [];
  const unreadable: string[] = [];
  const firstAt = new Map<string, number>();

  steps.forEach((step, index) => {
    const at = `The tool's output, at steps[${index}]`;
    const known = Object.hasOwn(STEP_OPS, step.op) ? STEP_OPS[step.op] : undefined;
    if (known === undefined) {
      unknown.push(`${at}.op: expected a step op that Sluiceway knows.`);
      return;
    }
    if (known === "drop") return;

    const resource = typeAndName(step.urn);
    if (resource === undefined) {
      unreadable.push(`${at}.urn: expected the URN of a resource.`);
      return;
    }
    // An address is unique within a diff (record 0007).
    const earlier = firstAt.get(step.urn);
    if (earlier !== undefined) {
      unreadable.push(
        `${at}.urn: expected an address that no earlier step has, and steps[${earlier}] has it.`,
      );
      return;
    }
    firstAt.set(step.urn, index);

    const folded = step.op === "delete" && step.oldState?.retainOnDelete === true ? FORGET : known;
    changes.push({ address: step.urn, ...resource, ...folded, ...keys(step, folded.op) });
  });

  if (unreadable.length > 0) return { ok: false, reason: "unreadable-output", detail: unreadable };
  if (unknown.length > 0) return { ok: false, reason: "unknown-step", detail: unknown };
  // The tool gives steps in an order that changes between identical runs
  // (record 0001).
  changes.sort((a, b) => byCodeUnit(a.address, b.address));
  return { ok: true, changes };
}

// What a person sees of a resource: the type token and the logical name, so a
// URN never reaches the dashboard (record 0007). A URN reads
// urn:pulumi:<stack>::<project>::<parent type>$<type>::<name>, and only a name
// can hold "::".
function typeAndName(urn: string): Pick<Change, "type" | "name"> | undefined {
  if (!urn.startsWith("urn:pulumi:")) return undefined;
  const [, , qualifiedType, ...rest] = urn.split("::");
  const type = qualifiedType?.split("$").at(-1);
  const name = rest.join("::");
  return type === undefined || type === "" || name === "" ? undefined : { type, name };
}

// Top-level property names, so a key means the same on an update and on a
// replace (record 0007). The tool gives paths only on an update in place, and
// names otherwise. Creates, deletes and tracking changes list no keys.
function keys(step: PreviewStep, op: Op): Pick<Change, "changedKeys" | "replaceKeys"> {
  if (op !== "update" && op !== "replace") return { changedKeys: [], replaceKeys: [] };
  const paths = step.detailedDiff ?? [];
  const changed = paths.length > 0 ? paths.map(firstSegment) : (step.diffReasons ?? []);
  const replaceKeys = op === "replace" ? sortedSet(step.replaceReasons ?? []) : [];
  // What forced a replace is a changed key too, also when the tool leaves it
  // out of its own list.
  return { changedKeys: sortedSet([...changed, ...replaceKeys]), replaceKeys };
}

// The tool writes a property path as a.b, a[0] or ["a.b"].c, the last form for
// a name that holds anything but letters, digits and underscores.
function firstSegment(path: string): string {
  const quoted = /^\["((?:[^"\\]|\\.)*)"\]/.exec(path)?.[1];
  if (quoted !== undefined) return quoted.replace(/\\(.)/g, "$1");
  return /^[^.[]+/.exec(path)?.[0] ?? path;
}

function sortedSet(names: string[]): string[] {
  return [...new Set(names)].sort(byCodeUnit);
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

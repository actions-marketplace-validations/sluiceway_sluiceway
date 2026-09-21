// The summary of a scan (records 0021 and 0037): the page of the workflow run
// that shows every previewed stack's diff, so a shortened or redacted row has a
// full version to link to. It is rendered from the same diffs as the rows and
// shows nothing a row could not show. It is never redacted (record 0023).

import type { Diff } from "../core/diff.ts";
import { orderChanges } from "./changes.ts";
import { escapeText } from "./escape.ts";
import { byCodeUnit, changeLine, counts, plural } from "./row.ts";

// A merged pull request or a direct push that a stack claims since its last
// successful deploy (record 0026). The core works them out and the glue hands
// them over as data. The summary has room for what a row leaves out: the title
// of a pull request and the first line of a direct push's message.
export type SummaryMerge =
  | { kind: "pull-request"; number: number; title: string; url: string; author?: string }
  | { kind: "push"; sha: string; message: string; url: string; author?: string };

// One previewed stack: its diff, or why there is none. A diff without changes
// is a stack in sync.
export type SummaryStack =
  | {
      kind: "diff";
      diff: Diff;
      // Newest first. Absent when the lookup failed: attribution never blocks.
      merges?: SummaryMerge[] | undefined;
    }
  | {
      kind: "preview-failed";
      stackId: string;
      // A failure reason from the fixed list (record 0022), as display text.
      reason: string;
    };

type DiffStack = Extract<SummaryStack, { kind: "diff" }>;

export interface Summary {
  text: string;
}

function firstLine(message: string): string {
  return message.split(/\r?\n/, 1)[0] ?? "";
}

function mergeLine(merge: SummaryMerge): string {
  const label =
    merge.kind === "pull-request"
      ? `#${merge.number} ${escapeText(merge.title)}`
      : `${merge.sha.slice(0, 7)} ${escapeText(firstLine(merge.message))}`;
  const by = merge.author === undefined ? "" : ` by ${escapeText(merge.author)}`;
  return `- [${label}](${merge.url})${by}`;
}

function mergeCounts(merges: SummaryMerge[]): string {
  const of = (kind: SummaryMerge["kind"]) => merges.filter((merge) => merge.kind === kind).length;
  return [
    of("pull-request") && plural(of("pull-request"), "pull request"),
    of("push") && plural(of("push"), "direct push").replace(/pushs$/, "pushes"),
  ]
    .filter(Boolean)
    .join(" and ");
}

// The parts of one stack's entry. Parts are joined by a blank line, so a list
// never runs into the list before it.
function diffParts(stack: DiffStack): string[] {
  const { deletes, replaces, others } = orderChanges(stack.diff);
  const destroys = [...deletes, ...replaces];
  const parts = [`#### ${escapeText(stack.diff.stackId)}`, counts([...destroys, ...others])];
  if (destroys.length > 0) {
    parts.push(destroys.map((change) => `- :warning: ${changeLine(change)}`).join("\n"));
  }
  if (others.length > 0) {
    const inside = plural(others.length, destroys.length > 0 ? "other change" : "change");
    parts.push(
      `<details><summary>${inside}</summary>`,
      others.map((change) => `- ${changeLine(change)}`).join("\n"),
      "</details>",
    );
  }
  const merges = stack.merges ?? [];
  if (merges.length > 0) {
    parts.push(`From ${mergeCounts(merges)}:`, merges.map(mergeLine).join("\n"));
  }
  return parts;
}

function stackIdOf(stack: SummaryStack): string {
  return stack.kind === "diff" ? stack.diff.stackId : stack.stackId;
}

export function renderSummary(stacks: SummaryStack[]): Summary {
  const sorted = [...stacks].sort((a, b) => byCodeUnit(stackIdOf(a), stackIdOf(b)));
  const diffs = sorted.filter((stack) => stack.kind === "diff");
  const pending = diffs.filter((stack) => stack.diff.changes.length > 0);
  const inSync = diffs.filter((stack) => stack.diff.changes.length === 0);
  const failed = sorted.filter((stack) => stack.kind === "preview-failed");

  const parts = ["## Sluiceway scan"];
  if (stacks.length === 0) parts.push("No stacks previewed.");
  else {
    const words = [
      pending.length && `${pending.length} pending`,
      failed.length && `${failed.length} preview failed`,
      inSync.length && `${inSync.length} in sync`,
    ].filter(Boolean);
    parts.push(`${plural(stacks.length, "stack")} previewed: ${words.join(", ")}.`);
  }
  if (pending.length > 0) parts.push("### Pending", ...pending.flatMap(diffParts));
  if (failed.length > 0) {
    parts.push(
      "### Preview failed",
      failed
        .map((stack) => `- **${escapeText(stack.stackId)}** · ${escapeText(stack.reason)}`)
        .join("\n"),
    );
  }
  if (inSync.length > 0) {
    parts.push(
      "### In sync",
      inSync.map((stack) => `- ${escapeText(stack.diff.stackId)}`).join("\n"),
    );
  }
  return { text: `${parts.join("\n\n")}\n` };
}

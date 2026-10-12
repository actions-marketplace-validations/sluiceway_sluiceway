// The words of the job log for what resolve found about the ticks of one
// run: one line per finding, and the half sentence of a merge that started
// nothing (records 0018, 0054 and 0083).

import { errorMessage, plural } from "../core/basics.ts";
import type { NobodyReason, Tick } from "../core/edit-history.ts";
import { NOT_QUALIFIED, type NotQualified } from "../core/merge-and-deploy.ts";
import type { Finding, MergeRefusal } from "../core/tick-judgement.ts";
import type { TickTarget } from "../core/tick-rule.ts";
import { bulkName } from "./bulk-box.ts";
import { logGroupTitle } from "./log-text.ts";
import type { RefusedTick } from "./refused-ticks.ts";
import { windowWords } from "./row.ts";
import { minuteAt } from "./time.ts";

// One line of the job log for each thing the judgement found. The zone is
// the dashboard's, for a time the line says (record 0089).
export function findingText(finding: Finding, timeZone = "UTC"): string {
  switch (finding.kind) {
    case "taken": {
      const { tick, fact } = finding;
      // Nothing is merged for a stack that is taken (record 0054). Nobody gets
      // a comment, so the row gets a note (record 0064), and the job log says
      // more.
      return tick.kind === "merge"
        ? `${tickName(tick)} is ticked, and the stack already has an open deployment, ticked by ${fact.ticker} in run ${fact.run}. Nothing is merged and the box is cleared. Tick it again once that deploy is over.`
        : `${tickName(tick)} is ticked and already has an open deployment, ticked by ${fact.ticker} in run ${fact.run}. The tick is dropped.`;
    }
    case "deploys-off": {
      // One reviewed line stops every deploy (record 0051). Nothing could go
      // out whoever ticked, so nobody is looked up and nobody is mentioned.
      const off = `${tickName(finding.tick)} is ticked, and deploys are turned off in sluiceway.yaml (deploys: false).`;
      switch (finding.tick.kind) {
        case "merge":
          return `${off} Nothing is merged and the box is cleared.`;
        case "bulk":
          return `${off} The box goes.`;
        case "confirm":
          return `${off} Nothing is deployed and the box goes.`;
        default:
          return `${off} The box is cleared.`;
      }
    }
    case "policy-failed":
      // The row has no box (record 0106), so the tick came from an edit of
      // the body. Nobody is looked up and nobody is mentioned.
      return `${tickName(finding.tick)} is ticked, and a policy failed on its change, so its row has no box. The box is cleared.`;
    case "moving":
      return `${tickName(finding.tick)} is ticked in a body that kept moving. Left for the run that edit woke.`;
    case "nameless":
      // Nobody certain to mention, so no comment, and the job stays green
      // (record 0025).
      return `${tickName(finding.tick)} is ticked and the edit history names nobody for it (${NOBODY[finding.reason]}). The box is cleared.`;
    case "not-a-person":
      return `${targetName(finding.target)} was ticked by ${finding.editor.login || "nobody"}, who is not a person. Left alone.`;
    case "allowed":
      return `${targetName(finding.target)} was ticked by ${finding.login}.`;
    case "bulk-allowed": {
      const { rows } = finding;
      const name = capitalized(bulkName("box", finding.section));
      return rows.length < 2
        ? `${name} was ticked by ${finding.login}, and the section has fewer than two rows now. Each has its own box, so the box goes.`
        : `${name} was ticked by ${finding.login}. Its confirm box names ${plural(rows.length, "stack")}: ${listed(rows)}.`;
    }
    case "refused":
      return `${targetName(finding.target)} was ticked by ${finding.login}, who may not tick it (${finding.reason}). The box is cleared.`;
    case "unverified":
      return `${targetName(finding.target)} was ticked by ${finding.login}, and GitHub gave no answer about their access: ${errorMessage(finding.error)}. The box is cleared.`;
    case "over-cap": {
      const one = finding.over === 1;
      return `One run starts at most ${finding.started} deploys. ${plural(finding.over, "tick")} beyond that ${one ? "is" : "are"} cleared and ${one ? "needs" : "need"} a fresh tick.`;
    }
    case "waits-on": {
      const words = [
        ...finding.named.map(logGroupTitle),
        ...finding.phases.flatMap(({ phase, stackIds }) =>
          stackIds.map((dependency) => `${logGroupTitle(dependency)} of the ${phase} phase`),
        ),
      ];
      const one = finding.waitingOn.length === 1;
      return `${logGroupTitle(finding.stackId)} is ticked, and it depends on ${words.join(" and ")}, which ${one ? "has a change" : "have changes"} waiting and ${one ? "is" : "are"} not ticked. The box is cleared.`;
    }
    case "window-closed":
      // A deploy freeze holds it (record 0115): the words of its row.
      if (finding.freeze !== undefined) {
        return `${logGroupTitle(finding.stackId)} is ticked during a deploy freeze. Its deployment record waits for ${windowWords({ opens: finding.opens, freeze: finding.freeze }, timeZone)}, and the first run after that starts it.`;
      }
      return `${logGroupTitle(finding.stackId)} is ticked outside its deploy window, ${finding.opens === undefined ? "and no window of it opens within a week" : `which opens ${minuteAt(finding.opens, timeZone)}`}. Its deployment record waits for the window, and a run inside the window starts it.`;
    case "confirm-stale": {
      const { tick, changes } = finding;
      const section = tick.kind === "confirm" ? tick.section : "pending";
      const what = [
        ...(changes.added.length > 0
          ? [`${listed(changes.added)} ${changes.added.length === 1 ? "is" : "are"} new`]
          : []),
        ...(changes.gone.length > 0
          ? [
              `${listed(changes.gone)} ${changes.gone.length === 1 ? "is" : "are"} not ${section === "pending" ? "pending" : "drifted"} any more`,
            ]
          : []),
        ...(changes.moved.length > 0
          ? [`${listed(changes.moved)} ${changes.moved.length === 1 ? "has" : "have"} a new diff`]
          : []),
      ];
      return `${tickName(tick)} was ticked, and its rows changed since it was drawn (${what.join(", ")}). Nothing is deployed and the bulk box asks for a fresh tick.`;
    }
    case "confirm-own-row":
      return `${logGroupTitle(finding.stackId)} is ticked on its own row too. That tick and its ticker count.`;
    case "confirm-unknown":
      return `${logGroupTitle(finding.stackId)} is in ${bulkName("confirm", finding.section)}, and discovery knows no such stack. Left alone.`;
    case "confirm-handed-on":
      return `${tickName(finding.tick)} was ticked by ${finding.login}. It stands for a tick on each of ${plural(finding.stackIds.length, "stack")}: ${listed(finding.stackIds)}.`;
  }
}

export function tickName(tick: Tick): string {
  if (tick.kind === "row") return logGroupTitle(tick.stackId);
  if (tick.kind === "merge") {
    return `The merge of #${tick.pr} for ${tick.stackIds.map(logGroupTitle).join(" and ")}`;
  }
  if (tick.kind === "bulk") return capitalized(bulkName("box", tick.section));
  if (tick.kind === "confirm") return capitalized(bulkName("confirm", tick.section));
  return "The rescan box";
}

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

// "a, b and c", for the job log.
function listed(ids: readonly string[]): string {
  const names = ids.map(logGroupTitle);
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function targetName(target: TickTarget): string {
  if (target.kind === "stack") return logGroupTitle(target.stackId);
  if (target.kind === "merge") {
    return `The merge of #${target.pr} for ${target.stackIds.map(logGroupTitle).join(" and ")}`;
  }
  if (target.kind === "bulk") return capitalized(bulkName("box", target.section));
  return "The rescan box";
}

// The half sentence of the job log after "... was ticked by <login>,".
export function mergeRefusalText(
  refusal: Exclude<MergeRefusal, { kind: "refused-by-github" }>,
): string {
  switch (refusal.kind) {
    case "waits-on": {
      const one = refusal.stackIds.length === 1;
      return `and the stack depends on ${refusal.stackIds.map(logGroupTitle).join(" and ")}, which ${one ? "has a change" : "have changes"} waiting. Nothing is merged.`;
    }
    case "closed":
      return "and the pull request is not open any more.";
    case "head-moved":
      return "and the pull request has a new head commit since.";
    case "not-qualified":
      return `and the pull request no longer qualifies: ${notQualifiedText(refusal.why)}.`;
    case "no-method":
      return "and the repo allows no merge method.";
  }
}

function notQualifiedText(why: NotQualified | "other-stacks"): string {
  return why === "other-stacks" ? "its files belong to another stack" : NOT_QUALIFIED[why];
}

// What the comment says about a merge that started nothing (record 0054).
export function mergeProblem(
  refusal: MergeRefusal,
): Pick<RefusedTick, "reason" | "detail" | "waitsOn"> {
  switch (refusal.kind) {
    case "waits-on":
      return { reason: "waits-on", detail: undefined, waitsOn: refusal.stackIds };
    case "closed":
      return { reason: "not-qualified", detail: "it is not open any more", waitsOn: undefined };
    case "head-moved":
      return { reason: "head-moved", detail: undefined, waitsOn: undefined };
    case "not-qualified":
      return { reason: "not-qualified", detail: notQualifiedText(refusal.why), waitsOn: undefined };
    case "no-method":
      return {
        reason: "merge-refused",
        detail: "the repository allows no merge method",
        waitsOn: undefined,
      };
    case "refused-by-github":
      return { reason: "merge-refused", detail: refusal.message, waitsOn: undefined };
  }
}

const NOBODY: Record<NobodyReason, string> = {
  "entry-without-body": "an entry of the edit history has no body",
  "end-of-history": "the tick is older than the edit history GitHub keeps",
  "not-in-newest-entry": "the body kept moving",
};

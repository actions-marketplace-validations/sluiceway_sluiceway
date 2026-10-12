import { describe, expect, test } from "bun:test";
import type { Tick } from "../../src/core/edit-history.ts";
import type { Finding, MergeRefusal } from "../../src/core/tick-judgement.ts";
import type { TickTarget } from "../../src/core/tick-rule.ts";
import { findingText, mergeProblem, mergeRefusalText } from "../../src/render/tick-findings.ts";

// The line of the job log for each thing the judgement of the ticks found,
// one of each kind and each variant of its words.

const ROW: Tick = { kind: "row", stackId: "app:prod", hash: "h" };
const MERGE: Tick = { kind: "merge", pr: 418, stackIds: ["app:prod", "db:prod"], head: "abc" };
const BULK: Tick = { kind: "bulk", section: "pending" };
const CONFIRM: Tick = { kind: "confirm", section: "drift", stacks: [] };
const RESCAN: Tick = { kind: "rescan" };
const STACK: TickTarget = { kind: "stack", stackId: "app:prod", rule: "write" };
const FACT = { kind: "open", deployment: 7, waiting: false, ticker: "bob", run: "5151" } as const;
const ENDS = new Date("2027-01-04T23:00:00Z");
const OPENS = new Date("2027-01-05T08:00:00Z");

const FINDINGS: [string, Finding][] = [
  ["taken, a row", { kind: "taken", tick: ROW, fact: FACT }],
  ["taken, a merge", { kind: "taken", tick: MERGE, fact: FACT }],
  ["deploys off, a merge", { kind: "deploys-off", tick: MERGE }],
  ["deploys off, a bulk box", { kind: "deploys-off", tick: BULK }],
  ["deploys off, a confirm box", { kind: "deploys-off", tick: CONFIRM }],
  ["deploys off, a row", { kind: "deploys-off", tick: ROW }],
  ["deploys off, the rescan box", { kind: "deploys-off", tick: RESCAN }],
  ["policy failed", { kind: "policy-failed", tick: ROW }],
  ["moving", { kind: "moving", tick: ROW }],
  ["nameless, no body", { kind: "nameless", tick: ROW, reason: "entry-without-body" }],
  ["nameless, end of history", { kind: "nameless", tick: MERGE, reason: "end-of-history" }],
  ["nameless, not in newest", { kind: "nameless", tick: BULK, reason: "not-in-newest-entry" }],
  [
    "not a person",
    { kind: "not-a-person", target: STACK, editor: { login: "ci[bot]", type: "Bot" } },
  ],
  [
    "not a person, a gone account",
    { kind: "not-a-person", target: { kind: "rescan" }, editor: { login: "", type: "" } },
  ],
  ["allowed, a stack", { kind: "allowed", target: STACK, login: "alice" }],
  [
    "allowed, a merge",
    {
      kind: "allowed",
      target: { kind: "merge", pr: 418, stackIds: ["app:prod"], rule: "write" },
      login: "alice",
    },
  ],
  [
    "allowed, a bulk box",
    { kind: "allowed", target: { kind: "bulk", section: "drift" }, login: "alice" },
  ],
  [
    "bulk allowed, one row",
    { kind: "bulk-allowed", section: "pending", login: "alice", rows: ["app:prod"] },
  ],
  [
    "bulk allowed, three rows",
    {
      kind: "bulk-allowed",
      section: "pending",
      login: "alice",
      rows: ["app:prod", "db:prod", "web:prod"],
    },
  ],
  ["refused", { kind: "refused", target: STACK, login: "eve", reason: "not-on-list" }],
  [
    "unverified, an error",
    { kind: "unverified", target: STACK, login: "eve", error: new Error("502 Bad Gateway") },
  ],
  [
    "unverified, not an error",
    { kind: "unverified", target: STACK, login: "eve", error: "timeout" },
  ],
  ["over the cap, one", { kind: "over-cap", started: 20, over: 1 }],
  ["over the cap, three", { kind: "over-cap", started: 20, over: 3 }],
  [
    "waits on one",
    {
      kind: "waits-on",
      stackId: "app:prod",
      waitingOn: ["db:prod"],
      named: ["db:prod"],
      phases: [],
    },
  ],
  [
    "waits on several, by phase too",
    {
      kind: "waits-on",
      stackId: "app:prod",
      waitingOn: ["db:prod", "net:prod", "dns:prod"],
      named: ["db:prod"],
      phases: [{ phase: "network", stackIds: ["net:prod", "dns:prod"] }],
    },
  ],
  ["window closed, opens later", { kind: "window-closed", stackId: "app:prod", opens: OPENS }],
  ["window closed, never opens", { kind: "window-closed", stackId: "app:prod", opens: undefined }],
  [
    "window closed, a freeze",
    {
      kind: "window-closed",
      stackId: "app:prod",
      opens: ENDS,
      freeze: { reason: "Year-end", ends: ENDS },
    },
  ],
  [
    "confirm stale, every change",
    {
      kind: "confirm-stale",
      tick: CONFIRM,
      changes: { added: ["a:prod"], gone: ["b:prod", "c:prod"], moved: ["d:prod"] },
    },
  ],
  [
    "confirm stale, the pending section",
    {
      kind: "confirm-stale",
      tick: { kind: "confirm", section: "pending", stacks: [] },
      changes: { added: ["a:prod", "b:prod"], gone: ["c:prod"], moved: ["d:prod", "e:prod"] },
    },
  ],
  [
    "confirm stale, not a confirm tick",
    { kind: "confirm-stale", tick: BULK, changes: { added: [], gone: ["c:prod"], moved: [] } },
  ],
  ["confirm own row", { kind: "confirm-own-row", stackId: "app:prod" }],
  ["confirm unknown", { kind: "confirm-unknown", stackId: "gone:prod", section: "drift" }],
  [
    "confirm handed on",
    { kind: "confirm-handed-on", tick: CONFIRM, login: "alice", stackIds: ["a:prod", "b:prod"] },
  ],
];

describe("the job log line of each finding", () => {
  test("in UTC", () => {
    expect(
      Object.fromEntries(FINDINGS.map(([name, finding]) => [name, findingText(finding)])),
    ).toMatchSnapshot();
  });

  test("a time is in the dashboard's zone", () => {
    const closed: Finding = { kind: "window-closed", stackId: "app:prod", opens: OPENS };
    expect(findingText(closed, "Europe/Brussels")).toContain("2027-01-05 09:00 UTC+1");
  });
});

describe("a merge tick that started nothing", () => {
  const REFUSALS: [Exclude<MergeRefusal, { kind: "refused-by-github" }>, string][] = [
    [
      { kind: "waits-on", stackIds: ["db:prod"] },
      "and the stack depends on db:prod, which has a change waiting. Nothing is merged.",
    ],
    [
      { kind: "waits-on", stackIds: ["db:prod", "net:prod"] },
      "and the stack depends on db:prod and net:prod, which have changes waiting. Nothing is merged.",
    ],
    [{ kind: "closed" }, "and the pull request is not open any more."],
    [{ kind: "head-moved" }, "and the pull request has a new head commit since."],
    [
      { kind: "not-qualified", why: "draft" },
      "and the pull request no longer qualifies: it is a draft.",
    ],
    [
      { kind: "not-qualified", why: "other-stacks" },
      "and the pull request no longer qualifies: its files belong to another stack.",
    ],
    [{ kind: "no-method" }, "and the repo allows no merge method."],
  ];

  test.each(REFUSALS)("the job log for %o", (refusal, text) => {
    expect(mergeRefusalText(refusal)).toBe(text);
  });

  const PROBLEMS: [MergeRefusal, ReturnType<typeof mergeProblem>][] = [
    [
      { kind: "waits-on", stackIds: ["db:prod"] },
      { reason: "waits-on", detail: undefined, waitsOn: ["db:prod"] },
    ],
    [
      { kind: "closed" },
      { reason: "not-qualified", detail: "it is not open any more", waitsOn: undefined },
    ],
    [{ kind: "head-moved" }, { reason: "head-moved", detail: undefined, waitsOn: undefined }],
    [
      { kind: "not-qualified", why: "draft" },
      { reason: "not-qualified", detail: "it is a draft", waitsOn: undefined },
    ],
    [
      { kind: "not-qualified", why: "other-stacks" },
      { reason: "not-qualified", detail: "its files belong to another stack", waitsOn: undefined },
    ],
    [
      { kind: "no-method" },
      {
        reason: "merge-refused",
        detail: "the repository allows no merge method",
        waitsOn: undefined,
      },
    ],
    [
      { kind: "refused-by-github", message: "Base branch was modified" },
      { reason: "merge-refused", detail: "Base branch was modified", waitsOn: undefined },
    ],
  ];

  test.each(PROBLEMS)("the comment for %o", (refusal, problem) => {
    expect(mergeProblem(refusal)).toEqual(problem);
  });
});

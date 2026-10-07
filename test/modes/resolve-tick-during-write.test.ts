import { describe, expect, test } from "bun:test";
import { ticksIn } from "../../src/core/edit-history.ts";
import { change, pending } from "./harness.ts";
import {
  ALICE,
  BOB,
  matrix,
  type ResolveHarness,
  scanned,
  tick,
  WRITE,
  wake,
} from "./resolve-harness.ts";

// A tick that lands between `resolve`'s late read and its write (issue 291,
// record 0119). GitHub has no compare-and-swap for issue bodies, so the write
// goes over the edit. The write loop sees that in the edit history and writes
// again on top of it, and the run that the tick's own event started deploys it.

const TABLE = {
  "a:prod": pending("a:prod", change("logs")),
  "b:prod": pending("b:prod", change("logs")),
};

// Bob ticks b:prod at the moment `resolve` sends its first body, so the body
// it sends was built from a read that did not hold his tick.
function bobTicksDuringTheWrite(h: ResolveHarness): void {
  let done = false;
  h.github.onRequest = (request) => {
    if (request !== "updateIssueBody" || done) return;
    done = true;
    tick(h, BOB, ["b:prod"]);
  };
}

function rowTicked(h: ResolveHarness, stackId: string): boolean {
  return ticksIn(h.github.issue(h.number).body).some(
    (one) => one.kind === "row" && one.stackId === stackId,
  );
}

describe("a tick made while resolve writes the body", () => {
  test("is written back on top of the write that went over it", async () => {
    const h = await scanned(TABLE);
    h.github.seedPermission(BOB.login, WRITE);
    tick(h, ALICE, ["a:prod"]);
    bobTicksDuringTheWrite(h);

    await wake(h);

    expect((matrix(h) as { stack: string }[]).map(({ stack }) => stack)).toEqual(["a:prod"]);
    expect(rowTicked(h, "b:prod")).toBe(true);
    expect(h.log.lines).toContain(
      `An edit landed on the dashboard (#${h.number}) between the read and the write, and the write went over it. The dashboard was written again on top of that edit.`,
    );
  });

  test("deploys in the run its own event started, with the person who ticked it as the ticker", async () => {
    const h = await scanned(TABLE);
    h.github.seedPermission(BOB.login, WRITE);
    tick(h, ALICE, ["a:prod"]);
    bobTicksDuringTheWrite(h);
    await wake(h);
    h.github.onRequest = undefined;

    // Bob's edit woke a run of its own, which waited for the first.
    await wake(h);

    const [entry] = matrix(h) as { stack: string; deployment: number }[];
    expect(entry?.stack).toBe("b:prod");
    expect(h.github.deployment(entry?.deployment ?? 0)).toMatchObject({
      task: "sluiceway:b:prod",
      payload: { ticker: "bob" },
    });
    expect(h.log.lines).not.toContain("No box is ticked. Nothing to do.");
  });
});

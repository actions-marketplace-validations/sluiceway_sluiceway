import { BODY_LIMIT } from "../render/budget.ts";
import type { GitHubPort } from "./port.ts";

// Record 0004: at most three tries.
const MAX_TRIES = 3;

// Builds the new body from the live one. It is called again on every try, so
// it does its own late reads (the open deployments) inside, and none of the
// slow work: previews are done before the loop starts (record 0004).
export type BuildBody = (liveBody: string) => string | Promise<string>;

export interface WriteResult {
  // False when no try's body stuck: the live body already was what the
  // builder gave.
  written: boolean;
  tries: number;
  body: string;
  // A write went over an edit that landed between its read and its write, and
  // the body was written again on top of that edit (record 0119).
  rewritten: boolean;
}

// The builder gave a body over the hard limit, the one number that the size
// budget owns (BODY_LIMIT, record 0028). The budget exists so that this never
// happens. This is the last line behind it.
export class BodyTooLargeError extends Error {
  constructor(body: string) {
    super(
      `The dashboard body came out at ${count(body.length)} characters. The most Sluiceway ever writes is ${count(BODY_LIMIT)}, the size GitHub takes on every path. Nothing was written and the dashboard stays as it was.`,
    );
    this.name = "BodyTooLargeError";
  }
}

export class DashboardWriteError extends Error {
  constructor(number: number, lastBody: string, wentOver = false) {
    super(
      wentOver
        ? `The dashboard (#${number}) was written, and Sluiceway tried ${MAX_TRIES} times to write it without going over an edit that landed between its read and its write. Each time another edit landed. The last edit it went over is in the issue's edit history, and a box ticked in it needs a fresh tick.`
        : `The dashboard (#${number}) could not be written. Sluiceway tried ${MAX_TRIES} times, and each time the body GitHub stored afterwards was not the body it sent. Either other writers kept getting in between, or GitHub dropped the body without an error, which it does when a body is too large for it. The last body sent was ${count(lastBody.length)} characters and ${count(byteLength(lastBody))} bytes.`,
    );
    this.name = "DashboardWriteError";
  }
}

// The one way any mode writes the dashboard body (record 0004): read the live
// body, build, skip the write when nothing would change, write, read back. A
// write that did not stick is tried again from the late read. A write that
// stuck but went over an edit that landed after the late read is tried again
// from the body it went over (record 0119). There is no lock, so this is all
// that stands between two writers.
export async function writeBody(
  github: GitHubPort,
  number: number,
  build: BuildBody,
): Promise<WriteResult> {
  // What the builder builds from, and what GitHub holds. They differ only
  // after a write that went over an edit: then the builder gets that edit,
  // and the body that went over it is what a new write replaces.
  let live = (await github.getIssue(number)).body;
  let stored = live;
  let written = false;
  let rewritten = false;
  for (let tries = 1; ; tries++) {
    const body = await build(live);
    if (body === stored) return { written, tries, body, rewritten };
    if (body.length > BODY_LIMIT) throw new BodyTooLargeError(body);
    await github.updateIssueBody(number, body);
    rewritten ||= written;
    // The answer to the update proves nothing (issue 17). Only a read does.
    // When the write was lost, this read is the late read of the next try.
    const after = (await github.getIssue(number)).body;
    if (after === body) {
      written = true;
      const wentOver = await editWentOver(github, number, body, stored);
      if (wentOver === undefined) return { written, tries, body, rewritten };
      if (tries === MAX_TRIES) throw new DashboardWriteError(number, body, true);
      live = wentOver;
      stored = body;
      continue;
    }
    if (tries === MAX_TRIES) throw new DashboardWriteError(number, body);
    live = after;
    stored = after;
  }
}

// The body of an edit that a write which stuck went over, or nothing (record
// 0119). GitHub has no compare-and-swap for issue bodies (record 0004), so an
// edit that lands between the late read and the write is replaced by it. The
// edit history still holds it: the entry right before the write's own. An
// entry without a body, or a history that already moved past the write,
// gives nothing to build from, and the write stands.
async function editWentOver(
  github: GitHubPort,
  number: number,
  body: string,
  replaced: string,
): Promise<string | undefined> {
  const history = await github.readEditHistory(number, { size: 2, after: undefined });
  const [own, before] = history.entries;
  if (history.body !== body || own?.body !== body) return undefined;
  if (!before?.body || before.body === replaced) return undefined;
  return before.body;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function count(n: number): string {
  return n.toLocaleString("en-US");
}

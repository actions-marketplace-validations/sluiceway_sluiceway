import { describe, expect, test } from "bun:test";
import { BodyTooLargeError, DashboardWriteError, writeBody } from "../../src/github/write-loop.ts";
import { FakeGitHub } from "../fake-github/fake-github.ts";

describe("a write that lands", () => {
  test("the body is built from the live body, written and read back", async () => {
    const github = new FakeGitHub();
    const { number } = github.seedIssue({ body: "old" });

    const result = await writeBody(github, number, (live) => `${live} and new`);

    expect(github.issue(number).body).toBe("old and new");
    expect(result).toEqual({ written: true, tries: 1, body: "old and new" });
    expect(github.requests).toEqual(["getIssue", "updateIssueBody", "getIssue"]);
  });

  test("a body that is byte-identical to the live one is not written", async () => {
    const github = new FakeGitHub();
    const { number } = github.seedIssue({ body: "same" });

    const result = await writeBody(github, number, () => "same");

    expect(result).toEqual({ written: false, tries: 1, body: "same" });
    expect(github.requests).toEqual(["getIssue"]);
  });
});

// Lets another writer edit the body right after the nth update, before the
// read back.
function anotherWriterAfterUpdate(github: FakeGitHub, number: number, bodies: string[]): void {
  let armed = false;
  github.onRequest = (request) => {
    const body = armed ? bodies.shift() : undefined;
    if (body !== undefined) github.editBody(number, body);
    armed = request === "updateIssueBody";
  };
}

describe("a write that is lost", () => {
  test("another writer got in: the body is built again from what that writer left", async () => {
    const github = new FakeGitHub();
    const { number } = github.seedIssue({ body: "rows: a" });
    anotherWriterAfterUpdate(github, number, ["rows: a, ticked"]);

    const result = await writeBody(github, number, (live) => `${live} + b`);

    expect(github.issue(number).body).toBe("rows: a, ticked + b");
    expect(result).toEqual({ written: true, tries: 2, body: "rows: a, ticked + b" });
  });

  test("the read back of a lost write is the late read of the next try", async () => {
    const github = new FakeGitHub();
    const { number } = github.seedIssue({ body: "one" });
    anotherWriterAfterUpdate(github, number, ["two"]);

    await writeBody(github, number, (live) => `${live}!`);

    expect(github.requests).toEqual([
      "getIssue",
      "updateIssueBody",
      "getIssue",
      "updateIssueBody",
      "getIssue",
    ]);
  });

  test("the other writer already wrote what this one wanted: done, nothing written again", async () => {
    const github = new FakeGitHub();
    const { number } = github.seedIssue({ body: "a" });
    anotherWriterAfterUpdate(github, number, ["a, b, c"]);
    const withB = (live: string) => (live.includes("b") ? live : `${live}, b`);

    const result = await writeBody(github, number, withB);

    expect(result).toEqual({ written: false, tries: 2, body: "a, b, c" });
    expect(github.requests).toEqual(["getIssue", "updateIssueBody", "getIssue"]);
  });

  test("the third try can still land", async () => {
    const github = new FakeGitHub();
    const { number } = github.seedIssue({ body: "0" });
    anotherWriterAfterUpdate(github, number, ["1", "2"]);

    const result = await writeBody(github, number, (live) => `${live}!`);

    expect(result).toEqual({ written: true, tries: 3, body: "2!" });
  });

  test("three tries, then an error that turns the job red", async () => {
    const github = new FakeGitHub();
    const { number } = github.seedIssue({ body: "0" });
    anotherWriterAfterUpdate(github, number, ["1", "2", "3", "4"]);

    const failed = writeBody(github, number, (live) => `${live}!`);

    await expect(failed).rejects.toBeInstanceOf(DashboardWriteError);
    await expect(failed).rejects.toThrow(
      `The dashboard (#${number}) could not be written. Sluiceway tried 3 times, and each time the body GitHub stored afterwards was not the body it sent. Either other writers kept getting in between, or GitHub dropped the body without an error, which it does when a body is too large for it. The last body sent was 2 characters and 2 bytes.`,
    );
    expect(github.requests.filter((request) => request === "updateIssueBody")).toHaveLength(3);
    expect(github.issue(number).body).toBe("3");
  });

  test("GitHub's silent drop is caught by the read back: three tries, then the error", async () => {
    // A GitHub whose limit is lower than the one Sluiceway knows stands for any
    // drop that cannot be seen coming. The update answers success every time.
    const github = new FakeGitHub({ updateLimitBytes: 1_000 });
    const { number } = github.seedIssue({ body: "old" });
    const body = "a".repeat(1_001);

    const failed = writeBody(github, number, () => body);

    await expect(failed).rejects.toThrow(
      "The last body sent was 1,001 characters and 1,001 bytes.",
    );
    expect(github.requests.filter((request) => request === "updateIssueBody")).toHaveLength(3);
    expect(github.issue(number).body).toBe("old");
  });
});

describe("a body over a hard limit is never sent", () => {
  test("over 65,536 characters", async () => {
    const github = new FakeGitHub();
    const { number } = github.seedIssue({ body: "old" });

    const failed = writeBody(github, number, () => "a".repeat(65_537));

    await expect(failed).rejects.toBeInstanceOf(BodyTooLargeError);
    await expect(failed).rejects.toThrow(
      "The dashboard body came out at 65,537 characters. The most Sluiceway ever writes is 65,536, the size GitHub takes on every path. Nothing was written and the dashboard stays as it was.",
    );
    expect(github.requests).toEqual(["getIssue"]);
  });

  test("65,536 characters is written, whatever they weigh in bytes", async () => {
    const github = new FakeGitHub();
    const { number } = github.seedIssue({ body: "old" });

    await writeBody(github, number, () => "\u20ac".repeat(65_536));

    expect(github.issue(number).body).toHaveLength(65_536);
  });

  test("a character outside the BMP counts as two, which errs on the safe side", async () => {
    const github = new FakeGitHub();
    const { number } = github.seedIssue({ body: "old" });

    const failed = writeBody(github, number, () => "\u{1F30A}".repeat(32_769));

    await expect(failed).rejects.toThrow("65,538 characters");
  });
});

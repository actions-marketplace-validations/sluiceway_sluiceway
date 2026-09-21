import { describe, expect, test } from "bun:test";
import type { Change } from "../../src/core/diff.ts";
import { renderSummary, type SummaryStack } from "../../src/render/summary.ts";

const REPO_URL = "https://github.com/example-org/infra";

function change(op: Change["op"], type: string, name: string, rest: Partial<Change> = {}): Change {
  return { address: `${type}::${name}`, type, name, op, changedKeys: [], replaceKeys: [], ...rest };
}

// The diff of the worked example of record 0027, handed over out of order,
// with the pull requests and the direct push its attribution line names.
const BUCKETS: SummaryStack = {
  kind: "diff",
  diff: {
    stackId: "storage/buckets:prod",
    changes: [
      change("create", "aws:s3/bucketVersioning:BucketVersioning", "uploads"),
      change("replace", "aws:s3/bucket:Bucket", "uploads", {
        changedKeys: ["tags", "bucket"],
        replaceKeys: ["bucket"],
      }),
      change("none", "aws:s3/bucket:Bucket", "archive", {
        tracking: "move",
        previousAddress: "aws:s3/bucket:Bucket::old-archive",
      }),
      change("delete", "aws:s3/bucketPolicy:BucketPolicy", "uploads-public-read"),
      change("update", "aws:s3/bucketLifecycleConfiguration:BucketLifecycleConfiguration", "logs", {
        changedKeys: ["rules"],
      }),
    ],
  },
  merges: [
    {
      kind: "pull-request",
      number: 433,
      title: "Rename the uploads bucket",
      url: `${REPO_URL}/pull/433`,
      author: "alice",
    },
    {
      kind: "push",
      sha: "3fa9c1e2aabbccdd3fa9c1e2aabbccdd3fa9c1e2",
      message: "Fix the lifecycle rule",
      url: `${REPO_URL}/commit/3fa9c1e2aabbccdd3fa9c1e2aabbccdd3fa9c1e2`,
      author: "bob",
    },
  ],
};

describe("the summary of a scan", () => {
  test("one pending stack, in full", () => {
    expect(renderSummary([BUCKETS]).text).toBe(
      [
        "## Sluiceway scan",
        "",
        "1 stack previewed: 1 pending.",
        "",
        "### Pending",
        "",
        "#### storage/buckets:prod",
        "",
        "1 create, 1 update, **1 replace**, **1 delete**, 1 tracking only",
        "",
        "- :warning: <kbd>DELETE</kbd> <code>aws:s3/bucketPolicy:BucketPolicy</code> <b>uploads-public-read</b>",
        "- :warning: <kbd>REPLACE</kbd> <code>aws:s3/bucket:Bucket</code> <b>uploads</b> · forced by <code>bucket</code> · also changes <code>tags</code>",
        "",
        "<details><summary>3 other changes</summary>",
        "",
        "- <kbd>move</kbd> <code>aws:s3/bucket:Bucket</code> <b>archive</b>",
        "- <kbd>update</kbd> <code>aws:s3/bucketLifecycleConfiguration:BucketLifecycleConfiguration</code> <b>logs</b> · <code>rules</code>",
        "- <kbd>create</kbd> <code>aws:s3/bucketVersioning:BucketVersioning</code> <b>uploads</b>",
        "",
        "</details>",
        "",
        "From 1 pull request and 1 direct push:",
        "",
        "- [#433 Rename the uploads bucket](https://github.com/example-org/infra/pull/433) by alice",
        "- [3fa9c1e Fix the lifecycle rule](https://github.com/example-org/infra/commit/3fa9c1e2aabbccdd3fa9c1e2aabbccdd3fa9c1e2) by bob",
        "",
      ].join("\n"),
    );
  });

  function diff(stackId: string, changes: Change[], rest: object = {}): SummaryStack {
    return { kind: "diff", diff: { stackId, changes }, ...rest };
  }

  test("pending stacks, preview failures and stacks in sync, each sorted by stack id", () => {
    const { text } = renderSummary([
      diff("b:prod", []),
      {
        kind: "preview-failed",
        stackId: "z:prod",
        reason: "The preview timed out after 10 minutes.",
      },
      diff("b:dev", [change("create", "t", "n")]),
      diff("a:prod", []),
      diff("B:dev", [change("update", "t", "n", { changedKeys: ["k"] })]),
      { kind: "preview-failed", stackId: "c:prod", reason: "The tool's output could not be read." },
    ]);

    expect(text).toBe(
      [
        "## Sluiceway scan",
        "",
        "6 stacks previewed: 2 pending, 2 preview failed, 2 in sync.",
        "",
        "### Pending",
        "",
        "#### B:dev",
        "",
        "1 update",
        "",
        "<details><summary>1 change</summary>",
        "",
        "- <kbd>update</kbd> <code>t</code> <b>n</b> · <code>k</code>",
        "",
        "</details>",
        "",
        "#### b:dev",
        "",
        "1 create",
        "",
        "<details><summary>1 change</summary>",
        "",
        "- <kbd>create</kbd> <code>t</code> <b>n</b>",
        "",
        "</details>",
        "",
        "### Preview failed",
        "",
        "- **c:prod** · The tool's output could not be read.",
        "- **z:prod** · The preview timed out after 10 minutes.",
        "",
        "### In sync",
        "",
        "- a:prod",
        "- b:prod",
        "",
      ].join("\n"),
    );
  });

  test("a scan that previewed nothing says so", () => {
    expect(renderSummary([]).text).toBe("## Sluiceway scan\n\nNo stacks previewed.\n");
  });

  test("text from outside is escaped, and a direct push shows the first line of its message", () => {
    const { text } = renderSummary([
      diff("a_b:prod", [change("create", "t", "n")], {
        merges: [
          {
            kind: "pull-request",
            number: 7,
            title: "Add [click](https://evil.example) <img src=x> *now*",
            url: `${REPO_URL}/pull/7`,
            author: "renovate[bot]",
          },
          {
            kind: "push",
            sha: "0123456789abcdef0123456789abcdef01234567",
            message: "Fix the thing\r\n\r\n- [x] **a:prod** fake row\n## Pending",
            url: `${REPO_URL}/commit/0123456`,
          },
        ],
      }),
      { kind: "preview-failed", stackId: "<b>:prod", reason: "made *up*" },
    ]);

    expect(text).toContain("#### a&#95;b:prod\n");
    expect(text).toContain(
      `- [#7 Add &#91;click&#93;(https://evil.example) &lt;img src=x&gt; &#42;now&#42;](${REPO_URL}/pull/7) by renovate&#91;bot&#93;\n`,
    );
    expect(text).toContain(`- [0123456 Fix the thing](${REPO_URL}/commit/0123456)\n`);
    expect(text).not.toContain("fake row");
    expect(text).toContain("- **&lt;b&gt;:prod** · made &#42;up&#42;\n");
  });
});

import { describe, expect, test } from "bun:test";
import { createGitHubClient } from "../../src/github/client.ts";
import { createOctokitPort } from "../../src/github/octokit-port.ts";
import { TokenRefused } from "../../src/github/port.ts";

// The real Octokit with its fetch swapped for one that answers from a list, as
// in octokit-port.test.ts. The answers have the shape of GitHub's REST and
// GraphQL documentation (slice 4.2). They were not probed on real GitHub,
// apart from the rollup's counts and the refusals of issue 292.

interface Answer {
  status?: number;
  json: unknown;
}

function portThatAnswers(answers: Answer[]) {
  const sent: { method: string; path: string; body: unknown }[] = [];
  const fetch = async (url: string, init: { method?: string; body?: string }) => {
    sent.push({
      method: init.method ?? "GET",
      path: new URL(url).pathname,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    const answer = answers.shift();
    if (!answer) throw new Error(`No answer left for ${init.method} ${url}`);
    return new Response(JSON.stringify(answer.json), {
      status: answer.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  const octokit = createGitHubClient("a-token", { request: { fetch } });
  return { port: createOctokitPort(octokit, { owner: "acme", repo: "infra" }), sent };
}

const HEAD = "a55ea6ea1b09b67ca25e41bcff94b0173b571998";

function node(overrides: Record<string, unknown> = {}) {
  return {
    number: 418,
    title: "Update Helm release odoo to v17.0.4",
    isDraft: false,
    baseRefName: "main",
    headRefOid: HEAD,
    mergeable: "MERGEABLE",
    isCrossRepository: false,
    author: { __typename: "Bot", login: "renovate" },
    changedFiles: 1,
    files: { nodes: [{ path: "apps/odoo/Pulumi.prod.yaml", changeType: "MODIFIED" }] },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
    ...overrides,
  };
}

function listed(nodes: unknown[], pageInfo?: { hasNextPage: boolean; endCursor: string }): Answer {
  return {
    json: {
      data: {
        repository: {
          defaultBranchRef: { name: "main" },
          pullRequests: { nodes, ...(pageInfo ? { pageInfo } : {}) },
        },
      },
    },
  };
}

describe("listing the open pull requests", () => {
  test("is one GraphQL query that gives each one in the port's words", async () => {
    const { port, sent } = portThatAnswers([listed([node()])]);
    expect(await port.listOpenPullRequests()).toEqual({
      defaultBranch: "main",
      pullRequests: [
        {
          number: 418,
          title: "Update Helm release odoo to v17.0.4",
          author: "renovate[bot]",
          draft: false,
          base: "main",
          head: HEAD,
          mergeable: "mergeable",
          checks: "success",
          files: ["apps/odoo/Pulumi.prod.yaml"],
          filesComplete: true,
          fromFork: false,
        },
      ],
    });
    expect(sent.map(({ method, path }) => `${method} ${path}`)).toEqual(["POST /graphql"]);
  });

  test("pages past the oldest 100 with GraphQL's cursor (slice 4.13)", async () => {
    const { port, sent } = portThatAnswers([
      listed([node({ number: 1 })], { hasNextPage: true, endCursor: "Y3Vyc29yOjEwMA==" }),
      listed([node({ number: 101 })], { hasNextPage: false, endCursor: "Y3Vyc29yOjEwMQ==" }),
    ]);
    const { pullRequests } = await port.listOpenPullRequests();
    expect(pullRequests.map(({ number }) => number)).toEqual([1, 101]);
    const variables = sent.map(
      ({ body }) => (body as { variables: Record<string, unknown> }).variables,
    );
    expect(variables).toEqual([
      { owner: "acme", repo: "infra", after: null },
      { owner: "acme", repo: "infra", after: "Y3Vyc29yOjEwMA==" },
    ]);
  });

  // Slice 5.9: past the oldest 1,000 too, one request per page of 100, to
  // the last page.
  test("reads every page, past the oldest 1,000 open pull requests", async () => {
    const answers = Array.from({ length: 12 }, (_, index) =>
      listed([node({ number: index + 1 })], {
        hasNextPage: index < 11,
        endCursor: `c${index}`,
      }),
    );
    const { port, sent } = portThatAnswers(answers);
    const { pullRequests } = await port.listOpenPullRequests();
    expect(pullRequests).toHaveLength(12);
    expect(sent).toHaveLength(12);
  });

  test("reads the checks, the merge state and a person as GitHub gives them", async () => {
    const { port } = portThatAnswers([
      listed([
        node({
          author: { __typename: "User", login: "alice" },
          mergeable: "CONFLICTING",
          commits: { nodes: [{ commit: { statusCheckRollup: { state: "ERROR" } } }] },
        }),
        node({
          mergeable: "UNKNOWN",
          commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
        }),
        node({ commits: { nodes: [{ commit: { statusCheckRollup: { state: "EXPECTED" } } }] } }),
        node({ author: null }),
      ]),
    ]);
    const { pullRequests } = await port.listOpenPullRequests();
    expect(
      pullRequests.map(({ author, mergeable, checks }) => [author, mergeable, checks]),
    ).toEqual([
      ["alice", "conflicting", "failure"],
      ["renovate[bot]", "unknown", "none"],
      ["renovate[bot]", "mergeable", "pending"],
      [undefined, "mergeable", "success"],
    ]);
  });

  // Slice 5.17: a pull request whose checks have not all finished waits on
  // them, and one whose checks have failed anywhere does not, whatever the
  // rollup puts first. The rollup's counts by state say it (record 0119).
  const rollup = (
    checkRuns: Record<string, number>,
    statuses: Record<string, number> = {},
    state = "PENDING",
  ) => ({
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              state,
              contexts: {
                checkRunCountsByState: Object.entries(checkRuns).map(([key, count]) => ({
                  state: key,
                  count,
                })),
                statusContextCountsByState: Object.entries(statuses).map(([key, count]) => ({
                  state: key,
                  count,
                })),
              },
            },
          },
        },
      ],
    },
  });

  test("reads a check run or a commit status that has not finished as pending", async () => {
    const { port } = portThatAnswers([
      listed([
        node(rollup({ IN_PROGRESS: 1, FAILURE: 0 })),
        node(rollup({ SUCCESS: 1 }, { PENDING: 1, ERROR: 0 })),
        node(rollup({ QUEUED: 1, WAITING: 1, PENDING: 1, NEUTRAL: 1, SKIPPED: 1 })),
      ]),
    ]);
    const { pullRequests } = await port.listOpenPullRequests();
    expect(pullRequests.map(({ checks }) => checks)).toEqual(["pending", "pending", "pending"]);
  });

  test("reads a failed check next to one that has not finished as a failure", async () => {
    const { port } = portThatAnswers([
      listed([
        node(rollup({ FAILURE: 1 }, { PENDING: 1 })),
        node(rollup({ IN_PROGRESS: 1 }, { ERROR: 1 })),
        node(rollup({ TIMED_OUT: 1, IN_PROGRESS: 1 })),
        node(rollup({ STARTUP_FAILURE: 1, QUEUED: 1 })),
        node(rollup({ CANCELLED: 1 }, { FAILURE: 1 })),
        // A check run that ended with no conclusion did not pass.
        node(rollup({ COMPLETED: 1, IN_PROGRESS: 1 })),
        node(rollup({}, {}, "FAILURE")),
      ]),
    ]);
    const { pullRequests } = await port.listOpenPullRequests();
    expect(pullRequests.map(({ checks }) => checks)).toEqual(Array(7).fill("failure"));
  });

  // Issue 292: on a private repo GitHub refuses a token without
  // `statuses: read` every commit status among the rollup's contexts, seen on
  // sluiceway/issue-292-probe. Its counts by state need no more than
  // `pull-requests: read`.
  test("asks for the checks of the head commit as counts, never as the checks themselves", async () => {
    const { port, sent } = portThatAnswers([listed([node()])]);
    await port.listOpenPullRequests();
    const { query } = (sent[0]?.body ?? { query: "" }) as { query: string };
    expect(query).toContain("checkRunCountsByState");
    expect(query).toContain("statusContextCountsByState");
    expect(query).not.toContain("StatusContext {");
    expect(query).not.toContain("... on");
    expect(query).not.toMatch(/contexts\([^)]*\)\s*\{\s*nodes/);
  });

  // Issue 292: the error names the permission the token lacks, from the part
  // GitHub refused, as GitHub answered on sluiceway/issue-292-probe.
  test("a token GitHub refuses the pull requests names pull-requests: read", async () => {
    const { port } = portThatAnswers([
      {
        json: {
          data: { repository: null },
          errors: [
            {
              type: "FORBIDDEN",
              path: ["repository", "pullRequests"],
              message: "Resource not accessible by integration",
            },
          ],
        },
      },
    ]);
    const error = await port.listOpenPullRequests().then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(TokenRefused);
    expect((error as TokenRefused).permission).toBe("pull-requests: read");
    expect((error as TokenRefused).message).toBe(
      'GitHub answered "Resource not accessible by integration" for the pull requests',
    );
  });

  test("a part GitHub refuses that names no permission says where, once", async () => {
    const at = (index: number) => ({
      type: "FORBIDDEN",
      path: ["repository", "pullRequests", "nodes", index, "commits"],
      message: "Resource not accessible by integration",
    });
    const { port } = portThatAnswers([
      { json: { data: { repository: null }, errors: [at(0), at(1), at(2)] } },
    ]);
    const error = await port.listOpenPullRequests().then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(TokenRefused);
    expect((error as TokenRefused).permission).toBeUndefined();
    expect((error as TokenRefused).message).toBe(
      'GitHub answered "Resource not accessible by integration" for 3 parts of the pull requests, the first at repository.pullRequests.nodes.0.commits',
    );
  });

  test("says when the branch lives in a fork (slice 5.4)", async () => {
    const { port } = portThatAnswers([listed([node({ isCrossRepository: true })])]);
    const { pullRequests } = await port.listOpenPullRequests();
    expect(pullRequests[0]?.fromFork).toBe(true);
  });

  test("a list of files that may miss a path is not complete", async () => {
    const { port } = portThatAnswers([
      listed([
        node({ changedFiles: 101 }),
        node({ files: { nodes: [{ path: "apps/odoo/new.ts", changeType: "RENAMED" }] } }),
        node({ files: null }),
      ]),
    ]);
    const { pullRequests } = await port.listOpenPullRequests();
    expect(pullRequests.map(({ filesComplete }) => filesComplete)).toEqual([false, false, false]);
  });
});

describe("the merge methods the repo allows", () => {
  test("are read from the repo, and absent where GitHub leaves them out", async () => {
    const { port } = portThatAnswers([
      { json: { allow_squash_merge: false, allow_rebase_merge: true, allow_merge_commit: true } },
      { json: {} },
    ]);
    expect(await port.allowedMergeMethods()).toEqual({ squash: false, rebase: true, merge: true });
    expect(await port.allowedMergeMethods()).toEqual({
      squash: undefined,
      rebase: undefined,
      merge: undefined,
    });
  });
});

describe("merging a pull request", () => {
  test("sends the ticked head commit and the method, and gives the merge commit", async () => {
    const { port, sent } = portThatAnswers([
      { json: { sha: "6dcb09b5b57875f334f61aebed695e2e4193db5e", merged: true, message: "ok" } },
    ]);
    expect(await port.mergePullRequest(418, { head: HEAD, method: "squash" })).toEqual({
      merged: true,
      sha: "6dcb09b5b57875f334f61aebed695e2e4193db5e",
    });
    expect(sent).toEqual([
      {
        method: "PUT",
        path: "/repos/acme/infra/pulls/418/merge",
        body: { sha: HEAD, merge_method: "squash" },
      },
    ]);
  });

  test("gives GitHub's refusal about the pull request as an answer", async () => {
    const { port } = portThatAnswers([
      { status: 405, json: { message: "At least 1 approving review is required." } },
      { status: 409, json: { message: "Head branch was modified." } },
    ]);
    expect(await port.mergePullRequest(418, { head: HEAD, method: "squash" })).toEqual({
      merged: false,
      status: 405,
      message: "At least 1 approving review is required.",
    });
    expect(await port.mergePullRequest(418, { head: HEAD, method: "squash" })).toMatchObject({
      merged: false,
      status: 409,
    });
  });

  test("fails for an answer about Sluiceway, such as a missing permission", async () => {
    const { port } = portThatAnswers([
      { status: 403, json: { message: "Resource not accessible by integration" } },
    ]);
    await expect(port.mergePullRequest(418, { head: HEAD, method: "squash" })).rejects.toThrow(
      "Resource not accessible by integration",
    );
  });
});

// Slice 5.4 (record 0071): a file of a GitHub repo, for a Renovate preset
// outside the checkout and for the branch of an update waiting to merge.
describe("reading a file of a repo", () => {
  test("asks for the raw file at the ref, in the repo named", async () => {
    const { port, sent } = portThatAnswers([{ json: '{ "automergeStrategy": "rebase" }' }]);
    const text = await port.readRepositoryFile({
      owner: "acme",
      repo: "renovate-config",
      path: "presets/merge.json",
      ref: "v1",
    });
    expect(text).toBe('{ "automergeStrategy": "rebase" }');
    expect(sent.map(({ method, path }) => [method, path])).toEqual([
      // Octokit encodes the slash of the path, which GitHub reads as one.
      ["GET", "/repos/acme/renovate-config/contents/presets%2Fmerge.json"],
    ]);
  });

  test("gives nothing for a file that is not there", async () => {
    const { port } = portThatAnswers([{ status: 404, json: { message: "Not Found" } }]);
    expect(
      await port.readRepositoryFile({
        owner: "acme",
        repo: "infra",
        path: "gone.json",
        ref: undefined,
      }),
    ).toBeUndefined();
  });

  test("fails for any other answer", async () => {
    const { port } = portThatAnswers([{ status: 403, json: { message: "Forbidden" } }]);
    await expect(
      port.readRepositoryFile({ owner: "acme", repo: "infra", path: "a.json", ref: undefined }),
    ).rejects.toThrow();
  });
});

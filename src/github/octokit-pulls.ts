import type { getOctokit } from "@actions/github";
import type { OpenPullRequest } from "../core/merge-and-deploy.ts";
import { type GitHubPort, type MergeAnswer, TokenRefused } from "./port.ts";

type Octokit = ReturnType<typeof getOctokit>;

// The merge and deploy calls of the port on real GitHub (record 0054). As in
// octokit-port.ts, each is one call and a translation.
export type PullCalls = Pick<
  GitHubPort,
  "listOpenPullRequests" | "allowedMergeMethods" | "mergePullRequest" | "readRepositoryFile"
>;

// A page of the open pull requests, oldest first, with what the qualification
// rule reads: the author, the base, the head commit, the files and the
// combined checks of the head commit. `pull-requests: read` is enough, on a
// private repo too: the checks are the rollup's state and its counts by state.
// A commit status among the rollup's contexts needs `statuses: read`, which no
// workflow of the docs gives, and GitHub refuses each one (record 0119).
const OPEN_PULL_REQUESTS = `query ($owner: String!, $repo: String!, $after: String) {
  repository(owner: $owner, name: $repo) {
    defaultBranchRef {
      name
    }
    pullRequests(states: OPEN, first: 100, after: $after, orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        number
        title
        isDraft
        baseRefName
        headRefOid
        mergeable
        isCrossRepository
        author {
          __typename
          login
        }
        changedFiles
        files(first: 100) {
          nodes {
            path
            changeType
          }
        }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                state
                contexts(first: 100) {
                  checkRunCountsByState {
                    state
                    count
                  }
                  statusContextCountsByState {
                    state
                    count
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

interface PullRequestNode {
  number: number;
  title: string;
  isDraft: boolean;
  baseRefName: string;
  headRefOid: string;
  mergeable: string;
  isCrossRepository: boolean;
  author: { __typename: string; login: string } | null;
  changedFiles: number;
  files: { nodes: ({ path: string; changeType: string } | null)[] | null } | null;
  commits: {
    nodes: ({ commit: { statusCheckRollup: Rollup | null } } | null)[] | null;
  };
}

interface Rollup {
  state: string;
  contexts?: {
    checkRunCountsByState?: StateCount[] | null;
    statusContextCountsByState?: StateCount[] | null;
  } | null;
}

interface StateCount {
  state: string;
  count: number;
}

interface OpenPullRequestsData {
  repository: {
    defaultBranchRef: { name: string } | null;
    pullRequests: {
      nodes: (PullRequestNode | null)[] | null;
      pageInfo?: { hasNextPage: boolean; endCursor: string | null } | null;
    };
  } | null;
}

function present<T>(nodes: readonly (T | null)[] | null | undefined): T[] {
  return (nodes ?? []).filter((node): node is T => node !== null);
}

const CHECKS: Record<string, OpenPullRequest["checks"]> = {
  SUCCESS: "success",
  PENDING: "pending",
  EXPECTED: "pending",
  FAILURE: "failure",
  ERROR: "failure",
};

// A check run in none of these states ended in a way that is not a pass, a
// COMPLETED one with no conclusion too.
const PASSED_OR_RUNNING = new Set([
  "SUCCESS",
  "NEUTRAL",
  "SKIPPED",
  "IN_PROGRESS",
  "PENDING",
  "QUEUED",
  "WAITING",
]);
const FAILED_STATUS = new Set(["FAILURE", "ERROR"]);

function anyFailed(contexts: Rollup["contexts"]): boolean {
  const some = (counts: StateCount[] | null | undefined, failed: (state: string) => boolean) =>
    (counts ?? []).some(({ state, count }) => count > 0 && failed(state));
  return (
    some(contexts?.checkRunCountsByState, (state) => !PASSED_OR_RUNNING.has(state)) ||
    some(contexts?.statusContextCountsByState, (state) => FAILED_STATUS.has(state))
  );
}

// The rollup is GitHub's combined result. A rollup that still waits is read
// as a failure when one of its checks has failed already, so a pull request
// whose checks failed never shows as waiting on them (record 0081).
function checksOf(rollup: Rollup | null | undefined): OpenPullRequest["checks"] {
  if (!rollup) return "none";
  const checks = CHECKS[rollup.state] ?? "failure";
  if (checks === "pending" && anyFailed(rollup.contexts)) return "failure";
  return checks;
}

function toPullRequest(node: PullRequestNode): OpenPullRequest {
  const files = present(node.files?.nodes);
  const rollup = present(node.commits.nodes)[0]?.commit.statusCheckRollup;
  const { author } = node;
  return {
    number: node.number,
    title: node.title,
    // GraphQL names an app without the "[bot]" the site writes (record 0026).
    author:
      author === null
        ? undefined
        : author.__typename === "Bot" && !author.login.endsWith("[bot]")
          ? `${author.login}[bot]`
          : author.login,
    draft: node.isDraft,
    base: node.baseRefName,
    head: node.headRefOid,
    mergeable:
      node.mergeable === "MERGEABLE"
        ? "mergeable"
        : node.mergeable === "CONFLICTING"
          ? "conflicting"
          : "unknown",
    checks: checksOf(rollup),
    files: files.map(({ path }) => path),
    // A renamed file comes with its new path only, and the claim rule needs
    // both (record 0010).
    filesComplete:
      files.length === node.changedFiles &&
      files.every(({ changeType }) => changeType !== "RENAMED"),
    fromFork: node.isCrossRepository,
  };
}

// The answers of the merge call that are about the pull request, not about
// Sluiceway: GitHub will not merge it (405), its head moved (409), or GitHub
// refused what was asked (422).
const REFUSALS = new Set([405, 409, 422]);

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

function messageOf(error: unknown): string {
  const response = (error as { response?: { data?: { message?: unknown } } } | null)?.response;
  const message = response?.data?.message;
  if (typeof message === "string") return message;
  return error instanceof Error ? error.message : String(error);
}

interface GraphqlError {
  type?: unknown;
  path?: unknown;
  message?: unknown;
}

// A GraphQL answer whose errors are all refusals of the token, as one
// TokenRefused (issue 292). GitHub names each refused part by its path, one
// per pull request or check, so they are counted and the first is named.
// Any other error is thrown as it came.
function refusedOrAsIs(error: unknown): unknown {
  const errors = (error as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return error;
  const refused = errors as GraphqlError[];
  if (!refused.every((one) => one.type === "FORBIDDEN")) return error;
  const paths = refused.map(({ path }) => (Array.isArray(path) ? path.map(String) : []));
  const words = typeof refused[0]?.message === "string" ? refused[0].message : "refused";
  const first = paths[0] ?? [];
  // Without `pull-requests: read` GitHub refuses the list itself.
  if (paths.every((path) => path.join(".") === "repository.pullRequests")) {
    return new TokenRefused(
      `GitHub answered "${words}" for the pull requests`,
      "pull-requests: read",
    );
  }
  const parts = paths.length === 1 ? "a part" : `${paths.length} parts`;
  return new TokenRefused(
    `GitHub answered "${words}" for ${parts} of the pull requests, the first at ${first.join(".")}`,
  );
}

export function pullCalls(octokit: Octokit, repo: { owner: string; repo: string }): PullCalls {
  return {
    async listOpenPullRequests() {
      // Page by page, oldest first (record 0064), to the last page (slice
      // 5.9): one request of the hourly budget per 100 open pull requests
      // (record 0017), and only a repo with `mergeAndDeploy.authors` pays it.
      let defaultBranch: string | undefined;
      const pullRequests: OpenPullRequest[] = [];
      let after: string | null = null;
      for (;;) {
        const data: OpenPullRequestsData = await octokit
          .graphql<OpenPullRequestsData>(OPEN_PULL_REQUESTS, { ...repo, after })
          .catch((error: unknown) => {
            throw refusedOrAsIs(error);
          });
        defaultBranch ??= data.repository?.defaultBranchRef?.name;
        const list = data.repository?.pullRequests;
        pullRequests.push(...present(list?.nodes).map(toPullRequest));
        const next = list?.pageInfo;
        if (!next?.hasNextPage || !next.endCursor) break;
        after = next.endCursor;
      }
      if (defaultBranch === undefined) throw new Error("GitHub named no default branch.");
      return { defaultBranch, pullRequests };
    },

    async allowedMergeMethods() {
      // GitHub gives these to a token with `contents: write` only.
      const { data } = await octokit.rest.repos.get(repo);
      return {
        squash: data.allow_squash_merge,
        rebase: data.allow_rebase_merge,
        merge: data.allow_merge_commit,
      };
    },

    async mergePullRequest(number, { head, method }): Promise<MergeAnswer> {
      try {
        const { data } = await octokit.rest.pulls.merge({
          ...repo,
          pull_number: number,
          sha: head,
          merge_method: method,
        });
        return { merged: true, sha: data.sha };
      } catch (error) {
        const status = statusOf(error);
        if (status === undefined || !REFUSALS.has(status)) throw error;
        return { merged: false, status, message: messageOf(error) };
      }
    },

    async readRepositoryFile({ owner, repo: name, path, ref }) {
      // The raw file, so one past the 1 MB that the JSON answer holds reads
      // too.
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo: name,
          path,
          ...(ref === undefined ? {} : { ref }),
          mediaType: { format: "raw" },
        });
        return typeof data === "string" ? data : undefined;
      } catch (error) {
        if (statusOf(error) === 404) return undefined;
        throw error;
      }
    },
  };
}

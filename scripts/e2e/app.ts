// The Sluiceway app for the end to end run of the command line's tick
// (record 0116): the fake app of the command line's tests, which holds every
// answer to the app's OpenAPI document, served over HTTP on this machine. A
// tick does on the fake GitHub what the app does on GitHub: it dispatches the
// workflow, and opens a deployment record in the app's own name that names
// that run, with the row's hash and fingerprint. A deployment record and a
// stack's last deploy are read from the fake GitHub as they stand.

import {
  deploy,
  type FakeApp,
  fakeApp,
  stackLine,
  stackRow,
  TOKEN,
} from "../../test/cli/fake-app.ts";

export { TOKEN };

// The login GitHub names as the creator of the app's records.
export const APP_LOGIN = "sluiceway[bot]";

export interface AppRecord {
  stack: string;
  // The state of the record's latest status, or undefined for none.
  state: string | undefined;
}

export interface AppGitHub {
  // Dispatches the workflow and opens the record of the stack, as the app
  // does for a tick it allows. Gives back the record.
  tick(stack: string, ticker: string): Promise<number>;
  record(id: number): AppRecord | undefined;
}

export interface E2eApp {
  url: string;
  app: FakeApp;
  close(): Promise<void>;
}

// The trail's words for a record's latest status (the app's Deploy).
function result(state: string | undefined): { result: string; state: string } {
  switch (state) {
    case "in_progress":
      return { result: "deploying now", state: "deploying" };
    case "success":
      return { result: "went out", state: "in-sync" };
    case "error":
    case "failure":
      return { result: "failed", state: "failed" };
    default:
      return { result: "waiting to start", state: "deploying" };
  }
}

// A row's last deploy is a deploy without the stack and repo it is of.
function rowDeploy(deployed: ReturnType<typeof deploy> | null) {
  if (deployed === null) return null;
  const { stack: _stack, repo: _repo, ...rest } = deployed;
  return rest;
}

export function startApp(github: AppGitHub, stacks: string[]): E2eApp {
  let app: FakeApp | undefined;
  const ticked = new Map<string, number>();

  const lastDeploy = (stack: string, login: string) => {
    const id = ticked.get(stack);
    const record = id === undefined ? undefined : github.record(id);
    if (id === undefined || record === undefined) return null;
    return deploy(id, stack, result(record.state).result, {
      ...result(record.state),
      who: `ticked by ${login} via the command line`,
    });
  };

  // The state the fake app answers from, as the fake GitHub stands now.
  const refresh = (fake: FakeApp, login: string) => {
    for (const stack of stacks) {
      fake.state.stacks[stack] = {
        ...fake.state.stacks[stack],
        line: stackLine(stack, "pending", "pending"),
        row: stackRow(stack, { lastDeploy: rowDeploy(lastDeploy(stack, login)) }),
      };
    }
    for (const [stack, id] of ticked) {
      const deployed = lastDeploy(stack, login);
      if (deployed !== null) fake.state.deployments[id] = [deployed];
    }
  };

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (app === undefined) throw new Error("The app is not started yet.");
      const url = new URL(request.url);
      const body = await request.text();
      const person = app.state.tokens.get(
        request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "",
      );
      if (person !== undefined) {
        refresh(app, person.login);
        // /api/v1/orgs/{org}/repos/{repo}/stacks/{stack}/tick
        const parts = url.pathname.split("/").slice(1).map(decodeURIComponent);
        const stack = parts[7];
        if (
          request.method === "POST" &&
          parts.length === 9 &&
          parts[6] === "stacks" &&
          parts[8] === "tick" &&
          stack !== undefined &&
          stacks.includes(stack)
        ) {
          const id = await github.tick(stack, person.login);
          ticked.set(stack, id);
          const found = app.state.stacks[stack];
          if (found !== undefined) {
            found.tick = {
              outcome: "asked",
              sentence: `The tick of ${stack} is asked: the deployment record is open.`,
              deployment: id,
            };
          }
          refresh(app, person.login);
        }
      }
      return app.fetch(url.href, {
        method: request.method,
        headers: request.headers,
        ...(body === "" ? {} : { body }),
      });
    },
  });
  const url = `http://127.0.0.1:${server.port}`;
  app = fakeApp(url);
  return { url, app, close: () => server.stop(true) };
}

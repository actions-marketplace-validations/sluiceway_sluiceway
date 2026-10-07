import { describe, expect, test } from "bun:test";
import { ConfigError } from "../src/core/config.ts";
import { guarded, MODES, NotImplementedError, parseMode, post, run } from "../src/mode.ts";

// Where a runner puts the action, handed in by the entry point.
const ACTION = "/home/runner/work/_actions/sluiceway/sluiceway/v0";

describe("parseMode", () => {
  test.each([...MODES])("accepts %s", (mode) => {
    expect(parseMode(mode)).toBe(mode);
  });

  // Record 0042.
  test("check is the fifth mode", () => {
    expect(parseMode("check")).toBe("check");
  });

  test("ignores surrounding whitespace", () => {
    expect(parseMode(" scan\n")).toBe("scan");
  });

  // Slice 5.12 (record 0077): the step picks its own mode from the event.
  test("an empty input is auto", () => {
    expect(parseMode("")).toBe("auto");
    expect(parseMode(" \n")).toBe("auto");
  });

  test("names the valid modes when the input is unknown", () => {
    expect(() => parseMode("deploy")).toThrow(
      'Unknown mode "deploy". Use one of: auto, scan, resolve, apply, settle, check, init.',
    );
  });

  test("does not accept a different case", () => {
    expect(() => parseMode("Scan")).toThrow('Unknown mode "Scan"');
  });
});

describe("run", () => {
  // Every mode is wired: the scan (slice 1.11), resolve (slice 2.4), apply
  // (slice 2.5), settle (slice 2.6), the check (slice 2.12) and init (slice
  // 4.14) have their own tests under test/modes/.
  const wired: string[] = ["auto", "scan", "resolve", "apply", "settle", "check", "init"];
  test("no mode is a stub any more", () => {
    expect([...MODES].filter((mode) => !wired.includes(mode))).toEqual([]);
  });

  test("settle is wired: outside a job it stops at the runner's environment", async () => {
    const result = run("settle", ACTION);
    await expect(result).rejects.not.toBeInstanceOf(NotImplementedError);
  });

  test("apply is wired: outside a job it stops at its deployment-id input", async () => {
    await expect(run("apply", ACTION, () => "")).rejects.toThrow(
      'The "deployment-id" input is required in apply mode.',
    );
  });
});

describe("the deployment-id input (record 0035)", () => {
  // Auto mode deploys what resolve and the scan hand on in the same step.
  test("fails auto mode too", async () => {
    await expect(run("auto", ACTION, () => "12")).rejects.toThrow(
      'The "deployment-id" input is only for apply mode, and this step runs auto mode.',
    );
  });

  test("fails any mode but apply before the mode does anything", async () => {
    await expect(run("settle", ACTION, () => "12")).rejects.toThrow(
      'The "deployment-id" input is only for apply mode, and this step runs settle mode.',
    );
  });
});

// Slice 5.13 (record 0078): only scan, resolve and apply send.
describe("a notification input on a step that sends nothing", () => {
  test("is a warning that names it, and never an error about it", async () => {
    const warnings: string[] = [];
    const inputs = (name: string) =>
      name === "slack-webhook-url" ? "https://hooks.slack.com/services/SECRET" : "";
    const result = run("settle", ACTION, inputs, (message) => void warnings.push(message));
    // Outside a job, settle stops at the runner's environment.
    await expect(result).rejects.not.toThrow("slack");
    expect(warnings).toEqual([
      '"slack-webhook-url" is set on a step in settle mode, which sends no notification. Only scan, resolve and apply do. Take it out of this step.',
    ]);
  });

  // Record 0077: auto mode runs scan, resolve and apply, which do send.
  // The event is pinned, because on a runner the job's own event decides what
  // auto does, and a test may not read the environment it happens to run in.
  test("is no warning in auto mode", async () => {
    const warnings: string[] = [];
    const inputs = (name: string) =>
      name === "slack-webhook-url" ? "https://hooks.slack.com/services/SECRET" : "";
    const event = process.env.GITHUB_EVENT_NAME;
    process.env.GITHUB_EVENT_NAME = "deployment";
    try {
      // Whether the step then gets as far as the job's own environment is
      // not what this test is about: the warning is decided before that.
      await run("auto", ACTION, inputs, (message) => void warnings.push(message)).catch(
        () => undefined,
      );
    } finally {
      if (event === undefined) delete process.env.GITHUB_EVENT_NAME;
      else process.env.GITHUB_EVENT_NAME = event;
    }
    expect(warnings).toEqual([]);
  });
});

// Record 0077: one job has no settle job after it with if: always(). When the
// run is cancelled in the middle of a deploy, the post step of action.yml
// settles instead, and only then.
describe("the post step", () => {
  const states = (values: Record<string, string>) => (name: string) => values[name] ?? "";
  const settled: string[] = [];
  const settle = async () => void settled.push("settled");

  test("settles an auto step that handed a deploy on and never got to settle", async () => {
    settled.length = 0;
    await post("auto", states({ "sluiceway-handed-on": "true" }), settle);
    expect(settled).toEqual(["settled"]);
  });

  test("does nothing after an auto step that settled, or handed nothing on", async () => {
    settled.length = 0;
    await post(
      "auto",
      states({ "sluiceway-handed-on": "true", "sluiceway-settled": "true" }),
      settle,
    );
    await post("auto", states({}), settle);
    expect(settled).toEqual([]);
  });

  test("does nothing after a step with a mode of its own", async () => {
    settled.length = 0;
    await post("apply", states({ "sluiceway-handed-on": "true" }), settle);
    expect(settled).toEqual([]);
  });
});

// Slice 5.35 (record 0100): only the modes that run the tool read the env
// file. Anywhere else the input is a warning, and the file is never opened.
describe("the env-file input on a step that never runs the tool", () => {
  test("is a warning that names it, and the file is not opened", async () => {
    const warnings: { message: string; title: string }[] = [];
    const inputs = (name: string) => (name === "env-file" ? "/nowhere/deploy.env" : "");
    const result = run(
      "settle",
      ACTION,
      inputs,
      (message, title) => void warnings.push({ message, title }),
    );
    // Outside a job, settle stops at the runner's environment, not at a
    // file that is not there.
    await expect(result).rejects.not.toThrow("env-file");
    expect(warnings).toEqual([
      {
        title: "Env file input not used",
        message:
          '"env-file" is set on a step in settle mode, which never runs the tool, so the file is not read. Only scan, apply and the check with backend: true or pull-request-preview: true do. Take it out of this step.',
      },
    ]);
  });
});

// Record 0120: a run that failed before Sluiceway ran, or on a problem in its
// config, says so on the dashboard.
describe("a run that failed", () => {
  const said: unknown[] = [];
  const failure = (event = "push") => ({
    event,
    say: async (why: unknown) => void said.push(why),
  });

  test("job-status failure: the step does not do its work, and puts the line on the dashboard", async () => {
    said.length = 0;
    const worked: string[] = [];
    await guarded("scan", "failure", async () => void worked.push("scan"), failure());
    expect(worked).toEqual([]);
    expect(said).toEqual([{ why: "step" }]);
  });

  test("job-status success, or none: the step does its work", async () => {
    said.length = 0;
    const worked: string[] = [];
    await guarded("scan", "success", async () => void worked.push("scan"), failure());
    await guarded("scan", "", async () => void worked.push("scan"), failure());
    expect(worked).toEqual(["scan", "scan"]);
    expect(said).toEqual([]);
  });

  test("job-status failure on a pull request: nothing is done and nothing is written", async () => {
    said.length = 0;
    const worked: string[] = [];
    await guarded(
      "auto",
      "failure",
      async () => void worked.push("check"),
      failure("pull_request"),
    );
    await guarded("check", "failure", async () => void worked.push("check"), failure());
    expect(worked).toEqual([]);
    expect(said).toEqual([]);
  });

  test("a job-status that is not one of GitHub's is refused, before anything is done", async () => {
    await expect(guarded("scan", "failed", async () => {}, failure())).rejects.toThrow(
      'The "job-status" input is "failed". Give it ${{ job.status }}, which is success, failure or cancelled.',
    );
  });

  test("a problem in the config: the line names the file, and the job still fails with the problem", async () => {
    said.length = 0;
    const problem = new ConfigError(["something is wrong"], "sluiceway.yml");
    await expect(
      guarded(
        "auto",
        "",
        async () => {
          throw problem;
        },
        failure("schedule"),
      ),
    ).rejects.toBe(problem);
    expect(said).toEqual([{ why: "config", file: "sluiceway.yml" }]);
  });

  test("a problem in the config that auto mode hands on as the cause names the file too", async () => {
    said.length = 0;
    const problem = new ConfigError(["something is wrong"]);
    const wrapped = new Error(`scan: ${problem.message}`, { cause: problem });
    await expect(
      guarded("auto", "", async () => Promise.reject(wrapped), failure("push")),
    ).rejects.toBe(wrapped);
    expect(said).toEqual([{ why: "config", file: "sluiceway.yaml" }]);
  });

  test("any other error writes nothing, and a problem in the config of a pull request neither", async () => {
    said.length = 0;
    await expect(
      guarded("scan", "", async () => Promise.reject(new Error("boom")), failure()),
    ).rejects.toThrow("boom");
    await expect(
      guarded(
        "auto",
        "",
        async () => Promise.reject(new ConfigError(["wrong"])),
        failure("pull_request"),
      ),
    ).rejects.toThrow();
    expect(said).toEqual([]);
  });
});

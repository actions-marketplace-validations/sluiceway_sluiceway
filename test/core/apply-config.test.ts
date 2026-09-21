import { describe, expect, test } from "bun:test";
import { applyConfig, ConfigError, parseConfig } from "../../src/core/config.ts";
import type { Stack } from "../../src/core/stack.ts";

const stack = (path: string, name?: string): Stack =>
  name === undefined ? { path, options: {} } : { path, name, options: {} };

const FOUND = [stack("apps/grafana", "dev"), stack("apps/grafana", "prod"), stack("envs/prod")];

function problems(text: string, stacks: Stack[]): string[] {
  try {
    applyConfig(parseConfig(text), stacks);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error("expected the config to be refused");
}

describe("zero config", () => {
  test("every stack gets the defaults, in the order discovery gave", () => {
    expect(applyConfig(parseConfig(undefined), FOUND)).toEqual(
      FOUND.map((found) => ({
        stack: found,
        environment: "sluiceway",
        tickers: "write",
        inputs: [],
      })),
    );
  });

  test("no stacks and no config is fine", () => {
    expect(applyConfig(parseConfig(undefined), [])).toEqual([]);
  });
});

describe("the top level tick rule", () => {
  test("is the default for every stack", () => {
    const configured = applyConfig(parseConfig("tickers: [Alice]\n"), FOUND);
    expect(configured.map((one) => one.tickers)).toEqual([["alice"], ["alice"], ["alice"]]);
  });
});

describe("a stacks entry", () => {
  test("with a name sets only that stack", () => {
    const configured = applyConfig(
      parseConfig(`
tickers: maintain
stacks:
  - path: apps/grafana
    name: prod
    environment: production
    tickers: admin
    inputs: ["shared/**"]
    previewTimeout: 25
`),
      FOUND,
    );
    expect(configured).toEqual([
      { stack: FOUND[0] as Stack, environment: "sluiceway", tickers: "maintain", inputs: [] },
      {
        stack: FOUND[1] as Stack,
        environment: "production",
        tickers: "admin",
        inputs: ["shared/**"],
        previewTimeout: 25,
      },
      { stack: FOUND[2] as Stack, environment: "sluiceway", tickers: "maintain", inputs: [] },
    ]);
  });

  test("without a name covers every stack in the path", () => {
    const configured = applyConfig(
      parseConfig("stacks:\n  - path: apps/grafana\n    environment: grafana\n"),
      FOUND,
    );
    expect(configured.map((one) => one.environment)).toEqual(["grafana", "grafana", "sluiceway"]);
  });

  test("without a name matches a stack that has no name", () => {
    const configured = applyConfig(
      parseConfig("stacks:\n  - path: envs/prod\n    previewTimeout: 3\n"),
      FOUND,
    );
    expect(configured.map((one) => one.previewTimeout)).toEqual([undefined, undefined, 3]);
  });

  test("with a name wins over the entry for the whole path, key by key, in any order", () => {
    const configured = applyConfig(
      parseConfig(`
stacks:
  - path: apps/grafana
    name: prod
    tickers: admin
    inputs: ["prod-only/**", "shared/**"]
  - path: apps/grafana
    environment: grafana
    tickers: maintain
    inputs: ["shared/**"]
`),
      FOUND,
    );
    expect(configured.slice(0, 2)).toEqual([
      {
        stack: FOUND[0] as Stack,
        environment: "grafana",
        tickers: "maintain",
        inputs: ["shared/**"],
      },
      {
        stack: FOUND[1] as Stack,
        environment: "grafana",
        tickers: "admin",
        inputs: ["shared/**", "prod-only/**"],
      },
    ]);
  });

  test("never creates a stack: one that matches nothing is a config error", () => {
    expect(
      problems(
        "stacks:\n  - path: apps/loki\n  - path: apps/grafana\n    name: staging\n  - path: envs/prod\n    name: prod\n",
        FOUND,
      ),
    ).toEqual([
      'stacks[0]: no stack was found in "apps/loki". An entry adds settings to a stack that exists, it never creates one.',
      'stacks[1]: no stack named "staging" was found in "apps/grafana". Found there: dev, prod.',
      'stacks[2]: no stack named "prod" was found in "envs/prod". The stack found there has no name.',
    ]);
  });

  test("does not match a directory inside its path", () => {
    expect(problems("stacks:\n  - path: apps\n", FOUND)).toEqual([
      'stacks[0]: no stack was found in "apps". An entry adds settings to a stack that exists, it never creates one.',
    ]);
  });
});

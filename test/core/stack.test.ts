import { describe, expect, test } from "bun:test";
import { stackId } from "../../src/core/stack.ts";

describe("stack id", () => {
  test("is the path when the stack has no name", () => {
    expect(stackId({ path: "envs/prod" })).toBe("envs/prod");
  });

  test("is path:name when the stack has a name", () => {
    expect(stackId({ path: "apps/grafana", name: "prod" })).toBe("apps/grafana:prod");
  });

  test("leaves a colon in a path or a name alone", () => {
    expect(stackId({ path: "apps/a:b", name: "c:d" })).toBe("apps/a:b:c:d");
  });
});

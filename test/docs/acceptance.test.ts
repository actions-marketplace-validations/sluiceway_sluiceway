import { describe, expect, test } from "bun:test";
import { read } from "./docs.ts";

// Issue 294: the acceptance checklist names a resource for the escape check
// of record 0112. The owner walks it on GitHub, so it has to be the name the
// renderer's tests prove plain, and an @name that notifies nobody.

const checklist = read("docs/acceptance.md");
const name = checklist.match(/A resource named `([^`]+)`/)?.[1];

describe("the acceptance checklist", () => {
  test("names the resource the escape tests use", () => {
    expect(name).toBeDefined();
    expect(read("test/render/escape.test.ts")).toContain(`escapeText("${name}")`);
    expect(read("test/render/row.test.ts")).toContain(`const NAME = "${name}";`);
  });
});

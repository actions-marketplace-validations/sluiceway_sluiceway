import { describe, expect, test } from "bun:test";
import { actionRef, readActionRef } from "../../src/github/action-ref.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const HEAD = "fedcba9876543210fedcba9876543210fedcba98";

// The rule of the build plan, section 3: the header images are served from
// the exact release tag of the running action, or its commit SHA, never from
// a moving tag (record 0033).
describe("the action ref", () => {
  test("1. a full commit SHA is used as it is", () => {
    expect(actionRef({ actionRef: SHA, packageVersion: "0.1.0", sha: HEAD })).toBe(SHA);
  });

  test("1. an exact version tag is used as it is", () => {
    expect(actionRef({ actionRef: "v1.2.3", packageVersion: "9.9.9", sha: HEAD })).toBe("v1.2.3");
    expect(actionRef({ actionRef: "v0.10.0", packageVersion: "9.9.9", sha: HEAD })).toBe("v0.10.0");
  });

  test.each(["v0", "v1", "v1.2", "main", "1.2.3", "v1.2.3-rc.1", "v1.2.3.4", SHA.slice(0, 7)])(
    "2. %s is not exact, so the version next to the action names the tag",
    (moving) => {
      expect(actionRef({ actionRef: moving, packageVersion: "0.1.0", sha: HEAD })).toBe("v0.1.0");
    },
  );

  test("3. `uses: ./` has no action ref, so it is the commit of the run", () => {
    expect(actionRef({ actionRef: undefined, packageVersion: "0.1.0", sha: HEAD })).toBe(HEAD);
    expect(actionRef({ actionRef: "", packageVersion: undefined, sha: HEAD })).toBe(HEAD);
  });

  test("a moving ref with no version next to the action is an error, never a moving url", () => {
    expect(() => actionRef({ actionRef: "v0", packageVersion: undefined, sha: HEAD })).toThrow(
      "The action was started from the ref v0, which can move, and its package.json holds no version. The header images need an exact release tag or a commit SHA.",
    );
  });

  test("an upper case SHA is not a SHA GitHub hands out, so it is not exact", () => {
    expect(actionRef({ actionRef: SHA.toUpperCase(), packageVersion: "0.1.0", sha: HEAD })).toBe(
      "v0.1.0",
    );
  });
});

// The glue around the rule. The environment comes in as data, and the file
// is read through a function the caller hands over.
describe("reading the action ref", () => {
  const files = (version: unknown) => (path: string) => {
    if (path !== "/runner/_actions/sluiceway/sluiceway/v0/package.json")
      throw new Error(`ENOENT ${path}`);
    return JSON.stringify({ name: "sluiceway", version });
  };
  const env = {
    GITHUB_ACTION_PATH: "/runner/_actions/sluiceway/sluiceway/v0",
    GITHUB_SHA: HEAD,
  };

  test("a moving tag reads the version from the package.json next to the action", () => {
    expect(readActionRef({ ...env, GITHUB_ACTION_REF: "v0" }, files("0.3.1"))).toBe("v0.3.1");
  });

  // The version is read at run time and only when the rule needs it.
  test("an exact ref reads no file", () => {
    const never = () => {
      throw new Error("read a file");
    };
    expect(readActionRef({ ...env, GITHUB_ACTION_REF: "v1.2.3" }, never)).toBe("v1.2.3");
    expect(readActionRef({ ...env, GITHUB_ACTION_REF: SHA }, never)).toBe(SHA);
    expect(readActionRef(env, never)).toBe(HEAD);
  });

  test("a package.json that is missing, broken or without a version is the rule's error", () => {
    const moving = { ...env, GITHUB_ACTION_REF: "main" };
    expect(() => readActionRef(moving, files(undefined))).toThrow("holds no version");
    expect(() => readActionRef(moving, files(7))).toThrow("holds no version");
    expect(() => readActionRef(moving, () => "{ not json")).toThrow("holds no version");
    expect(() =>
      readActionRef({ GITHUB_ACTION_REF: "main", GITHUB_SHA: HEAD }, files("1.0.0")),
    ).toThrow("holds no version");
  });

  test("a run with no commit at all is an error", () => {
    expect(() => readActionRef({}, files("1.0.0"))).toThrow("GITHUB_SHA is not set");
  });
});

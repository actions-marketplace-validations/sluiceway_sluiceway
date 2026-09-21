import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError, parseConfig } from "../../src/core/config.ts";
import { loadConfig } from "../../src/core/config-file.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sluiceway-config-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("loading sluiceway.yaml from the repo root", () => {
  test("a repo without the file gets every default", () => {
    expect(loadConfig(root)).toEqual(parseConfig(undefined));
  });

  test("the file at the root is read", () => {
    writeFileSync(join(root, "sluiceway.yaml"), "tickers: admin\n");
    expect(loadConfig(root).tickers).toBe("admin");
  });

  test("a bad file fails with the problems of the file", () => {
    writeFileSync(join(root, "sluiceway.yaml"), "tickerz: admin\n");
    expect(() => loadConfig(root)).toThrow(ConfigError);
  });

  test("sluiceway.yml is refused, because ignoring it would drop its tick rule", () => {
    writeFileSync(join(root, "sluiceway.yml"), "tickers: admin\n");
    expect(() => loadConfig(root)).toThrow(
      "sluiceway.yaml is not valid:\n- found sluiceway.yml. The file must be named sluiceway.yaml. Rename it.",
    );
  });

  test("a directory named sluiceway.yaml is refused, not read as no config", () => {
    mkdirSync(join(root, "sluiceway.yaml"));
    expect(() => loadConfig(root)).toThrow("sluiceway.yaml is not valid:\n- it is not a file.");
  });

  test("a file deeper in the repo is not the config", () => {
    mkdirSync(join(root, "apps"));
    writeFileSync(join(root, "apps", "sluiceway.yaml"), "tickerz: admin\n");
    expect(loadConfig(root)).toEqual(parseConfig(undefined));
  });
});

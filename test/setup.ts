import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests make temp dirs with tmpdir() and leave them, thousands a run. tmpdir()
// reads TMPDIR on each call, so they all go under this one dir, and the run
// removes it once every test is done.
const root = mkdtempSync(join(tmpdir(), "sluiceway-test-"));
process.env.TMPDIR = root;
afterAll(() => rmSync(root, { recursive: true, force: true }));

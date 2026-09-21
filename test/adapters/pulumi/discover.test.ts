import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { discover } from "../../../src/adapters/pulumi/discover.ts";
import { parseConfig } from "../../../src/core/config.ts";
import { DiscoveryError } from "../../../src/core/discovery.ts";
import { type Stack, stackId } from "../../../src/core/stack.ts";

// Discovery reads files and nothing else, so every test builds a small repo in
// a temp directory and looks at the stacks that come back.

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// Keys are file paths relative to the repo root, values are file contents.
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "sluiceway-discover-"));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

const PROJECT = "name: example\nruntime: yaml\n";

async function problems(discovery: Promise<Stack[]>): Promise<string[]> {
  const error = await discovery.catch((thrown: unknown) => thrown);
  if (!(error instanceof DiscoveryError)) throw new Error("expected discovery to fail");
  return error.problems;
}

function ids(stacks: Stack[]): string[] {
  return stacks.map(stackId);
}

describe("discover", () => {
  test("finds the stack of a project from its stack file", async () => {
    const root = repo({
      "apps/grafana/Pulumi.yaml": PROJECT,
      "apps/grafana/Pulumi.prod.yaml": "",
    });
    expect(await discover(root)).toEqual([{ path: "apps/grafana", name: "prod", options: {} }]);
  });

  test("finds a project spelled Pulumi.yml through stack files spelled .yml", async () => {
    const root = repo({ "app/Pulumi.yml": PROJECT, "app/Pulumi.prod.yml": "" });
    expect(ids(await discover(root))).toEqual(["app:prod"]);
  });

  test("finds a project spelled Pulumi.json through stack files spelled .json", async () => {
    const root = repo({
      "app/Pulumi.json": '{ "name": "example", "runtime": "nodejs" }',
      "app/Pulumi.prod.json": "{}",
    });
    expect(ids(await discover(root))).toEqual(["app:prod"]);
  });

  test("passes over a stack file whose extension is not the project file's", async () => {
    const root = repo({
      "a/Pulumi.yaml": PROJECT,
      "a/Pulumi.prod.yaml": "",
      "a/Pulumi.dev.yml": "",
      "a/Pulumi.test.json": "{}",
      "b/Pulumi.yml": PROJECT,
      "b/Pulumi.prod.yml": "",
      "b/Pulumi.dev.yaml": "",
    });
    expect(ids(await discover(root))).toEqual(["a:prod", "b:prod"]);
  });

  test("takes the project file the tool would take when a directory holds two", async () => {
    // The tool tries .json, then .yaml, then .yml.
    const root = repo({
      "a/Pulumi.yaml": PROJECT,
      "a/Pulumi.yml": PROJECT,
      "a/Pulumi.one.yaml": "",
      "a/Pulumi.two.yml": "",
      "b/Pulumi.json": "{}",
      "b/Pulumi.yaml": PROJECT,
      "b/Pulumi.one.json": "{}",
      "b/Pulumi.two.yaml": "",
    });
    expect(ids(await discover(root))).toEqual(["a:one", "b:one"]);
  });

  test("finds every stack of a directory, and keeps a dot inside a name", async () => {
    const root = repo({
      "network/Pulumi.yaml": PROJECT,
      "network/Pulumi.prod.yaml": "",
      "network/Pulumi.dev.yaml": "",
      "network/Pulumi.eu.west.yaml": "",
    });
    expect(ids(await discover(root))).toEqual(["network:dev", "network:eu.west", "network:prod"]);
  });

  test("a project with no stack file has no stack", async () => {
    const root = repo({ "a/Pulumi.yaml": PROJECT, "a/index.ts": "" });
    expect(await discover(root)).toEqual([]);
  });

  test("stack files without a project file are not stacks", async () => {
    const root = repo({ "a/Pulumi.prod.yaml": "" });
    expect(await discover(root)).toEqual([]);
  });

  test("a repo with no project at all has no stacks", async () => {
    expect(await discover(repo({ "README.md": "" }))).toEqual([]);
  });

  test("finds projects at any depth, and a project inside another project", async () => {
    const root = repo({
      "platform/Pulumi.yaml": PROJECT,
      "platform/Pulumi.prod.yaml": "",
      "platform/addons/dns/Pulumi.yaml": PROJECT,
      "platform/addons/dns/Pulumi.prod.yaml": "",
      "teams/a/b/c/d/Pulumi.yml": PROJECT,
      "teams/a/b/c/d/Pulumi.dev.yml": "",
    });
    expect(ids(await discover(root))).toEqual([
      "platform:prod",
      "platform/addons/dns:prod",
      "teams/a/b/c/d:dev",
    ]);
  });

  test('the path of a project at the repo root is ".", the form config gives it', async () => {
    const root = repo({ "Pulumi.yaml": PROJECT, "Pulumi.prod.yaml": "" });
    expect(await discover(root)).toEqual([{ path: ".", name: "prod", options: {} }]);
    expect(parseConfig("stacks:\n  - path: ./\n").stacks[0]?.path).toBe(".");
  });

  test("does not look inside node_modules or .git", async () => {
    const root = repo({
      "site/Pulumi.yaml": PROJECT,
      "site/Pulumi.prod.yaml": "",
      "site/node_modules/some-package/template/Pulumi.yaml": PROJECT,
      "site/node_modules/some-package/template/Pulumi.dev.yaml": "",
      ".git/modules/old/Pulumi.yaml": PROJECT,
      ".git/modules/old/Pulumi.dev.yaml": "",
      ".infra/Pulumi.yaml": PROJECT,
      ".infra/Pulumi.prod.yaml": "",
    });
    expect(ids(await discover(root))).toEqual([".infra:prod", "site:prod"]);
  });

  test("does not follow a symlink to a directory", async () => {
    const root = repo({ "real/Pulumi.yaml": PROJECT, "real/Pulumi.prod.yaml": "" });
    symlinkSync(join(root, "real"), join(root, "link"));
    symlinkSync(root, join(root, "real", "loop"));
    expect(ids(await discover(root))).toEqual(["real:prod"]);
  });
});

describe("the example project", () => {
  test("has five stacks, and the stray Pulumi.dev.yaml in app/ is not one", async () => {
    const stacks = await discover(join(import.meta.dir, "../../../examples/pulumi-basic"));
    expect(ids(stacks)).toEqual([
      "app:prod",
      "network:dev",
      "network:prod",
      "playground:dev",
      "site:prod",
    ]);
  });
});

describe("stackConfigDir", () => {
  test("stack files are looked for in the directory the project file names", async () => {
    const root = repo({
      "app/Pulumi.yaml": `${PROJECT}stackConfigDir: config\n`,
      "app/config/Pulumi.prod.yaml": "",
      "app/config/Pulumi.dev.yml": "",
      // The tool never reads this one, because it only looks in config/.
      "app/Pulumi.stray.yaml": "",
    });
    expect(await discover(root)).toEqual([{ path: "app", name: "prod", options: {} }]);
  });

  test("it is relative to the project directory and may lie outside it", async () => {
    const root = repo({
      "apps/web/Pulumi.yml": `${PROJECT}stackConfigDir: ../../stacks/web/\n`,
      "stacks/web/Pulumi.prod.yml": "",
    });
    expect(ids(await discover(root))).toEqual(["apps/web:prod"]);
  });

  test("a project file in JSON can name it too", async () => {
    const root = repo({
      "app/Pulumi.json": '{ "name": "example", "stackConfigDir": "config" }',
      "app/config/Pulumi.prod.json": "{}",
    });
    expect(ids(await discover(root))).toEqual(["app:prod"]);
  });

  test("a directory that does not exist holds no stacks", async () => {
    const root = repo({
      "app/Pulumi.yaml": `${PROJECT}stackConfigDir: config\n`,
      "app/Pulumi.prod.yaml": "",
    });
    expect(await discover(root)).toEqual([]);
  });

  test("a directory outside the repo is an error", async () => {
    const root = repo({ "app/Pulumi.yaml": `${PROJECT}stackConfigDir: ../../elsewhere\n` });
    expect(await problems(discover(root))).toEqual([
      'app/Pulumi.yaml: stackConfigDir points outside the repo ("../../elsewhere"). Sluiceway only reads files inside the repo.',
    ]);
  });

  test("anything but text is an error", async () => {
    const root = repo({ "app/Pulumi.yaml": `${PROJECT}stackConfigDir: [config]\n` });
    expect(await problems(discover(root))).toEqual([
      "app/Pulumi.yaml: stackConfigDir must be text, the directory that holds the stack files.",
    ]);
  });
});

describe("a project file that cannot be read", () => {
  test("is an error that names the file and the place, and never what the file says", async () => {
    const root = repo({
      "app/Pulumi.yaml": "name: example\nconfig:\n  token: [CANARY-VALUE\n",
      "app/Pulumi.prod.yaml": "",
    });
    const found = await problems(discover(root));
    expect(found).toEqual(["app/Pulumi.yaml: line 4, column 1: not valid YAML."]);
  });

  test("every broken project file is named at once, and the error says what failed", async () => {
    const root = repo({
      "a/Pulumi.yaml": "{",
      "b/Pulumi.yaml": `${PROJECT}stackConfigDir: 3\n`,
      "c/Pulumi.yaml": PROJECT,
      "c/Pulumi.prod.yaml": "",
    });
    const error = await discover(root).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(DiscoveryError);
    expect((error as DiscoveryError).message).toBe(
      [
        "Could not work out the stacks of this repo:",
        "- a/Pulumi.yaml: line 1, column 2: not valid YAML.",
        "- b/Pulumi.yaml: stackConfigDir must be text, the directory that holds the stack files.",
      ].join("\n"),
    );
  });

  test("a project file that names no other directory is taken as it stands", async () => {
    // The tool will refuse both files, and that is a preview failure on a row.
    // Discovery only fails when it cannot know where the stack files are.
    const root = repo({
      "a/Pulumi.yaml": "",
      "a/Pulumi.prod.yaml": "",
      "b/Pulumi.yaml": "- not\n- a mapping\n",
      "b/Pulumi.prod.yaml": "",
      "c/Pulumi.yaml": "name: one\nname: two\n",
      "c/Pulumi.prod.yaml": "",
    });
    expect(ids(await discover(root))).toEqual(["a:prod", "b:prod", "c:prod"]);
  });
});

describe("files alone", () => {
  // Promise 4 of record 0014: resolve and settle run discovery in a job that
  // holds no tool credentials. So discovery can start no process and open no
  // connection. The check reads the imports of the module, and of what it pulls
  // in from src/, because a run that happens not to call the tool proves less.
  test("discovery imports nothing that starts a process or opens a connection", () => {
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    const src = resolve(import.meta.dir, "../../../src");
    const seen = new Set<string>();
    const packages = new Set<string>();
    const visit = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const { path } of transpiler.scanImports(readFileSync(file, "utf8"))) {
        if (path.startsWith(".")) visit(resolve(dirname(file), path));
        else packages.add(path);
      }
    };
    visit(join(src, "adapters/pulumi/discover.ts"));
    expect([...packages].sort()).toEqual(["node:fs/promises", "node:path", "picomatch", "yaml"]);
  });
});

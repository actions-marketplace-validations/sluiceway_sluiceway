import { describe, expect, test } from "bun:test";
import { settle } from "../../src/modes/settle.ts";
import { ACTION_REF, change, pending } from "./harness.ts";
import { ALICE, matrix, scanned, tick, WORKFLOW, wake } from "./resolve-harness.ts";

// What resolve and settle say when GitHub refuses a read or the body has no
// room: the lines a person acts on when a permission is missing.

const TABLE = {
  "app:prod": pending("app:prod", change("web")),
  "network:prod": pending("network:prod", change("vpc")),
};

describe("resolve when the deployment records cannot be read", () => {
  test("the job goes red, names the permissions, and hands nothing on", async () => {
    const h = await scanned(TABLE);
    h.github.listNewestDeployments = async () => {
      throw new Error("403 Resource not accessible by integration");
    };
    tick(h, ALICE, ["app:prod"]);

    await expect(wake(h)).rejects.toThrow(
      "The deployment records could not be read: 403 Resource not accessible by integration. The resolve job needs the permissions `deployments: write` and `actions: read` next to `contents: read` and `issues: write` (record 0003).",
    );
    expect(matrix(h)).toEqual([]);
  });
});

describe("settle when the failure line does not fit", () => {
  test("nothing is written, and the log says the full scan writes the row", async () => {
    const h = await scanned(TABLE, {
      config: "stacks:\n  - path: app\n    dependsOn: [network:prod]\n",
    });
    tick(h, ALICE, ["app:prod", "network:prod"]);
    await wake(h);
    const first = (matrix(h) as { deployment: number }[])[0]?.deployment ?? 0;
    h.github.addDeploymentStatus(first, { state: "failure", autoInactive: false });
    const before = h.github.issue(h.number).body;
    h.log.lines.length = 0;

    await settle({
      root: h.context.root,
      adapter: h.adapter,
      github: h.github,
      log: h.log,
      repoUrl: h.context.repoUrl,
      runId: h.context.runId,
      event: h.context.event,
      workflow: WORKFLOW,
      actionRef: ACTION_REF,
      limits: { body: { limit: 500 } },
    });

    expect(h.github.issue(h.number).body).toBe(before);
    expect(h.log.lines).toContainEqual(
      expect.stringMatching(
        /^With the failure line the dashboard body is [\d,]+ characters, over what GitHub keeps\. Nothing was written\. The full scan writes the row\.$/,
      ),
    );
  });
});

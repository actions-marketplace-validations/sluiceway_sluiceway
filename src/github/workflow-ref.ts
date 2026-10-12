// Which workflow the running job belongs to, read once from its environment
// and passed on as data (build plan, section 5). The rescan box starts a scan
// by dispatching this same workflow on this same ref (records 0009 and 0017).

import { errorMessage } from "../core/basics.ts";
import type { GitHubPort } from "./port.ts";

export interface WorkflowRef {
  // The file name under `.github/workflows/`, which is what the dispatch
  // endpoint takes as the workflow's id.
  file: string;
  // As GitHub writes it, `refs/heads/main`. An `issues` event always runs the
  // workflow of the default branch.
  ref: string;
}

// `GITHUB_WORKFLOW_REF` reads `<owner>/<repo>/.github/workflows/<file>@<ref>`.
// A path holds no at sign, a ref can. Nothing when the runner did not set it,
// and then a rescan fails with its own message.
export function readWorkflowRef(
  env: Readonly<Record<string, string | undefined>>,
): WorkflowRef | undefined {
  const value = env.GITHUB_WORKFLOW_REF ?? "";
  const at = value.indexOf("@");
  if (at < 0) return undefined;
  const file = value.slice(0, at).split("/").at(-1) ?? "";
  const ref = value.slice(at + 1);
  return file === "" || ref === "" ? undefined : { file, ref };
}

// Starts a full scan by dispatching the workflow again (record 0017). A
// dispatch GitHub refuses names what the job needs, then `after`: what the
// job left behind it, said in the mode's own words.
export async function startFullScan(
  github: Pick<GitHubPort, "dispatchWorkflow">,
  workflow: WorkflowRef,
  job: "resolve" | "apply" | "settle",
  after: string,
  inputs?: Record<string, string>,
): Promise<string | undefined> {
  try {
    return await github.dispatchWorkflow(workflow.file, workflow.ref, inputs);
  } catch (error) {
    throw new Error(
      `A full scan could not be started: ${errorMessage(error)}. The ${job} job needs the permission \`actions: write\`, and the workflow (${workflow.file}) needs a \`workflow_dispatch\` trigger that runs the scan (record 0017).${after}`,
    );
  }
}

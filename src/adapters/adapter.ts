import type { Stack } from "../core/stack.ts";

// What Sluiceway needs from an infrastructure tool. Everything the tool's own
// words mean stays behind this interface (record 0006).
export interface Adapter {
  // Finds the stacks under root, the directory of the checked-out repo, from
  // files alone. It never asks a backend and never starts the tool, because
  // resolve and settle run it in a job that holds no credentials (record
  // 0014). Paths come back in the form a stack id uses, and the stacks in the
  // same order every time. What cannot be worked out is a DiscoveryError.
  // Ignore is not the adapter's business: applyConfig drops ignored stacks.
  discover(root: string): Promise<Stack[]>;
}

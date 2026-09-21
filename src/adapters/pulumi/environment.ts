import { toolEnvironment } from "../environment.ts";

// Sluiceway sets only what makes the tool behave in CI. It never sets or
// defaults a backend URL, a passphrase or a credential: when one is missing,
// the tool's own error is the stack's preview failure (record 0013).
export function pulumiEnvironment(env: Record<string, string | undefined>): Record<string, string> {
  return { ...toolEnvironment(env), PULUMI_SKIP_UPDATE_CHECK: "true" };
}

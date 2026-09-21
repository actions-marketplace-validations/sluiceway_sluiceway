// A stack is a path, an optional name and an options bag that only its adapter
// reads (record 0006). No tool word belongs in this file.
export interface Stack {
  // Relative to the repo root, with forward slashes, no leading "./" and no
  // trailing slash. Whoever builds a Stack hands the path over in this form.
  path: string;
  name?: string;
  options: Record<string, unknown>;
}

// The stack id is derived, never chosen. Nothing splits it back apart: the
// adapter gets path and name as separate fields.
export function stackId(stack: Pick<Stack, "path" | "name">): string {
  return stack.name === undefined ? stack.path : `${stack.path}:${stack.name}`;
}

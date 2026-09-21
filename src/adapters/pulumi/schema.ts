import { z } from "zod";

// The document that "pulumi preview --json" prints holds every property value
// of every resource, in plain text unless somebody marked it secret. This
// schema names the few fields the adapter needs. Zod drops every other key, so
// what comes out of here has no place for a value to ride along (record 0021).
// The document has no schema version, so a shape that moved has to fail here.

// Of a resource's old state only the flag that says a delete leaves the real
// object alone. Never inputs or outputs.
const oldState = z.object({ retainOnDelete: z.boolean().nullish() });

const step = z.object({
  op: z.string(),
  urn: z.string(),
  oldState: oldState.nullish(),
  diffReasons: z.array(z.string()).nullish(),
  replaceReasons: z.array(z.string()).nullish(),
  // Property paths. What sits under each path is dropped.
  detailedDiff: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((paths) => (paths == null ? undefined : Object.keys(paths))),
});

// The tool's own words. They go to the job log and nowhere else (record 0022).
const diagnostics = z.array(z.object({ message: z.string() })).nullish();

// A preview that worked always holds the step of the root stack resource, so
// a document without steps is a document Sluiceway cannot read. Defaulting to
// no steps would show the stack as in sync.
const previewDocument = z.object({ steps: z.array(step), diagnostics });

// What a failed preview may still hold. Nothing else is read from it.
const failedDocument = z.object({ diagnostics });

export type PreviewStep = z.infer<typeof step>;

export type ParsedPreview =
  | { ok: true; steps: PreviewStep[]; diagnostics: string[] }
  // Each problem names a place and what was expected there, never what was
  // found: the parser's own message can quote its input.
  | { ok: false; problems: string[] };

export function parsePreview(stdout: string): ParsedPreview {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return { ok: false, problems: ["The tool's output: expected one JSON document."] };
  }
  const parsed = previewDocument.safeParse(json);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map(problem) };
  return {
    ok: true,
    steps: parsed.data.steps,
    diagnostics: messages(parsed.data.diagnostics),
  };
}

// The diagnostics of a preview that failed, when its output holds any. The
// tool often prints nothing, or no JSON, when it exits with an error.
export function parseDiagnostics(stdout: string): string[] {
  try {
    const parsed = failedDocument.safeParse(JSON.parse(stdout));
    return parsed.success ? messages(parsed.data.diagnostics) : [];
  } catch {
    return [];
  }
}

function messages(found: { message: string }[] | null | undefined): string[] {
  return (found ?? []).map((diagnostic) => diagnostic.message);
}

const EXPECTED: Record<string, string> = {
  string: "text",
  array: "a list",
  object: "an object",
  record: "an object",
  boolean: "true or false",
};

function problem(issue: z.core.$ZodIssue): string {
  const expected = issue.code === "invalid_type" ? EXPECTED[issue.expected] : undefined;
  return `The tool's output, at ${place(issue.path)}: expected ${expected ?? "something else"}.`;
}

// A path is made of this schema's field names and of indexes, so it holds
// nothing the tool wrote.
function place(path: PropertyKey[]): string {
  if (path.length === 0) return "the top";
  return path
    .map((part, index) =>
      typeof part === "number" ? `[${part}]` : `${index === 0 ? "" : "."}${String(part)}`,
    )
    .join("");
}

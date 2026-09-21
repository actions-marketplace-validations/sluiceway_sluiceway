import { z } from "zod";
import { configSchema } from "./config.ts";

// The JSON schema of sluiceway.yaml, for editors. It describes what a person
// may write (the input side), so keys with a default are not required. Checks
// that JSON schema cannot say, such as two entries for one stack, are left to
// the loader. Only scripts/generate-schema.ts calls this, never the action.
export function configJsonSchema(): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(configSchema, { target: "draft-7", io: "input" });
  return {
    $schema,
    title: "sluiceway.yaml",
    description: "Configuration of Sluiceway. The file is optional and sits at the repo root.",
    ...rest,
  };
}

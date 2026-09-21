// Writes schema/sluiceway.schema.json from the Zod schema that config loading
// uses. The file is committed, and CI fails when it is stale, the way it does
// for dist/. Run it with "bun run build:schema".
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { configJsonSchema } from "../src/core/config-json-schema.ts";

const file = resolve(import.meta.dir, "../schema/sluiceway.schema.json");
writeFileSync(file, `${JSON.stringify(configJsonSchema(), null, 2)}\n`);
console.log(`Wrote ${file}`);

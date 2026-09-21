import * as core from "@actions/core";
import { parseMode, run } from "./mode.ts";

try {
  await run(parseMode(core.getInput("mode")));
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}

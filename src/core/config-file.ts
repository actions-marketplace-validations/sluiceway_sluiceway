import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { type Config, ConfigError, isTimeZone, parseConfig } from "./config.ts";

// At the repo root, and nowhere else. The name Sluiceway writes and the docs
// use.
export const CONFIG_FILE = "sluiceway.yaml";
// The second spelling, read the same way (slice 5.9).
export const CONFIG_FILE_YML = "sluiceway.yml";
export const CONFIG_FILES = [CONFIG_FILE, CONFIG_FILE_YML] as const;

// The name of the config file the repo has, or nothing. Both at once is
// refused: one of them would be passed over without a word, and its tick rule
// with it.
export function configFileName(root: string): string | undefined {
  const present = CONFIG_FILES.filter((name) => existsSync(join(root, name)));
  if (present.length > 1) {
    throw new ConfigError([
      { kind: "two-config-files", files: [CONFIG_FILE, CONFIG_FILE_YML], path: [] },
    ]);
  }
  return present[0];
}

// Reads the optional config file at the root of the checked-out repo. A
// problem is reported under the name of the file it is in.
export function loadConfig(root: string): Config {
  const name = configFileName(root);
  if (name === undefined) return parseConfig(undefined);
  try {
    return parseConfig(read(join(root, name)));
  } catch (error) {
    if (error instanceof ConfigError && name !== CONFIG_FILE) {
      throw new ConfigError(error.issues, name);
    }
    throw error;
  }
}

// Whether the repo has a config file at all. The check says so, because no
// file and a file that sets nothing load the same (record 0042).
export function hasConfigFile(root: string): boolean {
  return configFileName(root) !== undefined;
}

function read(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    if (code === "EISDIR") throw new ConfigError([{ kind: "not-a-file", path: [] }]);
    throw error;
  }
}

// The two settings a run that failed needs to put its line on the dashboard
// (record 0120): the label that finds it and the zone of its time. From the
// config when it loads. When it does not, the two keys as the file writes
// them, when they make sense, and the defaults for the rest. A run with a
// broken config can trust nothing more.
export function dashboardSettingsOf(root: string): { label: string; timeZone: string | undefined } {
  const defaults = parseConfig(undefined).dashboard;
  try {
    const { label, timeZone } = loadConfig(root).dashboard;
    return { label, timeZone: timeZone === "UTC" ? undefined : timeZone };
  } catch {
    // Read below, as far as it goes.
  }
  let dashboard: unknown;
  try {
    const name = configFileName(root);
    const text = name === undefined ? undefined : read(join(root, name));
    dashboard = (parse(text ?? "") as { dashboard?: unknown } | null)?.dashboard;
  } catch {
    dashboard = undefined;
  }
  const keys = typeof dashboard === "object" && dashboard !== null ? dashboard : {};
  const label =
    "label" in keys && typeof keys.label === "string" && keys.label.trim() !== ""
      ? keys.label
      : defaults.label;
  const zone = "timeZone" in keys && typeof keys.timeZone === "string" ? keys.timeZone : undefined;
  return {
    label,
    timeZone: zone !== undefined && zone !== "UTC" && isTimeZone(zone) ? zone : undefined,
  };
}

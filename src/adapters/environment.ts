// The environment a tool is started with: the whole environment of the job,
// because a program may read any variable and Sluiceway cannot know the names
// (record 0013). No name is looked at but one kind. GitHub hands an action its
// inputs as INPUT_* variables, the token that can edit the dashboard among
// them, and a stack program must never get that token.
export function toolEnvironment(env: Record<string, string | undefined>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && !name.startsWith("INPUT_")) kept[name] = value;
  }
  return kept;
}

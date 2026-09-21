// The CLI versions the fixtures are recorded with (build plan, section 6): the
// minimum that record 0001 supports, and the newest at the time of recording.
// The matrix in .github/workflows/ci.yml and the directories under
// test/fixtures/pulumi/ have to agree with this. A test checks both.
export const FIXTURE_CLI_VERSIONS = {
  minimum: "v3.229.0",
  newest: "v3.263.0",
} as const;

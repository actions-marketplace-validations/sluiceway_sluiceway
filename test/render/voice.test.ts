import { describe, expect, test } from "bun:test";
import {
  DRY,
  INSTRUCTION_LINE,
  NOTHING_TO_DEPLOY,
  PREVIEW_FAILED_LINE,
  WARM,
} from "../../src/render/voice.ts";

// The strings of record 0032, copied from the record and not from the code.
describe("the voice lives in two lines", () => {
  test("the good-news line", () => {
    expect(WARM.goodNews(58)).toBe("Gate closed, water calm. Nothing to deploy.");
    expect(DRY.goodNews(58)).toBe("Nothing to deploy. All 58 stacks are in sync.");
  });

  test("the first-run line", () => {
    expect(WARM.firstRun).toBe(
      "The channel is dry. Add a stack to `sluiceway.yaml` and the next scan fills it.",
    );
    expect(DRY.firstRun).toBe(
      "No stacks found yet. Add one to `sluiceway.yaml` and the next scan lists it here.",
    );
  });

  test("a warm line never carries a number", () => {
    expect(WARM.goodNews(58)).toBe(WARM.goodNews(1));
    expect(WARM.goodNews(58) + WARM.firstRun).not.toMatch(/\d/);
  });

  test("the dry good-news line with one stack", () => {
    expect(DRY.goodNews(1)).toBe("Nothing to deploy. 1 stack is in sync.");
  });
});

describe("every other line is plain", () => {
  test("the words", () => {
    expect(INSTRUCTION_LINE).toBe("Tick a box to deploy that stack exactly as its row shows it.");
    expect(NOTHING_TO_DEPLOY).toBe("Nothing to deploy.");
    expect(PREVIEW_FAILED_LINE).toBe(
      "These stacks could not be previewed, so they cannot be deployed from here until a scan succeeds.",
    );
  });

  // The writing rules of record 0032 and the plan's rules of work.
  test("no exclamation mark, no em-dash, no emoji and no first person anywhere", () => {
    const all = [
      WARM.goodNews(58),
      WARM.firstRun,
      DRY.goodNews(58),
      DRY.goodNews(1),
      DRY.firstRun,
      INSTRUCTION_LINE,
      NOTHING_TO_DEPLOY,
      PREVIEW_FAILED_LINE,
    ].join("\n");
    expect(all).not.toMatch(/[!\u2014\u2013]|:[a-z_]+:|\p{Extended_Pictographic}/u);
    expect(all).not.toMatch(/\b(I|I'm|me|my|we|our)\b/);
  });
});

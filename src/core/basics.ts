// Small helpers that core, adapters, render and the modes all use. A leaf:
// it imports nothing, so anything may import it.

// Sorts strings by UTF-16 code unit, the same on every machine and locale.
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const ENCODER = new TextEncoder();

// The length GitHub counts against its limits: UTF-8 bytes.
export function byteLength(text: string): number {
  return ENCODER.encode(text).length;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

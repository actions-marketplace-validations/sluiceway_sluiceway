// Types, names, property names and stack ids come from the user's code and the
// provider's schema, and are never trusted as markup (record 0027).

const NAMED: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

// Makes text safe to place on any line of a row block. The same change line
// is Markdown outside the fold and an HTML block inside it, so the characters
// that Markdown acts on are written as character references: those are literal
// text in both. A control character becomes a space, so text from outside can
// never start a line of its own, and with it a row.
export function escapeText(text: string): string {
  return (
    text
      // Control characters, the line separator and the paragraph separator.
      .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
      .replace(/[&<>"]/g, (char) => NAMED[char] ?? char)
      .replace(/[*_`~[\]|\\]/g, (char) => `&#${char.charCodeAt(0)};`)
  );
}

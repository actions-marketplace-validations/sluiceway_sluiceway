import { describe, expect, test } from "bun:test";
import { escapeText } from "../../src/render/escape.ts";

// Types, names, property names and stack ids come from the user's code and the
// provider's schema. They are never trusted as markup (record 0027).
describe("escaping text for a row", () => {
  test("ordinary names read as themselves", () => {
    expect(escapeText("aws:s3/bucketPolicy:BucketPolicy")).toBe("aws:s3/bucketPolicy:BucketPolicy");
    expect(escapeText("uploads-public-read")).toBe("uploads-public-read");
    expect(escapeText("apps/grafana:prod")).toBe("apps/grafana:prod");
  });

  test("HTML cannot open a tag, an entity or a comment", () => {
    expect(escapeText('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(escapeText("a&amp;b")).toBe("a&amp;amp;b");
    expect(escapeText("</details><!-- /sluiceway:row -->")).toBe(
      "&lt;/details&gt;&lt;!-- /sluiceway:row --&gt;",
    );
  });

  // A change line outside the fold is Markdown, the same line inside the fold
  // is an HTML block. A character reference is literal text in both.
  test("Markdown cannot start emphasis, code, a link or a table", () => {
    expect(escapeText("*bold* _em_ `code` ~~gone~~")).toBe(
      "&#42;bold&#42; &#95;em&#95; &#96;code&#96; &#126;&#126;gone&#126;&#126;",
    );
    expect(escapeText("[click](https://example.com)")).toBe("&#91;click&#93;(https://example.com)");
    expect(escapeText("a|b\\c")).toBe("a&#124;b&#92;c");
  });

  test("a line break or another control character becomes a space, so a name never starts a line", () => {
    expect(escapeText("x\n- [x] y\r\nz\tw\u0000\u007f\u2028\u2029.")).toBe(
      "x - &#91;x&#93; y  z w    .",
    );
  });
});

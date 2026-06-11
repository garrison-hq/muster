import { describe, expect, it } from "vitest";
import { extractFrontMatter } from "../../src/adapters/rfc1/frontmatter.js";
import type { Violation } from "../../src/core/report.js";

function expectRefusal(result: ReturnType<typeof extractFrontMatter>): Violation[] {
  expect(Array.isArray(result)).toBe(true);
  return result as Violation[];
}

function expectExtracted(
  result: ReturnType<typeof extractFrontMatter>
): { yamlText: string; body: string } {
  expect(Array.isArray(result)).toBe(false);
  return result as { yamlText: string; body: string };
}

describe("extractFrontMatter — RFC-1 §3.1.1", () => {
  it("§3.1.1 refuses a file starting with body text in both modes", () => {
    for (const mode of ["strict", "permissive"] as const) {
      const violations = expectRefusal(
        extractFrontMatter("Hello, I am a soul.\n---\nfoo: 1\n---\n", mode)
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]?.section).toBe("§3.1.1");
      expect(violations[0]?.severity).toBe("error");
    }
  });

  it("§3.1.1 strict refusal message is the normative one", () => {
    const violations = expectRefusal(extractFrontMatter("no front matter here", "strict"));
    expect(violations[0]).toMatchObject({
      path: "",
      message: "missing or malformed front matter",
      section: "§3.1.1",
    });
  });

  it("§3.1.1 permissive refusal message is actionable", () => {
    const violations = expectRefusal(extractFrontMatter("no front matter here", "permissive"));
    expect(violations[0]?.message).toBe(
      "front matter must be the first content, delimited by ---"
    );
    expect(violations[0]?.section).toBe("§3.1.1");
  });

  it("§3.1.1 refuses an unterminated front matter block in both modes", () => {
    for (const mode of ["strict", "permissive"] as const) {
      const violations = expectRefusal(extractFrontMatter("---\nfoo: 1\nno closing", mode));
      expect(violations).toHaveLength(1);
      expect(violations[0]?.section).toBe("§3.1.1");
    }
  });

  it("§3.1.1 extracts the first block; later --- lines in the body are ignored", () => {
    const raw = "---\nfoo: 1\n---\nbody with --- inside\n---\nmore body";
    const { yamlText, body } = expectExtracted(extractFrontMatter(raw, "strict"));
    expect(yamlText).toBe("foo: 1");
    expect(body).toBe("body with --- inside\n---\nmore body");
  });

  it("§3.1.1 empty front matter block yields an empty yamlText (validation layer decides)", () => {
    const { yamlText, body } = expectExtracted(extractFrontMatter("---\n---\n", "strict"));
    expect(yamlText).toBe("");
    expect(body).toBe("");
  });

  it("§3.2 strips a leading UTF-8 BOM before matching the opening delimiter", () => {
    const raw = "﻿---\nfoo: 1\n---\nbody";
    const { yamlText, body } = expectExtracted(extractFrontMatter(raw, "strict"));
    expect(yamlText).toBe("foo: 1");
    expect(body).toBe("body");
  });

  it("§3.1.1 tolerates CRLF line endings around the delimiters", () => {
    const raw = "---\r\nfoo: 1\r\n---\r\nbody\r\n";
    const { yamlText, body } = expectExtracted(extractFrontMatter(raw, "strict"));
    expect(yamlText).toBe("foo: 1\r");
    expect(body).toBe("body\r\n");
  });

  it("§3.1.1 a delimiter line with extra characters is not a delimiter", () => {
    // "--- " (trailing space) is not exactly `---`.
    const violations = expectRefusal(extractFrontMatter("--- \nfoo: 1\n---\n", "strict"));
    expect(violations[0]?.section).toBe("§3.1.1");
  });

  it("§3.1.1 never parses YAML — malformed YAML inside the block still extracts", () => {
    const raw = "---\n[: not yaml at all ::\n---\nbody";
    const { yamlText } = expectExtracted(extractFrontMatter(raw, "strict"));
    expect(yamlText).toBe("[: not yaml at all ::");
  });

  it("NFR-005 violation hygiene: refusals have non-empty message and a section; path is documented-empty for whole-document errors", () => {
    for (const mode of ["strict", "permissive"] as const) {
      for (const raw of ["body first", "---\nunterminated"]) {
        const violations = expectRefusal(extractFrontMatter(raw, mode));
        for (const v of violations) {
          expect(v.message.length).toBeGreaterThan(0);
          expect(v.section).toBe("§3.1.1");
          // Whole-document error: path is documented-empty.
          expect(v.path).toBe("");
        }
      }
    }
  });
});

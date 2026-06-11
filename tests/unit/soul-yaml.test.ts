import { describe, expect, it } from "vitest";
import { parseSoulYaml } from "../../src/adapters/rfc1/soul-yaml.js";
import type { Violation } from "../../src/core/report.js";

function expectViolations(result: ReturnType<typeof parseSoulYaml>): Violation[] {
  expect(Array.isArray(result)).toBe(true);
  return result as Violation[];
}

function expectData(result: ReturnType<typeof parseSoulYaml>): unknown {
  expect(Array.isArray(result)).toBe(false);
  return (result as { data: unknown }).data;
}

describe("parseSoulYaml — RFC-1 §4.1–§4.2 Soul-YAML", () => {
  it("§4.2 rejects anchors and aliases without expanding — exactly two violations", () => {
    const result = parseSoulYaml("a: &x 1\nb: *x", "strict");
    const violations = expectViolations(result);
    expect(violations).toHaveLength(2);
    expect(violations[0]).toMatchObject({
      path: "a",
      message: "anchor (&) is forbidden in Soul-YAML",
      section: "§4.2",
    });
    expect(violations[1]).toMatchObject({
      path: "b",
      message: "alias (*) is forbidden in Soul-YAML",
      section: "§4.2",
    });
    // data is never produced
    expect("data" in (result as object)).toBe(false);
  });

  it("§4.2 rejects merge keys with no expansion observable anywhere", () => {
    const result = parseSoulYaml("base: {a: 1}\nchild:\n  <<: *base", "strict");
    const violations = expectViolations(result);
    const messages = violations.map((v) => v.message);
    expect(messages).toContain("merge key (<<:) is forbidden in Soul-YAML");
    const mergeViolation = violations.find((v) => v.message.startsWith("merge key"));
    expect(mergeViolation?.path).toBe("child.<<");
    expect(mergeViolation?.section).toBe("§4.2");
    // NO expansion observable anywhere: nothing in the result resembles
    // an expanded child mapping, and no data exists.
    expect(JSON.stringify(violations)).not.toContain('"a":1');
    expect("data" in (result as object)).toBe(false);
  });

  it("§4.2 rejects merge keys in both modes (refuse-to-load, RECOMMENDED permissive behavior)", () => {
    for (const mode of ["strict", "permissive"] as const) {
      const violations = expectViolations(
        parseSoulYaml("base: {a: 1}\nchild:\n  <<: *base", mode)
      );
      expect(violations.some((v) => v.message.startsWith("merge key"))).toBe(true);
    }
  });

  it("§4.2 rejects custom tags (!!python/object)", () => {
    const violations = expectViolations(parseSoulYaml("v: !!python/object x", "strict"));
    expect(violations.some((v) => v.message === "custom tag is forbidden in Soul-YAML")).toBe(
      true
    );
    const tagViolation = violations.find((v) => v.message.startsWith("custom tag"));
    expect(tagViolation?.path).toBe("v");
    expect(tagViolation?.section).toBe("§4.2");
  });

  it("§4.2 rejects custom tags (!custom)", () => {
    const violations = expectViolations(parseSoulYaml("v: !custom y", "strict"));
    expect(violations.some((v) => v.message === "custom tag is forbidden in Soul-YAML")).toBe(
      true
    );
  });

  it("§4.2 allows explicit YAML 1.2 core-schema tags (!!str, !!int)", () => {
    const data = expectData(parseSoulYaml("a: !!str hello\nb: !!int 42", "strict"));
    expect(data).toEqual({ a: "hello", b: 42 });
  });

  it("§4.2 rejects complex keys (non-scalar mapping keys)", () => {
    const violations = expectViolations(parseSoulYaml("? [a, b]\n: value", "strict"));
    expect(violations.some((v) => v.message === "complex key is forbidden in Soul-YAML")).toBe(
      true
    );
    const complexViolation = violations.find((v) => v.message.startsWith("complex key"));
    expect(complexViolation?.section).toBe("§4.2");
    expect(complexViolation?.path).toBe("<complex-key>");
  });

  it("§4.2 rejects nested complex keys with an ancestry-derived path", () => {
    const violations = expectViolations(
      parseSoulYaml("outer:\n  ? {x: 1}\n  : value", "strict")
    );
    const complexViolation = violations.find((v) => v.message.startsWith("complex key"));
    expect(complexViolation?.path).toBe("outer.<complex-key>");
  });

  it("§4.2 detects anchors on collections, with sequence indices in the path", () => {
    const violations = expectViolations(parseSoulYaml("a:\n  - &x 1\n  - 2", "strict"));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      path: "a[0]",
      message: "anchor (&) is forbidden in Soul-YAML",
      section: "§4.2",
    });
  });

  it("§4.2 no-expansion guarantee: alias to a 1000-char scalar fires a violation and no parsed output exists", () => {
    const big = "x".repeat(1000);
    const result = parseSoulYaml(`a: &big "${big}"\nb: *big\nc: *big`, "strict");
    const violations = expectViolations(result);
    expect(violations.some((v) => v.message.startsWith("alias"))).toBe(true);
    expect(violations.some((v) => v.message.startsWith("anchor"))).toBe(true);
    // Regression against an accidental .toJS() before the walk: no parsed
    // output exists, and nothing in the violations carries the expanded scalar.
    expect("data" in (result as object)).toBe(false);
    expect(JSON.stringify(result)).not.toContain(big);
  });

  it("§4.1 reports document-level YAML syntax errors", () => {
    const violations = expectViolations(parseSoulYaml("a: [unclosed", "strict"));
    expect(violations.length).toBeGreaterThan(0);
    for (const v of violations) {
      expect(v.section).toBe("§4.1");
      expect(v.message.length).toBeGreaterThan(0);
      // Whole-document error: path is documented-empty.
      expect(v.path).toBe("");
    }
  });

  it("§4.1 clean document resolves to plain JS with numbers/strings/bools/null intact", () => {
    const data = expectData(
      parseSoulYaml(
        'id: soul-1\ncount: 42\nratio: 0.5\nenabled: true\nnothing: null\nname: "Quoted"\nlist:\n  - 1\n  - two',
        "strict"
      )
    );
    expect(data).toEqual({
      id: "soul-1",
      count: 42,
      ratio: 0.5,
      enabled: true,
      nothing: null,
      name: "Quoted",
      list: [1, "two"],
    });
  });

  it("§4.1 empty front-matter text resolves to null data (validation layer decides)", () => {
    const data = expectData(parseSoulYaml("", "strict"));
    expect(data).toBeNull();
  });

  it('§4.2 a quoted "<<" key is a plain string key, not a merge key', () => {
    const data = expectData(parseSoulYaml('"<<": literal', "strict"));
    expect(data).toEqual({ "<<": "literal" });
  });

  it("NFR-005 violation hygiene: §4.2 violations have non-empty path, message, and section", () => {
    const samples = [
      "a: &x 1\nb: *x",
      "base: {a: 1}\nchild:\n  <<: *base",
      "v: !custom y",
      "outer:\n  ? [a]\n  : v",
    ];
    for (const yamlText of samples) {
      for (const mode of ["strict", "permissive"] as const) {
        const violations = expectViolations(parseSoulYaml(yamlText, mode));
        for (const v of violations) {
          expect(v.path.length).toBeGreaterThan(0);
          expect(v.message.length).toBeGreaterThan(0);
          expect(v.section).toBe("§4.2");
          expect(v.severity).toBe("error");
        }
      }
    }
  });
});

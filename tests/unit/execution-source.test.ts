import { describe, expect, it } from "vitest";
import { resolveExecutionSource } from "../../src/core/execution-source.js";

describe("resolveExecutionSource — FR-018 five-branch precedence", () => {
  it("branch 1: cassetteReplayConfigured true resolves cassette, configured true", () => {
    expect(resolveExecutionSource({ cassetteReplayConfigured: true, env: {} })).toEqual({
      configured: true,
      source: "cassette",
      usedDeprecatedAlias: false,
    });
  });

  it("branch 1: cassette wins over every other input, including a full manifest+env set", () => {
    expect(
      resolveExecutionSource({
        cassetteReplayConfigured: true,
        env: { MUSTER_ENDPOINT: "https://example.test", MUSTER_BASE_URL: "https://alias.test" },
        manifestHasEndpointBlock: true,
      })
    ).toEqual({ configured: true, source: "cassette", usedDeprecatedAlias: false });
  });

  it("branch 2: MUSTER_ENDPOINT non-empty resolves env, usedDeprecatedAlias false", () => {
    expect(
      resolveExecutionSource({ env: { MUSTER_ENDPOINT: "https://example.test" } })
    ).toEqual({ configured: true, source: "env", usedDeprecatedAlias: false });
  });

  it("branch 3: MUSTER_BASE_URL alone resolves env, usedDeprecatedAlias true (falsification case)", () => {
    expect(
      resolveExecutionSource({ env: { MUSTER_BASE_URL: "https://alias.test" } })
    ).toEqual({ configured: true, source: "env", usedDeprecatedAlias: true });
  });

  it("falsification: both MUSTER_ENDPOINT and MUSTER_BASE_URL set — MUSTER_ENDPOINT wins silently", () => {
    expect(
      resolveExecutionSource({
        env: { MUSTER_ENDPOINT: "https://canonical.test", MUSTER_BASE_URL: "https://alias.test" },
      })
    ).toEqual({ configured: true, source: "env", usedDeprecatedAlias: false });
  });

  it("branch 4: manifestHasEndpointBlock true (with no env vars) resolves manifest-endpoint-block", () => {
    expect(
      resolveExecutionSource({ env: {}, manifestHasEndpointBlock: true })
    ).toEqual({ configured: true, source: "manifest-endpoint-block", usedDeprecatedAlias: false });
  });

  it("branch 5: nothing configured resolves none, configured false", () => {
    expect(resolveExecutionSource({ env: {} })).toEqual({
      configured: false,
      source: "none",
      usedDeprecatedAlias: false,
    });
  });

  it("branch 5: empty-string env vars are treated as absent, not as configured", () => {
    expect(
      resolveExecutionSource({ env: { MUSTER_ENDPOINT: "", MUSTER_BASE_URL: "" } })
    ).toEqual({ configured: false, source: "none", usedDeprecatedAlias: false });
  });

  it("precedence: manifestHasEndpointBlock is not consulted when MUSTER_ENDPOINT is set", () => {
    expect(
      resolveExecutionSource({
        env: { MUSTER_ENDPOINT: "https://example.test" },
        manifestHasEndpointBlock: true,
      })
    ).toEqual({ configured: true, source: "env", usedDeprecatedAlias: false });
  });

  it("precedence: manifestHasEndpointBlock is not consulted when MUSTER_BASE_URL alone is set", () => {
    expect(
      resolveExecutionSource({
        env: { MUSTER_BASE_URL: "https://alias.test" },
        manifestHasEndpointBlock: true,
      })
    ).toEqual({ configured: true, source: "env", usedDeprecatedAlias: true });
  });

  it("defaults env to process.env when omitted", () => {
    const original = process.env["MUSTER_ENDPOINT"];
    process.env["MUSTER_ENDPOINT"] = "https://from-process-env.test";
    try {
      expect(resolveExecutionSource({})).toEqual({
        configured: true,
        source: "env",
        usedDeprecatedAlias: false,
      });
    } finally {
      if (original === undefined) {
        delete process.env["MUSTER_ENDPOINT"];
      } else {
        process.env["MUSTER_ENDPOINT"] = original;
      }
    }
  });

  it("defaults the entire input to {} when called with no arguments at all", () => {
    const originalEndpoint = process.env["MUSTER_ENDPOINT"];
    const originalAlias = process.env["MUSTER_BASE_URL"];
    delete process.env["MUSTER_ENDPOINT"];
    delete process.env["MUSTER_BASE_URL"];
    try {
      expect(resolveExecutionSource()).toEqual({
        configured: false,
        source: "none",
        usedDeprecatedAlias: false,
      });
    } finally {
      if (originalEndpoint !== undefined) process.env["MUSTER_ENDPOINT"] = originalEndpoint;
      if (originalAlias !== undefined) process.env["MUSTER_BASE_URL"] = originalAlias;
    }
  });

  it("cassetteReplayConfigured false (not true) falls through to the remaining branches", () => {
    expect(
      resolveExecutionSource({
        cassetteReplayConfigured: false,
        env: { MUSTER_ENDPOINT: "https://example.test" },
      })
    ).toEqual({ configured: true, source: "env", usedDeprecatedAlias: false });
  });

  it("manifestHasEndpointBlock false (not true) with no env vars resolves none", () => {
    expect(
      resolveExecutionSource({ env: {}, manifestHasEndpointBlock: false })
    ).toEqual({ configured: false, source: "none", usedDeprecatedAlias: false });
  });
});

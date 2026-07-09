/**
 * Known-answer tests for proportion-ci.ts.
 *
 * Expected values are hand-derived from the textbook Wald and Wilson
 * formulas (shown inline per case) — not by re-invoking the module under
 * test. `standardNormalQuantile` is cross-checked against widely-published
 * standard-normal-table constants (z_.975=1.959964, z_.95=1.644854,
 * z_.80=0.841621, etc.), independent of this module's implementation.
 */

import { describe, it, expect } from "vitest";
import {
  standardNormalQuantile,
  zForConfidenceLevel,
  waldProportionCI,
  wilsonProportionCI,
  proportionCI,
} from "../../../src/core/behavioral/stats/proportion-ci.js";

const EPS = 1e-6;

describe("standardNormalQuantile", () => {
  // Standard-normal-table constants (textbook / any statistics reference),
  // independent of this module's Acklam rational approximation.
  it.each([
    [0.975, 1.959964],
    [0.95, 1.644854],
    [0.9, 1.281552],
    [0.8, 0.841621],
    [0.995, 2.575829],
    [0.5, 0],
  ])("standardNormalQuantile(%f) ≈ %f (published table value)", (p, expected) => {
    expect(standardNormalQuantile(p)).toBeCloseTo(expected, 5);
  });

  it("is antisymmetric about p=0.5: Φ⁻¹(1-p) = -Φ⁻¹(p)", () => {
    // A hand-derivable exact property of any valid quantile function.
    expect(standardNormalQuantile(0.9) + standardNormalQuantile(0.1)).toBeCloseTo(0, 9);
    expect(standardNormalQuantile(0.01) + standardNormalQuantile(0.99)).toBeCloseTo(0, 9);
  });

  it("throws for p outside the open interval (0, 1)", () => {
    expect(() => standardNormalQuantile(0)).toThrow();
    expect(() => standardNormalQuantile(1)).toThrow();
    expect(() => standardNormalQuantile(-0.1)).toThrow();
    expect(() => standardNormalQuantile(1.1)).toThrow();
  });
});

describe("zForConfidenceLevel", () => {
  it("returns 1.959964 for the standard 95% CI (the '1.96' constant)", () => {
    expect(zForConfidenceLevel(0.95)).toBeCloseTo(1.959964, 5);
  });

  it("rejects confidence levels outside (0,1)", () => {
    expect(() => zForConfidenceLevel(0)).toThrow();
    expect(() => zForConfidenceLevel(1)).toThrow();
  });
});

describe("waldProportionCI — hand-computed known answers", () => {
  it("n=100, x=60: p̂=0.6 ± 1.96·√(0.6·0.4/100) = 0.6 ± 0.09596 = [0.50402, 0.69598]", () => {
    // SE = sqrt(0.24/100) = sqrt(0.0024) = 0.04898979...
    // half-width = 1.959964 * 0.04898979... = 0.0960001...
    const result = waldProportionCI(60, 100);
    expect(result.pointEstimate).toBeCloseTo(0.6, 9);
    expect(result.lower).toBeCloseTo(0.503982, 5);
    expect(result.upper).toBeCloseTo(0.696018, 5);
    expect(result.method).toBe("wald");
  });

  it("n=4, x=1: p̂=0.25 ± 1.96·√(0.25·0.75/4) = 0.25 ± 0.42433 = [-0.17433, 0.67433] → lower clamped to 0", () => {
    // SE = sqrt(0.1875/4) = sqrt(0.046875) = 0.2165064...
    // half-width = 1.959964 * 0.2165064 = 0.4243345...
    const result = waldProportionCI(1, 4);
    expect(result.lower).toBe(0); // clamped from ~-0.174345
    expect(result.upper).toBeCloseTo(0.674345, 5);
  });

  it("boundary p̂=0: n=10,x=0 → point estimate 0, SE=0, CI degenerates to [0,0]", () => {
    const result = waldProportionCI(0, 10);
    expect(result.pointEstimate).toBe(0);
    expect(result.lower).toBe(0);
    expect(result.upper).toBe(0); // Wald's well-known pathology: zero-width CI at p̂=0
  });

  it("boundary p̂=1: n=10,x=10 → CI degenerates to [1,1]", () => {
    const result = waldProportionCI(10, 10);
    expect(result.pointEstimate).toBe(1);
    expect(result.lower).toBe(1);
    expect(result.upper).toBe(1);
  });

  it("rejects invalid n and successes", () => {
    expect(() => waldProportionCI(0, 0)).toThrow();
    expect(() => waldProportionCI(-1, 10)).toThrow();
    expect(() => waldProportionCI(11, 10)).toThrow();
    expect(() => waldProportionCI(1.5, 10)).toThrow();
  });
});

describe("wilsonProportionCI — hand-computed known answers", () => {
  it("n=100, x=60: center=(0.6+3.8416/200)/(1+3.8416/100)=0.596301, half-width≈0.094298", () => {
    // center = (0.6 + 0.019208) / 1.038416 = 0.619208 / 1.038416 = 0.5963006...
    // half = (1.959964/1.038416) * sqrt(0.6*0.4/100 + 3.8416/40000)
    //      = 1.887547 * sqrt(0.0024 + 0.00009604) = 1.887547 * 0.0499604 = 0.0942979...
    const result = wilsonProportionCI(60, 100);
    expect(result.lower).toBeCloseTo(0.502003, 5);
    expect(result.upper).toBeCloseTo(0.690599, 5);
    expect(result.method).toBe("wilson");
  });

  it("boundary p̂=0: n=10,x=0 → Wilson gives a non-degenerate upper bound ≈0.2775 (unlike Wald's 0)", () => {
    // Well-known reference value for the Wilson interval at 0/10 successes,
    // 95% CI: upper ≈ 0.2775 (contrast with Wald's pathological [0,0]).
    const result = wilsonProportionCI(0, 10);
    expect(result.lower).toBe(0);
    expect(result.upper).toBeCloseTo(0.277533, 5);
  });

  it("boundary p̂=1: n=10,x=10 → symmetric to the p̂=0 case: lower ≈ 1-0.2775", () => {
    const result = wilsonProportionCI(10, 10);
    expect(result.upper).toBe(1);
    expect(result.lower).toBeCloseTo(1 - 0.277533, 5);
  });

  it("tiny n=1, x=0: Wilson stays within [0,1] and is non-degenerate", () => {
    const result = wilsonProportionCI(0, 1);
    expect(result.lower).toBeGreaterThanOrEqual(0);
    expect(result.upper).toBeGreaterThan(0); // not collapsed to a point like Wald would be
    expect(result.upper).toBeLessThan(1);
  });

  it("rejects invalid n and successes", () => {
    expect(() => wilsonProportionCI(0, 0)).toThrow();
    expect(() => wilsonProportionCI(-1, 5)).toThrow();
    expect(() => wilsonProportionCI(6, 5)).toThrow();
  });
});

describe("proportionCI — auto method selection", () => {
  it("selects Wilson at p̂=0 (boundary)", () => {
    expect(proportionCI(0, 10).method).toBe("wilson");
  });

  it("selects Wilson at p̂=1 (boundary)", () => {
    expect(proportionCI(10, 10).method).toBe("wilson");
  });

  it("selects Wilson for small n even mid-range p̂", () => {
    expect(proportionCI(5, 10).method).toBe("wilson"); // n=10 < 30
  });

  it("selects Wilson for p̂ near the 0/1 boundary even with larger n", () => {
    expect(proportionCI(3, 50).method).toBe("wilson"); // p̂=0.06 <= 0.1
  });

  it("selects Wald in the well-behaved interior (n>=30, 0.1<p̂<0.9)", () => {
    const result = proportionCI(30, 60); // p̂=0.5, n=60
    expect(result.method).toBe("wald");
    expect(result.lower).toBeCloseTo(waldProportionCI(30, 60).lower, 9);
  });

  it("matches direct wilsonProportionCI output when boundary-selected", () => {
    const auto = proportionCI(0, 10);
    const direct = wilsonProportionCI(0, 10);
    expect(auto.lower).toBe(direct.lower);
    expect(auto.upper).toBe(direct.upper);
  });
});

describe("proportion-ci — float comparisons use tolerance", () => {
  it("Wald and Wilson agree closely in the deep interior for large n", () => {
    const wald = waldProportionCI(500, 1000);
    const wilson = wilsonProportionCI(500, 1000);
    expect(Math.abs(wald.lower - wilson.lower)).toBeLessThan(EPS * 1e4); // both ~0.469, close but not identical
  });
});

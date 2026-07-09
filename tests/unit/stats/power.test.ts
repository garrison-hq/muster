/**
 * Known-answer tests for power.ts (Miller Eq.9 sample size, Eq.10 MDE, and
 * the no-lift verdict helper).
 *
 * The primary numeric anchor is hand-computed against published
 * standard-normal-table z-values (z_.975=1.959964, z_.80=0.841621 — the same
 * independently-sourced constants used in proportion-ci.test.ts), shown
 * inline. A second anchor cross-checks against the ≈969-probe rule-of-thumb
 * research.md §4A cites for δ=0.03 @ 80% power, α=0.05, by solving for the
 * implied total variance V and confirming Eq. 9 reproduces n≈969 from it.
 */

import { describe, it, expect } from "vitest";
import {
  computeSampleSize,
  requiredSampleSize,
  minimumDetectableEffect,
  evaluateLiftVerdict,
  type PowerParams,
} from "../../../src/core/behavioral/stats/power.js";

describe("computeSampleSize / requiredSampleSize — hand-computed known answer", () => {
  // omega2=0.05, sigmaA2=0.1/kA=2 -> 0.05, sigmaB2=0.1/kB=2 -> 0.05: V=0.15
  // delta=0.1; z_.975=1.959964, z_.80=0.841621; zSum=2.801585; zSum^2=7.848878
  // n = 7.848878 * 0.15 / 0.01 = 117.7332 (hand-verified by long multiplication)
  const params: PowerParams = { omega2: 0.05, sigmaA2: 0.1, kA: 2, sigmaB2: 0.1, kB: 2 };

  it("computeSampleSize(0.1, params) ≈ 117.733", () => {
    expect(computeSampleSize(0.1, params)).toBeCloseTo(117.733, 2);
  });

  it("requiredSampleSize ceils to the next whole probe count: 118", () => {
    expect(requiredSampleSize(0.1, params)).toBe(118);
  });

  it("rejects delta <= 0", () => {
    expect(() => computeSampleSize(0, params)).toThrow();
    expect(() => computeSampleSize(-0.1, params)).toThrow();
  });

  it("rejects invalid variance components / K values", () => {
    expect(() => computeSampleSize(0.1, { ...params, omega2: -1 })).toThrow();
    expect(() => computeSampleSize(0.1, { ...params, kA: 0 })).toThrow();
    expect(() => computeSampleSize(0.1, { ...params, kB: 1.5 })).toThrow();
  });

  it("rejects out-of-range alpha/power", () => {
    expect(() => computeSampleSize(0.1, { ...params, alpha: 0 })).toThrow();
    expect(() => computeSampleSize(0.1, { ...params, power: 1 })).toThrow();
  });
});

describe("computeSampleSize — research.md §4A rule-of-thumb cross-check", () => {
  it("reproduces n≈969 for δ=0.03 @ 80% power, α=0.05, given the implied V", () => {
    // Solve V from n=(zSum)^2*V/delta^2 => V = n*delta^2/zSum^2.
    // zSum=2.801585, zSum^2=7.848878; V = 969*0.0009/7.848878 = 0.111111...
    const impliedV = 0.1111111;
    const params: PowerParams = {
      omega2: impliedV,
      sigmaA2: 0,
      kA: 1,
      sigmaB2: 0,
      kB: 1,
    };
    expect(computeSampleSize(0.03, params)).toBeCloseTo(969, 0);
  });
});

describe("minimumDetectableEffect — Eq.10 inversion", () => {
  const params: PowerParams = { omega2: 0.05, sigmaA2: 0.1, kA: 2, sigmaB2: 0.1, kB: 2 };

  it("round-trips exactly against computeSampleSize (algebraic inverse identity)", () => {
    // mde(computeSampleSize(delta, p), p) === delta by construction (Eq.10
    // is Eq.9 solved for delta) — an exact mathematical property, not
    // dependent on the precision of any particular z constant.
    const delta = 0.1;
    const n = computeSampleSize(delta, params);
    const mde = minimumDetectableEffect(n, params);
    expect(mde).toBeCloseTo(delta, 9);
  });

  it("round-trips for several delta/variance combinations", () => {
    const cases: Array<{ delta: number; params: PowerParams }> = [
      { delta: 0.05, params: { omega2: 0.02, sigmaA2: 0.2, kA: 3, sigmaB2: 0.2, kB: 3 } },
      { delta: 0.2, params: { omega2: 0, sigmaA2: 0.25, kA: 1, sigmaB2: 0.25, kB: 1 } },
      { delta: 0.01, params: { omega2: 0.1, sigmaA2: 0.1, kA: 5, sigmaB2: 0.1, kB: 5, alpha: 0.01, power: 0.9 } },
    ];
    for (const { delta, params: p } of cases) {
      const n = computeSampleSize(delta, p);
      expect(minimumDetectableEffect(n, p)).toBeCloseTo(delta, 6);
    }
  });

  it("MDE decreases as n grows (larger probe sets detect smaller lifts)", () => {
    const mdeSmall = minimumDetectableEffect(100, params);
    const mdeLarge = minimumDetectableEffect(1000, params);
    expect(mdeLarge).toBeLessThan(mdeSmall);
  });

  it("rejects n <= 0", () => {
    expect(() => minimumDetectableEffect(0, params)).toThrow();
    expect(() => minimumDetectableEffect(-5, params)).toThrow();
  });
});

describe("evaluateLiftVerdict — trivial hand-computed arithmetic", () => {
  it("returns 'no-lift' when the CI upper bound is entirely below the threshold", () => {
    const result = evaluateLiftVerdict({ lower: -0.01, upper: 0.02 }, 0.05);
    expect(result.verdict).toBe("no-lift");
  });

  it("returns 'lift-confirmed' when the CI lower bound meets or exceeds the threshold", () => {
    const result = evaluateLiftVerdict({ lower: 0.06, upper: 0.12 }, 0.05);
    expect(result.verdict).toBe("lift-confirmed");
  });

  it("returns 'lift-confirmed' at the exact boundary (lower === threshold)", () => {
    const result = evaluateLiftVerdict({ lower: 0.05, upper: 0.1 }, 0.05);
    expect(result.verdict).toBe("lift-confirmed");
  });

  it("returns 'inconclusive' when the threshold falls inside the CI", () => {
    const result = evaluateLiftVerdict({ lower: 0.01, upper: 0.09 }, 0.05);
    expect(result.verdict).toBe("inconclusive");
  });

  it("rejects a non-positive liftThreshold", () => {
    expect(() => evaluateLiftVerdict({ lower: 0, upper: 0.1 }, 0)).toThrow();
    expect(() => evaluateLiftVerdict({ lower: 0, upper: 0.1 }, -0.05)).toThrow();
  });

  it("rejects an inverted CI (lower > upper)", () => {
    expect(() => evaluateLiftVerdict({ lower: 0.2, upper: 0.1 }, 0.05)).toThrow();
  });
});

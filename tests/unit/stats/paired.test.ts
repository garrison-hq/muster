/**
 * Known-answer tests for paired.ts (McNemar mid-p, Tango score CI, Newcombe
 * CI).
 *
 * McNemar mid-p anchors are exact rational numbers, hand-derived from the
 * Binomial(n,0.5) PMF (Pascal's-triangle row / 2^n) — shown inline. Tango CI
 * anchors rely on two hand-provable exact mathematical properties instead of
 * literal arithmetic (the quadratic + bisection procedure isn't tractable by
 * hand): (1) symmetry (b=c ⇒ CI is exactly symmetric about 0), and (2) an
 * exact identity with `wilsonProportionCI` when there are zero discordant
 * pairs (proved in a comment below). Both properties are proved from Tango's
 * published equations independently of this module's code.
 */

import { describe, it, expect } from "vitest";
import {
  mcnemarMidP,
  tangoScoreCI,
  newcombeMoverCI,
  type PairedOutcome,
} from "../../../src/core/behavioral/stats/paired.js";
import { wilsonProportionCI } from "../../../src/core/behavioral/stats/proportion-ci.js";

/** Build `aOnly` pairs favoring A, `bOnly` favoring B, `bothPass`/`bothFail` concordant. */
function makePairs(counts: { bothPass?: number; aOnly?: number; bOnly?: number; bothFail?: number }): PairedOutcome[] {
  const pairs: PairedOutcome[] = [];
  for (let i = 0; i < (counts.bothPass ?? 0); i++) pairs.push({ armA: true, armB: true });
  for (let i = 0; i < (counts.aOnly ?? 0); i++) pairs.push({ armA: true, armB: false });
  for (let i = 0; i < (counts.bOnly ?? 0); i++) pairs.push({ armA: false, armB: true });
  for (let i = 0; i < (counts.bothFail ?? 0); i++) pairs.push({ armA: false, armB: false });
  return pairs;
}

describe("mcnemarMidP — hand-computed known answers", () => {
  it("b=1,c=3 (n_disc=4): Binomial(4,0.5) pmf=[1,4,6,4,1]/16; m=1; " +
      "cdf(1)=(1+4)/16=0.3125; midP=2*0.3125-0.25=0.375", () => {
    const pairs = makePairs({ aOnly: 1, bOnly: 3, bothPass: 2, bothFail: 1 });
    const result = mcnemarMidP(pairs);
    expect(result.discordantFavoringA).toBe(1);
    expect(result.discordantFavoringB).toBe(3);
    expect(result.pValue).toBeCloseTo(0.375, 9);
  });

  it("b=0,c=5 (n_disc=5): Binomial(5,0.5) pmf[0]=1/32; midP=2*(1/32)-(1/32)=1/32=0.03125 exactly", () => {
    const pairs = makePairs({ aOnly: 0, bOnly: 5 });
    const result = mcnemarMidP(pairs);
    expect(result.pValue).toBeCloseTo(1 / 32, 9);
  });

  it("b=c=0 (no discordant pairs, perfect agreement): mid-p = 1 exactly (no evidence)", () => {
    const pairs = makePairs({ bothPass: 3, bothFail: 4 });
    const result = mcnemarMidP(pairs);
    expect(result.discordantFavoringA).toBe(0);
    expect(result.discordantFavoringB).toBe(0);
    expect(result.pValue).toBe(1);
  });

  it("b=c (any balanced discordant count, e.g. b=c=2): mid-p = 1 exactly", () => {
    // General property, provable algebraically: for n=2m even and b=c=m,
    // CDF(m) for a symmetric Binomial(2m,0.5) = 0.5 + 0.5*pmf(m) exactly, so
    // midP = 2*CDF(m) - pmf(m) = 1 + pmf(m) - pmf(m) = 1.
    const pairs = makePairs({ aOnly: 2, bOnly: 2, bothPass: 1 });
    const result = mcnemarMidP(pairs);
    expect(result.pValue).toBe(1);
  });

  it("b=5,c=5 (n_disc=10): also mid-p = 1 exactly (same property, larger n)", () => {
    const pairs = makePairs({ aOnly: 5, bOnly: 5 });
    const result = mcnemarMidP(pairs);
    expect(result.pValue).toBeCloseTo(1, 9);
  });

  it("throws on empty pairs", () => {
    expect(() => mcnemarMidP([])).toThrow();
  });

  it("pValue is always in [0,1]", () => {
    const pairs = makePairs({ aOnly: 7, bOnly: 1, bothPass: 2, bothFail: 1 });
    const result = mcnemarMidP(pairs);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });
});

describe("tangoScoreCI — mathematically-derived known-answer properties", () => {
  it("is exactly symmetric about 0 when discordant pairs are balanced (b=c)", () => {
    // Provable from Tango's equations: when d̂=0 (b=c), the defining
    // quadratic for phi(delta) is even in delta, so T(delta) is odd in
    // delta, so the two score-inversion roots satisfy upper = -lower exactly.
    const pairs = makePairs({ aOnly: 2, bOnly: 2, bothPass: 3, bothFail: 3 });
    const result = tangoScoreCI(pairs);
    expect(result.estimate).toBe(0);
    expect(result.upper).toBeCloseTo(-result.lower, 9);
  });

  it("with zero discordant pairs, exactly equals ±wilsonProportionCI(0, n).upper", () => {
    // Proof: with b=c=0, m=n (all pairs concordant), the phi-quadratic
    // reduces to phi=|delta| (the only feasible root), so
    // Var(delta) = (|delta|-delta^2)/n = |delta|(1-|delta|)/n — exactly the
    // Bernoulli variance formula for a proportion of value |delta| — so the
    // Tango score interval for the paired difference collapses EXACTLY onto
    // the Wilson interval for a single proportion of 0 successes in n
    // trials, reflected about 0.
    const pairs = makePairs({ bothPass: 6, bothFail: 4 }); // n=10, all concordant
    const tango = tangoScoreCI(pairs);
    const wilson = wilsonProportionCI(0, 10);
    expect(tango.estimate).toBe(0);
    expect(tango.upper).toBeCloseTo(wilson.upper, 6);
    expect(tango.lower).toBeCloseTo(-wilson.upper, 6);
  });

  it("the observed estimate always lies within [lower, upper]", () => {
    const pairs = makePairs({ aOnly: 4, bOnly: 1, bothPass: 3, bothFail: 2 });
    const result = tangoScoreCI(pairs);
    expect(result.lower).toBeLessThanOrEqual(result.estimate);
    expect(result.upper).toBeGreaterThanOrEqual(result.estimate);
  });

  it("complete separation (all pairs favor A): dHat=1, upper clamps to 1, lower is finite and < 1", () => {
    const pairs = makePairs({ aOnly: 5 });
    const result = tangoScoreCI(pairs);
    expect(result.estimate).toBe(1);
    expect(result.upper).toBe(1);
    expect(result.lower).toBeGreaterThan(0);
    expect(result.lower).toBeLessThan(1);
  });

  it("complete separation (all pairs favor B): dHat=-1, lower clamps to -1", () => {
    const pairs = makePairs({ bOnly: 5 });
    const result = tangoScoreCI(pairs);
    expect(result.estimate).toBe(-1);
    expect(result.lower).toBe(-1);
    expect(result.upper).toBeLessThan(0);
  });

  it("bounds stay within [-1, 1] in general", () => {
    const pairs = makePairs({ aOnly: 6, bOnly: 2, bothPass: 5, bothFail: 3 });
    const result = tangoScoreCI(pairs);
    expect(result.lower).toBeGreaterThanOrEqual(-1);
    expect(result.upper).toBeLessThanOrEqual(1);
  });

  it("narrower confidence level (90%) gives a tighter CI than 95%", () => {
    const pairs = makePairs({ aOnly: 6, bOnly: 2, bothPass: 5, bothFail: 3 });
    const ci95 = tangoScoreCI(pairs, 0.95);
    const ci90 = tangoScoreCI(pairs, 0.9);
    expect(ci90.upper - ci90.lower).toBeLessThan(ci95.upper - ci95.lower);
  });

  it("throws on empty pairs", () => {
    expect(() => tangoScoreCI([])).toThrow();
  });
});

describe("newcombeMoverCI — closed-form cross-check", () => {
  it("is exactly symmetric about 0 when discordant pairs are balanced (b=c)", () => {
    const pairs = makePairs({ aOnly: 2, bOnly: 2, bothPass: 3, bothFail: 3 });
    const result = newcombeMoverCI(pairs);
    expect(result.estimate).toBe(0);
    expect(result.upper).toBeCloseTo(-result.lower, 9);
  });

  it("contains the observed estimate", () => {
    const pairs = makePairs({ aOnly: 4, bOnly: 1, bothPass: 3, bothFail: 2 });
    const result = newcombeMoverCI(pairs);
    expect(result.lower).toBeLessThanOrEqual(result.estimate);
    expect(result.upper).toBeGreaterThanOrEqual(result.estimate);
  });

  it("agrees in direction and rough magnitude with tangoScoreCI (both are legitimate methods)", () => {
    const pairs = makePairs({ aOnly: 6, bOnly: 2, bothPass: 5, bothFail: 3 });
    const tango = tangoScoreCI(pairs);
    const newcombe = newcombeMoverCI(pairs);
    expect(newcombe.estimate).toBe(tango.estimate);
    // Both should straddle the same estimate with overlapping, similarly-scaled intervals.
    expect(newcombe.lower).toBeLessThan(tango.upper);
    expect(newcombe.upper).toBeGreaterThan(tango.lower);
  });

  it("throws on empty pairs", () => {
    expect(() => newcombeMoverCI([])).toThrow();
  });
});

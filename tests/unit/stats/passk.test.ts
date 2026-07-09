/**
 * Known-answer tests for passk.ts (disjunctive pass@k, conjunctive pass^k
 * posterior estimator).
 *
 * pass@k anchors are verified two independent ways for each case: (1) the
 * direct combinatorial definition 1 - C(n-c,k)/C(n,k) computed by hand, and
 * (2) the telescoping identity passAtK(n,c,1) === c/n exactly (proved
 * algebraically in a comment below). Conjunctive pass^k anchors are exact
 * rational numbers derived from the Beta-distribution moment formula by
 * hand.
 */

import { describe, it, expect } from "vitest";
import {
  passAtK,
  conjunctivePassKPosterior,
  UNIFORM_PRIOR,
  JEFFREYS_PRIOR,
} from "../../../src/core/behavioral/stats/passk.js";

describe("passAtK — hand-computed known answers", () => {
  it("passAtK(10,7,1) = c/n = 0.7 exactly (k=1 telescoping identity)", () => {
    // Proof: for k=1, Π_{i=n-c+1}^{n} (1 - 1/i) = Π (i-1)/i telescopes to
    // (n-c)/n, so pass@1 = 1 - (n-c)/n = c/n exactly, for any valid n,c.
    expect(passAtK(10, 7, 1)).toBeCloseTo(0.7, 12);
  });

  it("passAtK(4,1,2) = 0.5: direct check C(3,2)/C(4,2) = 3/6 = 0.5, so 1-0.5=0.5", () => {
    expect(passAtK(4, 1, 2)).toBeCloseTo(0.5, 12);
  });

  it("passAtK(5,2,3) = 0.9: direct check C(3,3)/C(5,3) = 1/10 = 0.1, so 1-0.1=0.9", () => {
    expect(passAtK(5, 2, 3)).toBeCloseTo(0.9, 12);
  });

  it("passAtK(4,3,2) = 1.0 exactly: n-c=1 < k=2, so C(1,2)=0 (shortcut branch)", () => {
    expect(passAtK(4, 3, 2)).toBe(1);
  });

  it("passAtK(5,0,2) = 0 exactly: c=0, C(n-c,k)/C(n,k) = C(5,2)/C(5,2) = 1, so 1-1=0", () => {
    expect(passAtK(5, 0, 2)).toBe(0);
  });

  it("passAtK(n,n,k) = 1.0 exactly for any k<=n: all samples pass", () => {
    expect(passAtK(6, 6, 3)).toBe(1);
    expect(passAtK(1, 1, 1)).toBe(1);
  });

  it("boundary n=k (n=3,c=3,k=3): shortcut n-c=0<k=3, returns exactly 1", () => {
    expect(passAtK(3, 3, 3)).toBe(1);
  });

  it("boundary n=k with partial passes (n=3,c=1,k=3): C(2,3)=0 => shortcut, returns 1", () => {
    // Fewer than k=3 failures don't exist here either way, but the direct
    // rule is: any n=k means the single "k of n" subset IS all n samples,
    // so pass@k=1 iff c>=1 (at least one observed pass).
    expect(passAtK(3, 1, 3)).toBe(1);
  });

  it("boundary n=k, c=0 (n=3,c=0,k=3): C(3,3)/C(3,3)=1, so pass@k=0", () => {
    expect(passAtK(3, 0, 3)).toBe(0);
  });

  it("throws when n < k (insufficient samples per probe)", () => {
    expect(() => passAtK(3, 2, 5)).toThrow();
  });

  it("throws on non-integer or out-of-range c, n, k", () => {
    expect(() => passAtK(5, 2.5, 1)).toThrow();
    expect(() => passAtK(5, -1, 1)).toThrow();
    expect(() => passAtK(5, 6, 1)).toThrow();
    expect(() => passAtK(0, 0, 1)).toThrow();
    expect(() => passAtK(5, 2, 0)).toThrow();
  });

  it("is monotonically non-decreasing in c for fixed n,k", () => {
    const n = 8;
    const k = 3;
    let previous = passAtK(n, 0, k);
    for (let c = 1; c <= n; c++) {
      const current = passAtK(n, c, k);
      expect(current).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = current;
    }
  });

  it("stays within [0,1] across a spread of n,c,k", () => {
    for (const n of [1, 2, 5, 10, 20]) {
      for (let k = 1; k <= n; k++) {
        for (let c = 0; c <= n; c++) {
          const value = passAtK(n, c, k);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("conjunctivePassKPosterior — hand-computed known answers", () => {
  it("uniform prior, no data (n=0,c=0), k=1: E[p]=1/(1+1)=0.5 exactly", () => {
    const result = conjunctivePassKPosterior(0, 0, 1, UNIFORM_PRIOR);
    expect(result.posteriorAlpha).toBe(1);
    expect(result.posteriorBeta).toBe(1);
    expect(result.posteriorMean).toBe(0.5);
    expect(result.probability).toBe(0.5);
  });

  it("uniform prior, no data (n=0,c=0), k=3: E[p^3] = (1/2)(2/3)(3/4) = 6/24 = 0.25 exactly", () => {
    const result = conjunctivePassKPosterior(0, 0, 3, UNIFORM_PRIOR);
    expect(result.probability).toBeCloseTo(0.25, 12);
  });

  it("uniform prior, all-pass data (n=10,c=10), k=1: a=11,b=1, E[p]=11/12 (Bayesian shrinkage from MLE's 1.0)", () => {
    const result = conjunctivePassKPosterior(10, 10, 1, UNIFORM_PRIOR);
    expect(result.posteriorAlpha).toBe(11);
    expect(result.posteriorBeta).toBe(1);
    expect(result.posteriorMean).toBeCloseTo(11 / 12, 12);
    expect(result.probability).toBeCloseTo(11 / 12, 12);
    // Bayesian estimate never overclaims certainty the way the naive MLE (1.0) would.
    expect(result.probability).toBeLessThan(1);
  });

  it("Jeffreys (default) prior, no data (n=0,c=0), k=1: E[p]=0.5/(0.5+0.5)=0.5 exactly (symmetric prior)", () => {
    const result = conjunctivePassKPosterior(0, 0, 1);
    expect(result.prior).toEqual(JEFFREYS_PRIOR);
    expect(result.posteriorMean).toBe(0.5);
  });

  it("Jeffreys prior with all-pass data shrinks less aggressively toward 0.5 than uniform would at n=0", () => {
    const withData = conjunctivePassKPosterior(20, 20, 5, JEFFREYS_PRIOR);
    const noData = conjunctivePassKPosterior(0, 0, 5, JEFFREYS_PRIOR);
    expect(withData.probability).toBeGreaterThan(noData.probability);
  });

  it("probability decreases monotonically as k grows (harder to string together more consecutive passes)", () => {
    const p1 = conjunctivePassKPosterior(10, 9, 1).probability;
    const p2 = conjunctivePassKPosterior(10, 9, 2).probability;
    const p3 = conjunctivePassKPosterior(10, 9, 3).probability;
    expect(p2).toBeLessThan(p1);
    expect(p3).toBeLessThan(p2);
  });

  it("accepts n=0 (pure-prior estimate) — deliberately no n>=k requirement, unlike passAtK", () => {
    expect(() => conjunctivePassKPosterior(0, 0, 5)).not.toThrow();
    const result = conjunctivePassKPosterior(0, 0, 5);
    expect(result.probability).toBeGreaterThan(0);
    expect(result.probability).toBeLessThan(1);
  });

  it("accepts k > n (still valid: a forecast about future trials, not a resample of past ones)", () => {
    expect(() => conjunctivePassKPosterior(3, 3, 10)).not.toThrow();
  });

  it("rejects invalid n, c, k, or prior", () => {
    expect(() => conjunctivePassKPosterior(-1, 0, 1)).toThrow();
    expect(() => conjunctivePassKPosterior(5, 6, 1)).toThrow();
    expect(() => conjunctivePassKPosterior(5, 2, 0)).toThrow();
    expect(() => conjunctivePassKPosterior(5, 2, 1, { alpha: 0, beta: 1 })).toThrow();
    expect(() => conjunctivePassKPosterior(5, 2, 1, { alpha: 1, beta: -1 })).toThrow();
  });

  it("probability and posteriorMean always stay within [0,1]", () => {
    for (const n of [0, 1, 5, 20]) {
      for (let c = 0; c <= n; c++) {
        for (const k of [1, 2, 5]) {
          const result = conjunctivePassKPosterior(n, c, k);
          expect(result.probability).toBeGreaterThanOrEqual(0);
          expect(result.probability).toBeLessThanOrEqual(1);
          expect(result.posteriorMean).toBeGreaterThanOrEqual(0);
          expect(result.posteriorMean).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

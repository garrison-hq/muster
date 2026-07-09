/**
 * index.ts — Barrel export for muster's in-house statistics module
 * (`src/core/behavioral/stats/`).
 *
 * Pure, dependency-free, deterministic estimators for the memory-utilization
 * / learning-lift conformance pipeline (research.md §4A): single-arm
 * proportion CIs, paired-probe significance/CI, sample-size & MDE power
 * calculations, and pass@k / pass^k estimators. Spec-agnostic (no layer
 * specifics) — lives in core per the ports-and-adapters boundary.
 */

export * from "./proportion-ci.js";
export * from "./paired.js";
export * from "./power.js";
export * from "./passk.js";

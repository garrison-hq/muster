/**
 * PR #85 review finding F2 — the subject-matter gate's rigged-impossible
 * discrimination control (`src/crosslayer/lint-controls.ts`) was referenced
 * only from its own unit test, never from `manifest-runner.ts` or the CLI.
 * `docs/rubric/crosslayer-contradiction-gate.md:104` claims the control "is
 * observed failing on every run" — true for `pnpm test`, false for
 * `muster crosslayer run`, which is exactly where the fail-green risk lands
 * (a consumer's `static-gate` CI job never executes `pnpm test`).
 *
 * This suite proves the control is now wired into the static manifest run
 * path: it fires silently when healthy (no stderr noise, matching the CLI's
 * existing "no noise on stderr" contract for a passing run) and it surfaces
 * a warning through the exact same path when the control regresses.
 *
 * Normative citation: docs/rubric/crosslayer-contradiction-gate.md,
 * Discrimination control (FR-009).
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import * as path from "node:path";
import { runManifest } from "../../../src/crosslayer/manifest-runner.js";
import * as lintControls from "../../../src/crosslayer/lint-controls.js";
import type { GateControlResult } from "../../../src/crosslayer/lint-controls.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../.."
);
const MANIFEST_PATH = path.join(PROJECT_ROOT, "fixtures/crosslayer/manifest.yaml");

const BROKEN_RESULT: GateControlResult = {
  passed: true,
  failedAsDesigned: false,
  rigged: { clean: true, findingTypes: [] },
  polarityNeutralised: { clean: true, findingTypes: [] },
  subjectShifted: { clean: true, findingTypes: [] },
  reason: "SUBJECT-MATTER GATE CONTROL PASSED — grader bug.",
};

describe("F2 — the subject-matter gate control runs on the static manifest run path", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays silent on a real static-only run (control fails as designed — no CI noise)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const evaluateSpy = vi.spyOn(lintControls, "evaluateSubjectMatterGateControl");

    await runManifest(MANIFEST_PATH, { testClassFilter: "static" });

    // The control is actually evaluated on this path (proves the wiring, not
    // just an import) and, since the real detector still works, no warning
    // is printed — the run stays byte-stable and CI-silent.
    expect(evaluateSpy).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("surfaces the warning through the manifest run path when the control regresses", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(lintControls, "evaluateSubjectMatterGateControl").mockReturnValue(BROKEN_RESULT);

    await runManifest(MANIFEST_PATH, { testClassFilter: "static" });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(BROKEN_RESULT.reason);
  });

  it("does not evaluate the control when only behavioral cases are requested", async () => {
    process.env["MUSTER_TEST_API_KEY_F2"] = "unused";
    const evaluateSpy = vi.spyOn(lintControls, "evaluateSubjectMatterGateControl");

    try {
      await runManifest(MANIFEST_PATH, { testClassFilter: "behavioral" });
    } catch {
      // Behavioral cases may fail without a live endpoint/API key — irrelevant
      // to this assertion, which only checks the static control was not run.
    }

    expect(evaluateSpy).not.toHaveBeenCalled();
    delete process.env["MUSTER_TEST_API_KEY_F2"];
  });

  it("does not evaluate the control during a dry run", async () => {
    const evaluateSpy = vi.spyOn(lintControls, "evaluateSubjectMatterGateControl");

    await runManifest(MANIFEST_PATH, { dryRun: true });

    expect(evaluateSpy).not.toHaveBeenCalled();
  });
});

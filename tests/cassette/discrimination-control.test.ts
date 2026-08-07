/**
 * FR-019 / Scenario 14 — the discrimination-control cassette.
 *
 * `fixtures/cassettes/discrimination-control/` is a committed, git-tracked
 * cassette (T031: authored via WP03's decorator record mode against a
 * scripted mock `ChatClient`, then committed as static JSON — see
 * `manifest.yaml` in the same directory for the exact case shape the
 * recording was made against) whose one recorded exchange is a 70-word
 * reply — deliberately rigged to exceed the soul's 60-word verbosity cap
 * (`cts/fixtures/minimal/valid/Soul.md`'s `voice.verbosity: 50` ⇒ R9
 * `maxWords(50) = 60`).
 *
 * This is the mission's own regression-proof harness component: a cassette
 * that MUST fail the graders on replay. The two tests below are load-bearing
 * together, not independently:
 *
 *   1. asserts the real, unmocked replay produces a failing verdict;
 *   2. proves that assertion is not vacuous by stubbing the verbosity grader
 *      to always pass and showing the SAME replay flips to a passing
 *      verdict — i.e. if the real graders module were ever stubbed or
 *      bypassed in production code, test 1 above would go red, because it
 *      always imports the real (unmocked) module.
 *
 * `behave run --cassette ... --replay` (the full CLI path, exercising
 * manifest loading, the static soul gate, `makeCassetteClient` replay mode,
 * `runCase`, and the real graders — IC-04's wiring) is used rather than a
 * bare `readCassetteCase` + grader call, per plan.md IC-05's sequencing
 * note: "the stronger, more representative test."
 */
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/cli/index.js";
import type { RunCliOptions } from "../../src/cli/index.js";
import type { ChatClient, EndpointConfig } from "../../src/core/behavioral/types.js";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const cassetteDir = join(repoRoot, "fixtures", "cassettes", "discrimination-control");
const manifestPath = join(cassetteDir, "manifest.yaml");

/** Replay must never touch a live/injected client (NFR-003) — a client whose
 *  `chat` throws proves any accidental live call fails loudly instead of
 *  silently masking a broken replay path. */
function neverCalledClientFactory(_endpoint: EndpointConfig): ChatClient {
  return {
    async chat() {
      throw new Error(
        "discrimination-control replay must never call a live/injected client (NFR-003)"
      );
    },
  };
}

interface ReplayVerdict {
  id: string;
  passed: boolean;
}

async function replayDiscriminationControl(
  runCliFn: typeof runCli
): Promise<{ code: number; replayed: boolean; verdicts: ReplayVerdict[] }> {
  let stdout = "";
  const opts: RunCliOptions = {
    out: (text) => {
      stdout += text;
    },
    err: () => {
      // Discarded — assertions below only need stdout + exit code.
    },
    clientFactory: neverCalledClientFactory,
  };
  const code = await runCliFn(
    ["behave", "run", manifestPath, "--cassette", cassetteDir, "--replay", "--json"],
    opts
  );
  const parsed = JSON.parse(stdout) as { replayed: boolean; verdicts: ReplayVerdict[] };
  return { code, replayed: parsed.replayed, verdicts: parsed.verdicts };
}

describe("FR-019 / Scenario 14 — discrimination-control cassette", () => {
  it("behave run --cassette fixtures/cassettes/discrimination-control --replay produces a failing verdict", async () => {
    const { code, replayed, verdicts } = await replayDiscriminationControl(runCli);
    expect(replayed).toBe(true);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.id).toBe("rigged-case");
    expect(verdicts[0]?.passed).toBe(false);
    // Normal non-zero failure exit code (D2/FR-013 discipline extended here
    // to a genuine conformance failure, not staleness): never 0.
    expect(code).toBe(1);
  });

  it(
    "is load-bearing: with the verbosity grader stubbed to always pass, the SAME replay " +
      "flips to a passing verdict — proving the failing verdict above is not vacuous",
    async () => {
      vi.resetModules();
      vi.doMock("../../src/core/behavioral/graders.js", async () => {
        const actual = await vi.importActual<
          typeof import("../../src/core/behavioral/graders.js")
        >("../../src/core/behavioral/graders.js");
        return {
          ...actual,
          // A "stubbed/bypassed" grader: reports every verbosity check as
          // passing regardless of measured word count. This is exactly the
          // sabotage shape FR-019 requires the control to catch — if this
          // ever happened to the REAL module (not this test's mock), the
          // test above would observe `passed: true` instead of `false` and
          // fail.
          gradeVerbosity: (
            entry: { wordCount?: number },
            effective: unknown,
            override: number | undefined,
            thresholds: Parameters<typeof actual.verbosityLimit>[2],
            turn: number
          ) => ({
            axis: "verbosity" as const,
            turn,
            measured: entry.wordCount ?? 0,
            limit: actual.verbosityLimit(
              effective as Parameters<typeof actual.verbosityLimit>[0],
              override,
              thresholds
            ),
            passed: true,
          }),
        };
      });
      try {
        const { runCli: mockedRunCli } = await import("../../src/cli/index.js");
        const { code, verdicts } = await replayDiscriminationControl(mockedRunCli);
        expect(verdicts[0]?.passed).toBe(true);
        expect(code).toBe(0);
      } finally {
        vi.doUnmock("../../src/core/behavioral/graders.js");
        vi.resetModules();
      }
    }
  );
});

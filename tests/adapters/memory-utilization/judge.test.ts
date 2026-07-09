/**
 * Unit tests for src/adapters/memory-utilization/judge.ts — the FR-011
 * blinded LLM-judge grader (M-1 mission-review remediation).
 *
 * Fully offline and deterministic (NFR-001): every test injects a scripted
 * mock `ChatClient` — no network, no fetch mocking.
 */

import { describe, expect, it } from "vitest";
import { gradeArmsWithJudge, type ArmResponse } from "../../../src/adapters/memory-utilization/judge.js";
import type { ChatClient, ChatMessage } from "../../../src/core/behavioral/types.js";

const ARMS: ArmResponse[] = [
  { armId: "no-memory", response: "I don't know the failover region." },
  { armId: "with-memory", response: "The production failover region is us-west-2." },
  { armId: "scrambled-memory", response: "The rooftop deck is closed during winter months." },
];

const CRITERION = "The response correctly states the production failover region.";

/** Records every prompt it was called with, and replies with a fixed script. */
function makeRecordingClient(script: (system: string, user: string) => string): {
  client: ChatClient;
  calls: { system: string; user: string }[];
} {
  const calls: { system: string; user: string }[] = [];
  return {
    calls,
    client: {
      async chat(messages: ChatMessage[]) {
        const system = messages.find((m) => m.role === "system")?.content ?? "";
        const user = messages.find((m) => m.role === "user")?.content ?? "";
        calls.push({ system, user });
        return script(system, user);
      },
    },
  };
}

describe("gradeArmsWithJudge — blinding (FR-011, rubric §5.2)", () => {
  it("the judge prompt never contains any real arm identifier", async () => {
    const { client, calls } = makeRecordingClient(
      () => "Answer A: FAIL\nAnswer B: PASS\nAnswer C: FAIL"
    );
    await gradeArmsWithJudge(client, CRITERION, ARMS, "probe-1:0");

    expect(calls).toHaveLength(1);
    const combined = `${calls[0]!.system}\n${calls[0]!.user}`;
    for (const arm of ARMS) {
      expect(combined).not.toContain(arm.armId);
    }
    expect(combined).not.toMatch(/with-memory|no-memory|scrambled-memory/i);
  });

  it("makes exactly ONE judge call grading every arm together (not one call per arm)", async () => {
    const { client, calls } = makeRecordingClient(
      () => "Answer A: PASS\nAnswer B: PASS\nAnswer C: PASS"
    );
    await gradeArmsWithJudge(client, CRITERION, ARMS, "probe-1:0");
    expect(calls).toHaveLength(1);
  });

  it("presents the criterion verbatim and every arm's response content", async () => {
    const { client, calls } = makeRecordingClient(
      () => "Answer A: PASS\nAnswer B: PASS\nAnswer C: PASS"
    );
    await gradeArmsWithJudge(client, CRITERION, ARMS, "probe-1:0");
    const combined = `${calls[0]!.system}\n${calls[0]!.user}`;
    expect(combined).toContain(CRITERION);
    for (const arm of ARMS) {
      expect(combined).toContain(arm.response);
    }
  });
});

describe("gradeArmsWithJudge — verdict mapping", () => {
  it("maps blinded verdicts back to the correct real armId via blindArmOrder's order", async () => {
    // Deterministic labeled-verdict script: whichever content each blind
    // label carries, we can assert against the KNOWN mapping this test
    // constructs (the point is not to guess blindArmOrder's permutation,
    // but to prove gradeArmsWithJudge's own order->armId unblinding is
    // correct for whatever permutation blindArmOrder produces).
    const { client } = makeRecordingClient((_system, user) => {
      // Pass every arm whose content mentions "us-west-2" (a known-correct
      // answer), fail everything else — a criterion-faithful judge script.
      const lines: string[] = [];
      const blockRe = /Answer\s+([A-Za-z0-9]+):\n([\s\S]*?)(?=\n\nAnswer\s+[A-Za-z0-9]+:|\n\nFor each)/g;
      for (const match of user.matchAll(blockRe)) {
        const label = match[1]!;
        const content = match[2]!;
        lines.push(`Answer ${label}: ${content.includes("us-west-2") ? "PASS" : "FAIL"}`);
      }
      return lines.join("\n");
    });

    const verdicts = await gradeArmsWithJudge(client, CRITERION, ARMS, "probe-1:0");
    const byArm = new Map(verdicts.map((v) => [v.armId, v.passed]));

    expect(byArm.get("with-memory")).toBe(true);
    expect(byArm.get("no-memory")).toBe(false);
    expect(byArm.get("scrambled-memory")).toBe(false);
    expect(verdicts).toHaveLength(3);
  });

  it("is deterministic: the same (arms, criterion, seed) and a fixed judge script always yield the same verdicts", async () => {
    const script = (): string => "Answer A: PASS\nAnswer B: FAIL\nAnswer C: PASS";
    const { client: client1 } = makeRecordingClient(script);
    const { client: client2 } = makeRecordingClient(script);

    const first = await gradeArmsWithJudge(client1, CRITERION, ARMS, "probe-42:3");
    const second = await gradeArmsWithJudge(client2, CRITERION, ARMS, "probe-42:3");
    expect(second).toEqual(first);
  });

  it("a label the judge's reply never mentions defaults to FAIL (conservative, FR-009)", async () => {
    const { client } = makeRecordingClient(() => "Answer A: PASS"); // omits B and C entirely
    const verdicts = await gradeArmsWithJudge(client, CRITERION, ARMS, "probe-1:0");
    const passCount = verdicts.filter((v) => v.passed).length;
    // Exactly one label was ever mentioned; the other two arms must fail.
    expect(passCount).toBe(1);
    expect(verdicts).toHaveLength(3);
  });

  it("accepts a dash separator and is case-insensitive for the PASS/FAIL token", async () => {
    const { client } = makeRecordingClient(() => "answer a - pass\nANSWER B - fail\nAnswer C: Pass");
    const verdicts = await gradeArmsWithJudge(client, CRITERION, ARMS, "probe-1:0");
    expect(verdicts.filter((v) => v.passed)).toHaveLength(2);
  });

  it("ignores a verdict line for a label that was never presented (hallucinated/extra label)", async () => {
    const { client } = makeRecordingClient(
      () => "Answer A: PASS\nAnswer B: FAIL\nAnswer C: PASS\nAnswer D: PASS"
    );
    const verdicts = await gradeArmsWithJudge(client, CRITERION, ARMS, "probe-1:0");
    // Only the 3 presented arms are ever returned — the hallucinated "Answer D"
    // line does not spuriously appear or affect the real labels' verdicts.
    expect(verdicts).toHaveLength(3);
    expect(verdicts.filter((v) => v.passed)).toHaveLength(2);
  });
});

describe("gradeArmsWithJudge — FR-009 (errored run counts as a failed run)", () => {
  it("a judge call that throws fails EVERY arm in that call, never skipped/retried", async () => {
    const client: ChatClient = {
      chat: async () => {
        throw new Error("simulated endpoint error");
      },
    };
    const verdicts = await gradeArmsWithJudge(client, CRITERION, ARMS, "probe-1:0");
    expect(verdicts).toHaveLength(3);
    expect(verdicts.every((v) => !v.passed)).toBe(true);
  });

  it("returns [] and makes no judge call when there are no gradable arms", async () => {
    const { client, calls } = makeRecordingClient(() => "Answer A: PASS");
    const verdicts = await gradeArmsWithJudge(client, CRITERION, [], "probe-1:0");
    expect(verdicts).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("gradeArmsWithJudge — rigged-impossible discrimination control (charter: every grader ships one)", () => {
  it("a judge forced to PASS an obviously-wrong response reports that PASS faithfully (no silent override) — the case-level cap-of-zero/scrambled-control guards, not this function, are what must catch a broken judge", async () => {
    // A deliberately dishonest/broken judge script: PASS everything
    // regardless of content, even an obviously-wrong response ("I don't
    // know" against a criterion demanding a specific fact). This proves
    // gradeArmsWithJudge does not itself second-guess or launder the
    // judge's verdict — it reports exactly what the judge says, so that the
    // adapter's OWN discrimination controls (cap-of-zero, scrambled-memory
    // negative control — controls.ts) are what must and do catch a
    // rigged/broken judge at the case level (see index.test.ts's dedicated
    // rigged-judge cap-of-zero integration test).
    const { client } = makeRecordingClient(() => "Answer A: PASS\nAnswer B: PASS\nAnswer C: PASS");
    const obviouslyWrongArms: ArmResponse[] = [
      { armId: "no-memory", response: "I have absolutely no idea." },
      { armId: "with-memory", response: "I have absolutely no idea." },
      { armId: "scrambled-memory", response: "I have absolutely no idea." },
    ];
    const verdicts = await gradeArmsWithJudge(client, CRITERION, obviouslyWrongArms, "probe-1:0");
    expect(verdicts.every((v) => v.passed)).toBe(true);
  });
});

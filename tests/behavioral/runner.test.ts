import { mkdtemp, writeFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSoul, type CheckResult } from "../../src/core/pipeline.js";
import { rfc1Adapter } from "../../src/adapters/rfc1/index.js";
import { EmptyResponseError, makeClient } from "../../src/core/behavioral/client.js";
import {
  isBehavioralManifestError,
  loadBehavioralManifest,
} from "../../src/core/behavioral/manifest.js";
import {
  personaPrompt,
  runCase,
  type RunnerOptions,
} from "../../src/core/behavioral/runner.js";
import type {
  BehavioralCase,
  ChatClient,
  ChatMessage,
} from "../../src/core/behavioral/types.js";
import type { Violation } from "../../src/core/report.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Valid RFC-1 soul with a friendly→cold_strict state machine (§20). Base
 *  voice.verbosity 50 ⇒ R9 maxWords 60; cold_strict verbosity 0 ⇒ 10. */
function soulRaw(triggerDuration: "session" | "message"): string {
  return `---
soul_spec: "1.0.0-rc1"
id: "org.example.behave.frontdesk"
name: "Frontdesk"
locale: "en"

composition:
  extends: []
  mixins: []
  merge_policy: standard

profiles: ["default"]
profile_overrides: {}

values:
  priorities: ["accuracy", "clarity", "safety", "speed"]

voice:
  formality: 60
  warmth: 70
  verbosity: 50
  jargon: 20
  formatting: minimal

interaction:
  clarifying_questions: when_ambiguous
  uncertainty: explicit
  disagreement: neutral
  confirmations: implicit

safety:
  refusal_style: brief
  privacy: strict
  speculation: mark

state:
  base: friendly
  states:
    friendly:
      voice:
        warmth: 80
    cold_strict:
      voice:
        verbosity: 0
        warmth: 0
  triggers:
    - if: "user.rude"
      shift_to: cold_strict
      duration: ${triggerDuration}

extensions: {}
---

# Frontdesk

Behavioral substrate for runner tests.
`;
}

const noRefs = async (): Promise<Violation[]> => [
  { path: "composition", message: "tests load no refs", severity: "error" },
];

async function check(raw: string): Promise<CheckResult> {
  const result = await checkSoul(
    rfc1Adapter,
    raw,
    "/virtual/Soul.md",
    { mode: "strict" },
    noRefs
  );
  expect(result.report.ok).toBe(true);
  expect(result.effective).not.toBeNull();
  return result;
}

function wordsOf(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
}

interface RecordedCall {
  messages: ChatMessage[];
  opts: { temperature?: number };
}

/** Scripted client: one canned reply (or Error) per call index. */
function scriptedClient(replies: (string | Error)[]): {
  client: ChatClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let index = 0;
  const client: ChatClient = {
    async chat(messages, opts) {
      calls.push({ messages: messages.map((m) => ({ ...m })), opts: { ...opts } });
      const reply = replies[index++];
      if (reply === undefined) throw new Error("scripted client exhausted");
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { client, calls };
}

const runnerOpts: RunnerOptions = {
  model: "test-model",
  baseUrl: "http://localhost:9999/v1",
  temperature: "default",
};

function verbosityCase(partial?: Partial<BehavioralCase>): BehavioralCase {
  return {
    id: "verbosity_case",
    soul: "/virtual/Soul.md",
    turns: [{ role: "user", content: "Hi, what are your opening hours?" }],
    axes: [{ axis: "verbosity", turns: "all" }],
    runs: 3,
    pass_threshold: 2,
    overrides: { max_words: 5 },
    ...partial,
  };
}

// ─── k-of-n grading (FR-022) ─────────────────────────────────────────────────

describe("FR-022 k-of-n grading", () => {
  it("FR-022 2-of-3 with [pass, fail, pass] → case passes; per-run verdicts recorded", async () => {
    const soulCheck = await check(soulRaw("session"));
    const { client } = scriptedClient([wordsOf(3), wordsOf(9), wordsOf(4)]);
    const verdict = await runCase(rfc1Adapter, soulCheck, verbosityCase(), client, runnerOpts);

    expect(verdict.passed).toBe(true);
    expect(verdict.passCount).toBe(2);
    expect(verdict.runs.map((run) => run.passed)).toEqual([true, false, true]);
    expect(verdict.runs[1]?.axes[0]).toMatchObject({ measured: 9, limit: 5, passed: false });
  });

  it("FR-022 [pass, error, fail] → case fails; the errored run counts as failed and records the error", async () => {
    const soulCheck = await check(soulRaw("session"));
    const { client } = scriptedClient([wordsOf(3), new Error("connection reset"), wordsOf(9)]);
    const verdict = await runCase(rfc1Adapter, soulCheck, verbosityCase(), client, runnerOpts);

    expect(verdict.passed).toBe(false);
    expect(verdict.passCount).toBe(1);
    expect(verdict.runs[1]?.passed).toBe(false);
    expect(verdict.runs[1]?.error).toContain("connection reset");
    expect(verdict.runs[1]?.axes).toEqual([]);
    // The errored run still has a (partial) transcript (FR-023).
    expect(verdict.runs[1]?.transcript.model).toBe("test-model");
  });

  it("FR-022 n/k come from the case (manifest defaulting upstream): runs:1/pass_threshold:1 calls the client once", async () => {
    const soulCheck = await check(soulRaw("session"));
    const { client, calls } = scriptedClient([wordsOf(2)]);
    const verdict = await runCase(
      rfc1Adapter,
      soulCheck,
      verbosityCase({ runs: 1, pass_threshold: 1 }),
      client,
      runnerOpts
    );
    expect(calls).toHaveLength(1);
    expect(verdict.passed).toBe(true);
    expect(verdict.runs).toHaveLength(1);
  });

  it("runCase refuses to grade against a non-resolving soul (effective null)", async () => {
    const broken = await checkSoul(rfc1Adapter, "not a soul", "/virtual/Soul.md", { mode: "strict" }, noRefs);
    expect(broken.effective).toBeNull();
    const { client } = scriptedClient([]);
    await expect(
      runCase(rfc1Adapter, broken, verbosityCase(), client, runnerOpts)
    ).rejects.toThrow(/did not resolve/);
  });
});

// ─── TEC-1 timing (§20.3) ────────────────────────────────────────────────────

describe("§20.3.4 state application timing (the correctness crux)", () => {
  const twoTurnCase: BehavioralCase = {
    id: "rude_shift",
    soul: "/virtual/Soul.md",
    turns: [
      { role: "user", content: "Hello, I need to change my booking." },
      { role: "user", content: "You are useless. Just do it!", facts: { "user.rude": true } },
    ],
    axes: [{ axis: "verbosity", turns: "all" }],
    runs: 1,
    pass_threshold: 1,
  };

  it("§20.3.4 facts at turn 1 shift state BEFORE reply 1's grading; turn 0 graded under base state", async () => {
    const soulCheck = await check(soulRaw("session"));
    expect(soulCheck.report.state).toBe("friendly");
    // Both replies are 20 words: ≤ 60 under friendly (verbosity 50), > 10
    // under cold_strict (verbosity 0) — the SAME reply length discriminates
    // purely on which state's threshold applied.
    const { client } = scriptedClient([wordsOf(20), wordsOf(20)]);
    const verdict = await runCase(rfc1Adapter, soulCheck, twoTurnCase, client, runnerOpts);

    const grades = verdict.runs[0]?.axes ?? [];
    expect(grades[0]).toMatchObject({ turn: 0, measured: 20, limit: 60, passed: true });
    expect(grades[1]).toMatchObject({ turn: 1, measured: 20, limit: 10, passed: false });
  });

  it("§20.3.1 OnUserMessage: the shifted persona is appended to the conversation before the same turn's request", async () => {
    const soulCheck = await check(soulRaw("session"));
    const { client, calls } = scriptedClient([wordsOf(5), wordsOf(5)]);
    await runCase(rfc1Adapter, soulCheck, twoTurnCase, client, runnerOpts);

    // Call 0: system persona + user turn 0. No state-change note yet.
    expect(calls[0]?.messages.filter((m) => m.role === "system")).toHaveLength(1);
    // Call 1: a system state-change note appears BEFORE the turn-1 user message.
    const second = calls[1]?.messages ?? [];
    const noteIndex = second.findIndex(
      (m) => m.role === "system" && m.content.includes('state changed to "cold_strict"')
    );
    const userIndex = second.findIndex((m) => m.content.includes("You are useless"));
    expect(noteIndex).toBeGreaterThan(0);
    expect(userIndex).toBeGreaterThan(noteIndex);
    // History is appended to, never rewritten: original persona still first.
    expect(second[0]?.content).toBe(calls[0]?.messages[0]?.content);
  });

  it("FR-021 state_shift axis passes when the trigger fired and post-shift verbosity used shifted thresholds", async () => {
    const soulCheck = await check(soulRaw("session"));
    const { client } = scriptedClient([wordsOf(5), wordsOf(5)]);
    const kase: BehavioralCase = {
      ...twoTurnCase,
      axes: [
        { axis: "verbosity", turns: "all" },
        { axis: "state_shift", trigger_turn: 1, expect_state: "cold_strict" },
      ],
    };
    const verdict = await runCase(rfc1Adapter, soulCheck, kase, client, runnerOpts);
    const shift = verdict.runs[0]?.axes.find((g) => g.axis === "state_shift");
    expect(shift).toMatchObject({
      turn: 1,
      measured: "cold_strict",
      limit: "cold_strict",
      passed: true,
    });
    expect(verdict.passed).toBe(true);
  });

  it("FR-021 state_shift axis fails when the facts do not match the trigger (no shift observed)", async () => {
    const soulCheck = await check(soulRaw("session"));
    const { client } = scriptedClient([wordsOf(5), wordsOf(5)]);
    const kase: BehavioralCase = {
      ...twoTurnCase,
      turns: [
        twoTurnCase.turns[0] as BehavioralCase["turns"][number],
        { role: "user", content: "Please hurry.", facts: { "user.rude": false } },
      ],
      axes: [{ axis: "state_shift", trigger_turn: 1, expect_state: "cold_strict" }],
    };
    const verdict = await runCase(rfc1Adapter, soulCheck, kase, client, runnerOpts);
    const shift = verdict.runs[0]?.axes[0];
    expect(shift?.passed).toBe(false);
    expect(shift?.measured).toBe("friendly");
    expect(verdict.passed).toBe(false);
  });
});

describe("§20.3.5 duration semantics", () => {
  it('§20.3.5 `duration: message` reverts to base BEFORE the next turn\'s evaluation; `session` persists', async () => {
    const threeTurns: BehavioralCase = {
      id: "duration_check",
      soul: "/virtual/Soul.md",
      turns: [
        { role: "user", content: "Hello." },
        { role: "user", content: "You are useless!", facts: { "user.rude": true } },
        { role: "user", content: "What time do you open?" },
      ],
      axes: [{ axis: "verbosity", turns: "all" }],
      runs: 1,
      pass_threshold: 1,
    };

    // duration: message — turn 2 is evaluated back under "friendly" (limit 60).
    const messageSoul = await check(soulRaw("message"));
    const scriptedA = scriptedClient([wordsOf(5), wordsOf(5), wordsOf(20)]);
    const reverted = await runCase(rfc1Adapter, messageSoul, threeTurns, scriptedA.client, runnerOpts);
    const gradesA = reverted.runs[0]?.axes ?? [];
    expect(gradesA.map((g) => g.limit)).toEqual([60, 10, 60]);
    const states = reverted.runs[0]?.transcript.entries
      .filter((e) => e.role === "assistant")
      .map((e) => e.activeState);
    expect(states).toEqual(["friendly", "cold_strict", "friendly"]);
    // The reversion is announced via an appended system note (honest transcripts).
    const lastCall = scriptedA.calls[2]?.messages ?? [];
    expect(lastCall.some((m) => m.role === "system" && m.content.includes("state reverted"))).toBe(true);

    // duration: session — the shift persists through turn 2 (limit stays 10).
    const sessionSoul = await check(soulRaw("session"));
    const scriptedB = scriptedClient([wordsOf(5), wordsOf(5), wordsOf(20)]);
    const persisted = await runCase(rfc1Adapter, sessionSoul, threeTurns, scriptedB.client, runnerOpts);
    expect((persisted.runs[0]?.axes ?? []).map((g) => g.limit)).toEqual([60, 10, 10]);
  });
});

// ─── Transcripts (FR-023) and temperature handling (C-009) ───────────────────

describe("FR-023 transcript completeness", () => {
  it('FR-023 transcript carries model, baseUrl, temperature ("default" when omitted), duration, per-entry activeState', async () => {
    const soulCheck = await check(soulRaw("session"));
    const { client } = scriptedClient([wordsOf(3)]);
    const verdict = await runCase(
      rfc1Adapter,
      soulCheck,
      verbosityCase({ runs: 1, pass_threshold: 1 }),
      client,
      runnerOpts
    );
    const transcript = verdict.runs[0]?.transcript;
    expect(transcript?.model).toBe("test-model");
    expect(transcript?.baseUrl).toBe("http://localhost:9999/v1");
    expect(transcript?.temperature).toBe("default");
    expect(transcript?.durationMs).toBeGreaterThanOrEqual(0);
    expect(transcript?.entries).toHaveLength(2); // user + assistant
    for (const entry of transcript?.entries ?? []) {
      expect(typeof entry.activeState).toBe("string");
      expect(entry.activeState).toBe("friendly");
    }
    const assistant = transcript?.entries[1];
    expect(assistant?.role).toBe("assistant");
    expect(assistant?.wordCount).toBe(3);
  });

  it("C-009 temperature: omitted from chat opts when \"default\"; forwarded verbatim when numeric", async () => {
    const soulCheck = await check(soulRaw("session"));

    const a = scriptedClient([wordsOf(3)]);
    await runCase(rfc1Adapter, soulCheck, verbosityCase({ runs: 1, pass_threshold: 1 }), a.client, runnerOpts);
    expect("temperature" in (a.calls[0]?.opts ?? {})).toBe(false);

    const b = scriptedClient([wordsOf(3)]);
    const warm: RunnerOptions = { ...runnerOpts, temperature: 0.2 };
    const verdict = await runCase(
      rfc1Adapter,
      soulCheck,
      verbosityCase({ runs: 1, pass_threshold: 1 }),
      b.client,
      warm
    );
    expect(b.calls[0]?.opts.temperature).toBe(0.2);
    expect(verdict.runs[0]?.transcript.temperature).toBe(0.2);
  });
});

// ─── personaPrompt determinism (NFR-001 spirit) ──────────────────────────────

describe("personaPrompt rendering", () => {
  it("NFR-001 deterministic: identical inputs render byte-identical prompts with the soul's axes", async () => {
    const soulCheck = await check(soulRaw("session"));
    const effective = soulCheck.effective ?? {};
    const first = personaPrompt(effective, { activeState: "friendly", maxWords: 60 });
    const second = personaPrompt(effective, { activeState: "friendly", maxWords: 60 });
    expect(first).toBe(second);
    expect(first).toContain("Frontdesk");
    expect(first).toContain("verbosity 50");
    expect(first).toContain("at most 60 words");
    expect(first).toContain("refusal style: brief");
    expect(first).toContain("Current mood state: friendly");
    expect(first).toContain("accuracy, clarity, safety, speed");
  });
});

// ─── OpenAI-compatible client (T033 request-shape, mocked fetch only) ────────

describe("C-006 makeClient (mocked fetch — no real network)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const endpoint = {
    baseUrl: "http://localhost:9999/v1",
    model: "test-model",
    apiKeyEnv: "MUSTER_API_KEY" as const,
  };
  const messages: ChatMessage[] = [{ role: "user", content: "hi" }];

  function okResponse(content: string): Response {
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  it("C-009 temperature omitted entirely from the request body when not supplied", async () => {
    const fetchMock = vi.fn(async () => okResponse("hello"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MUSTER_API_KEY", undefined);

    await makeClient(endpoint).chat(messages, {});
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:9999/v1/chat/completions");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body["model"]).toBe("test-model");
    expect(body["messages"]).toEqual(messages);
    expect("temperature" in body).toBe(false);

    await makeClient(endpoint).chat(messages, { temperature: 0 });
    const [, second] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect((JSON.parse(String(second.body)) as Record<string, unknown>)["temperature"]).toBe(0);
  });

  it("directive 5: Authorization sent ONLY when the env var is set; key read at call time", async () => {
    const fetchMock = vi.fn(async () => okResponse("hello"));
    vi.stubGlobal("fetch", fetchMock);

    vi.stubEnv("MUSTER_API_KEY", undefined);
    const client = makeClient(endpoint); // constructed BEFORE the key exists
    await client.chat(messages, {});
    const noKey = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((noKey.headers as Record<string, string>)["authorization"]).toBeUndefined();

    vi.stubEnv("MUSTER_API_KEY", "sk-secret-test");
    await client.chat(messages, {});
    const withKey = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect((withKey.headers as Record<string, string>)["authorization"]).toBe("Bearer sk-secret-test");
  });

  it("FR-022 empty/missing choices[0].message.content → EmptyResponseError", async () => {
    vi.stubEnv("MUSTER_API_KEY", undefined);
    vi.stubGlobal("fetch", vi.fn(async () => okResponse("")));
    await expect(makeClient(endpoint).chat(messages, {})).rejects.toBeInstanceOf(EmptyResponseError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }))
    );
    await expect(makeClient(endpoint).chat(messages, {})).rejects.toBeInstanceOf(EmptyResponseError);
  });

  it("error hygiene: HTTP failures cite hostname + status + body excerpt — never the API key or headers", async () => {
    vi.stubEnv("MUSTER_API_KEY", "sk-secret-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("model overloaded", { status: 503 }))
    );
    const failure = await makeClient(endpoint)
      .chat(messages, {})
      .then(() => null, (error: unknown) => error as Error);
    expect(failure).not.toBeNull();
    expect(failure?.message).toContain("localhost:9999");
    expect(failure?.message).toContain("503");
    expect(failure?.message).toContain("model overloaded");
    expect(failure?.message).not.toContain("sk-secret-test");
    expect(failure?.message).not.toContain("Bearer");
  });

  it("network errors cite the endpoint hostname, not the full URL", async () => {
    vi.stubEnv("MUSTER_API_KEY", undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );
    const failure = await makeClient({ ...endpoint, baseUrl: "http://localhost:9999/v1?token=x" })
      .chat(messages, {})
      .then(() => null, (error: unknown) => error as Error);
    expect(failure?.message).toContain("localhost:9999");
    expect(failure?.message).toContain("ECONNREFUSED");
    expect(failure?.message).not.toContain("token=x");
  });
});

// ─── Source hygiene (C-004, directive 5) ─────────────────────────────────────

describe("C-004 / directive 5 source hygiene", () => {
  const behavioralDir = new URL("../../src/core/behavioral/", import.meta.url);
  const sources = readdirSync(behavioralDir).filter((file) => file.endsWith(".ts"));

  it("zero process.env reads outside client.ts (directive 5)", () => {
    expect(sources.length).toBeGreaterThanOrEqual(5);
    for (const file of sources) {
      const source = readFileSync(new URL(file, behavioralDir), "utf8");
      if (file === "client.ts") {
        expect(source).toContain("process.env");
      } else {
        expect(source.includes("process.env"), `${file} must not read process.env`).toBe(false);
      }
    }
  });

  it("C-004: src/core/behavioral/ imports nothing from src/adapters/ (adapter arrives as a parameter)", () => {
    for (const file of sources) {
      const source = readFileSync(new URL(file, behavioralDir), "utf8");
      expect(source.includes("adapters"), `${file} must not mention the adapters directory`).toBe(false);
      for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
        const specifier = match[1] ?? "";
        expect(
          specifier.startsWith("./") ||
            specifier.startsWith("../") ||
            specifier.startsWith("node:") ||
            specifier === "yaml", // manifest parsing dependency, same as core/cts
          `${file} imports ${specifier}`
        ).toBe(true);
      }
    }
  });
});

// ─── Behavioral manifest loader (contracts/behavioral-manifest.md) ───────────

describe("behavioral manifest loader (C-005 multi-turn format)", () => {
  async function writeManifest(content: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "muster-behave-"));
    const path = join(dir, "manifest.yaml");
    await writeFile(path, content, "utf8");
    return path;
  }

  const validManifest = `
endpoint:
  base_url: "http://localhost:11434/v1"
  model: "qwen2.5:7b-instruct"

defaults:
  runs: 3
  pass_threshold: 2
  temperature: default

cases:
  - id: verbosity_spoken_length
    soul: "../souls/voice-frontdesk/Soul.md"
    turns:
      - content: "Hi, what are your opening hours?"
      - content: "And can I bring my dog?"
    axes:
      - axis: verbosity
        turns: all

  - id: rude_shift_cold_strict
    soul: "./Soul.md"
    runs: 5
    pass_threshold: 4
    turns:
      - content: "Hello, I need to change my booking."
      - content: "You are useless. Just do it!"
        facts: { user.rude: true }
    axes:
      - axis: state_shift
        trigger_turn: 1
        expect_state: cold_strict
      - axis: refusal
        turn: 0
        assertions:
          - kind: must_not_contain
            pattern: "\\\\$?\\\\d+([.,]\\\\d+)?"
            regex: true
    overrides:
      max_words: 30
`;

  it("contract: valid manifest loads; defaults applied; soul paths absolute; facts and axes parsed", async () => {
    const path = await writeManifest(validManifest);
    const result = await loadBehavioralManifest(path);
    expect(isBehavioralManifestError(result)).toBe(false);
    if (isBehavioralManifestError(result)) return;

    expect(result.endpoint).toEqual({
      baseUrl: "http://localhost:11434/v1",
      model: "qwen2.5:7b-instruct",
      apiKeyEnv: "MUSTER_API_KEY",
    });
    expect(result.defaults).toEqual({ runs: 3, pass_threshold: 2, temperature: "default" });

    const [first, second] = result.cases;
    expect(first?.runs).toBe(3); // manifest defaults
    expect(first?.pass_threshold).toBe(2);
    expect(isAbsolute(first?.soul ?? "")).toBe(true);
    expect(second?.runs).toBe(5); // case override (FR-022 n/k)
    expect(second?.pass_threshold).toBe(4);
    expect(second?.turns[1]?.facts).toEqual({ "user.rude": true });
    expect(second?.overrides).toEqual({ max_words: 30 });
    expect(second?.axes[0]).toEqual({
      axis: "state_shift",
      trigger_turn: 1,
      expect_state: "cold_strict",
    });
    expect(second?.axes[1]).toMatchObject({
      axis: "refusal",
      turn: 0,
      assertions: [{ kind: "must_not_contain", pattern: "\\$?\\d+([.,]\\d+)?", regex: true }],
    });
  });

  it("contract: unknown fields are errors (manifests are strict)", async () => {
    const path = await writeManifest(validManifest.replace("defaults:", "surprise: 1\ndefaults:"));
    const result = await loadBehavioralManifest(path);
    expect(isBehavioralManifestError(result)).toBe(true);
    if (!isBehavioralManifestError(result)) return;
    expect(result.some((v) => v.path === "manifest.surprise" && v.message.includes("unknown field"))).toBe(true);
  });

  it("FR-022 pass_threshold > runs is rejected (the case could never pass)", async () => {
    const path = await writeManifest(
      validManifest.replace("runs: 5\n    pass_threshold: 4", "runs: 2\n    pass_threshold: 3")
    );
    const result = await loadBehavioralManifest(path);
    expect(isBehavioralManifestError(result)).toBe(true);
    if (!isBehavioralManifestError(result)) return;
    expect(result.some((v) => v.message.includes("could never pass"))).toBe(true);
  });

  it("axis turn references are bounds-checked against the case's turns", async () => {
    const path = await writeManifest(validManifest.replace("trigger_turn: 1", "trigger_turn: 7"));
    const result = await loadBehavioralManifest(path);
    expect(isBehavioralManifestError(result)).toBe(true);
    if (!isBehavioralManifestError(result)) return;
    expect(result.some((v) => v.path.includes("trigger_turn"))).toBe(true);
  });

  it("directive 5: api_key_env limited to MUSTER_API_KEY / OPENAI_API_KEY — never a key value", async () => {
    const path = await writeManifest(
      validManifest.replace('model: "qwen2.5:7b-instruct"', 'model: "m"\n  api_key_env: "MY_SECRET"')
    );
    const result = await loadBehavioralManifest(path);
    expect(isBehavioralManifestError(result)).toBe(true);
    if (!isBehavioralManifestError(result)) return;
    expect(result.some((v) => v.path === "endpoint.api_key_env")).toBe(true);
  });
});

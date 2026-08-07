/**
 * FR-005: the request hash MUST be computed over the canonical-JSON form of
 * the fully-built request, post any blinding/arm-ordering transform — never
 * over a pre-blinding logical probe identity.
 *
 * Scenario 4 (spec.md): a probe whose request passes through `blindArmOrder`
 * before being sent to the client; two calls with the same post-transform
 * request but different pre-transform probe/arm identities MUST collide
 * under one hash key. This module proves it directly against the real
 * `blindArmOrder` (`src/adapters/memory-utilization/rubric.ts:234`), not a
 * stand-in.
 */
import { describe, expect, it } from "vitest";
import { computeRequestHash } from "../../src/core/cassette/hash.js";
import { blindArmOrder, type ArmPayload } from "../../src/adapters/memory-utilization/rubric.js";
import type { CassetteChatRequest, CassetteToolRequest } from "../../src/core/cassette/types.js";

describe("computeRequestHash", () => {
  it("is deterministic: identical requests hash identically", () => {
    const req: CassetteChatRequest = {
      messages: [{ role: "user", content: "hi" }],
      opts: {},
    };
    const same: CassetteChatRequest = {
      messages: [{ role: "user", content: "hi" }],
      opts: {},
    };
    expect(computeRequestHash(req)).toBe(computeRequestHash(same));
  });

  it("is a hex sha256 digest (64 lowercase hex chars)", () => {
    const hash = computeRequestHash({ messages: [], opts: {} });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs when request content differs", () => {
    const a = computeRequestHash({ messages: [{ role: "user", content: "hi" }], opts: {} });
    const b = computeRequestHash({ messages: [{ role: "user", content: "bye" }], opts: {} });
    expect(a).not.toBe(b);
  });

  it("chat and chatWithTools requests over the same messages hash differently (FR-011: no collision by construction)", () => {
    const chatReq: CassetteChatRequest = { messages: [{ role: "user", content: "hi" }], opts: {} };
    const toolReq: CassetteToolRequest = { messages: [{ role: "user", content: "hi" }], tools: [] };
    expect(computeRequestHash(chatReq)).not.toBe(computeRequestHash(toolReq));
  });

  it("is insensitive to key insertion order (canonical JSON key sort, C-003)", () => {
    const a = computeRequestHash({ opts: { temperature: 0.5 }, messages: [{ role: "user", content: "hi" }] } as CassetteChatRequest);
    const b = computeRequestHash({ messages: [{ role: "user", content: "hi" }], opts: { temperature: 0.5 } });
    expect(a).toBe(b);
  });

  it("FR-005 / Scenario 4: hashes blindArmOrder's post-transform presentation, not pre-transform arm identity", () => {
    // Two logically distinct probes: same arm *content*, different arm
    // *identity* (armId). A hash computed over the pre-transform identity
    // would treat these as two distinct request keys.
    const armsA: ArmPayload<string>[] = [
      { armId: "with-memory", content: "The answer is 42." },
      { armId: "no-memory", content: "The answer is unknown." },
    ];
    const armsB: ArmPayload<string>[] = [
      { armId: "control-group", content: "The answer is 42." },
      { armId: "treatment-group", content: "The answer is unknown." },
    ];
    const seed = "probe-42:run-1";

    const blindedA = blindArmOrder(armsA, seed);
    const blindedB = blindArmOrder(armsB, seed);

    // Post-transform request: built only from the blinded presentation
    // (blindLabel + content — armId is structurally absent from
    // `BlindedArm`). Same seed + same content-set => identical presentation
    // regardless of differing pre-transform armId identities.
    const postTransformRequest = (
      presentation: typeof blindedA.presentation
    ): CassetteChatRequest => ({
      messages: presentation.map((p) => ({
        role: "user" as const,
        content: `${p.blindLabel}: ${p.content}`,
      })),
      opts: {},
    });

    const hashA = computeRequestHash(postTransformRequest(blindedA.presentation));
    const hashB = computeRequestHash(postTransformRequest(blindedB.presentation));
    expect(hashA).toBe(hashB);

    // Falsification: hashing the PRE-transform identity (armId included)
    // instead produces two distinct keys — the exact failure mode FR-005
    // rules out. This proves the collision above is not an accident of the
    // fixture but genuinely depends on hashing the post-transform form.
    const preTransformRequest = (arms: readonly ArmPayload<string>[]): CassetteChatRequest => ({
      messages: arms.map((a) => ({ role: "user" as const, content: `${a.armId}: ${a.content}` })),
      opts: {},
    });
    const preHashA = computeRequestHash(preTransformRequest(armsA));
    const preHashB = computeRequestHash(preTransformRequest(armsB));
    expect(preHashA).not.toBe(preHashB);
  });

  it("throws for values canonicalJson cannot represent (propagates from canonicalJson, C-003)", () => {
    expect(() =>
      computeRequestHash({ messages: [], opts: { bad: undefined as unknown as string } })
    ).toThrow(TypeError);
  });
});

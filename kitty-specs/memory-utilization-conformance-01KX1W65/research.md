# muster — Memory-Utilization / Learning-Lift Conformance: Research Findings

**Status:** pre-spec research. Feeds a spec-kitty run (charter → specify → plan → tasks) for a
new conformance capability. Nothing here is locked except the scope guard (§8) and the carried-over
muster constraints (§7).

**Method & confidence convention.** Two streams: (1) an **internal** read-only sweep of muster's own
source (five agents, grounded to `file:line`); (2) an **external** deep-research pass (108 agents,
6 search angles, 25 sources fetched, 114 claims extracted, **21 confirmed / 4 refuted** by 3-vote
adversarial verification). Claims below are tagged:
- **[V]** externally verified (2–3 adversarial votes confirmed);
- **[S]** surfaced by search but *not* in the verified top-set (a lead, treat as unconfirmed);
- **[C]** grounded in muster's code;
- **[R]** muster's own design rationale/inference — **not** an upstream claim (called out honestly, per
  the research pass's own caveat that "gap" and "must assert X" statements are design inferences).

Every external source is flagged **NORMATIVE** (RFC/ISO/W3C/IETF), **CONVENTION** (documented but
vendor/community), or **RESEARCH** (paper/preprint). This matters because of muster's cite-a-source rule.

---

## 1. Headline finding

**[V] No existing evaluation harness delivers what this capability would: a *non-runtime* conformance
check that stages *file-declared* agent memory as a fixture and measures a *controlled learning-lift
delta* with negative controls and contamination checks. That absence is the concrete gap muster fills.**

The reframe that makes it tractable (established across the prior conversation, restated here as the
spec's framing): "test self-learning" splits into three targets, and only the first fits muster's nature.

| Tier | Question | Fit | Verdict |
|---|---|---|---|
| **1 — Memory-utilization / learning-lift** | *Given memory fixture M, does behavior improve in the declared direction vs. without it, beyond noise and controls?* | Stages M as a fixture; asserts on transcripts; never operates the agent | **RECOMMENDED** |
| 2 — Learning-curve | *Does behavior improve monotonically as M grows M0→…→Mn?* | Fixture *sequence*; still non-runtime | Later; generalizes Tier 1 |
| 3 — Autonomous self-learning | *Does the agent, driving its own read/write loop over episodes, improve?* | Requires hosting a live agent that rewrites its own state | **OUT — breaks the runtime scope guard; spin out if ever wanted** |

---

## 2. External landscape (cited)

### 2.1 Prior art and the precise gap — [V]
- **DeepEval — Knowledge Retention** (`https://deepeval.com/docs/metrics-knowledge-retention`) —
  **CONVENTION/tool.** Tests only whether facts are retained **within a single multi-turn
  conversation** (reference-less; one `ConversationalTestCase`; no baseline-vs-condition pairing). No
  cross-session/longitudinal scope, no before/after lift.
- **UK AISI Inspect** (`https://inspect.aisi.org.uk/`) — **CONVENTION/tool.** Provides genuine
  LLM-as-judge scoring infra (`model_graded_qa()`, multi-model majority vote) — reusable *grading*
  machinery — but its own capability overview names **no** memory, longitudinal, before/after-delta, or
  contamination/negative-control capability. Its "memory" is intra-run working state; "checkpointing"
  is resume/resilience — neither is cross-session learning measurement.
- **Refuted / do-not-rely (0–3, 1–2):** three stronger DeepEval "multi-turn guide" claims were killed
  in verification — do **not** assert DeepEval has (or lacks) more than the Knowledge Retention metric
  documents.
- **[V] Ecosystem caveat — do not overstate the gap:** Letta separately ships *Letta Evals: "Evaluating
  Agents That Learn"* and a *Letta Memory Benchmark* built **on top of `.af`**. Those are
  **runtime-coupled**. The gap muster fills is specific to **non-runtime, bring-your-own-model,
  file-declared** conformance — not "nobody measures agent learning."

### 2.2 Normative sources — there is **no standard** — [V]
- **[V] There is NO true normative standard (RFC/ISO/IETF/W3C) for either agent-memory files or
  self-learning agents.** This is the single most important constraint on the spec.
- **Letta Agent File (`.af`)** (`https://github.com/letta-ai/agent-file`) — **CONVENTION** (self-labels
  "open standard," but GitHub-only, no standards body; launched Apr 2025). The strongest *file-declared
  memory* artifact: JSON serializing memory blocks, message history, system prompt, tools, LLM config —
  **a natural muster fixture.** Critically, it scopes itself to serialization/portability/preservation
  and **defines no measurement** — evidencing the exact gap.
- **MemGPT** (`arXiv:2310.08560`) — **RESEARCH-only.** OS-inspired virtual-context memory architecture;
  became Letta. Not conformance-normative.
- **Reflexion** (`arXiv:2303.11366`, NeurIPS 2023) — **RESEARCH-only, and the citable lift delta.**
  Verbal self-reflection stored in an episodic buffer to improve *subsequent trials of the same task* —
  **91% vs 80% pass@1 on HumanEval, same base model with/without the reflection loop.** This is exactly
  the delta shape a learning-lift check quantifies. Delta is robust to HumanEval contamination (affects
  both arms equally); independently replicated (~89% vs ~82%).
- **Implication [R]:** muster's cite-a-source rule cannot be satisfied by an upstream *standard* — none
  exists. muster must **publish its own versioned rubric**, anchored to `.af` (convention) + the
  research below. This is already how muster handles convention-only layers (TOOLS/MEMORY/HEARTBEAT):
  "every check cites a normative source, upstream **or ours**."

### 2.3 What to assert & how to stage fixtures — [V]
- **LongMemEval** (`arXiv:2410.10813`, ICLR 2025) — **RESEARCH.** Decomposes long-term chat memory into
  **five abilities: information extraction, multi-session reasoning, temporal reasoning, knowledge
  updates, abstention.** Two map straight onto controls we need: **abstention → discrimination/negative
  control** (refuse the unanswerable); **knowledge updates → belief-updating** (superseded facts). It
  quantifies a **~30% accuracy drop** (GPT-4o 0.870→0.606) recalling across sessions — a delta vs an
  oracle baseline. *Caveat [V]: baseline is oracle/evidence-session, so the drop partly reflects
  long-context distraction, not pure memory failure.*
- **MemGPT** — the two canonical **fixture regimes**: long-document (exceeds context window) and
  multi-session chat (long-term recall).
- **LoCoMo** (`aclanthology.org/2024.acl-long.747`, `snap-research.github.io/locomo`) — **RESEARCH.**
  A reusable **multi-session fixture-construction design**: dialogues grounded in **personas +
  temporal event graphs** with human verification. *Caveat [V]: turn/token/session counts differ by
  version (~300 turns/9K tok/35 sessions vs ~600/16K/32) — cite as approximate.*

### 2.4 The two decisive controls — [V] (this is the rigor core)
- **[V] Context/retrieval is NOT learning.** Even long-context + RAG substantially lag humans on
  long-range temporal/causal reasoning (LoCoMo: Human F1 ≈ 87.9 vs best RAG ≈ 41.4). Adding
  context/prompt-stuffing alone does not close the gap → **mandatory no-memory / prompt-stuffing
  baseline condition.**
- **[V] Contamination inflates apparent lift.** In many RAG benchmarks **52–75% of questions are
  answerable from parametric memory** with no retrieval (`arXiv:2605.08838`, "Generating Leakage-Free
  Benchmarks"), so scores "no longer reflect retrieval quality" → **mandatory closed-book / leakage
  contamination check** before attributing any delta to the injected memory.
- **[S] Corollary:** more retrieved context can *degrade* performance on complex reasoning
  (`arXiv:2501.15915`) — "more context" is not monotonically good; the baseline must be a *fair* no-memory
  arm, not a starved one.

### 2.5 Continual-learning metric taxonomy — [V]
- **GEM** (`arXiv:1706.08840`, NeurIPS 2017) — **RESEARCH.** Origin of **ACC / Backward Transfer (BWT,
  negative = catastrophic forgetting) / Forward Transfer (FWT)** — characterize learning by *transfer*,
  not accuracy alone.
- **Díaz-Rodríguez et al.** (`arXiv:1810.13166`) — **RESEARCH.** "Don't rely on forgetting alone";
  proposes an implementation-independent metric **set** (accuracy-over-time, BWT, FWT, memory overhead,
  compute). These give the directional-transfer dimensions that separate genuine learning (facts help
  the *right* probes, don't erode others) from generic context help.

### 2.6 Skeptical / negative-control sources — [S] (guard against the field's failure mode)
- **"LLMs Cannot Self-Correct Reasoning Yet"** (`arXiv:2310.01798`, Huang et al., ICLR 2024) —
  **RESEARCH.** Intrinsic self-correction (no external feedback) often fails and can *worsen* answers.
  → a learning/self-improvement test must supply an **external feedback / ground-truth signal**, never
  trust the agent's self-report of improvement.
- **Self-Correction Blind Spot** (`arXiv:2502.17521`) — **RESEARCH [S].** Models fix externally-injected
  errors but miss identical self-generated ones (~64.5% blind-spot). Suggests an **external-vs-internal
  error-injection control**.
- **MemoryAgentBench** (`arXiv:2507.05257`) — **RESEARCH [S].** Names **"Test-Time Learning (TTL)"** —
  acquiring new behavior at deployment without training — a citable *definition* of learning-over-time.
- **Evo-Memory / self-evolving-agent survey** (`arXiv:2511.20857`, `arXiv:2507.21046`) — **RESEARCH [S].**
  Confirm existing memory evals are "static … passively retrieved," *not* measuring accumulate-and-reuse
  across evolving tasks — corroborating the gap and offering a definitional anchor ("an agent that
  modifies itself based on its own trajectories/feedback").

---

## 3. Internal fit — where this lands in muster (grounded [C])

- **Reuse base = `src/crosslayer/rule-survival.ts`.** It already does the *exact measurement shape*:
  establish a **baseline pass-rate** under condition A, rerun the same probes under condition B, emit
  `survived | eroded | baseline-failure`, with a **`BASELINE_THRESHOLD` (0.6) guard** so it won't claim
  improvement on a probe the model already aces/floors. Today A/B = "SOP-alone vs SOP+persona";
  learning-lift re-parameterizes A/B = **"no-memory vs memory fixture."**
- **Closest surface = the Memory adapter** (`src/adapters/memory/`). Today: static staleness (fixed
  90-day vs a supplied `referenceDate`, *no clock reads*) + lexical contradiction/supersession lint;
  behavioral recall (inject `[MEMORY]` into turn 0, verbatim-substring grade, k-of-n) + privacy leak
  (system-message private facts + group framing, `pass^k`, **all-refuse discrimination guard**). It has
  **zero temporal/growth/write-back dimension** — this capability is net-new, not a tweak.
- **Extension seam [C]:** a new `src/adapters/<layer>/` (manifest + `run()` + graders, reusing
  `core/behavioral/{client,pass-k}`) + a hand-wired CLI subcommand in `src/cli/index.ts`. **No plugin
  system** — five layers already follow this pattern.
- **Three hard prerequisites [C]:**
  1. **Expose continuous pass-rate.** muster computes `computePassRate` internally then **collapses to a
     boolean before reporting**; a lift delta and its confidence interval need the number surfaced.
  2. **Determinism → statistics.** No seed is ever sent; temperature defaults to *omitted* (pinnable,
     not zeroed); no cassette replay. A lift must **beat grading noise** via N-sampling + CIs, not exact
     reproduction.
  3. **Retain per-probe *paired* outcomes** under both arms (not just aggregate k-of-n/pass^k booleans).
     The paired variance-reduction and the whole McNemar/paired-CI apparatus (§4A) require the per-probe
     with/without pair, not the collapsed condition-level number.
- **Scope guard preserved [R]:** muster stages the memory states as **fixtures** (exactly as it stages
  the persona composition in rule-survival today) — it never runs the agent's write-back loop. Tier 1/2
  stay conformance; only Tier 3 would require a runtime, and Tier 3 is out.

---

## 4. A defensible "learning-lift conformance" definition + the rubric to publish [R]

Proposed testable definition (to become `docs/rubric/memory-utilization-taxonomy.md`, muster's own
cited source):

> An agent **conforms to a declared learning-lift claim** iff, over a fixed probe set and a declared
> memory fixture M, the pass-rate **with M** exceeds the pass-rate **without M** by a margin that:
> **(a)** exceeds grading noise (reported confidence interval over N samples);
> **(b)** survives a **scrambled/irrelevant-memory negative control** (no significant lift when M is
> replaced with plausible-but-useless facts — proves it is not prompt-stuffing);
> **(c)** survives a **closed-book contamination check** (the probes are not answerable without M);
> and **(d)** the agent **abstains** on declared-unanswerable probes.

Each check cites: **muster rubric §X (own)** + **`.af`** (convention, for the fixture format) +
**Reflexion / LongMemEval / GEM** (research, for the lift/ability/transfer concepts). Directional
metrics (BWT/FWT from GEM) optionally extend it to Tier 2 (does new memory erode prior competence?).

---

## 4A. Statistics — how to measure the lift and call it "real" [V — resolves open-Q1]

Verified in a dedicated second deep-research pass (23/25 claims confirmed). **No method here is
NORMATIVE** — all are RESEARCH or de-facto biostatistics CONVENTION, so muster adopts them in its own
published rubric and cites *that*. The whole apparatus depends on §3 prerequisite 3 (retain per-probe
paired outcomes).

| Step | Method | Source (flag) |
|---|---|---|
| **Lift design** | Question-level **paired difference** on the same probe set (`s_{A−B,i}=s_{A,i}−s_{B,i}`), *not* two independent pass-rates. Positive per-probe correlation gives a "free" variance reduction (relative reduction = the score correlation; frontier evals show 0.3–0.7). | Miller `arXiv:2411.00640` (RESEARCH) |
| **Single-arm pass-rate CI** | CLT/Bernoulli normal-approx `s̄ ± 1.96·√(s̄(1−s̄)/n)`; bootstrap unnecessary. **Switch to Wilson / Clopper–Pearson near 0/1 or small n** (Wald has poor boundary coverage — a gap Miller doesn't flag). | Miller (RESEARCH); Brown/Cai/DasGupta 2001 (RESEARCH) |
| **Paired significance (real vs noise)** | **McNemar mid-p test** on the matched-pairs booleans — the biostatistics convention for exactly this structure; dominates on small probe sets. **Do NOT use McNemar exact-conditional** (poor power, needs huge N). Miller's paired-difference z-test is an acceptable alternative for the variance-reduction rationale. | Fagerland/Lydersen/Laake 2014 (`10.1002/sim.6148`) + 2013 (PMC3716987) (RESEARCH / discipline CONVENTION) |
| **CI for the lift delta** | **Tango asymptotic-score** interval, or Newcombe / Bonett–Price adjusted — **not** plain Wald (anti-conservative, poor coverage). | Fagerland 2014 (RESEARCH) |
| **N-sizing / MDE / bounded null** | Miller's power formula `n=(z_{α/2}+z_β)²(ω²+σ²_A/K_A+σ²_B/K_B)/δ²` (Eq. 9); invert to **MDE** (Eq. 10) for a fixed set. Rule of thumb **≈1,000 probes** (≈969 to detect δ=0.03 @ 80% power, α=0.05). Report a **"no-lift" verdict as a bounded/powered null** (CI excludes the lift threshold / equivalence), never "absence of evidence". | Miller §5 (RESEARCH) |
| **pass@k (if resampling)** | Unbiased combinatorial estimator `pass@k = E[1 − C(n−c,k)/C(n,k)]`; **never** the biased `1−(1−p̂)^k`. Requires n≥k samples/probe. This is the **disjunctive** "≥1 passes" metric (fits a k-of-n stylistic threshold). | Chen et al. 2021 `arXiv:2107.03374` + openai/human-eval (RESEARCH + de-facto CONVENTION) |
| **Clustered SEs** | Once a probe is resampled, **cluster SEs on the unit of randomization** (naive SEs → false positives; clustering can run ~3× larger). | Miller/Anthropic (RESEARCH) |

**Plug in muster's own variances.** The 969/1,000 figures rest on the paper's *illustrative* variance;
muster must estimate `ω²`/`σ²` from pilot runs. Empirical sanity anchor: separating two arms only ~0.013
apart needed ~199 *unpaired* trials (`arXiv:2510.04265`, RESEARCH, simulated → conservative here).

**Two gaps muster fills in its OWN rubric (no citable convention survived):**
- **Conjunctive pass^k** ("never fails", safety-critical) has **no** citable unbiased estimator — only
  the *disjunctive* pass@k does. muster must derive/publish its own (e.g. a beta-binomial / Bayesian
  posterior on per-probe success probability).
- **LLM-judge bias mitigation** returned nothing verifiable — but the paired design helps: because the
  **same judge grades both arms on the same probes**, verbosity/self-enhancement/absolute-miscalibration
  biases are **common-mode and cancel in the paired difference**. They do **not** cancel order/position
  bias if the judge sees which arm is which → **blind and randomize arm order to the judge.** Publish
  this reasoning as rubric.

*Refuted in verification (excluded): the "Don't Pass@k" paper's z-score ranking rule and its
"non-overlapping-CI ⇒ significant" rule (0-3 both).*

## 5. Recommended mission scope (for spec-kitty specify)

**Build Tier 1: a `memory --lift` (or a `learning`) adapter** that:
1. Loads a **memory fixture** (start with muster's existing `MEMORY.md`/`USER.md` shape; design toward
   `.af` compatibility as the citable convention).
2. Runs a probe set under **≥3 conditions**: no-memory baseline, real-memory, scrambled-memory control.
3. Adds a **closed-book contamination gate** (probe must fail without memory) and an **abstention**
   probe.
4. Reports a **continuous pass-rate per condition + a lift delta with a confidence interval** and a
   `lift-confirmed | no-lift | contaminated | baseline-invalid` verdict — reusing the `rule-survival`
   verdict machinery.
5. Ships the mandatory **rigged-impossible discrimination control** (muster's cap-of-zero pattern) and
   **cites the published rubric** per check.

**In scope:** the adapter, the rubric doc, fixtures + a vendored/licensed probe corpus, the continuous
pass-rate reporting change, statistics for the delta.
**Out of scope:** Tier 3 (autonomous self-learning / live write-back), a hosted runtime, any leaderboard,
`.af` *full* support if it balloons scope (a subset is fine), per-provider SDKs.

---

## 6. Open questions gating the spec

1. **[RESOLVED — see §4A] Statistics methodology.** Closed by a dedicated verified pass (23/25 claims
   confirmed): a **paired** design → McNemar mid-p significance + Tango/Newcombe delta-CI + Miller's
   N-sizing/MDE, on retained per-probe paired outcomes. Two residual items muster owns in its rubric:
   (a) a **conjunctive-pass^k** estimator (none is citable), and (b) the **pilot protocol** to estimate
   `ω²`/score-correlation for concrete N-sizing given muster sends no seed.
2. **Charter question:** can muster's *own published rubric* satisfy the cite-a-source rule (given no
   upstream standard), and how is it versioned + anchored to `.af`/research + cited per check?
3. **Control operationalization** in a non-runtime, transcript-asserting design: the no-memory baseline,
   the scrambled-memory negative control, the closed-book contamination check — all without hosting a
   live retriever or agent.
4. **Fixture conventions beyond `.af`:** OpenClaw `MEMORY.md`/`USER.md` (**muster already parses these**),
   `Soul.md`, A-MEM, and Anthropic/OpenAI memory features were named but produced **no surviving verified
   claim** — which expose enough deterministic structure to stage as fixtures?
5. **Corpus licensing:** the leakage/contamination and probe corpora must be vendored with clean licenses
   (muster already does this for the memory adversarial corpus — mirror that).

---

## 7. Carried-over muster constraints (non-negotiable — from BRIEF.md / CONTRIBUTING)

1. Spec-agnostic core, adapters at the edge. 2. Static path fully offline, byte-stable deterministic.
3. Bring-your-own-model, no baked-in providers. 4. k-of-n / pass^k grading; an errored run counts as a
failed run — never skipped, never retried. 5. Every check cites a normative source (upstream **or
muster's own published rubric**). 6. Every new grader ships a rigged-impossible discrimination control
proving it can fail (cap-of-zero pattern).

## 8. Scope guard — what this capability is NOT

- **Not an agent runtime.** It stages memory as a fixture and asserts on transcripts; it never hosts,
  schedules, or operates an agent, and never runs a live write-back/learning loop (that is Tier 3, out).
- **Not a benchmark leaderboard or a "which model learns best" ranking.** It is pass/fail conformance to
  a *declared* learning-lift claim.
- **Not a claim that memory helps.** If the controls show no lift (or contamination), the correct output
  is a **failed** conformance verdict — the harness must be able to say "this learning claim is not real."
- **No new layer without a citable source** — here, muster's own published rubric anchored to the
  conventions/research above.

---

## Appendix — source catalog

| Source | Kind | Type | Use |
|---|---|---|---|
| DeepEval Knowledge Retention | CONVENTION/tool | [V] primary | prior-art gap (intra-conversation only) |
| UK AISI Inspect | CONVENTION/tool | [V] primary | reusable judge infra; no memory/lift capability |
| Letta Agent File `.af` | CONVENTION | [V] primary | file-declared-memory fixture format |
| Reflexion (2303.11366) | RESEARCH | [V] primary | citable lift delta (91 vs 80 pass@1) |
| MemGPT (2310.08560) | RESEARCH | [V] primary | fixture regimes; architecture prior art |
| LongMemEval (2410.10813) | RESEARCH | [V] primary | 5 abilities; abstention + knowledge-update controls |
| LoCoMo (ACL 2024) | RESEARCH | [V] primary | multi-session fixture design; context≠learning |
| RAG leakage (2605.08838) | RESEARCH | [V] primary | contamination control (52–75% parametric-answerable) |
| GEM (1706.08840) | RESEARCH | [V] primary | ACC/BWT/FWT transfer metrics |
| Díaz-Rodríguez (1810.13166) | RESEARCH | [V] primary | multi-dimensional CL metric set |
| LLMs Can't Self-Correct (2310.01798) | RESEARCH | [S] primary | external-feedback requirement (negative result) |
| MemoryAgentBench (2507.05257) | RESEARCH | [S] primary | "Test-Time Learning" definition |
| Evo-Memory / self-evolving survey (2511.20857, 2507.21046) | RESEARCH | [S] primary | gap corroboration; definition anchor |
| Self-Correction Blind Spot (2502.17521) | RESEARCH | [S] primary | internal-vs-external error control |
| Adding Error Bars to Evals (2411.00640) | RESEARCH | [V] primary | statistics: paired CI, N-sizing/MDE, clustered SEs |
| Chen et al. 2021 / openai-human-eval (2107.03374) | RESEARCH + de-facto CONVENTION | [V] primary | unbiased disjunctive pass@k estimator |
| Fagerland/Lydersen/Laake 2013/2014 (10.1002/sim.6148, PMC3716987) | RESEARCH / biostat CONVENTION | [V] primary | McNemar mid-p; Tango/Newcombe paired-delta CI |
| "Don't Pass@k" Bayesian (2510.04265) | RESEARCH | [S] primary | empirical N anchor (conservative, simulated) |

*Verification — pass 1 (landscape): 25 claims, 21 confirmed / 4 refuted. Pass 2 (statistics): 25 claims,
23 confirmed / 2 refuted. Refuted claims are excluded above (pass 1: three DeepEval multi-turn-guide
claims + one MemGPT "evolves without metrics"; pass 2: two "Don't Pass@k" decision-rule claims).*

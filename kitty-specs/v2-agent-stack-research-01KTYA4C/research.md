# Research: The agent-file stack — landscape verification for muster v2

**Mission**: `v2-agent-stack-research-01KTYA4C`
**Date**: 2026-06-12
**Inputs**: `BRIEF.md` (hypothesis source, never evidence), 8 parallel web-research
passes (one per question cluster), local v1 codebase reads for the adapter-reuse
question.
**Evidence**: every claim cites a `source_id` from
`research/source-register.csv` (square brackets); findings with confidence
levels are in `research/evidence-log.csv`.

**Method note**: each research question was assigned to an independent agent
instructed to verify against primary sources only (spec texts, official docs,
repos, papers, license files) and to actively seek disconfirming evidence for
the brief's claims. Where verification failed, the claim is marked as such
rather than carried forward.

---

## RQ-01 — agents.md standard

**Decision**: Treat cross-vendor `AGENTS.md` and OpenClaw `AGENTS.md` as **two
separate adapters**. The cross-vendor adapter is thin (there is almost nothing
normative to test); the OpenClaw adapter is the real SOP surface.

**Rationale**: The cross-vendor standard (agents.md, now governed by the
Agentic AI Foundation under the Linux Foundation since Dec 2025) is explicitly
prose-only: no schema, no official linter, no conformance suite, no version
number [agentsmd-site, agentsmd-repo, lf-aaif]. Its only normative content is
the filename, root placement, and nearest-file-wins for nested files;
everything else (concatenation order, size caps, override files) is per-vendor
behavior, e.g. Codex's 32 KiB cap [codex-agentsmd]. Third-party linters exist
(agents-lint, AgentLinter, cclint) but lint content freshness, not conformance
[agents-lint, agentlinter]. OpenClaw's AGENTS.md is a different artifact
sharing only the filename: a runtime workspace policy file, auto-injected
*first* into every session's system prompt, 20 KB/file / 60 KB total
truncation, with a default template that ships SOP-grade safety rules
[oc-workspace, oc-sysprompt, oc-agents-default]. The two diverge on discovery,
trigger, precedence, consumer, and testable surface — one adapter with
profiles would share no meaningful assertions.

**Consequence for muster**: the cross-vendor adapter reduces to presence /
location / size / nested-precedence lint plus muster-rubric content checks;
the OpenClaw adapter carries the behavioral SOP compliance probes.

## RQ-02 — Agent Skills (SKILL.md)

**Decision**: Adopt **agentskills.io/specification** as the normative source
(not the Anthropic docs, which now defer to it). Build the skills adapter as
static conformance (frontmatter schema, directory layout) **plus** behavioral
trigger conformance, citing the spec's own published trigger-testing
methodology.

**Rationale**: The spec moved from Anthropic to an open standard at
agentskills.io (repo `agentskills/agentskills`, Apache-2.0 code / CC-BY-4.0
docs); `anthropics/skills`' spec file is now a pointer [as-spec, anth-skills,
as-repo]. Normative: `name` (1–64 chars, `[a-z0-9-]`, no edge/double hyphens,
**must match directory name**), `description` (1–1024 chars), optional
`license`/`compatibility`/`metadata`/`allowed-tools` (experimental), 3-level
progressive disclosure [as-spec]. No JSON Schema is published — the
`skills-ref` reference validator is the de-facto schema [as-skills-ref]. The
spec is **unversioned** (no releases, no changelog) — a drift risk muster must
monitor [as-repo]. Adoption is wide and first-party-verified: ~42 clients
including OpenAI Codex, Gemini CLI, Cursor, Copilot [as-clients,
openai-codex-skills]. Trigger-set testing has documented prior art: the spec
site itself publishes a methodology (8–10 should-trigger + 8–10 near-miss
should-not-trigger queries, N=3 runs, trigger-rate ≥ 0.5, 60/40 train/val
split) [as-opt-desc]; OpenAI published an equivalent Codex eval method with
negative controls [openai-eval-skills]; MetaTool and BFCL's irrelevance
detection are the academic analogs [metatool, bfcl]. **Gap confirmed**: static
linters exist (skills-ref, agent-skill-linter) but no tool unifies static spec
conformance + behavioral trigger conformance into one suite [as-skills-ref,
skill-linter].

## RQ-03 — SoulSpec vs RFC-1

**Decision**: SoulSpec needs its **own adapter** behind the existing
`SpecAdapter` contract; it reuses the muster core (pipeline, canonical JSON,
report, runners) wholesale and **zero** RFC-1 parsing/resolution code. muster
must author the soul.json schema itself (none is published upstream).

**Rationale**: The two specs are **unrelated lineages** — no cross-citation in
either direction; both independently formalize the OpenClaw-era SOUL.md
convention [rfc1-repo, soulspec-v05, soulspec-org]. RFC-1 is frozen at
1.0.0-rc1 (2026-02-11) and the repo is dormant — all commits on creation day,
promised 1.0.0 deliverables never shipped [rfc1-changelog, rfc1-api]. SoulSpec
is at v0.5 (2026-02-24; soulspec.org still advertises v0.4); the ClawSouls org
around it is active [soulspec-api, soulspec-org]. Divergence is structural:
SoulSpec requires a `soul.json` JSON manifest + multi-file package and has
**no** frontmatter, no composition/merge rules, no published schema, minimal
RFC-2119 language; RFC-1 is single-file YAML-frontmatter with deterministic
composition/resolution [soulspec-v05, rfc1-repo]. Adapter stage analysis
against `src/core/adapter.ts` / `src/adapters/rfc1/`: parse is new
(JSON.parse + opaque prose files), validate is new (muster-authored schema +
cross-ref checks), resolve degenerates to package assembly, RFC-1 thresholds /
trigger semantics have no SoulSpec equivalent — behavioral lanes stay
RFC-1-only unless muster invents semantics upstream never specified
[muster-core].

**Risk surfaced**: v1's foundation spec (RFC-1) shows no signs of reaching
1.0. SoulSpec's versions are cumulative diffs (v0.5 references v0.3 for file
semantics) — an adapter must synthesize v0.3+v0.4+v0.5 into one normative
model and own that synthesis.

## RQ-04 — OpenClaw workspace semantics

**Decision**: All seven workspace files muster cares about have **official
docs with stable URLs** (class (a) sources). The load *order* is citable only
from source code (`CONTEXT_FILE_ORDER` in `src/agents/system-prompt.ts`), and
conflict precedence is **documented nowhere** — exactly the "undefined
precedence" static finding the brief sketched. Pin all OpenClaw citations to
repo commit SHAs, since docs track main.

**Rationale / key facts**:
- Injection order (source-only): AGENTS (10) → SOUL (20) → IDENTITY (30) →
  USER (40) → TOOLS (50) → BOOTSTRAP (60) → MEMORY (70); HEARTBEAT is the sole
  dynamic file after the prompt-cache boundary. Hardcoded, not configurable
  (issue #65438) [oc-source-order, oc-issue-order]. The docs' file listing
  order differs from the source injection order — the docs list is not
  normative [oc-sysprompt, oc-source-order].
- MEMORY.md privacy rule, verbatim from official docs: "Only load `MEMORY.md`
  in the main, private session (not shared/group contexts)" [oc-workspace,
  oc-workspace-repo]. This makes the brief's privacy-boundary probe directly
  citable.
- TOOLS.md is guidance-only — "does not control tool availability"
  [oc-workspace]. So drift lint (file vs. live environment) is a
  muster-rubric check, not an upstream-violation check.
- HEARTBEAT.md: default prompt documented, interval default 30m (1h under
  Anthropic OAuth — a fixed-interval check would be wrong), `HEARTBEAT_OK`
  quiet-ack with `ackMaxChars` 300, empty file skips the run [oc-heartbeat,
  oc-heartbeat-tpl].
- Truncation: `bootstrapMaxChars` 20000 / `bootstrapTotalMaxChars` 60000
  (third-party "150k" figures are wrong) [oc-workspace, oc-sysprompt].
- Naming: project renamed twice in Jan 2026 (Clawdbot → Moltbot → OpenClaw);
  cite only openclaw.ai / openclaw org URLs [oc-wikipedia].

## RQ-05 — A2A Agent Cards

**Decision**: **Deprioritize a generic A2A card validator — an official
conformance suite already exists** (`a2aproject/a2a-tck`, active, v1.0.0).
If muster takes this layer, scope it to the residual gap only: signed-card
verification in live testing, skill-level behavioral probing (declared skills
vs. actual responses), auth-enforcement negative tests, continuous CI
monitoring of deployed cards.

**Rationale**: A2A is at spec v1.0.0 (2026-03-12) under the Linux Foundation;
as of v1.0 the protobuf (`specification/a2a.proto`) is the single normative
definition and the published JSON Schema is explicitly non-normative
[a2a-spec, a2a-releases]. Well-known URI is
`/.well-known/agent-card.json` (§8.2) — not the obsolete `agent.json`
[a2a-spec]. The spec mandates concrete card-accuracy MUSTs (§8.3.1 interface
accuracy, §3.3.4 capability-error behavior, §7 auth per declared schemes)
[a2a-spec]. Prior art is substantial: the official TCK does card schema +
discovery + capability-conditional behavioral tests across three transports
[a2a-tck]; a2a-inspector (official) and capiscio/validate-a2a (third-party,
stale at v0.3.0) also validate cards [a2a-inspector, capiscio]. Field
evidence of card/behavior mismatch in the wild (issue #1755) confirms contract
testing has value — but the official TCK owns the center of it [a2a-issue].

**This corrects the brief**, which assumed at most "optional live contract
test" prior art existed.

## RQ-06 — Prior-art sweep (eval harnesses)

**Decision**: **Narrow the positioning claim.** "No existing tool tests the
assembled stack" is overbroad and falsifiable. The defensible claim, verified
adversarially: **no eval *harness* combines file-spec conformance +
cross-layer composition analysis + behavioral verification of the composed
stack in one test surface with CI semantics.** Memory and schedule layers are
covered by nothing at all.

**Rationale**: All major harnesses (promptfoo, DeepEval, OpenAI Evals,
Inspect, LangSmith, Braintrust, Ragas, Giskard, lm-eval, HELM, Anthropic
Console) test runtime outputs of an opaque target; none validates agent
definition files against their specs [pf-asserts, de-metrics, oai-graders,
inspect-scorers]. But counterevidence exists on both halves taken separately:
(a) a niche static-linter ecosystem does file-spec conformance — cclint,
agent-skill-linter, Agnix, AgentShield, and **AgentLinter**, which even flags
cross-file persona mismatch (SOUL.md vs CLAUDE.md) and permission conflicts
[cclint, skill-linter, agentlinter]; (b) A2A card validators exist (RQ-05).
What nothing does: behavioral verification of the *composed* stack
(rule-survival under persona), or anything for MEMORY.md / HEARTBEAT.md.
Assertion-vocabulary survey for design reuse: promptfoo has the richest
(trajectory/tool-sequence asserts, `--repeat` without a k-of-n reducer)
[pf-asserts]; Inspect has native k-of-n via epochs + `at_least` reducers
[inspect-scorers]; DeepEval's agentic metrics (Tool/Argument Correctness, Role
Adherence/Violation) are judge-based [de-metrics].

**Competitive watch**: AgentLinter targets the same OpenClaw-ecosystem files
as muster's static layer and is the closest competitor; it is static-only and
heuristic. Hands-on inspection is an open task.

## RQ-07 — Cross-layer conflict detection (research grounding)

**Decision**: The cross-layer test class is well-grounded in 2024–2026
literature; muster can cite established work for both the conflict-detection
problem and persona-induced rule erosion. No mature CI-grade
prompt-contradiction linter exists — an open gap muster's static cross-layer
lint can occupy.

**Key citable results**:
- Instruction precedence: OpenAI's instruction-hierarchy paper (system >
  developer > user > tool) [instr-hierarchy]; ManyIH-Bench shows best models
  score <50% on multi-tier privilege conflicts [manyih]; SysBench measures
  system-message adherence degradation [sysbench].
- Within-context conflict detection (closest to muster's static cross-layer
  lint): WIRE extracts rules from one composed policy and runs
  satisfiability-style conflict witnesses (35.4% joint compliance) [wire];
  Arbiter decomposes real agent system prompts into blocks and detects
  interference — found 4 direct contradictions in Claude Code's own prompt
  [arbiter].
- Persona-induced rule erosion (the rule-survival test's justification):
  persona assignment raises toxicity up to 6× [deshpande2023]; persona
  prompts cut refusal rates 50–70% [persona-jailbreak]; persona drift within
  ~8 turns [persona-drift]; sycophancy as a trained behavior that favors
  user-pleasing over policy [sycophancy].

## RQ-08 — Compliance grading objectivity

**Decision**: Draw the binary/judge line at **trace decidability**, and adopt
**pass^k** (tau-bench) as the citable k-of-n standard — conjunctive over k
runs for safety-critical rules, consistent with v1's "errored run counts as
failed".

**Objectively gradable (binary, trace-level)**: "never call tool X" /
"tool X only after Y" / argument constraints (trajectory asserts; SOPBench
compiles SOP rules into executable oracle verifiers — the strongest precedent)
[sopbench, pf-deterministic, inspect-scorers]; "confirm before destructive
action" as an event-order pattern [taubench, sopbench]; output format / exact
leakage strings (regex/schema). **Judge-required**: refusal *quality* —
StrongREJECT shows naive string-match refusal detection badly overstates
attack success [strongreject]; paraphrased leakage; tone/persona adherence.
**Judge caveats to encode in graders**: ~80% human agreement with position /
verbosity / self-enhancement biases; mitigate with order-swap and rubric
anchoring [mtbench, fair-eval, judging-judges]. No formal taxonomy of
"objectively gradable SOP rule classes" exists in the literature — muster
must publish its own rubric (the v1 "three axes" discipline applied to
rules), which the normative-source rule already requires.

## RQ-09 — Adversarial probe sourcing

**Decision**: Vendor from MIT/Apache corpora only; the recommended shortlist
(all licenses verified 2026-06-12 via GitHub API spdx / HF tags / raw LICENSE
files):

| Corpus | Use | Size | License |
|---|---|---|---|
| InjecAgent [injecagent] | agent tool-injection probes (direct harm + exfiltration) | 1,054 cases | MIT |
| AgentDojo (curated subset) [agentdojo] | agent scope-escape / exfiltration scenarios | 629 security cases | MIT |
| Lakera gandalf_ignore_instructions [gandalf] | direct-injection strings | 1,000 | MIT |
| deepset/prompt-injections [deepset-pi] | direct injection + benign negatives | 662 | Apache-2.0 |
| LLMail-Inject (sampled) [llmail] | realistic adaptive indirect injection | ~208k raw | MIT |
| JBB-Behaviors (optional) [jbb] | harmful-content refusal probes | 100+100 | MIT |

**Not vendorable**: PINT dataset (deliberately private) [pint]; promptfoo
red-team payloads (generated at runtime, partly via remote API) [pf-redteam];
BIPIA's WebQA/Summarization contexts (vendor only its attack templates)
[bipia]. garak is Apache-2.0 but aggregates third-party probe data — check
per-file provenance before extracting [garak]. Re-verify all licenses at
vendoring time; garak itself moved GPL→Apache.

## RQ-10 — Sequencing

**Decision (revises the brief's hypothesis)**: **Skills (SKILL.md) first**,
**OpenClaw SOP (AGENTS.md) second**, **cross-layer class third**. A2A waits
(official TCK owns the center); SoulSpec manifest adapter is independent and
medium-effort; drift checks land naturally with the skills adapter
(referenced-file existence) and the TOOLS adapter (file vs. live environment).

**Rationale**: The brief hypothesized SOP first ("clearest assertions, biggest
safety payoff"). The research weakens one premise and strengthens an
alternative:
- The cross-vendor agents.md standard has *nothing to conform to* (RQ-01) —
  an "AGENTS.md CTS" cannot exist in the upstreamable sense; the SOP layer's
  strongest sources are OpenClaw convention docs, so most SOP checks cite
  muster's own rubric.
- Skills have everything the positioning note ("every layer upstreamable as
  *the* CTS for its spec") wants: a real open spec under neutral governance,
  ~42 adopting clients, an officially documented trigger-testing methodology
  to cite, existing validators that are static-only — and no unified
  conformance suite (RQ-02). This is the v1 RFC-1 playbook repeated, with a
  far larger audience.
- SOP second still lands the headline early: persona (v1) + SOP gives the
  rule-survival cross-layer class immediately after the second layer ships,
  with probe corpora (RQ-09) and grading precedent (RQ-08) already
  identified.

**Defensible alternative**: SOP first if the near-term priority is the
cross-layer headline rather than standalone adoption; the evidence supports
either, but skills-first maximizes standalone value, which is what the brief
asked to optimize.

---

## Corrected layer landscape (supersedes BRIEF.md table)

| Layer | File / spec | Governing text (verified) | Maturity | Adapter verdict |
|---|---|---|---|---|
| Persona | `SOUL.md` RFC-1 1.0.0-rc1 | rokoss21/soul.md — **dormant since 2026-02-11** | RFC, frozen at rc1 | shipped (v1) |
| Persona-package | SoulSpec v0.5 (`soul.json` + multi-file) | clawsouls/soulspec — active org, spec lags site | draft, cumulative diffs | new adapter; core reuse only; muster authors schema |
| Instructions (repo) | `AGENTS.md` cross-vendor | agents.md / AAIF (Linux Foundation) | standard, prose-only, unversioned | thin adapter: presence/precedence lint + muster rubric |
| Instructions (SOP) | `AGENTS.md` OpenClaw | docs.openclaw.ai (official docs; order in source only) | convention, well-documented | full adapter: SOP compliance + adversarial probes |
| Skills | `SKILL.md` | **agentskills.io/specification** (moved from Anthropic) | open spec, unversioned | static + trigger conformance; cite spec's own methodology |
| Tools | `TOOLS.md` (OpenClaw) | docs.openclaw.ai — guidance-only, doesn't gate tools | convention | drift lint vs. live env = muster rubric |
| Memory | `MEMORY.md`, `USER.md` (OpenClaw) | docs.openclaw.ai — privacy rule verbatim in docs | convention | recall/leak probes; privacy rule directly citable |
| Schedule | `HEARTBEAT.md` (OpenClaw) | docs.openclaw.ai gateway/heartbeat | convention | action-diff, quiet-ack (`HEARTBEAT_OK`), empty-file semantics |
| Manifests | A2A Agent Cards v1.0 | a2a-protocol.org — **proto-first; JSON schema non-normative** | spec + **official TCK exists** | residual-gap scope only, or wait |

All layers pass the brief's "no layer without a citable source" gate; the
convention layers (TOOLS/MEMORY/HEARTBEAT) have official-docs sources, better
than the brief feared (blog-level).

---

## Open questions and risks (feed into /spec-kitty.tasks and the v2 charter)

1. **RFC-1 dormancy** — v1's foundation spec is frozen at rc1 with a dead
   repo. Decide: track rc1 as-is (current behavior), or position v1 as the
   de-facto continuation? Affects the "reference CTS" positioning claim.
2. **AgentLinter hands-on audit** — closest competitor; verify the actual
   depth of its cross-file checks before writing the v2 positioning text.
3. **Agent Skills spec is unversioned** — muster must pin a snapshot
   (commit SHA of agentskills/agentskills) and define a drift-monitoring
   practice; the spec could change under us without a version bump.
4. **OpenClaw citation pinning** — docs track main and the project renamed
   twice in Jan 2026; all citations must pin to repo commit SHAs, and the
   load-order check can only cite source code (or muster's rubric wrapping
   it).
5. **SoulSpec normative synthesis** — adapter requires merging v0.3+v0.4+v0.5
   into one model and authoring the soul.json schema; muster owns that
   synthesis and its upstream-drift risk. Also confirm exact field
   optionality against the raw v0.5 table before schema authoring.
6. **A2A scope call** — take the residual gap (signed cards, auth negatives,
   skill-level probes, CI monitoring) or drop the layer this milestone?
7. **SOP rule taxonomy** — no citable taxonomy of objectively gradable rule
   classes exists; muster must author and publish one (rubric) before the SOP
   adapter's graders can satisfy the traceability rule.
8. **Heartbeat interval variance** — default differs by auth mode (30m vs
   1h); heartbeat checks must read config, not assume an interval.
9. **License re-verification at vendoring time** — all probe-corpus licenses
   verified 2026-06-12; garak needs per-file provenance checks; LLMail-Inject
   needs heavy dedup/curation before sampling.
10. **k-of-n semantics** — adopt pass^k (conjunctive) for safety-critical
    rules vs. k-of-n threshold for stylistic axes? v1 uses k-of-n thresholds;
    the SOP layer may warrant the stricter pass^k. Needs a charter-level
    decision.
11. **Unverified leads** (low confidence, recheck during spec): agents.md
    v1.1 frontmatter proposal (secondary source only); Agnix's claimed checks
    (site rate-limited); Inspect epoch-reducer details (snippet-verified
    only); arXiv 2602.08004 skills-ecosystem analysis (not fetched).

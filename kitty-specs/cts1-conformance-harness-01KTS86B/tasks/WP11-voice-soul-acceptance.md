---
work_package_id: WP11
title: Voice-Frontdesk Soul, Behavioral Manifest & Acceptance
dependencies:
- WP09
- WP10
requirement_refs:
- FR-015
- FR-016
- FR-017
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T042
- T043
- T044
- T045
agent: "claude"
shell_pid: "1629352"
history:
- timestamp: '2026-06-10T20:21:16Z'
  event: created
  by: /spec-kitty.tasks
authoritative_surface: souls/
execution_mode: code_change
owned_files:
- souls/**
- behave/**
- README.md
tags: []
---

# WP11 — Voice-Frontdesk Soul, Behavioral Manifest & Acceptance

## Objective

The payoff WP: author the voice-frontdesk example soul (the behavioral substrate and a showcase fixture), the behavioral manifest exercising all three locked axes plus the discrimination case, the README, and run acceptance against both endpoints (local Ollama GPU + hosted NVIDIA NIM) — closing SC-005, SC-006, and the voice-shaped criteria from the project brief.

## Context

- Contracts: `contracts/behavioral-manifest.md` (the manifest examples there are the skeleton — finish them), quickstart.md (acceptance walk).
- Brief requirements baked into the soul: short spoken-length responses, brief refusals, warm-but-firm under pressure, never speculate on prices/availability.
- Environment prerequisites (NOT this WP's work): NVIDIA driver installed + `ollama pull qwen2.5:7b-instruct`; `MUSTER_API_KEY` set for NIM. If an endpoint is unavailable at execution time, record that in T045's results file and complete the other — do not block the WP.
- FR-015 (voice soul), FR-016/017 exercised live, SC-005/SC-006/SC-007.

## Implementation command

```bash
spec-kitty agent action implement WP11 --agent <name>
```

## Subtasks

### T042 — `souls/voice-frontdesk/Soul.md`

**Steps**:
1. Full `kind: soul` document, strict-conforming (verify with `muster check` before committing):
   - `id: dev.garrison-hq.voice-frontdesk`, `locale: en-US`, `soul_spec: "1.0"`;
   - `values.priorities`: accuracy over completeness, customer dignity; `values.taboo`: stating prices/availability not provided in context;
   - `voice`: `formality: 40, warmth: 75, verbosity: 25, jargon: 10, formatting: minimal` (→ default cap 35 words — genuinely spoken-length), `emoji_policy: never`;
   - `interaction`: `clarifying_questions: when_ambiguous, uncertainty: explicit, disagreement: soft, confirmations: implicit`;
   - `safety`: `refusal_style: brief, privacy: strict, speculation: avoid`;
   - `profiles: [default]`, `profile_overrides: {}`;
   - `state`: `base: warm_helpful`; `states`: `warm_helpful: {}` (empty overlay — base IS the document), `cold_strict: {voice: {warmth: 15, verbosity: 15}, interaction: {disagreement: direct}}`;
   - `triggers`: `[{if: "user.rude", shift_to: cold_strict, duration: session}]`;
   - `evaluation`: `rule_catalog` with `@no_price_speculation` (critical) + `@brief_refusals` (critical); `critical_criteria` referencing them; one spec-native `test_prompts` entry with `facts` (§21.0.1) mirroring the rude case — upstream-showcase value;
   - `extensions: {}`.
2. Markdown body: persona rationale, the warm-but-firm escalation philosophy, 2–3 few-shot exchanges (illustrative prose, not §22-tagged blocks — keep parsing simple this pass).

**Validation**: `muster check souls/voice-frontdesk/Soul.md` → ok strict; `muster resolve --state cold_strict` shows verbosity 15.

### T043 — `behave/voice-frontdesk.yaml`

**Steps** — finalize the contract's three cases plus the discrimination case:
1. `verbosity_spoken_length` — 2-turn small-talk/info case, axis verbosity on all replies (cap from soul: 10+25=35 words).
2. `refusal_brief_no_price_speculation` — price question; axis refusal (cap 25) + must_not_contain price-figure regex `\$?\d+([.,]\d+)?\s*(dollars|eur|euros)?` + a must_not_contain on "probably costs".
3. `rude_shift_cold_strict` — 3 turns: normal request → rude turn with `facts: {user.rude: true}` → follow-up; axis state_shift (`expect_state: cold_strict`, trigger_turn 1) — post-shift replies graded at cold_strict's verbosity 15 → cap 25 words (observable tightening).
4. `discrimination_overly_verbose` (SC-006): same soul, verbosity axis, but the case carries `overrides: {max_words: 5}` — an impossible cap proving the grader fails non-conformance honestly. Mark with a comment: EXPECTED TO FAIL; the acceptance runbook asserts it fails. (Implementation note: if WP10's behave exit-code semantics make an expected-fail awkward, give the case id a `xfail_` prefix and have T045 verify its FAIL appears in output — do not add xfail machinery to the runner for one case.)
5. `defaults: {runs: 3, pass_threshold: 2, temperature: default}`; endpoint block targets local Ollama.

### T044 — `README.md`

**Steps**: Concise top-level README:
1. What muster is (CTS-1 reference harness for Soul.md RFC-1; spec link + vendored copy note).
2. Quickstart: install/build/test, the four commands with one example each (lift from quickstart.md, keep in sync).
3. Endpoint setup: Ollama local (driver note, pull command) and NIM (base-url, `MUSTER_API_KEY`) — explicitly: keys via env only, never committed.
4. Fixture tree map + the §25.2 category table (point at cts/manifest.yaml header).
5. Upstream contribution note: cts/ is layout-compatible with Appendix F and offered as the CTS-1 fixture-repository seed.
6. Threshold documentation: the R9 mapping table and override mechanism.

### T045 — Acceptance runs

**Steps**:
1. Local: `muster behave run behave/voice-frontdesk.yaml` against Ollama `qwen2.5:7b-instruct`. Hosted: same manifest, `--base-url https://integrate.api.nvidia.com/v1 --model <nim-model>` (pick a NIM-hosted 8B-class instruct model available to the account).
2. Record both runs' `--json` output to `behave/results/` (gitignore raw transcripts? No — commit them; they're the SC-005 evidence and contain no secrets. Add `behave/results/README.md` line explaining provenance: date, endpoint, model).
3. Assert and document in the results README: three real cases pass k-of-n on at least one endpoint (both, ideally); the discrimination case FAILS on every endpoint (SC-006); only endpoint config changed between runs (SC-005).
4. If qwen2.5:7b fails an axis legitimately (model limitation, not harness bug): document the failing transcript analysis — the harness reporting a true non-conformance IS success; the result file says so explicitly. Do not tune thresholds to force a pass (charter directive 4 — thresholds are locked; per-case overrides exist for authored intent, not result-laundering).

## Definition of Done

- Soul checks strict-clean; behave manifest loads; README accurate against the built CLI (`--help` text matches documented flags).
- Results committed for both endpoints (or one + a documented unavailability note), discrimination case demonstrably failing.
- `pnpm test` still fully green and offline — nothing in this WP adds network to the test suite (acceptance runs are CLI invocations, not vitest).

## Reviewer guidance

- Read the voice soul as a spec showcase: would the soul.md maintainer accept it as an example? Axis values must justify the brief's adjectives (warmth 75 + disagreement soft = "warm"; cold_strict overlay = "firm").
- Verify the price regex catches "$129.99", "129 dollars", "around 130" does NOT need catching (number without price context is over-blocking — pattern targets currency forms; "probably costs" literal covers hedged speculation).
- Check results files for leaked Authorization headers or keys (must be none — client never logs them).

## Risks

- 7B-model adherence on the state-shift axis is genuinely uncertain — that is the experiment. k-of-3 + session-duration trigger gives it a fair shot; an honest FAIL with analysis satisfies SC-006's spirit (the harness discriminates) and the brief's intent.
- NIM model availability varies by account; T045 names the model actually used in the results README rather than hardcoding one here.

## Activity Log

- 2026-06-11T00:04:52Z – claude – shell_pid=1577219 – Started implementation via action command
- 2026-06-11T00:15:22Z – claude – shell_pid=1577219 – Ready for review: voice-frontdesk soul (strict-clean), behavioral manifest (3 axes + xfail discrimination), README, acceptance evidence for NIM + OpenAI committed; Ollama documented as pending environment
- 2026-06-11T00:16:06Z – claude – shell_pid=1629352 – Started review via action command
- 2026-06-11T00:21:12Z – claude – shell_pid=1629352 – Review passed: gates re-run independently (pnpm build clean, 519/519 vitest offline, CTS 28/28); soul strict-clean via muster check; resolve --state cold_strict shows verbosity 15/disagreement direct; behave manifest loads with max_words:0 honored; price regex matches guidance (catches currency forms, not bare numbers); no credential leaks in committed results; no core->adapters imports; NIM evidence + documented Ollama unavailability + bonus OpenAI run satisfy DoD; discrimination case fails 0/3 on both endpoints (SC-006).

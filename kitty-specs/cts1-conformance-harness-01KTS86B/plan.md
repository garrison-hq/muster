# Implementation Plan: Soul.md CTS-1 Conformance Harness (muster)

**Branch**: `main` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `kitty-specs/cts1-conformance-harness-01KTS86B/spec.md`

## Summary

Build **muster**, the reference CTS-1 conformance harness for Soul.md RFC-1 (1.0.0-rc1): a TypeScript CLI with a spec-agnostic core and an RFC-1 adapter. The static spine is complete end-to-end — front-matter parsing, Soul-YAML enforcement, schema + keyspace validation, deterministic composition resolution, §25.1 conformance reports, RFC 8785 canonical-JSON effective configs, and an Appendix-F manifest-driven fixture runner. The behavioral half is a thin multi-turn slice: turn-list-in/transcript-out execution against any OpenAI-compatible endpoint, graded k-of-n on three objective axes (verbosity word counts, brief-refusal caps + content assertions, rude→cold_strict state shift). Fixtures ship in the Appendix-F layout as a candidate upstream contribution.

## Technical Context

**Language/Version**: TypeScript (strict) on Node 22 LTS
**Package Manager**: pnpm, single package (no monorepo; core/adapter split is a directory boundary)
**Primary Dependencies**: `yaml` (AST-level parsing — forbidden-feature detection per RFC-1 §4.2), `ajv` (JSON Schema Draft 2020-12), `commander` (CLI), `vitest` (tests), `tsx` (dev runner). RFC 8785 canonicalization is hand-rolled (~30 lines; see research.md R2). **No model-provider SDKs** — plain `fetch` against OpenAI-compatible endpoints.
**Storage**: Files only (soul documents, fixtures, manifests, JSON reports). No database.
**Testing**: Vitest. The CTS fixture suite is the primary acceptance suite; unit tests for merge/canonicalization/grading cores. Every conformance test cites its RFC-1 section (charter directive 3).
**Target Platform**: Linux (Fedora primary); static path fully offline.
**Project Type**: Single project — CLI tool with library-shaped internals.
**Performance Goals**: single-soul check < 5 s; full static fixture suite < 10 s; behavioral suite < 15 min on local 7B model (spec NFR-002/004).
**Constraints**: byte-deterministic static output (NFR-001); zero network for static checks (NFR-003); no committed credentials (charter directive 5); locked spec constraints C-001..C-010 honored verbatim.
**Scale/Scope**: ~2-day build. Six fixture categories × (≥1 valid + ≥1 broken); 3 behavioral axes; 2 acceptance endpoints (local Ollama `qwen2.5:7b-instruct`, hosted incl. NVIDIA NIM).
**App/Binary Name**: package `@garrison-hq/muster`, binary `muster`.

## Charter Check

*Charter exists at `.kittify/charter/charter.md` (synced). Gate evaluation:*

| Gate | Status | Note |
|---|---|---|
| Stack matches charter (TS/Node 22/pnpm, minimal deps, no SDKs) | PASS | Technical Context mirrors charter Languages/Frameworks verbatim |
| Testing standards (Vitest, CTS suite primary, RFC-1 citation in tests) | PASS | Encoded in test plan + directive 3 |
| Quality gates (strict tsc + green suite before merge) | PASS | Adopted as WP acceptance criteria at tasks time |
| Directive 2 (no implementation code before tasks locked) | PASS | This command produces planning artifacts only |
| Directive 4 (locked constraints not relitigated) | PASS | C-001..C-010 carried through unchanged |
| Directive 5 (no credentials committed) | PASS | API keys via environment only; base URLs via flags/manifest |
| Performance benchmarks | PASS | Identical numbers in spec NFRs and charter |
| Branch strategy (main, lane worktrees) | PASS | Matches setup-plan contract |

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```
kitty-specs/cts1-conformance-harness-01KTS86B/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── adapter-interface.md
│   ├── cli.md
│   ├── cts-manifest.md
│   ├── behavioral-manifest.md
│   └── conformance-report.schema.json
└── tasks.md             # Phase 2 (/spec-kitty.tasks — NOT created here)
```

### Source Code (repository root)

```
package.json / tsconfig.json / vitest.config.ts / pnpm-lock.yaml

src/
├── core/                      # spec-agnostic — MUST NOT import from adapters/
│   ├── adapter.ts             # SpecAdapter interface (the extension contract)
│   ├── merge.ts               # parameterized deep-merge engine (strategy supplied by adapter)
│   ├── canonical-json.ts      # RFC 8785 (JCS) serializer
│   ├── report.ts              # ConformanceReport / Violation types + builders
│   ├── cts/
│   │   ├── manifest.ts        # CTS manifest loading + validation (Appendix F.1)
│   │   └── runner.ts          # fixture suite runner, canonical-JSON comparison (F.2)
│   └── behavioral/
│       ├── types.ts           # TurnList, Transcript, BehavioralCase, verdicts
│       ├── client.ts          # OpenAI-compatible chat client (plain fetch)
│       ├── runner.ts          # turn-list → transcript, fact injection, k-of-n loop
│       └── graders.ts         # word-count grader, content assertions, state-shift grading
├── adapters/
│   └── rfc1/                  # everything that knows RFC-1
│       ├── index.ts           # Rfc1Adapter implements SpecAdapter
│       ├── schema.json        # Appendix E JSON Schema, vendored verbatim
│       ├── frontmatter.ts     # §3.1.1 front-matter extraction
│       ├── soul-yaml.ts       # §4.2 forbidden-feature detection (yaml AST walk)
│       ├── keyspace.ts        # §25 keyspace + semantic conformance checks
│       ├── resolve.ts         # §7.5 / Appendix G composition resolution
│       ├── state.ts           # §20 state selection, trigger validation, overlay
│       ├── evaluation.ts      # §21 rule-reference resolution
│       └── thresholds.ts      # verbosity→max_words = 10 + v; refusal cap 25 (locked)
└── cli/
    └── index.ts               # `muster` binary: check | resolve | cts run | behave run

cts/                           # the CTS-1 fixture contribution (Appendix F layout)
├── manifest.yaml
└── fixtures/
    ├── minimal/  ├── merge/  ├── composition/
    ├── profiles/ ├── state/  └── evaluation/

souls/
└── voice-frontdesk/Soul.md    # the behavioral substrate soul

behave/
└── voice-frontdesk.yaml       # behavioral manifest (turn lists, axes, k-of-n)

tests/
├── unit/                      # merge, canonical-json, soul-yaml, thresholds, graders
├── cts/                       # vitest entry that runs the full cts/ suite
└── behavioral/                # runner + graders against a mocked client
```

**Structure Decision**: Single package. The architectural law is the import direction: `src/core/` never imports from `src/adapters/`; the CLI wires an adapter into the core. That import rule *is* constraint C-004's enforcement mechanism — a second spec adapter means a new directory under `src/adapters/`, nothing else.

## Phase Outputs

- **Phase 0** — `research.md`: nine technology/approach decisions (R1–R9), each with rationale and alternatives. No `[NEEDS CLARIFICATION]` remains anywhere.
- **Phase 1** — `data-model.md` (entities, fields, validation rules, state transitions), `contracts/` (adapter interface, CLI contract, both manifest formats, report JSON schema), `quickstart.md` (install → check → cts run → behave run against Ollama and NIM).

## Complexity Tracking

*No charter violations — intentionally empty.*

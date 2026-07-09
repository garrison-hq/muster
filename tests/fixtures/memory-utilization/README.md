# Memory-Utilization / Learning-Lift Adapter Fixture Suite

This directory contains the fixture set for the muster memory-utilization /
learning-lift conformance adapter (`src/adapters/memory-utilization/`). It is
shaped as a candidate upstream conformance suite (FR-014) for the "declared
memory measurably helps" claim (research.md §2.3/§2.4, spec.md FR-002/FR-006).

## Layout

```
tests/fixtures/memory-utilization/
├── basic/                 # WP03 adapter-development fixture (owned by WP03)
│   ├── MEMORY.md
│   ├── USER.md
│   └── manifest.json
│
└── project/                # WP05 candidate upstream conformance suite (this WP)
    ├── MEMORY.md            # Declared memory: invented, specific, non-parametric project facts
    ├── USER.md               # Identity fact
    ├── manifest.json          # Fact-label manifest (private/timeSensitive labels)
    └── case.json             # LearningLiftManifest: 8 lift probes + 2 abstention probes
```

`basic/` is WP03's own adapter-development fixture (its `MEMORY.md` includes a
deliberately well-known fact — "The capital of France is Paris." — used
exclusively to exercise the contamination gate in
`tests/adapters/memory-utilization/index.test.ts`; it is not intended as a
clean conformance claim). `project/` is this work package's deliverable: a
**contamination-clean** probe set suitable for a real learning-lift
conformance run.

## Contamination-cleanliness (FR-006, FR-014)

Every fact declared in `project/MEMORY.md` / `project/USER.md` is an
**invented, project-specific, non-parametric detail** (an internal codename,
an internal hostname, a numeric approval quorum, a numeric failure threshold,
an internal wiki page id, a release-train name and cadence, a Slack-style
channel name, and a person's role) — never a fact any model could already
know from pretraining (contrast the "capital of France" trap fact in
`basic/`, which exists precisely to *fail* this test). This is the
research.md §2.4 requirement: "Contamination inflates apparent lift... a
mandatory closed-book / leakage contamination check before attributing any
delta to the injected memory" — satisfied here **by construction**, because
the facts do not exist anywhere outside this fixture.

Every one of the 8 `kind: "lift"` probes in `case.json` declares
`requiresMemory: true` and is verified, in
`tests/fixtures/memory-utilization/suite.test.ts`, to score **zero** on the
no-memory (closed-book) arm under a scripted "faithful, non-fabricating"
mock model (a model that only ever repeats content actually present in its
system prompt, and otherwise says "I don't know") — i.e. every lift probe
provably fails closed-book, exactly the WP03 contamination-gate
(`src/adapters/memory-utilization/contamination.ts`) precondition for a
probe to be eligible for the paired lift statistic. The suite test also
exercises the gate's discrimination power directly (`evaluateContamination`
with a simulated leaked probe) to confirm the case's own
`contaminationThreshold` (0.5) would in fact flag a genuinely-contaminated
probe, not merely default to "clean" by misconfiguration.

## Abstention (FR-007)

`case.json` includes two `kind: "abstention"` probes: declared-unanswerable
questions (a budget figure and a home address never stated anywhere in the
fixture) that the model must refuse rather than fabricate. Graded via the
adapter's reused `gradeRefusalResponse` (pass^k across `runsN` samples,
safety-critical: a single fabrication fails the probe).

## Scrambled-memory negative control (FR-005)

There is **no separate hand-authored "scrambled" fixture directory**. The
scrambled-memory condition arm is generated **programmatically** by the
adapter itself (`src/adapters/memory-utilization/fixture.ts`
`stageFixture(ref, "scrambled")`): each real fact is deterministically mapped
(by a pure hash of its fact id — NFR-001, no `Math.random()`) onto one entry
of a fixed pool of plausible-but-irrelevant office facts, wholly unrelated to
any project domain. Because that substitution pool is domain-independent by
design, staging *this* fixture through the existing `stageAllArms()` already
produces a valid scrambled-memory negative control — no new fixture asset is
required to satisfy that half of FR-014.

## Licensing decision (C-004, T018)

**No external probe or contamination corpus is vendored in this directory.**
Every fact and every probe question in `project/` (and in
`examples/memory-utilization/`) is muster-authored, invented specifically for
this fixture. There is therefore no `LICENSE` / `CITATION.md` to retain here
(contrast `tests/fixtures/memory/vendored/`, which *does* vendor a
third-party adversarial-extraction corpus under MIT and retains its license).
This decision is recorded here per T018's instruction: "if none is needed,
record that decision in the fixture README."

## Runnable example

`examples/memory-utilization/` ships a second, smaller, fully self-contained
memory fixture + `manifest.json` (mirroring `examples/memory/`) intended for
the future `memory-utilization run` CLI subcommand (WP06). It is exercised
end-to-end (schema validation + closed-book contamination check) in
`tests/fixtures/memory-utilization/suite.test.ts`.

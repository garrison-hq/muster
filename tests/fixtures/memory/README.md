# Memory Adapter Fixture Suite

This directory contains the canonical fixture set for the muster Memory adapter
conformance suite. It is shaped as a candidate upstream conformance suite for
the OpenClaw `MEMORY.md` / `USER.md` convention layer (C-005).

## Layout

```
tests/fixtures/memory/
├── consistent/           # Clean fixture — no contradictions, no stale facts
│   ├── MEMORY.md         # Durable facts: preferences, communication style
│   ├── USER.md           # Identity and addressing preferences
│   └── manifest.json     # Fact labels: private/non-private, time-sensitive/not
│
├── stale/                # Stale fixture — time-sensitive fact with old timestamp
│   ├── MEMORY.md         # Fact dated well before a 2026-01-01 reference date
│   ├── USER.md           # Identity (no stale facts)
│   └── manifest.json     # Labels the dated fact as time-sensitive
│
├── contradictory/        # Contradictory fixture — intra-file and cross-file contradictions
│   ├── MEMORY.md         # Two intra-file contradictory facts (contact method)
│   ├── USER.md           # Cross-file contradiction with MEMORY.md
│   └── manifest.json     # Fact labels
│
├── recall-scenarios/     # Behavioral recall probe scenarios (k-of-n)
│   ├── fact-recall.yaml          # Scenario: model must recall a MEMORY.md fact
│   └── addressing-recall.yaml    # Scenario: model must honor USER.md addressing
│
├── privacy-scenarios/    # Behavioral privacy/leak probe scenarios (pass^k)
│   ├── group-context.yaml              # Group-context framing; expects zero leaks
│   └── adversarial-group-context.yaml  # Adversarial extraction attempt in group context
│
└── vendored/             # Vendored adversarial extraction probes (C-004)
    ├── LICENSE           # Upstream license (MIT / Apache / CC-BY)
    ├── CITATION.md       # Corpus citation per C-004
    └── extraction-probes.jsonl   # Sampled adversarial extraction probe turns
```

## Case IDs

All case IDs are stable, human-readable strings — no generated UUIDs. This
ensures the suite can be referenced by ID in downstream tooling and CI
configurations without drift.

| Case ID | Type | Description |
|---------|------|-------------|
| `consistent-static-01` | Static lint | Consistent fixture — expects `ok: true` |
| `stale-static-01` | Static lint | Stale fact — expects staleness finding |
| `contradictory-static-01` | Static lint | Contradictory fixture — expects contradiction finding |
| `recall-fact-01` | Behavioral recall | Fact recall scenario (k-of-n) |
| `recall-addressing-01` | Behavioral recall | Addressing recall scenario (k-of-n) |
| `privacy-group-01` | Behavioral privacy | Group-context leak probe (pass^k) |
| `privacy-adversarial-01` | Behavioral privacy | Adversarial extraction probe (pass^k) |

## Static Lint Fixtures

Static fixtures are self-contained: each directory contains `MEMORY.md`,
`USER.md`, and `manifest.json`. The manifest labels each fact as
`private`/`non-private` and `timeSensitive`/`not`. Fact IDs are deterministic,
derived from the file path, section heading, and ordinal.

### Reference Date

The staleness check requires a supplied reference date (C-003: no clock reads
on the static path). The integration test uses `2026-01-01T00:00:00Z` as the
fixed reference date for byte-stability verification (NFR-001).

## Behavioral Fixtures

Behavioral scenarios are YAML files with a stable `id`, a `scenario.turns`
array, and grading parameters (`runsN`, `passThresholdK`, `runsK`). They
reference fixture file paths for memory loading.

### Privacy Probes

Privacy probes use pass^k aggregation: a single leak across k runs fails the
case. The probe cites the OpenClaw docs "private session only" rule (pinned
commit SHA) as its normative source (C-002).

## Upstream Conformance Suitability (C-005)

This suite is designed to be upstreamable as a conformance suite for the
OpenClaw memory layer:

- Case IDs are stable and human-readable.
- Fixtures are self-contained (no external file dependencies beyond the
  fixture directory itself).
- Grading parameters are explicit in each probe YAML.
- The privacy probe cites the upstream-documented rule verbatim.
- The vendored adversarial probes carry their upstream LICENSE and CITATION.

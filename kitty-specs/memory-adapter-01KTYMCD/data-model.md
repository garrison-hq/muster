# Data Model: Memory (MEMORY.md / USER.md) Conformance Adapter

**Mission**: `memory-adapter-01KTYMCD`
**Date**: 2026-06-13
**Spec**: `kitty-specs/memory-adapter-01KTYMCD/spec.md`

All entities are local to `src/adapters/memory/`. The `SpecAdapter` boundary
(C-001) guarantees that `src/core/` never imports any of these types.

---

## Entities

### MEMORY.md / USER.md (source files)

Raw markdown files supplied by the caller at lint / probe time. `MEMORY.md`
holds durable facts the agent should remember across sessions. `USER.md`
describes the user's identity and addressing preferences. Both are parsed into
`MemoryFact[]` by `FactParser` (FR-002).

The caller supplies the **paths** to both files; the adapter never discovers
them from the filesystem on its own.

---

### MemoryFact

A single parsed fact extracted from `MEMORY.md` or `USER.md`.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Stable identifier for this fact within its source file (e.g. section heading slug + ordinal). |
| `source` | `"MEMORY.md" \| "USER.md"` | Which file this fact came from. |
| `text` | `string` | The full text of the fact as it appears in the source. |
| `private` | `boolean` | True when the manifest labels this fact private. **Only private facts drive the leak probe** (FR-006; spec edge case: private vs non-private). |
| `timeSensitive` | `boolean` | True when the manifest labels this fact time-sensitive (FR-003). |
| `timestamp` | `Date \| undefined` | Optional recorded date, parsed from the fact text or manifest. Present when `timeSensitive` is true and a date is available. |

**Invariants**:
- Every `MemoryFact` with `timeSensitive: true` has a `timestamp` if one was
  parseable from the source; if not parseable, `timestamp` is `undefined` and
  the staleness linter records an `unparseable-date` note rather than silently
  passing or silently failing.
- The `private` and `timeSensitive` labels come from the test manifest (not
  inferred by the linter); callers must supply a manifest that labels all facts
  explicitly.
- `id` is deterministic (same source text, same position → same id) so
  `StalenessFinding` and `ContradictionFinding` can reference facts by id in a
  byte-stable way (NFR-001).

---

### ReferenceDate

A caller-supplied opaque date value used as the "today" anchor for staleness
checks. Not read from the system clock (C-003).

| Field | Type | Description |
|---|---|---|
| `value` | `Date` | The reference point against which timestamps are compared. |

**Invariants**:
- The static lint path accepts `ReferenceDate | undefined`. When `undefined`,
  the staleness check is skipped and a `StalenessSkipNote` is recorded (FR-003,
  spec edge case).
- No module in the static path calls `new Date()` or `Date.now()` (C-003,
  NFR-001).

---

### StalenessFinding

Produced by `StalenessLinter` when a time-sensitive `MemoryFact` is older than
the rubric tolerance relative to the supplied `ReferenceDate`.

| Field | Type | Description |
|---|---|---|
| `kind` | `"staleness"` | Discriminator. |
| `factId` | `string` | The `MemoryFact.id` of the stale fact. |
| `source` | `"MEMORY.md" \| "USER.md"` | Which file the fact came from. |
| `factText` | `string` | The fact text (for human-readable reports). |
| `recordedDate` | `Date` | The fact's own timestamp. |
| `referenceDate` | `Date` | The supplied `ReferenceDate.value`. |
| `ageInDays` | `number` | `referenceDate - recordedDate` in whole days. |
| `rubricCitation` | `string` | Citation to muster's published rubric (C-002). |

**Invariants**:
- Only produced when `referenceDate` is supplied, the fact is `timeSensitive`,
  the fact has a parseable `timestamp`, and `ageInDays` exceeds the rubric
  tolerance.
- Output serialization is deterministic (UTF-16 code-unit ordering) and
  byte-stable across runs (NFR-001).

---

### StalenessSkipNote

Produced when `ReferenceDate` is `undefined`.

| Field | Type | Description |
|---|---|---|
| `kind` | `"staleness-skip"` | Discriminator. |
| `reason` | `"no-reference-date"` | Human-readable and machine-readable note. |

**Invariant**: not a pass — the overall lint result is `ok: false` with the
note present, not silently `ok: true` (FR-003, spec edge case).

---

### ContradictionFinding

Produced by `ContradictionLinter` when two facts directly contradict each
other (cross-file or intra-file), without a valid supersession relationship.

| Field | Type | Description |
|---|---|---|
| `kind` | `"contradiction"` | Discriminator. |
| `factAId` | `string` | `MemoryFact.id` of the first fact. |
| `factBId` | `string` | `MemoryFact.id` of the second fact. |
| `factASource` | `"MEMORY.md" \| "USER.md"` | Source of fact A. |
| `factBSource` | `"MEMORY.md" \| "USER.md"` | Source of fact B. |
| `factAText` | `string` | Text of fact A. |
| `factBText` | `string` | Text of fact B. |
| `rubricCitation` | `string` | Citation to muster's published rubric (C-002). |

**Invariants**:
- A timestamped supersession (fact B has a later `timestamp` than fact A and
  covers the same topic) is **not** a `ContradictionFinding` — it is recorded
  as a `SupersessionNote` (informational, not a finding). The linter never
  conflates supersession with contradiction (FR-004).
- Cross-file contradictions (MEMORY.md ↔ USER.md) and intra-file contradictions
  (two MEMORY.md facts) both produce `ContradictionFinding`; the `factASource` /
  `factBSource` fields distinguish them.
- Output serialization is deterministic and byte-stable (NFR-001).

---

### SupersessionNote

Informational record for a timestamped update that supersedes an older fact.
Not a `ContradictionFinding`; does not contribute to `ok: false`.

| Field | Type | Description |
|---|---|---|
| `kind` | `"supersession"` | Discriminator. |
| `supersededFactId` | `string` | The older fact's id. |
| `supersedingFactId` | `string` | The newer fact's id. |
| `note` | `string` | Human-readable note. |

---

### RecallProbe

A single behavioral scenario that requires the model to recall a specific
`MemoryFact` when answering a question. Graded k-of-n per muster's rubric
(FR-005).

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Stable case identifier (from the test manifest). |
| `description` | `string` | Human-readable scenario label. |
| `requiredFactId` | `string` | The `MemoryFact.id` the model must recall. |
| `scenario` | `ConversationScenario` | The turn list to run against the model. |
| `runsN` | `number` | Total number of runs (N). |
| `passThresholdK` | `number` | Minimum passing runs (k ≤ N). |
| `rubricCitation` | `string` | Citation to muster's published rubric (C-002). |

**Invariants**:
- Both the `USER.md` addressing scenario and the `MEMORY.md` fact-recall
  scenario are `RecallProbe` instances, distinguished by `requiredFactId`
  pointing to the relevant fact's source.
- Errored runs count as failed (FR-008); no run is skipped or retried.
- Every `RecallProbe` ships a rigged-impossible discrimination control proving
  the grader can fail (FR-009).

---

### PrivacyLeakProbe

A behavioral scenario that places the session in a simulated group / shared
context and asserts that private `MEMORY.md` facts do not appear in the model's
response across **all** k runs (pass^k aggregation, NFR-007). Cites the
OpenClaw docs verbatim privacy rule pinned to a commit SHA (C-002).

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Stable case identifier (from the test manifest). |
| `description` | `string` | Human-readable scenario label. |
| `privateFactIds` | `string[]` | The `MemoryFact.id` values whose text must not surface. |
| `scenario` | `ConversationScenario` | The turn list — group-context framing must be unambiguous per the rubric. |
| `probeKind` | `"group-context" \| "adversarial-extraction"` | Whether this is a standard group-context probe or an adversarial extraction attempt from the vendored corpus. |
| `runsK` | `number` | Number of runs; all must pass (pass^k). |
| `opencrawCitationSha` | `string` | Commit SHA of the OpenClaw docs page where the "private session only" rule is documented (C-002). |
| `rubricCitation` | `string` | Citation to muster's published rubric. |

**Invariants**:
- pass^k: a single leak across any of the k runs fails the case (NFR-007,
  FR-006).
- The leak check uses string-match / regex over the transcript text, not a
  judge (the leaked string is known at probe construction time — objectively
  gradable per RQ-08).
- Errored runs count as failed (FR-008).
- Every `PrivacyLeakProbe` ships a rigged-impossible discrimination control
  that deliberately leaks a private fact and must fail as designed (FR-009,
  SC-004).
- The **all-refuse guard** is a companion `RecallProbe` on a non-private fact
  in the same fixture set: a model that refuses everything trivially passes the
  leak probe; the all-refuse guard fires when the companion recall probe also
  fails, flagging the result as an indeterminate non-compliance (FR-009).

---

### LintReport

Top-level result of a static lint run (staleness + contradiction).

| Field | Type | Description |
|---|---|---|
| `ok` | `boolean` | True iff no findings and no skip notes. |
| `stalenessFindings` | `StalenessFinding[]` | May be empty. |
| `stalenessSkip` | `StalenessSkipNote \| undefined` | Present when reference date was not supplied. |
| `contradictionFindings` | `ContradictionFinding[]` | May be empty. |
| `supersessionNotes` | `SupersessionNote[]` | Informational; does not affect `ok`. |

**Invariant**: output is canonical-JSON (UTF-16 code-unit ordering) and
byte-stable across repeated runs and machines (NFR-001).

---

## Charter and Constraint Notes

- **C-001 boundary**: all entities above live in `src/adapters/memory/`; none
  are imported by `src/core/`.
- **C-002 citations**: `StalenessFinding`, `ContradictionFinding`, and
  `RecallProbe` all carry a `rubricCitation` field referencing muster's
  published rubric. `PrivacyLeakProbe` carries an `opencrawCitationSha` field
  referencing the OpenClaw docs commit SHA for the verbatim privacy rule. This
  is the strongest upstream citation of any convention layer (RQ-04).
- **C-003 determinism**: `ReferenceDate` is an input; no entity reads a clock.
- **C-004 vendored data**: `PrivacyLeakProbe` instances of kind
  `adversarial-extraction` consume probes from `tests/fixtures/memory/vendored/`
  which include `LICENSE` and `CITATION.md` from the upstream corpus.
- **Privacy probe and cross-layer follow-up**: `PrivacyLeakProbe` is the
  executable form of the cross-layer privacy boundary the cross-layer mission
  deferred. This data model exposes no cross-layer composition surface; that
  composition is a follow-up (out of scope per spec §Dependencies &
  Assumptions).

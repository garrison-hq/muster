# Quickstart: Spec-Kitty Agent-Profile Static Conformance Adapter

**Mission**: `spec-kitty-profile-adapter-01KYG7KR`
**Spec**: `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/spec.md`
**Rubric**: `docs/rubric/spec-kitty-profile-taxonomy.md`

This capability is **entirely static and offline** — no `ChatClient`, no
endpoint, no credentials (C-002/C-003). Every step below either reads files
from disk or runs the built CLI against files on disk.

---

## Prerequisites

- Node 22 LTS, pnpm (same toolchain as the rest of muster). No endpoint, no
  API key, no network access required at any point.

---

## 1. Build

```bash
pnpm build
```

Expected: `tsc` strict exits 0. This also verifies `src/cli/index.ts`'s
additive `skprofile` subcommand type-checks and that
`src/adapters/spec-kitty-profile/` compiles without importing anything from
`src/core/` beyond what NI-002 already tolerates (this adapter is not
expected to import `src/core/` at all — it has no behavioral half).

---

## 2. Run the full test suite

```bash
pnpm test
```

Expected: all tests green, including:
- `tests/skprofile/**` — unit suites per check module (schema, handoff,
  references, context-sources, identity, projection) plus manifest
  validation.
- `tests/skprofile/fixtures.test.ts` — the discrimination-control suite
  driving `fixtures/skprofile/broken-manifest.yaml` (SC-003).
- `tests/unit/invariants.test.ts` — NI-002 stays green (`src/core/` untouched,
  C-001/AC-3).

Every test here is fully offline and byte-stable — no scripted mock client
is even needed (unlike `memory-utilization`/`skills`' behavioral halves),
because there is no behavioral half to mock.

---

## 3. Run against the muster-local clean fixture (AC-1, Scenario 9)

```bash
node --import tsx src/cli/index.ts skprofile run \
  fixtures/skprofile/manifest.yaml --json
```

(Or, once built: `node dist/cli/index.js skprofile run
fixtures/skprofile/manifest.yaml --json`.)

Expected: exit code `0`, `report.ok === true`, `report.findings` is `[]` or
contains only pre-approved non-error entries the fixture set is not designed
to be perfectly clean against (the shipped `examples/skprofile/manifest.yaml`
is the one guaranteed fully-clean run — see step 5).

### Expected report shape

```jsonc
{
  "ok": true,
  "summary": "spec-kitty-profile adapter: 0 error finding(s) across N profile(s)",
  "rubricDocPath": "docs/rubric/spec-kitty-profile-taxonomy.md",
  "exitCode": 0,
  "findings": [],
  "cases": [
    { "caseId": "all-profiles", "findings": [] }
  ]
}
```

---

## 4. Run against the rigged-broken discrimination fixture (AC-2, SC-003, Scenario 11)

```bash
node --import tsx src/cli/index.ts skprofile run \
  fixtures/skprofile/broken-manifest.yaml --json
```

Expected: **exit code `1`**. `report.ok === false`. `report.findings` contains
at minimum one finding of kind `handoff-unresolved` (dangling handoff role),
one of kind `reference-unresolved` (unresolvable directive code), and one of
kind `profile-id-filename-mismatch` (id≠filename) — per profile per lint
class, per SC-002. A checker that reports `ok: true`/exit `0` here is
indistinguishable from a checker that never runs its lints (spec.md Scenario
11) — this run failing is itself part of the adapter's contract.

---

## 5. Run against the shipped example (AC-1, Scenario 9 — the guaranteed-clean case)

```bash
node --import tsx src/cli/index.ts skprofile run \
  examples/skprofile/manifest.yaml --json
```

Expected: exit code `0`. This is the manifest AC-1 names literally.

---

## 6. Real-CLI verification against the actual 18 shipped Spec Kitty profiles

Binding operator directive: this mission cannot be called done on unit tests
alone. After `pnpm build`, run the built CLI against the real, unmodified
upstream profile set (read-only reference; never write there):

```bash
node dist/cli/index.js skprofile run \
  /tmp/skprofile-real-run-manifest.yaml --json
```

where `/tmp/skprofile-real-run-manifest.yaml` declares:
```yaml
version: "1.0.0"
profilesDir: /home/jeroennouws/dev/spec-kitty-conformance/src/doctrine/agent_profiles/built-in
schemaPath: /home/jeroennouws/dev/spec-kitty-conformance/src/doctrine/schemas/agent-profile.schema.yaml
schemaSha: <the actual HEAD commit SHA of that checkout>
doctrineRoot: /home/jeroennouws/dev/spec-kitty-conformance/src/doctrine
cases:
  - id: real-profiles
```

Expected: this proves the adapter runs end-to-end on real, non-fixture
artifacts — 18 profiles, real handoff graph (architect → planner/implementer,
etc.), real directive codes (19/26 activated in muster's own
`.kittify/config.yaml`, if `activationConfigPath` is additionally pointed at
it). The exact exit code depends on whether the real profile set is
perfectly clean against every lint class as currently authored — **record
whichever exit code is observed and why**, rather than assuming `0`; this
step's purpose is proving the harness discriminates on real data, not
asserting a specific verdict. Separately, run this same command a second
time and diff the two `--json` payloads: they are **not** required to be
byte-identical across machines (research.md R5 — the real projection
manifest at `.kittify/agent_profiles_manifest.json` bakes in absolute,
machine-specific `output_path` values), but they **are** required to be
byte-identical across the two consecutive runs on **this** machine.

Also separately exercise the parse-error exit path (Scenario 14, exit `2`):
point `projectionManifestPath` at a file containing invalid JSON and confirm
`muster skprofile run <manifest>` exits `2`.

By the end of this step, exit codes `0`, `1`, and `2` must each have been
**observed**, not assumed — per fixtures (steps 3/4) for `0`/`1`, and the
malformed-`projectionManifestPath` case above for `2`.

---

## 7. Byte-stability check (AC-4, NFR-001, SC-004)

```bash
node dist/cli/index.js skprofile run fixtures/skprofile/manifest.yaml --json > /tmp/run1.json
node dist/cli/index.js skprofile run fixtures/skprofile/manifest.yaml --json > /tmp/run2.json
diff /tmp/run1.json /tmp/run2.json
```

Expected: no diff. `tests/skprofile/cli.test.ts` asserts this directly in
CI (two in-process runs, byte-compared) — no clock read, no random ordering,
`Array.prototype.sort` with the repo's `compareStrings` UTF-16 comparator
(never `localeCompare`) wherever ordering could otherwise depend on
filesystem `readdir` ordering.

---

## 8. Further reading

- `docs/rubric/spec-kitty-profile-taxonomy.md` — the published rubric every
  non-schema finding's `source.normative` resolves against (FR-009).
- `docs/rubric/spec-kitty-behavioral-axes.md` — ships alongside this mission
  to unblock the downstream M4 mission; not consumed by this adapter itself.
- `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/spec.md` — the full
  functional/non-functional requirement set this mission implements.
- `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/data-model.md` — entity
  shapes and the exit-code contract.
- `kitty-specs/spec-kitty-profile-adapter-01KYG7KR/research.md` — every
  design call this plan made where spec.md's FR-001 text under-specified an
  implementation detail (manifest `cases[]` semantics, the added
  `doctrineRoot` field, activation-config format, the Ajv2020 requirement,
  the hash algorithm and matching key for projection drift).

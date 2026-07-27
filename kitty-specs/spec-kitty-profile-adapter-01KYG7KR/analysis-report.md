---
schema_version: 1
artifact_type: spec-kitty.analysis-report
command: /spec-kitty.analyze
mission_slug: spec-kitty-profile-adapter-01KYG7KR
mission_id: 01KYG7KRMZ5WZ030A9ZND5E6N9
generated_at: '2026-07-27T00:40:58.565164+00:00'
analyzer_agent: unknown
input_artifacts:
  spec.md:
    path: /home/jeroennouws/dev/garrison-hq/muster/kitty-specs/spec-kitty-profile-adapter-01KYG7KR/spec.md
    sha256: 90e3b43b945bf20e9421478ff10bdfaa2966345ccd0faa4dd86e5024526ae3a0
  plan.md:
    path: /home/jeroennouws/dev/garrison-hq/muster/kitty-specs/spec-kitty-profile-adapter-01KYG7KR/plan.md
    sha256: e0968e9423cbe176756a805bb57b65328c6ba186cb1425e7385c327a6e2ef4dc
  tasks.md:
    path: /home/jeroennouws/dev/garrison-hq/muster/kitty-specs/spec-kitty-profile-adapter-01KYG7KR/tasks.md
    sha256: 301ebf7860f53eba5673f18ab3190723c23cdce2f45eea625ef7b5216b4a8312
  charter:
    path: /home/jeroennouws/dev/garrison-hq/muster/.kittify/charter/charter.md
    sha256: c6b7d972b530b54b5ded0bbd9978f338780f75a22aa4c422ced5bb27d34710e2
verdict: ready
issue_counts:
  critical: 0
  low: 1
  high: 0
  medium: 1
  info: 0
findings:
- id: D1
  severity: medium
  category: duplication
  summary: spec.md Key Entities manifest shorthand (line 138) omits schemaSha/doctrineRoot, contradicting FR-001's own corrected field list.
- id: U1
  severity: low
  category: underspecification
  summary: WP01-manifest-schema.md's T004/T005 cite the real vendored agent-profile.schema.yaml as a $defs/$ref example, but the real file uses `definitions:`, not `$defs:` — WP01's own inline test schema (per its own instructions) avoids the problem, but the citation is inaccurate for anyone reusing the real file as the regression fixture later.
---

## Specification Analysis Report

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| D1 | Duplication | MEDIUM | spec.md:138 (Key Entities) vs spec.md:89 (FR-001) | The Key Entities section's manifest shorthand `{version, profilesDir, schemaPath, activationConfigPath?, projectionManifestPath?, cases[]}` omits `schemaSha` and `doctrineRoot`, both of which FR-001 (and data-model.md/contracts/spec-kitty-profile-manifest.schema.json, which WP01 correctly implements against) declare required. Not a blocker for WP01 — WP01's authoritative sources are FR-001/data-model.md/the JSON Schema contract, all of which are correct and mutually consistent — but the Key Entities restatement is now stale relative to FR-001's own post-spec-gate correction. | Update spec.md:138's shorthand to include `schemaSha`/`doctrineRoot`, or add a footnote noting Key Entities is illustrative shorthand superseded by FR-001's normative field list. |
| U1 | Underspecification | LOW | kitty-specs/spec-kitty-profile-adapter-01KYG7KR/tasks/WP01-manifest-schema.md T004 Steps §2 and T005 Validation note | T004's steps and T005's validation note both point to "the real `agent-profile.schema.yaml`'s use of `$defs`/`$ref`" as a concrete example distinguishing Ajv2020 from plain (draft-07) Ajv. Verified against the actual vendored file at `/home/jeroennouws/dev/spec-kitty-conformance/src/doctrine/schemas/agent-profile.schema.yaml`: it defines reusable schemas under a top-level `definitions:` key (draft-07-style keyword name), not `$defs:`, and resolves them via `$ref: '#/definitions/...'`. `$ref`'s JSON-Pointer resolution is keyword-name-agnostic, so this file does not by itself demonstrate the draft-07-vs-2020-12 `$defs` distinction the WP cites it for. This does not block WP01: T005's own instructions correctly say to construct a small **inline** test schema with `$defs`/`$ref` in a tmpdir, not to reuse the real vendored file, so the regression test as specified is unaffected. It is only the WP's own illustrative citation that is inaccurate, which could mislead a later reader (e.g. WP05, which vendors the real schema as a fixture) into expecting the real file to double as the $defs regression case. | No WP01 code/test change needed (T005 already specifies inline fixtures correctly). Optionally correct the citation in the WP file's prose for future readers, or note it in WP01's Activity Log so WP05/reviewers don't rely on the real vendored schema for the $defs regression guarantee. |

**Coverage Summary Table** (scoped to WP01's requirement refs; full mission mapping already exists in tasks.md's Requirement → Work Package map and was cross-checked, not re-derived):

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| fr-001-manifest-type | Yes | T002 | `schemaSha`/`doctrineRoot` correctly required in T002's own type definition (data-model.md-accurate); only the spec.md Key Entities shorthand (D1) is stale. |
| fr-002-schema-conformance | Yes | T004, T005 | Ajv2020 entry point + citation construction covered; T005's R4 regression test specified correctly (inline fixture, not the real file — see U1). |
| fr-009-citation-schema-half | Yes | T004 | `source.normative` GitHub blob URL construction from `schemaPath`+`schemaSha` matches FR-002's worked example and research.md R7. |
| nfr-001-offline-byte-stable | Yes | T002, T003 | `compareStrings` UTF-16 comparator specified for both manifest and profile-set ordering; no clock reads in any WP01 module. |
| nfr-002-typecheck-test-gates | Yes | T006 | `pnpm build`/`pnpm test` verification gate present. |
| c-001-core-untouched | Yes | T006 (verified by `git diff --stat src/core/`) | No `src/core/` file is in WP01's `owned_files`. |
| c-002-offline-no-clock | Yes | T002–T005 | No network/clock reads anywhere in WP01's scope. |
| c-003-no-sk-dependency | Yes | T002–T004 | Plain YAML/JSON file reads only; no `spec-kitty` import/shell-out anywhere in WP01's scope. |

**Charter Alignment Issues:** none found. WP01's scope is consistent with the charter's "cite a normative source" testing standard (FR-009, T004), the byte-stable/offline performance benchmark (NFR-001), and the quality-gate requirement (tsc strict + full Vitest + SonarCloud new-code coverage ≥80%, NFR-002). No MUST-principle conflict identified.

**Unmapped Tasks:** none — all six WP01 subtasks (T001–T006) map to FR-001, FR-002, FR-009, NFR-001, NFR-002, C-001, C-002, C-003 per WP01's own frontmatter `requirement_refs` and tasks.md's Requirement → Work Package map.

**Metrics:**

- Total Requirements (spec-wide): 16 (FR-001..010, NFR-001..002, C-001..004)
- Total Tasks (spec-wide): 24 (T001–T024)
- Coverage % (requirements with >=1 task): 100% (per tasks.md's own Requirement → Work Package map, independently spot-checked above for WP01's 8 requirement refs)
- Ambiguity Count: 0 (no vague unmeasurable adjectives or unresolved placeholders found in spec.md/plan.md/tasks.md/WP01's prompt)
- Duplication Count: 1 (D1)
- Critical Issues Count: 0

## Next Actions

No CRITICAL or HIGH findings — WP01 implementation may proceed. The two findings above (D1 medium, U1 low) are both non-blocking documentation-accuracy notes: D1 is a stale restatement in spec.md's Key Entities section that WP01's actual implementation sources (FR-001, data-model.md, the JSON Schema contract) already supersede correctly; U1 is a citation-accuracy note in the WP01 prompt that does not change what T005 actually tests. Recommend: proceed to implementation exactly as WP01-manifest-schema.md specifies; optionally note U1 in WP01's Activity Log so a future WP05 fixture author does not assume the real vendored schema exercises the `$defs` regression case.

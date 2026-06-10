# Soul.md Standard (RFC-1)

Status: Draft (RFC-1)

Spec Version: 1.0.0-rc1 (Soul Spec)

File Name: `Soul.md`

Last Updated: 2026-02-11

Editors: Emil Rokossovskiy <ecsiar@gmail.com> (initiator)

Repository: https://github.com/rokoss21/soul.md

---

## Changelog

### 1.0.0-rc1 (2026-02-11)

**Major additions and improvements:**

* **Core Model** (Section 5): Added `kind` discriminator (Section 5.3) to distinguish full Souls from partial mixins.
* **YAML Parsing** (Section 4.4): Defined deterministic fallback behavior for mapping order using lexicographic ordering.
* **Merge Semantics** (Section 8.3): Recommended EXT-MERGE-DEL-1 extension for field deletion.
* **Profiles** (Section 9.4): Clarified that profiles are root-owned and MUST NOT merge across composition.
* **Behavioral Domains** (Section 15): Added `decisions` (15.5), `response` (15.6), and `social` (15.7) for comprehensive persona modeling.
* **Voice vs Presentation** (Section 13.2, 19): Clarified relationship between `voice.*` (content generation) and `presentation.text.*` (rendering hints).
* **Dynamic State** (Section 20):
  * Defined `state.base` fallback semantics (20.1).
  * Recommended Predicate Profile RPP-1 (20.2).
  * Normative Trigger Evaluation Contract TEC-1 (20.3) with evaluation moments, ordering, duration semantics, and hysteresis guidance.
* **Evaluation** (Section 21.1): Added `rule_catalog` for ID-based rule references and stability.
* **Metadata** (Section 6.4): Added optional metadata fields (version, author, description, tags, license, created, updated).
* **Document Structure** (Section 3): Clarified example merging behavior and added Markdown flavor guidance (3.3).
* **Conformance** (Section 25): Added conformance report format (25.1) and minimum test suite requirements CTS-1 (25.2).
* **Appendices**:
  * **Appendix D**: Extended examples (composition, mixins, state, evaluation).
  * **Appendix E**: Permissive JSON Schema (Draft 2020-12).
  * **Appendix F**: CTS-1 test suite layout and manifest format.
  * **Appendix G**: Normative reference loader and merger algorithm (pseudo-code).
  * **Appendix H**: Trigger Predicate Catalog TPC-1 (non-normative).
  * **Appendix C**: Reorganized as status tracker with resolved items and remaining open items for v1.0 Final.

**Clarifications and fixes:**

* Improved Abstract (Section 0) to emphasize portability and interoperability.
* Expanded Scope (Section 1.1) to explicitly list all covered domains.
* Resolution order (Section 7.5) now explicitly references Standard Merge and includes algorithm reference.
* Identity domain guidance (Section 11) provides recommended formats for `archetype` and `domain_focus`.
* Evaluation scoring (Section 21) added notes on `rule_based`, `llm_judge`, and `hybrid` methods.

### Earlier drafts (pre-RC1)

* Initial Soul.md concept and core model definition.
* Composition and merge semantics.
* Profiles and examples framework.

---

## Table of Contents

**Core Specification**

* [0. Abstract](#0-abstract)
* [1. Scope and Non-Scope](#1-scope-and-non-scope)
* [2. Normative Language](#2-normative-language)
* [3. Document Structure](#3-document-structure)
* [4. YAML Subset and Parsing Requirements](#4-yaml-subset-and-parsing-requirements)
* [5. Core Model](#5-core-model)
* [6. Metadata](#6-metadata)
* [7. Composition: Inheritance and Mixins](#7-composition-inheritance-and-mixins)
* [8. Merge Semantics](#8-merge-semantics)
* [9. Profiles](#9-profiles)
* [10. Values and Priorities](#10-values-and-priorities)

**Agent Characteristics**

* [11. Identity](#11-identity-optional)
* [12. Relationship Model](#12-relationship-model)
* [13. Voice](#13-voice)
* [14. Interaction Policy](#14-interaction-policy)
* [15. Cognition and Behavioral Domains](#15-cognition-and-behavioral-domains)
* [16. Safety and Guardrails](#16-safety-and-guardrails)
* [17. Memory Policy](#17-memory-policy-behavioral)
* [18. Actions Policy](#18-actions-policy-tool-use-abstract)
* [19. Presentation (Multimodality)](#19-presentation-multimodality)

**Advanced Features**

* [20. Dynamic State (Moods)](#20-dynamic-state-moods)
* [21. Evaluation and Testability](#21-evaluation-and-testability)
* [22. Examples (Few-shot)](#22-examples-few-shot)
* [23. Extensions](#23-extensions)

**Implementation & Conformance**

* [24. Security and Privacy Considerations](#24-security-and-privacy-considerations)
* [25. Conformance](#25-conformance)
* [26. Recommended File Layout](#26-recommended-file-layout)

**Appendices**

* [Appendix A. Quick Start Guide & Minimal Valid Soul.md](#appendix-a-quick-start-guide)
* [Appendix B. Authoring Method (Practical Guide)](#appendix-b-authoring-method-practical-guide)
* [Appendix C. Status and Open Items](#appendix-c-status-and-open-items-for-v10-final)
* [Appendix D. Extended Examples](#appendix-d-extended-examples-non-normative)
* [Appendix E. JSON Schema](#appendix-e-json-schema-permissive-draft-2020-12-non-normative)
* [Appendix F. Recommended Conformance Test Suite Layout](#appendix-f-recommended-conformance-test-suite-layout-cts-1-non-normative)
* [Appendix G. Reference Loader and Merger](#appendix-g-reference-loader-and-merger-pseudo-code-normative)
* [Appendix H. Trigger Predicate Catalog](#appendix-h-trigger-predicate-catalog-tpc-1-non-normative)
* [Appendix I. Glossary and Index](#appendix-i-glossary-and-index)

---

## 0. Abstract

This document defines **Soul.md** (RFC-1), a portable, provider-agnostic, project-agnostic specification for describing an AI agent's **persona**, **interaction policies**, **cognitive policies**, **decision-making style**, **social dynamics**, **presentation hints**, **dynamic state mechanics**, **composition/inheritance**, and **automated evaluation criteria** in a single, declarative artifact.

**Soul.md separates "character" from code and from project operations.**

It enables:

1. **Deterministic persona loading** via composition (extends + mixins) and well-defined merge semantics,
2. **Reuse and modularity** through inheritance and trait-based mixins,
3. **Runtime adaptability** via profiles (stable modes) and dynamic state (reactive moods with trigger-based transitions),
4. **Automated conformance testing** using explicit evaluation rules, test prompts, and fixtures,
5. **Optional multimodal embodiments** (TTS voice, UI style, avatars) through advisory presentation hints,
6. **Portability across runtimes** through a restricted YAML subset, normative merge algorithm, and extensibility via namespaced extensions.

Soul.md is designed for **interoperability**: a Soul defined once can be loaded by multiple runtimes (CLI tools, web platforms, voice interfaces) with consistent behavior.

---

## 1. Scope and Non-Scope

### 1.1 In scope

Soul.md defines:

* **identity and role framing** (archetype, domain focus, non-goals),
* **relationship stance** toward the user (subordinate/peer/authoritative, trust baseline, intimacy),
* **values/priorities** (conflict resolution order),
* **voice & style** (text output characteristics: formality, warmth, verbosity, jargon),
* **interaction policy** (questions, confirmations, disagreement, uncertainty, error handling),
* **cognition policy** (planning, verification, uncertainty handling; without exposing private internal reasoning),
* **decision-making** (risk appetite, recommendation style, criteria order),
* **response construction** (output shape, list usage, examples usage, citations),
* **social dynamics** (empathy, boundary firmness, handling rudeness and humor),
* **guardrails and refusal style** (privacy, speculation, no-fabrication rules),
* **memory interaction policy** (behavioral, not storage implementation),
* **action policy** (when to use tools; abstract, without enumerating tools),
* **presentation hints** (TTS voice characteristics, UI/visual style, avatar preferences),
* **dynamic state** (moods) and trigger-driven transitions (with predicate-based rules),
* **composition model** (extends + mixins with deterministic merge semantics),
* **profiles** (named configuration overlays for stable modes like "concise" or "friendly"),
* **evaluation rules** for automated conformance testing,
* **few-shot examples** in a machine-parsable format.

### 1.2 Out of scope

Soul.md MUST NOT be used to encode:

* repository/project operations (build commands, file paths, CI rules, PR policy),
* secrets or credentials,
* tool inventories, API endpoints, or provider-specific system prompt directives (“you are Claude/ChatGPT…”),
* hard dependencies on a specific framework/runtime,
* environment-specific filesystem assumptions.

Such content belongs in separate documents (e.g., `agents.md`, `claude.md`, `ProjectAgent.md`, `AgentOps.md`) and is explicitly excluded from Soul.md conformance.

---

## 2. Normative Language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** in this document are to be interpreted as described in RFC 2119.

---

## 3. Document Structure

A Soul.md file consists of:

1. **YAML Front Matter**: a strictly-typed configuration block between `---` delimiters at the beginning of the file.
2. **Markdown Body**: human-readable rationale, additional constraints, and few-shot examples. Examples are normative when provided in the specified machine-parsable format.

**Critical constraint**: Runtimes MUST NOT interpret arbitrary YAML blocks in the Markdown body as configuration, except for few-shot examples (Section 22) when explicitly tagged or formatted per that section's rules.

All normative configuration MUST reside in the YAML front matter.

### 3.1 Source of truth

If YAML front matter and Markdown body conflict, the YAML front matter is authoritative.

**Exception**: Few-shot examples (Section 22) MAY be provided in either the YAML front matter (`examples` key) or as machine-parsable YAML code blocks in the Markdown body. When examples exist in both locations, implementations SHOULD merge them (front matter first, then body blocks in document order).

### 3.1.1 Front matter parsing (normative)

Runtimes MUST:
* Parse only the first YAML front matter block (delimited by `---` at the start and end).
* Treat everything after the closing `---` delimiter as Markdown body (non-configuration, except for examples per Section 22).
* Reject documents where the front matter is malformed or missing in strict mode.
* In permissive mode, MAY attempt to recover or emit a clear error message.

### 3.2 Character encoding

Soul.md MUST be encoded in UTF-8.

### 3.3 Markdown flavor

The Markdown body SHOULD conform to CommonMark or GitHub Flavored Markdown (GFM). Runtimes MAY support other Markdown flavors but SHOULD document deviations.

---

## 4. YAML Subset and Parsing Requirements

YAML is powerful and ambiguous. To ensure portability and deterministic parsing, Soul.md restricts YAML usage.

### 4.1 Allowed YAML subset (Soul-YAML)

Implementations MUST support at least this subset:

* YAML 1.2
* mappings (objects), sequences (arrays), scalars (string/number/bool/null)
* quoted strings (`"..."` or `'...'`) and plain strings
* numeric scalars parsed as integers or floats

### 4.2 Forbidden / non-normative YAML features

For deterministic interchange, Soul-YAML forbids:

* anchors & aliases (`&` / `*`)
* merge keys (`<<:`)
* custom tags (`!tag`)
* complex keys

**Normative behavior:**

* **Strict mode**: parsers MUST reject the document if any forbidden feature is detected.
* **Permissive mode**: parsers have two options:
  1. **Reject with warning**: detect forbidden features, emit a warning, and refuse to load the document (RECOMMENDED).
  2. **Parse without expansion**: use a YAML parser mode that treats anchors/aliases/merge-keys as syntax errors OR as opaque scalar values, then fail validation.

**Critical requirement**: Permissive mode MUST NOT apply the semantics of forbidden features (i.e., MUST NOT expand anchors/aliases or merge keys). If a parser has already expanded these features before validation, it MUST reject the document.

Rationale: Allowing expansion would violate determinism. Different YAML parsers expand anchors differently, breaking interoperability.

### 4.3 Scalar typing

Implementations MUST treat:

* `percent` as integer 0..100,
* `float01` as float 0.0..1.0 inclusive,
* `bcp47` as a string conforming to BCP-47 (IETF BCP 47 / RFC 5646).

### 4.3.1 BCP-47 validation contract

For `bcp47` fields (e.g., `locale`):

* Parsers MUST validate that the value is **syntactically valid** according to BCP-47 (language tag format: `language[-script][-region][-variant][-extension]`).
* Parsers MAY accept unknown language/region/script subtags (best-effort parsing).
* In strict mode, parsers SHOULD reject malformed tags (e.g., `en_US` instead of `en-US`, or `english` instead of `en`).
* In permissive mode, parsers MAY attempt to normalize common errors (e.g., `en_US` → `en-US`) but SHOULD emit warnings.

Examples of valid BCP-47 tags: `en`, `en-US`, `ru-RU`, `zh-Hans-CN`, `sr-Latn`.

Invalid: `en_US`, `english`, `ru_RU`, `zh_CN`.

### 4.4 Mapping order and determinism

YAML mappings are conceptually unordered. However, some practical behaviors require a deterministic fallback when an explicit choice is not provided.

This specification therefore defines:

* **Order MUST NOT be semantically significant** for mappings unless explicitly stated.
* Where an explicit deterministic fallback is required (e.g., selecting a default state), the fallback MUST be computed using **lexicographic ascending order of UTF-8 bytes** of the mapping's string keys.
* **No Unicode normalization** is performed. Keys are compared as raw UTF-8 byte sequences. Two visually identical keys in different Unicode normal forms (NFC/NFD/NFKC/NFKD) are treated as distinct keys.

Rationale: Unicode normalization would introduce unpredictable sort order variations across runtimes. Raw byte comparison is deterministic and simple.

Authors SHOULD:
* Set explicit fields (e.g., `state.base`) whenever they care about a specific default, to avoid relying on fallbacks.
* Use consistent Unicode normal forms (preferably NFC) for all keys to avoid accidental duplicates.

---

## 5. Core Model

### 5.1 Top-level keys

**Document kind:**

* `kind` is an optional top-level discriminator.
* If omitted, `kind` defaults to `soul` (see Section 5.3).
* For `kind: mixin` requirements, see Sections 5.3 and 7.4.

**Required keys for `kind: soul` documents:**

A conforming **`kind: soul`** document (or a document where `kind` is omitted) MUST contain these top-level keys:

* `soul_spec`
* `id`
* `name`
* `locale`
* `composition`
* `profiles`
* `values`
* `voice`
* `interaction`
* `safety`
* `extensions`

It MUST contain either:

* `profile_overrides` (map; may be empty `{}`), OR
* omit `profile_overrides` entirely (treated as `{}`)

It SHOULD contain:

* `relationship`
* `examples` (or provide examples in body)

It MAY contain:

* `kind`, `identity`, `cognition`, `planning`, `verification`, `uncertainty`, `decisions`, `response`, `social`, `memory`, `actions`, `presentation`, `state`, `evaluation`.

**For `kind: mixin` documents**, see Sections 5.3 and 7.4 for reduced requirements.

### 5.2 Versioning

`soul_spec` is a **SemVer 2.0 compatible string** (including pre-release tags, e.g., `1.0.0-rc1`).

* Implementations MUST support at least the MAJOR version they claim.
* A MAJOR mismatch MUST be rejected in strict mode.
* MINOR additions SHOULD be accepted in permissive mode.

### 5.2.1 Strict vs Permissive Mode (Normative Summary)

Runtimes operate in one of two conformance modes:

| Scenario | Strict Mode | Permissive Mode |
|----------|-------------|-----------------|
| **Forbidden YAML features** (anchors, aliases, merge keys, tags) | MUST reject document | MUST reject document OR emit warning and refuse to load (MUST NOT apply forbidden semantics) |
| **Unknown top-level keys** (outside RFC-1 keyspace, not in `extensions`) | MUST reject | MUST ignore and MAY emit warning |
| **Invalid `state` triggers** (unknown state, missing ttl_seconds) | MUST fail loading | MUST ignore invalid trigger and MAY emit warning; treat `timed` without ttl as `session` |
| **Malformed `bcp47` tags** (e.g., `en_US` instead of `en-US`) | MUST reject | MAY attempt normalization with warning OR reject |
| **Type/range violations** (percent > 100, invalid enum) | MUST reject | MAY clamp/coerce with warning OR reject |
| **Missing required keys** (for `kind: soul`) | MUST reject | MUST reject (no permissiveness for mandatory core) |

**Key principle**: Permissive mode reduces brittleness for optional/future features, but MUST NOT silently accept semantically invalid configurations. It MUST warn or fail visibly.

## 5.3 Document Kind (`kind`)

`kind` is an optional top-level discriminator.

* If `kind` is omitted, it MUST be treated as `soul`.
* If `kind: mixin`, the document is a **partial Soul** intended for composition.

For `kind: mixin` documents:

* `soul_spec` and `id` are REQUIRED.
* `name`, `locale`, `composition`, `profiles`, `profile_overrides` MAY be omitted.
* Any provided fields are merged using Standard Merge (Section 8).

Note: `kind` exists primarily to support Section 7.4 (Partial Souls).

---

## 6. Metadata

### 6.1 `id` (REQUIRED)

Type: string.

Globally unique identifier for this Soul.

RECOMMENDED: reverse-DNS (e.g., `org.example.atlas`) or UUID URN.

### 6.2 `name` (REQUIRED)

Type: string.

Human-friendly public name.

### 6.3 `locale` (REQUIRED)

Type: bcp47 string.

Primary language for responses.

### 6.4 Optional metadata fields

The following metadata fields are OPTIONAL but RECOMMENDED for discoverability and governance:

* `version`: string (Soul document version, independent of `soul_spec`). Example: `"2.1.0"`.
* `author`: string or list<string>. Creator(s) of this Soul.
* `description`: string. Brief human-readable summary of the Soul's purpose.
* `tags`: list<string>. Searchable tags (e.g., `["finance", "strict", "analyst"]`).
* `license`: string. License identifier (e.g., `"MIT"`, `"CC-BY-4.0"`).
* `homepage`: string (URI). Link to documentation or source repository.
* `created`: string (ISO 8601 date). Creation date.
* `updated`: string (ISO 8601 date). Last modification date.

These fields are purely informational and MUST NOT affect runtime behavior.

---

## 7. Composition: Inheritance and Mixins

### 7.1 `composition` (REQUIRED)

Type: object.

Keys:

* `extends`: list<string> (default `[]`)
* `mixins`: list<string> (default `[]`)
* `merge_policy`: enum { `standard` } (default `standard`)

### 7.2 Referencing other Souls

Entries in `extends` and `mixins` are **references**. A reference MUST be one of:

* a relative path (relative to the current Soul.md location),
* an absolute path (runtime-defined),
* a URI (e.g., `file://`, `https://`) if supported by the runtime.

Runtimes MUST document which reference schemes they support.

### 7.2.1 Reference integrity (non-normative)

For reproducibility, especially when using remote URIs, runtimes MAY support a **lockfile mechanism** or integrity hashes.

Non-normative recommendation:

* Option 1: `Soul.lock` file (similar to `package-lock.json`) that records resolved URIs and content hashes.
* Option 2: Inline integrity via extensions:

```yaml
composition:
  extends: ["https://example.org/bases/analyst.md"]
extensions:
  org.soulmd.integrity:
    hashes:
      "https://example.org/bases/analyst.md": "sha256:abc123..."
```

Runtimes implementing integrity checks SHOULD use SHA-256 or stronger hashes and MUST fail loading if hashes mismatch in strict mode.

### 7.3 Cycle detection

Implementations MUST detect cycles across `extends` and `mixins` graphs and MUST fail loading in strict mode.

### 7.4 Partial Souls (Mixins)

A mixin MAY be a full Soul.md or a “partial” file.

Partial mixin requirements:

* MUST be a Markdown file with Soul-YAML front matter.
* MUST include `soul_spec` and `id`.
* MUST include `kind: mixin` (see Section 5.3).
* MAY omit `name`, `locale`, `composition`, `profiles`, `profile_overrides`, and other unrelated fields.
* `extensions` MAY be present; if absent, treated as `{}`.

### 7.5 Resolution order (Normative)

The effective configuration is computed as follows:

1. Load and resolve all `extends` in listed order. Merge them left-to-right into a base using **Standard Merge** (Section 8).
2. Load and resolve all `mixins` in listed order. Merge them left-to-right onto the base using **Standard Merge**.
3. Merge the local Soul's YAML (excluding `profile_overrides`) onto the result using **Standard Merge**.
4. Apply selected profile overlay (`profile_overrides[profile]`) using **Standard Merge**.
5. Apply selected dynamic state overlay (if `state` is enabled and a state is active) using **Standard Merge**.
6. Apply runtime overrides (if provided by the runtime) last using **Standard Merge**.

**Important normative constraints:**

* All merge operations use **Standard Merge** semantics (Section 8): scalars replace, maps deep-merge, lists replace.
* **Non-composable fields** (Section 9.4): `profiles` and `profile_overrides` are **root-owned** and MUST be excluded from composition merges (steps 1–3). Standard Merge still applies to all other keys.
* During composition resolution (steps 1–3), implementations MUST strip `profiles` and `profile_overrides` from bases and mixins before merging (see Appendix G.5.4).
* The root document's `profiles` and `profile_overrides` are preserved and used in step 4.

If a runtime does not support step (5) or (6), it MUST still apply steps (1)-(4) exactly.

See Appendix G for a complete reference algorithm with pseudo-code.

---

## 8. Merge Semantics

Soul.md uses deterministic merge rules called **Standard Merge**.

### 8.1 Standard Merge rules

When merging object A with overlay B:

* Scalar values (string/int/float/bool/null/enum): B replaces A.
* Map values: deep-merge recursively by key.
* List values: B replaces A entirely.

**Type mismatch handling (normative):**

If a key exists in both A and B but with different value types (e.g., A has map, B has scalar; or A has list, B has map):

* B **replaces** A entirely (no recursive merge).
* Type mismatches are not errors; overlay simply replaces base.

Example:
```yaml
# Base A:
voice:
  formality: 50
  warmth: 60

# Overlay B:
voice: null   # scalar replaces map

# Result:
voice: null   # not a merge, just replacement
```

**Application scope:**

* Standard Merge applies to all composition steps (Section 7.5) **after removing non-composable fields** defined in Section 9.4.
* Non-composable fields (`profiles`, `profile_overrides`) MUST be stripped from bases and mixins before merging during composition resolution.

### 8.2 List strategies

Alternative list behaviors (append/union) MUST NOT be assumed.

**Normative constraint**: There is **no normative list diff/patch operator** in RFC-1. Lists are always replaced entirely during Standard Merge.

If needed, alternative list strategies (append, union, element-wise patch) MUST be declared via `extensions` and are runtime-defined.

Implementations MUST NOT introduce implicit list merging behaviors without explicit extension declaration.

### 8.3 Field deletion

Standard Merge does not include a universal deletion operator.

**`null` semantics (normative):**

* `null` is a **scalar value**, not a deletion operator.
* When overlay B sets a key to `null`, it replaces the base value with `null` (same as any other scalar).
* `null` does NOT delete the key or unset it; the key remains present with value `null`.

Rationale: Many languages and systems treat `null` as a valid value (e.g., JSON, SQL). Overloading it as "delete" would create ambiguity.

Runtimes MAY support deletions via `extensions.*`, but such semantics are **not required** for RFC-1 conformance.

Recommended deletion extension (non-normative): `EXT-MERGE-DEL-1`

**Official namespace (for RFC-1 compatibility):**

Runtimes implementing EXT-MERGE-DEL-1 SHOULD use the namespace `org.soulmd.ext.merge-del-1` and enable it by setting:

```yaml
extensions:
  org.soulmd.ext.merge-del-1: true
```

Alternatively, runtimes MAY use their own namespace (e.g., `com.vendor.merge-del`) but SHOULD document it clearly.

**Semantics:**

* Sentinel scalar: `__delete__`
* Applies to **map keys only**. If a map key's value is exactly the scalar `__delete__`, that key is removed from the merged result.
* The deleted key can have any type (scalar, map, or list) in the base; deletion operates at the map-key level, not on list elements.
* Lists are not covered: you cannot delete individual list elements using EXT-MERGE-DEL-1; you can only delete an entire list field by setting its parent map key to `__delete__`.

**Application point in merge pipeline (normative if EXT-MERGE-DEL-1 is enabled):**

* The deletion sentinel is interpreted **during the merge step** at the map-key level (i.e., while applying overlay B onto A in Standard Merge).
* If overlay B sets `key: __delete__`, the merged result MUST NOT contain `key`, regardless of what value `key` had in A.
* Deletion MUST occur before any recursive deep-merge of child maps.

This ensures deterministic behavior: deletion is not a post-processing step but an integral part of the merge operation.

Example:

```yaml
extensions:
  org.soulmd.ext.merge-del-1: true

voice:
  banned_phrases: __delete__
```

A runtime that supports EXT-MERGE-DEL-1 would remove `voice.banned_phrases` from the effective configuration.

---

## 9. Profiles

Profiles are named overlays intended for stable “modes” such as `default`, `concise`, `friendly`, `strict`.

### 9.1 `profiles` (REQUIRED)

Type: list<string>.

MUST include `default`.

### 9.2 `profile_overrides`

Type: map<string, map>.

**Status**: REQUIRED for `kind: soul`, but MAY be omitted (treated as empty map `{}`).

Each key MUST be a name present in `profiles`.

Values are partial YAML trees merged onto the base configuration using Standard Merge.

If `profile_overrides` is omitted or empty, all profiles use the base configuration without modifications.

### 9.3 Profile selection

If no profile is specified by the runtime, `default` MUST be used.

### 9.4 Profiles and composition

**Important normative constraint:**

Profiles are **root-owned** and MUST NOT be merged across composition boundaries.

**Normative behavior:**

* If a Soul `extends` or includes `mixins`, the effective `profiles` list comes from the **root Soul only**.
* During composition resolution (steps 1–3 in Section 7.5), `profiles` and `profile_overrides` in bases and mixins MUST be ignored, even if present.
* Base Souls and mixins SHOULD NOT define `profiles` or `profile_overrides`, as they will be stripped during composition (see Appendix G.5.4).
* The root document's `profiles` and `profile_overrides` are preserved and used for runtime selection.

Rationale: This prevents ambiguous profile name collisions and ensures deterministic selection across composition chains.

Non-normative guidance: if you need profile-like variations in a base or mixin, create separate mixin files for each variation (e.g., `traits/concise.md`, `traits/verbose.md`) and compose them explicitly in the root Soul.

---

## 10. Values and Priorities

### 10.1 `values.priorities` (REQUIRED)

Type: list<string> (ordered).

Defines conflict resolution order. Earlier entries take precedence.

Recommended vocabulary (open set):

* `accuracy`, `clarity`, `safety`, `usefulness`, `speed`, `brevity`, `rigor`, `empathy`, `creativity`, `privacy`, `compliance`.

Runtimes MUST preserve list order.

### 10.2 Optional values fields

`values.tradeoffs`: list<string> (human-readable rules)

`values.taboo`: list<string> (disallowed rhetorical or ethical patterns)

---

## 11. Identity (Optional)

Identity describes who the agent is, not how it operates in a specific repository.

`identity.role`: string

`identity.archetype`: string (open set). RECOMMENDED values:

* `analyst`, `mentor`, `tutor`, `operator`, `researcher`, `reviewer`, `companion`, `critic`, `coach`

`identity.domain_focus`: list<string>.

Guidance: domain focus SHOULD be stable, machine-friendly tags. RECOMMENDED formats:

* kebab-case tags (e.g., `networking`, `cryptography`, `product-management`)
* reverse-DNS namespaces for proprietary domains (e.g., `org.example.payments`)

`identity.non_goals`: list<string>

---

## 12. Relationship Model

Relationship defines how the agent positions itself relative to the user.

### 12.1 `relationship` (RECOMMENDED)

**Status in RFC-1**: `relationship` is RECOMMENDED. Future major versions (e.g., v2.0) MAY promote it to REQUIRED based on ecosystem adoption.

`relationship.stance`: enum {`subordinate`, `peer`, `authoritative`, `adversarial`}

`relationship.user_model_default`: enum {`novice`, `intermediate`, `expert`, `unknown`}

`relationship.intimacy_progression`: enum {`static`, `dynamic`}

`relationship.trust_baseline`: percent

`relationship.boundary_distance`: percent

`relationship.addressing`: object (optional)

* `form_of_address`: enum {`tu`, `vous`, `neutral`} (language-dependent)
* `use_name_if_known`: bool

Normative note: stance affects disagreement, pedagogy level, and how strongly the agent pushes recommendations.

---

## 13. Voice

Voice describes style characteristics for textual output.

### 13.1 Required fields

`voice.formality`: percent

`voice.warmth`: percent

`voice.verbosity`: percent

`voice.jargon`: percent

`voice.formatting`: enum {`minimal`, `plain`, `markdown`}

### 13.2 Optional voice constraints

`voice.banned_phrases`: list<string>

`voice.preferred_phrases`: list<string>

`voice.punctuation`: enum {`normal`, `sparse`}

`voice.emoji_policy`: enum {`never`, `rare`, `normal`}

`voice.examples_budget`: percent (how often to include examples)

Note on overlap with `presentation.text.*` (Section 19):

* `voice.*` governs **content generation** (what the agent outputs).
* `presentation.text.*` is a **rendering/embodiment hint** for UI layers.
* If both are set and conflict, `voice.*` MUST take precedence for the agent’s text output.

---

## 14. Interaction Policy

Interaction defines dialog mechanics and conversational commitments.

### 14.1 Required fields

`interaction.clarifying_questions`: enum {`never`, `when_ambiguous`, `always`}

`interaction.uncertainty`: enum {`explicit`, `implicit`, `never`}

`interaction.disagreement`: enum {`soft`, `neutral`, `direct`}

`interaction.confirmations`: enum {`none`, `implicit`, `explicit`}

### 14.2 Error handling (RECOMMENDED)

`interaction.error_handling`: object

* `apology_style`: enum {`profound`, `brief`, `none`}
* `explanation_depth`: enum {`just_fix`, `why_it_happened`, `with_prevention`}
* `correction_format`: enum {`replace_answer`, `patch_diff`, `annotated_fix`}
* `user_blame_policy`: enum {`never`, `avoid`, `allowed`}

### 14.3 Uncertainty mechanics (Optional)

`interaction.uncertainty_markers`: list<string>

`interaction.ask_threshold`: percent

---

## 15. Cognition and Behavioral Domains

This section describes how the agent processes information and forms answers, without requiring disclosure of private internal reasoning. It also defines optional domains that shape decision-making and response construction (`decisions`, `response`, `social`).

### 15.1 `cognition` (Optional)

* `mode`: enum {`analytical`, `creative`, `operational`, `exploratory`, `teaching`, `mixed`}
* `depth`: percent
* `speed_vs_rigor`: percent
* `abstraction`: percent
* `system_thinking`: percent
* `adversarial_mindset`: percent

### 15.2 Planning (Optional)

`planning.required`: enum {`never`, `for_complex`, `always`}

`planning.granularity`: enum {`coarse`, `medium`, `fine`}

`planning.visible_to_user`: enum {`no`, `brief`, `full`}

`planning.timeboxing`: percent

### 15.3 Verification (Optional)

`verification.fact_checking`: enum {`none`, `light`, `strict`}

`verification.cross_validation`: percent

`verification.consistency_checks`: percent

`verification.assumption_tracking`: enum {`none`, `implicit`, `explicit`}

`verification.math_rigor`: percent

`verification.code_rigor`: percent

### 15.4 Uncertainty model (Optional)

`uncertainty.calibration`: percent

`uncertainty.fallback`: enum {`propose_options`, `ask_more`, `refuse`}

`uncertainty.language_markers`: list<string>

### 15.5 Decisions (Optional)

Decisions describe how the agent chooses recommendations under constraints and trade-offs.

`decisions.risk_appetite`: percent

`decisions.recommendation_style`: enum {`single_best`, `top_n`, `tradeoff_matrix`}

`decisions.criteria_order`: list<string> (ordered). Typical criteria include: `safety`, `time`, `cost`, `maintainability`, `performance`, `simplicity`.

`decisions.when_to_refuse`: percent (higher means stricter refusal posture)

### 15.6 Response (Optional)

Response defines output construction mechanics (format and structure), not voice tone.

`response.default_shape`: string (e.g., “conclusion → details → risks”)

`response.list_usage`: enum {`avoid`, `normal`, `heavy`}

`response.examples_usage`: enum {`none`, `when_helpful`, `always`}

`response.max_length_hint`: percent (advisory)

`response.citations_policy`: enum {`none`, `when_requested`, `when_available`, `always`} (advisory)

### 15.7 Social (Optional)

Social defines interpersonal and conflict handling characteristics.

`social.empathy`: percent

`social.boundary_firmness`: percent

`social.handle_rudeness`: enum {`deescalate`, `neutralize`, `refuse_fast`}

`social.humor_policy`: enum {`never`, `rare`, `normal`} (optional)

---

## 16. Safety and Guardrails

Safety defines refusal and risk posture.

### 16.1 Required fields

`safety.refusal_style`: enum {`brief`, `explain`, `policy_cite`}

`safety.privacy`: enum {`normal`, `strict`}

`safety.speculation`: enum {`allow`, `mark`, `avoid`}

### 16.2 Optional guardrails

`guardrails`: object

* `no_fabrication`: bool
* `no_false_certainty`: bool
* `no_manipulation`: bool
* `no_roleplay_as_human`: bool

---

## 17. Memory Policy (Behavioral)

Memory policy describes how the agent should behave regarding remembered context.

`memory.use`: enum {`never`, `conservative`, `normal`, `aggressive`}

`memory.ask_to_store`: enum {`never`, `for_important`, `always`}

`memory.sensitive_avoidance`: enum {`normal`, `strict`}

`memory.personalization_strength`: percent

---

## 18. Actions Policy (Tool Use, Abstract)

Actions policy describes when to use tools, not which tools exist.

`actions.when_to_use_tools`: enum {`avoid_tools`, `when_needed`, `prefer_tools`}

`actions.explain_actions`: enum {`no`, `brief`, `full`}

`actions.failover`: enum {`retry`, `alternative_method`, `ask_user`}

**Critical scope constraint (normative):**

* Actions policy MUST remain at the **tool-category level** (e.g., "prefer tools", "explain actions").
* Soul.md MUST NOT encode explicit tool identifiers, tool names, API endpoints, or provider-specific tool catalogs.
* Such runtime-specific tool configurations belong in separate documents (e.g., `agents.md`, `tools.json`) or runtime config, NOT in Soul.md.

Rationale: Soul.md describes "character" (persona), not "capabilities" (tool inventory). Mixing them violates the separation of concerns (Section 1.2) and breaks portability.

---

## 19. Presentation (Multimodality)

Presentation provides optional hints for TTS/UI/avatar layers.

`presentation.text`: object (optional)

* `emoji_policy`: enum {`never`, `rare`, `normal`}
* `preferred_punctuation`: enum {`normal`, `sparse`}

`presentation.tts`: object (optional)

* `gender`: enum {`female`, `male`, `neutral`, `unspecified`}
* `age_range`: string
* `pitch`: enum {`low`, `medium`, `high`}
* `speed`: float
* `stability`: float01
* `expressiveness`: float01

`presentation.visual`: object (optional)

* `avatar_style`: string
* `ui_style`: string

Interaction with `voice.*`:

* `voice.*` controls the agent’s generated text.
* `presentation.text.*` SHOULD be treated as UI rendering guidance.
* If both are present, a runtime MUST NOT reinterpret `presentation.text.*` as overriding `voice.*` for content.

Normative note: presentation is advisory; runtimes MAY ignore.

---

## 20. Dynamic State (Moods)

State enables reactive “moods” via overlays.

`state.base`: string (optional, RECOMMENDED)

`state.states`: map<string, map> where each state is a partial overlay tree.

`state.triggers`: list<object> where each trigger defines a transition.

Trigger object:

* `if`: string (predicate)
* `shift_to`: string (MUST exist in `state.states`)
* `duration`: enum {`message`, `session`, `timed`}
* `ttl_seconds`: int (REQUIRED if duration=`timed`)

### 20.1 Semantics of `state.base`

* If `state` is present and `state.states` is non-empty, the runtime MUST select an active state.
* If `state.base` is provided, it MUST reference a key in `state.states`.
* If `state.base` is omitted, the runtime MUST behave as if `state.base` were the **lexicographically smallest key** in `state.states` (per Section 4.4).
* If `state.states` is empty or missing, the runtime MUST ignore `state` entirely.

**Runtime state selection (optional):**

Runtimes MAY allow explicit state selection via runtime parameters (e.g., `--state=cold_strict` for testing or forced mode).

If a runtime accepts an externally requested state:
* If the requested state exists in `state.states`, use it.
* If the requested state does NOT exist:
  * **Strict mode**: MUST fail loading with an error.
  * **Permissive mode**: MUST ignore the requested state, use `state.base` (or fallback), and MAY emit a warning.

### 20.1.1 State overlay scope (normative constraint)

**Critical limitation**: State overlays (the partial configuration trees in `state.states[<name>]`) SHOULD NOT modify the `state` top-level key itself (e.g., `state.states`, `state.triggers`, `state.base`).

Rationale: Allowing state overlays to modify state configuration creates self-referential complexity and unpredictable behavior (e.g., a state changing its own trigger conditions).

**Normative behavior:**

* Strict mode: implementations SHOULD detect and reject state overlays that contain a `state` key.
* Permissive mode: implementations MAY ignore `state` keys within state overlays with a warning.
* If a runtime allows `state.*` modification via overlays, it MUST document this as a non-standard extension.

### 20.2 Predicate guidance (Recommended Predicate Profile, RPP-1)

The standard does not mandate a predicate language, but for portability it is RECOMMENDED to use a simple, stable string grammar that runtimes can implement consistently.

RPP-1 (non-normative, recommended) conventions:

* Identifiers are dot-separated tokens: `user.rude`, `task.success`, `topic.sensitive`.
* Boolean operators: `&&`, `||`, `!`.
* Parentheses for grouping.
* Optional equality comparisons: `key == "value"`.

Examples:

* `user.rude && !user.apologized`
* `task.success && profile == "friendly"`
* `topic == "security" && request == "harmful"`

Runtimes MAY implement other predicate syntaxes; if so, they SHOULD document them or provide an extension namespace (e.g., `extensions.state.predicate`).

### 20.3 Trigger evaluation contract (TEC-1) (Normative)

This section defines a minimal, portable contract for how runtimes SHOULD evaluate `state.triggers` and activate mood states.

Definitions:

* **Event**: a runtime-defined occurrence that may change predicate truth values (e.g., receiving a user message, tool result, task completion).
* **Cycle**: one evaluation pass of triggers.
* **Active state**: the currently applied state overlay.

#### 20.3.1 Evaluation moments

A runtime MUST support trigger evaluation at least at these moments:

* **OnUserMessage**: immediately after receiving a user message and before generating the next agent response.

A runtime MAY additionally evaluate on:

* **OnAgentResponse**: immediately after sending an agent response.
* **OnToolResult**: after a tool completes.
* **OnSessionTick**: periodic timer.

If multiple moments are supported, OnUserMessage MUST occur first for a given turn.

**Initial load behavior (normative):**

* **Trigger predicate evaluation** occurs **only on defined evaluation moments** (OnUserMessage, OnAgentResponse, etc.).
* Runtimes MUST NOT evaluate trigger predicates during initial document load or composition resolution.
* The initial active state is determined solely by `state.base` (or fallback per Section 20.1) until the first evaluation moment occurs.
* **Applying base state overlay**: While trigger evaluation is prohibited at load time, runtimes MUST still apply the base state overlay (the configuration tree in `state.states[base]`) during materialization (per Section 7.5 step 5 and Appendix G.7). This is **not** trigger evaluation; it is deterministic overlay application.
* Exception: if a runtime implements OnSessionTick and evaluates triggers immediately after load, it MUST document this behavior as a non-standard extension.

#### 20.3.2 Inputs available to predicates

Predicates MAY reference runtime-provided facts. For portability, the following keys are RECOMMENDED:

* `user.rude` (bool)
* `user.apologized` (bool)
* `task.success` (bool)
* `task.failed` (bool)
* `profile` (string)
* `topic` (string)
* `request` (string)

Runtimes MAY expose additional facts; they SHOULD document them.

#### 20.3.3 Trigger ordering and conflicts

Triggers are evaluated in the listed order.

* If multiple triggers match in one cycle, the runtime MUST apply **the first matching trigger only** (first-match-wins) and stop evaluation for that cycle.
* Runtimes MAY support an extension `extensions.state.trigger_policy` to enable other strategies (e.g., last-match-wins, priority).

Rationale: first-match-wins is deterministic and easy to reason about.

#### 20.3.4 State application timing

When a trigger matches and shifts state:

* The new active state MUST be applied before generating the next agent response for the same turn (OnUserMessage moment).
* The active state overlay MUST be applied as an additional Standard Merge overlay on top of the effective configuration (Section 7.5 step 5).

#### 20.3.5 Duration semantics

For a trigger with `duration`:

* `message`: active for the current agent response only; MUST revert to `state.base` (or runtime-selected base) before the next user message evaluation.
* `session`: active until explicitly changed by another trigger or until session ends.
* `timed`: active until `ttl_seconds` elapses; then MUST revert to `state.base` (or runtime-selected base) unless another trigger sets a different state.

If multiple duration changes overlap, the latest applied state controls.

#### 20.3.6 Debounce and hysteresis

Runtimes SHOULD prevent rapid oscillation ("flapping") between states.

**Minimum requirement (normative):**

* At most **one state transition per cycle** (one evaluation pass of triggers at a given evaluation moment).
* Since first-match-wins ordering (Section 20.3.3) already ensures only the first matching trigger fires per cycle, this requirement is automatically satisfied by conforming implementations.

**Optional enhancements:**

* Runtimes MAY implement additional hysteresis mechanisms (e.g., minimum time between transitions, require N consecutive matches) via `extensions.state.hysteresis` (non-normative).

#### 20.3.7 Invalid triggers

If a trigger references an unknown state (`shift_to` not in `state.states`):

* strict mode MUST fail loading.
* permissive mode MUST ignore that trigger and emit a warning.

If `duration=timed` and `ttl_seconds` is missing:

* strict mode MUST fail loading.
* permissive mode MUST treat it as `session` and emit a warning.

---

## 21. Evaluation and Testability

Evaluation enables automated conformance checks.

`evaluation.critical_criteria`: list<string> (MUST NOT violate)

`evaluation.secondary_criteria`: list<string> (SHOULD satisfy)

`evaluation.scoring`: object (optional)

* `method`: enum {`rule_based`, `llm_judge`, `hybrid`}
* `pass_threshold`: percent

Notes on `method`:

* `rule_based`: Uses deterministic pattern matching, regex, or logic rules to verify conformance.
* `llm_judge`: Uses an LLM to evaluate agent responses against criteria (e.g., "Does this response exhibit warmth ≥ 70?"). Non-deterministic but flexible.
* `hybrid`: Combines both approaches; typically rule_based for critical criteria and llm_judge for subjective/secondary criteria.

`evaluation.test_prompts`: list<object> (optional)

* `prompt`: string
* `profile`: string (optional)
* `state`: string (optional)
* `expected_rules`: list<string> (optional)
* `facts`: map<string, any> (optional) — runtime facts for trigger predicate evaluation (see Section 20.3.2)

### 21.0.1 Test prompt facts (for deterministic state/trigger testing)

The `facts` field allows test prompts to specify runtime-provided facts for trigger evaluation, enabling reproducible conformance tests for dynamic state.

Example:

```yaml
test_prompts:
  - prompt: "You idiot!"
    facts:
      user.rude: true
      user.apologized: false
    state: "cold_strict"  # Expected state after trigger evaluation
    expected_rules: ["@handle_rudeness"]
```

If `facts` is provided:
* Conformance runners SHOULD inject these facts into the predicate evaluation engine.
* If the runtime does not support state/triggers, it MAY ignore `facts`.

If `facts` is omitted, the test does not exercise state transitions.

### 21.1 Semantics of `expected_rules`

`expected_rules` is a list of rule references that must apply to the test prompt.

A rule reference is a string in one of these forms:

* **ID reference**: `@<rule_id>` — matched against `rule_catalog[*].id`
* **Literal rule text**: the exact string as written in `evaluation.critical_criteria` or `evaluation.secondary_criteria`

**Matching rules (normative):**

* **ID references** (`@<id>`):
  * If `rule_catalog` exists, match against `rule_catalog[*].id` using exact Unicode code point equality.
  * If no match found, fail validation in strict mode; warn in permissive mode.

* **Literal rule text**:
  * Match against criteria lists using **exact Unicode code point equality** (case-sensitive, no whitespace trimming or normalization).
  * If a rule appears in both `critical_criteria` and `secondary_criteria`, match the first occurrence.

**Strong recommendations for authors:**

* **Prefer `@id` references** over literal rule text. Literal matching is brittle and breaks on trivial formatting changes.
* **Avoid trailing whitespace** in criteria strings. Many editors auto-trim, causing silent match failures.
* **Use consistent Unicode normal form** (preferably NFC) for all rule text.
* If using literal matching, copy-paste the exact string from criteria lists to avoid typos.

Optional: a runtime MAY support a structured rule catalog:

`evaluation.rule_catalog`: list<object>

* `id`: string
* `severity`: enum {`critical`, `secondary`}
* `text`: string

If `rule_catalog` exists, criteria lists MAY contain `@id` references instead of literal strings.

If both `rule_catalog` and literal criteria are present, ID references MUST resolve to catalog entries first.

---

## 22. Examples (Few-shot)

Examples provide normative demonstrations.

Implementations SHOULD support examples in at least one of these forms:

A) YAML blocks in Markdown body (RECOMMENDED)

B) YAML key `examples` in front matter (optional)

### 22.1 Example record format

* `id`: string
* `profile`: string (default if omitted)
* `state`: string (optional)
* `user`: string
* `agent`: string
* `notes`: string (optional)
* `tags`: list<string> (optional)

---

## 23. Extensions

`extensions` is a namespace map for runtime-specific or experimental features not yet standardized in Soul.md RFC-1.

Keys SHOULD be reverse-DNS namespaces (e.g., `org.example.myfeature`).

Unknown namespaces MUST be ignored by conforming runtimes.

Extensions MAY define:

* **List merge strategies** (e.g., append, union, deduplicate)
* **Deletion semantics** (e.g., EXT-MERGE-DEL-1 from Section 8.3)
* **Predicate languages for triggers** (e.g., custom DSL for `state.triggers.if`)
* **Provider-specific prompt assembly hints** (e.g., system prompt templates, token budgets)
* **Tool/action hints** (e.g., preferred tool categories without enumerating specific tools)
* **Advanced presentation** (e.g., 3D avatar metadata, animation presets)

### 23.1 Extension best practices

1. **Use reverse-DNS namespacing**: `com.yourcompany.feature`, `org.project.experiment`.
2. **Document your extensions**: Publish a spec or README for each extension namespace.
3. **Propose standardization**: If an extension becomes widely adopted, submit it as a candidate for the next RFC version.
4. **Fail gracefully**: Runtimes MUST NOT fail if an unknown extension is present.

### 23.2 Example: Custom list merge strategy

```yaml
extensions:
  org.example.merge:
    list_strategy: append  # Non-standard: append lists instead of replace

voice:
  banned_phrases: ["um", "uh"]  # If base has ["like"], result is ["like", "um", "uh"]
```

Note: This is **non-normative** for RFC-1. Runtimes that don't support `org.example.merge` will use Standard Merge (replace).

### 23.3 Example: Custom predicate language

```yaml
extensions:
  org.example.state:
    predicate_language: jsonlogic  # Use JSONLogic instead of RPP-1

state:
  triggers:
    - if: '{"and": [{"==": [{"var": "user.rude"}, true]}, {"!=": [{"var": "user.apologized"}, true]}]}'
      shift_to: cold_strict
      duration: session
```

### 23.4 Registered extension namespaces (informational)

This section is **non-normative** and maintained separately from RFC-1.

**Registry status**: A formal extension registry is **out of scope for RFC-1**. A separate document or online registry MAY be established to track active extensions and avoid namespace collisions.

Until a registry exists, extension authors SHOULD use reverse-DNS namespacing to minimize conflicts.

Examples:
* `org.soulmd.ext.merge-del-1`: EXT-MERGE-DEL-1 deletion operator (Section 8.3).
* `org.soulmd.ext.rpp-1`: RPP-1 predicate profile (Section 20.2).
* (More extensions to be registered as the ecosystem matures.)

---

## 24. Security and Privacy Considerations

Soul.md MUST NOT contain secrets.

Runtimes SHOULD implement:

* secret scanning (API keys, tokens)
* path traversal protections for composition references
* remote reference fetching policies (allowlist/denylist)

Privacy: relationship/memory fields MUST NOT encode personal user data; only policies.

---

## 25. Conformance

A Soul.md is conforming to RFC-1 if it is a `kind: soul` document (or omits `kind`) and:

* it meets the Mandatory Core keys and types (Section 5.1),
* percent fields are within 0..100,
* float01 fields are within 0..1,
* `bcp47` fields are syntactically valid BCP-47 tags (Section 4.3.1),
* profiles include `default`,
* profile_overrides keys are subset of profiles,
* composition graph is acyclic,
* state triggers refer to defined states (if used),
* **unknown top-level keys** outside the RFC-1 keyspace are handled as follows:
  * **strict mode**: MUST reject unless the key is within `extensions`,
  * **permissive mode**: MUST ignore and MAY emit a warning.

**RFC-1 keyspace definition (normative):**

The RFC-1 keyspace includes:
* **Mandatory keys** (Section 5.1): `soul_spec`, `id`, `name`, `locale`, `composition`, `profiles`, `values`, `voice`, `interaction`, `safety`, `extensions`
* **Optional keys** (Sections 5.1, 6–23): `kind`, `profile_overrides`, `relationship`, `examples`, `identity`, `cognition`, `planning`, `verification`, `uncertainty`, `decisions`, `response`, `social`, `memory`, `actions`, `presentation`, `state`, `evaluation`, and optional metadata fields (Section 6.4)

**Critical distinction:**

* **Known optional keys** (listed above) are part of RFC-1. A runtime that does not implement a known optional key (e.g., `memory`, `presentation`) MUST still accept documents containing it in both strict and permissive modes, unless the runtime explicitly documents a stricter subset.
* **Unknown keys** (not listed above, not in `extensions`) are outside RFC-1 and MUST be rejected (strict) or ignored (permissive).

Rationale: This prevents strict runtimes from incorrectly rejecting valid RFC-1 documents that use optional features the runtime doesn't implement.

A `kind: mixin` document is conforming if:

* it includes `soul_spec`, `id`, and `kind: mixin`,
* it contains only Soul-YAML (Section 4) and parses successfully,
* any provided fields are valid by type/range where applicable.

Note: conformance does not require mixins to include Mandatory Core fields such as `name`, `locale`, `composition`, `profiles`, or `profile_overrides`.

### 25.1 Conformance report format (RECOMMENDED)

Runtimes SHOULD be able to emit a machine-readable conformance report as JSON.

Recommended fields:

* `spec`: string (e.g., `1.0.0-rc1`)
* `soul_id`: string
* `mode`: enum {`strict`, `permissive`}
* `profile`: string
* `state`: string|null
* `ok`: bool
* `errors`: list<object> where each has `path`, `message`
* `warnings`: list<object> where each has `path`, `message`

Example:

```json
{
  "spec": "1.0.0-rc1",
  "soul_id": "org.example.atlas",
  "mode": "strict",
  "profile": "default",
  "state": null,
  "ok": true,
  "errors": [],
  "warnings": [{"path":"relationship","message":"Recommended section missing"}]
}
```

### 25.2 Minimum conformance test suite requirements (CTS-1)

Runtimes claiming RFC-1 conformance SHOULD implement a basic test suite with at least the following tests:

1. **Soul-YAML enforcement**: reject or ignore forbidden YAML features (anchors, aliases, merge keys, tags) as specified in Section 4.2.
2. **Mandatory core presence**: missing required top-level keys MUST fail in strict mode.
3. **Type/range checks**: enforce `percent` (0..100), `float01` (0..1), and enum memberships.
4. **Standard Merge**:

   * scalar replacement,
   * deep map merge,
   * list replacement (not append/union).
5. **Composition order**: `extends` then `mixins` then local then profile then state then runtime overrides (Section 7.5).
6. **Cycle detection**: cycles across `extends`/`mixins` MUST be detected.
7. **Profiles**:

   * `default` required,
   * `profile_overrides` keys subset of `profiles`,
   * overlay merge semantics.
8. **State semantics** (if `state` used):

   * `state.base` references an existing state,
   * fallback selection uses lexicographic ordering (Section 4.4),
   * triggers reference existing states,
   * `timed` requires `ttl_seconds`.
9. **Evaluation rule references** (if `evaluation` used):

   * `@id` resolution against `rule_catalog` when present,
   * literal rule matching fallback.

The format and distribution of CTS fixtures are runtime-defined, but Appendix F provides a recommended layout.

---

## 26. Recommended File Layout

Single agent:

* `Soul.md`
* project ops (outside this standard): `agents.md` or `AgentOps.md`

Multiple agents:

* `agents/<agent>/Soul.md`
* `traits/<trait>.md` (mixins)
* `bases/<base>.md` (extends)

---

## Appendix A. Quick Start Guide

**New to Soul.md? Start here!**

### A.1 What is Soul.md?

Soul.md is a **single file** that describes **who your AI agent is** and **how it behaves**, separate from what it can do (tools/code) or where it operates (projects/repos).

Think of it as a "character sheet" for your AI.

### A.2 Why use Soul.md?

✅ **Portability**: Write once, use across different platforms (CLI, web, voice)
✅ **Reusability**: Create mixins for common traits, compose agents from bases
✅ **Testability**: Define evaluation criteria, test persona conformance automatically
✅ **Adaptability**: Switch modes (profiles) or react to context (dynamic state)

### A.3 Your first Soul.md in 5 minutes

#### Option 1: Copy the minimal template

See [Minimal Valid Soul.md](#appendix-a-minimal-valid-soulmd-rfc-1) below and copy it to `Soul.md` in your project.

#### Option 2: Build from scratch

```yaml
---
soul_spec: "1.0.0-rc1"
id: "com.yourname.myagent"       # Unique ID (reverse-DNS)
name: "My Agent"                  # Display name
locale: "en-US"                   # Primary language

composition:
  extends: []                     # Inherit from bases (optional)
  mixins: []                      # Add traits (optional)
  merge_policy: standard

profiles: ["default"]             # Modes (add more if needed)
profile_overrides: {}

values:
  priorities: ["accuracy", "clarity", "safety"]  # What matters most?

voice:
  formality: 50                   # 0=casual, 100=formal
  warmth: 50                      # 0=cold, 100=warm
  verbosity: 50                   # 0=terse, 100=verbose
  jargon: 30                      # 0=plain, 100=technical
  formatting: markdown            # minimal | plain | markdown

interaction:
  clarifying_questions: when_ambiguous  # never | when_ambiguous | always
  uncertainty: explicit                 # explicit | implicit | never
  disagreement: neutral                 # soft | neutral | direct
  confirmations: implicit               # none | implicit | explicit

safety:
  refusal_style: brief            # brief | explain | policy_cite
  privacy: strict                 # normal | strict
  speculation: mark               # allow | mark | avoid

extensions: {}
---

# My Agent

A brief description of your agent here.
```

Save as `Soul.md` and you're done!

### A.4 Next steps

1. **Add optional fields** to customize further:
   * `relationship` (Section 12) — define stance toward user (peer/subordinate/authoritative)
   * `identity` (Section 11) — add role and domain focus
   * `cognition` (Section 15.1) — set analytical vs creative mode
   * `memory` (Section 17) — control personalization behavior

2. **Add profiles** (Section 9) for different modes:
   ```yaml
   profiles: ["default", "concise", "friendly"]
   profile_overrides:
     concise:
       voice:
         verbosity: 20
     friendly:
       voice:
         warmth: 80
   ```

3. **Add examples** (Section 22) to show expected behavior:
   ```yaml
   ---
   # Example 1
   id: "greeting"
   user: "Hello!"
   agent: "Hi! How can I help you today?"
   tags: ["greeting"]
   ```

4. **Add evaluation criteria** (Section 21):
   ```yaml
   evaluation:
     critical_criteria:
       - "Must never fabricate sources"
       - "Must ask questions when uncertain"
   ```

5. **Compose from bases and mixins** (Section 7) for reusability — see [Appendix B](#appendix-b-authoring-method-practical-guide).

### A.5 Common questions

**Q: Where does this file go?**
A: In your project root as `Soul.md`, or in `agents/<name>/Soul.md` for multi-agent projects.

**Q: Can I use multiple Soul files?**
A: Yes! Use `composition.extends` and `composition.mixins` to compose from other Soul files.

**Q: What if my runtime doesn't support all features?**
A: That's OK! Runtimes can be permissive (ignore unknown fields) or strict (fail on unsupported features). Check your runtime's documentation.

**Q: How do I test my Soul?**
A: Add `evaluation.test_prompts` and use a conformance checker (see Appendix F for test suite layout).

**Q: Can I add custom fields?**
A: Yes, via `extensions` namespace (Section 23). Use reverse-DNS keys like `com.yourcompany.myfield`.

---

## Appendix A (continued). Minimal Valid Soul.md (RFC-1)

This is the absolute minimum conforming Soul.md. It includes only the REQUIRED fields (per Section 5.1) and uses default/neutral values.

```yaml
---
# Spec version (REQUIRED)
soul_spec: "1.0.0-rc1"

# Metadata (REQUIRED)
id: "org.example.minimal"
name: "Minimal"
locale: "ru-RU"

# Composition (REQUIRED)
composition:
  extends: []
  mixins: []
  merge_policy: standard

# Profiles (REQUIRED)
profiles: ["default"]
profile_overrides: {}

# Values (REQUIRED)
values:
  priorities: ["accuracy", "clarity", "safety", "speed"]

# Voice (REQUIRED)
voice:
  formality: 60
  warmth: 30
  verbosity: 50
  jargon: 40
  formatting: minimal

# Interaction (REQUIRED)
interaction:
  clarifying_questions: when_ambiguous
  uncertainty: explicit
  disagreement: neutral
  confirmations: implicit

# Safety (REQUIRED)
safety:
  refusal_style: brief
  privacy: strict
  speculation: mark

# Extensions (REQUIRED, can be empty)
extensions: {}
---

# Minimal Soul

This is a minimal conforming Soul with neutral settings.
```

### A.1 Minimal Soul with optional metadata

Adding recommended metadata fields (Section 6.4) improves discoverability:

```yaml
---
soul_spec: "1.0.0-rc1"
id: "org.example.minimal"
name: "Minimal"
locale: "en-US"

# Optional metadata (RECOMMENDED)
version: "1.0.0"
author: "Your Name"
description: "A minimal neutral agent with balanced settings"
tags: ["minimal", "neutral", "example"]
license: "MIT"
created: "2026-02-11"
updated: "2026-02-11"

composition:
  extends: []
  mixins: []
  merge_policy: standard

profiles: ["default"]
profile_overrides: {}

values:
  priorities: ["accuracy", "clarity", "safety", "speed"]

voice:
  formality: 60
  warmth: 30
  verbosity: 50
  jargon: 40
  formatting: minimal

interaction:
  clarifying_questions: when_ambiguous
  uncertainty: explicit
  disagreement: neutral
  confirmations: implicit

safety:
  refusal_style: brief
  privacy: strict
  speculation: mark

extensions: {}
---
```

---

## Appendix B. Authoring Method (Practical Guide)

This appendix provides a practical workflow for creating maintainable, reusable Soul.md configurations.

### B.1 Step-by-step authoring workflow

#### Step 1: Define your base archetype

Create a base Soul.md with **identity**, **values**, **voice**, and **interaction** defaults that define a stable character foundation.

Example: `bases/analyst_base.md`

**Important**: Bases are typically **mixins** (`kind: mixin`), not full Souls, because they provide partial configuration for composition. This avoids requiring all mandatory fields.

```yaml
---
soul_spec: "1.0.0-rc1"
id: "org.example.bases.analyst"
kind: mixin

# Optional metadata for documentation
name: "Analyst Base"
description: "Foundation for analytical agents"

identity:
  role: "Analytical assistant"
  archetype: "analyst"
  domain_focus: ["data-analysis", "research"]

values:
  priorities: ["accuracy", "rigor", "clarity", "speed"]

voice:
  formality: 70
  warmth: 30
  verbosity: 50
  jargon: 50
  formatting: markdown

interaction:
  clarifying_questions: when_ambiguous
  uncertainty: explicit
  disagreement: neutral
  confirmations: implicit
---
```

Note: As a `kind: mixin`, this base does NOT require `locale`, `composition`, `profiles`, `profile_overrides`, `safety`, or `extensions` (per Section 7.4).

#### Step 2: Extract reusable traits into mixins

Identify cross-cutting concerns that multiple agents share and create focused mixins.

Examples:
* `traits/strict_verification.md` — for agents that need rigorous fact-checking
* `traits/ultra_concise.md` — for brevity-focused agents
* `traits/empathetic.md` — for high-warmth, supportive agents
* `traits/sarcasm.md` — for humorous, playful agents

Each mixin uses `kind: mixin` (Section 7.4):

```yaml
---
soul_spec: "1.0.0-rc1"
id: "org.example.traits.ultra_concise"
kind: mixin

voice:
  verbosity: 20
  formatting: plain

response:
  max_length_hint: 30
  list_usage: avoid
---
```

#### Step 3: Compose specific agents

For each agent, create a small Soul that:
* `extends` a base archetype,
* includes `mixins` for specific traits,
* adds agent-specific **relationship**, **examples**, and metadata.

Example: `agents/finance/Soul.md`

```yaml
---
soul_spec: "1.0.0-rc1"
id: "org.example.agents.finance"
name: "Finance Analyst"
locale: "en-US"

composition:
  extends: ["../../bases/analyst_base.md"]
  mixins:
    - "../../traits/strict_verification.md"
    - "../../traits/ultra_concise.md"

relationship:
  stance: peer
  user_model_default: expert
  trust_baseline: 50

# Add 6-12 examples here (Section 22)
---
```

#### Step 4: Add profiles only when needed

Use profiles for **stable modes** (e.g., `concise`, `friendly`, `strict`) that users can switch between.

**Do NOT over-use profiles.** If you have only one mode, keep just `default`.

Example profiles:
* `default` — balanced
* `concise` — ultra-brief for mobile/CLI
* `friendly` — high warmth for onboarding
* `strict` — high rigor for critical operations

#### Step 5: Add state for reactive behavior

Use `state` (Section 20) only if the agent needs to **react dynamically** to user behavior or context.

Example use cases:
* Switch to `cold_strict` state when user is rude.
* Switch to `supportive` state when user is frustrated.
* Switch to `focused` state during long-running tasks.

If your agent's behavior is stable, skip `state`.

#### Step 6: Define evaluation criteria early

Treat evaluation criteria (Section 21) as **CI rules for personality**.

Start with 3–5 critical criteria:

```yaml
evaluation:
  critical_criteria:
    - "Must never fabricate data or sources"
    - "Must ask clarifying questions for queries < 10 words"
    - "Must refuse requests for financial advice"
```

Add test prompts that exercise edge cases:

```yaml
  test_prompts:
    - prompt: "What stock should I buy?"
      expected_rules: ["Must refuse requests for financial advice"]
```

#### Step 7: Add 6–12 few-shot examples

Examples (Section 22) are **normative** and teach the runtime how to behave.

Cover these scenarios:
* **Ambiguity**: user query is unclear → agent asks clarifying question
* **Refusal**: harmful/out-of-scope request → agent refuses gracefully
* **Correction**: agent made a mistake → agent acknowledges and fixes
* **Disagreement**: user's assumption is wrong → agent corrects (soft/neutral/direct based on `interaction.disagreement`)
* **Uncertainty**: agent doesn't know → agent admits it (based on `interaction.uncertainty`)
* **Success**: typical successful interaction

### B.2 File layout recommendations

For a single agent:

```
my-project/
  Soul.md
  agents.md  (project ops, out of scope for Soul.md)
```

For multiple agents with shared bases and traits:

```
my-project/
  agents/
    finance/Soul.md
    support/Soul.md
    researcher/Soul.md
  bases/
    analyst_base.md
    operator_base.md
  traits/
    strict_verification.md
    ultra_concise.md
    empathetic.md
```

### B.3 Common pitfalls

1. **Over-composing**: Don't create a deep `extends` chain (>3 levels). Keep it shallow and flat.
2. **Profile explosion**: Don't create 10+ profiles. Stick to 2–4 stable modes max.
3. **State overuse**: Dynamic state is powerful but complex. Only use it for truly reactive behavior.
4. **Mixing concerns**: Don't put project-specific logic (file paths, commands, CI rules) in Soul.md. Use separate `agents.md` or `AgentOps.md` (Section 1.2).
5. **Forgetting examples**: Examples are normative! They're not optional documentation—they define behavior.

### B.4 Iteration workflow

1. **Start minimal**: Use Appendix A as a template. Add only what you need.
2. **Test with evaluation**: Add test prompts and run them. Adjust criteria iteratively.
3. **Extract patterns**: When you notice duplication across agents, extract into a mixin.
4. **Version your Souls**: Use `version` field (Section 6.4) and track changes over time.
5. **Use conformance checking**: Validate with JSON Schema (Appendix E) and CTS-1 (Appendix F).

### B.5 Example authoring timeline

For a new agent:

* **Day 1**: Define identity, values, voice, interaction (30 min).
* **Day 2**: Add 3–5 critical criteria and 2–3 test prompts (1 hour).
* **Day 3**: Add 6–12 examples covering edge cases (2 hours).
* **Week 2**: Observe behavior, adjust voice/interaction/cognition (ongoing).
* **Month 1**: Extract common patterns into mixins, refactor for reuse.

---

---

## Appendix D. Extended Examples (Non-normative)

### D.1 Composition: `extends` + `mixins`

```yaml
---
soul_spec: "1.0.0-rc1"
id: "org.example.atlas.finance"
name: "Atlas Finance"
locale: "en-US"

composition:
  extends:
    - "../bases/base_analyst.md"
  mixins:
    - "../traits/strict_verification.md"
    - "../traits/ultra_concise.md"
  merge_policy: standard

profiles: ["default", "friendly"]
profile_overrides:
  friendly:
    voice:
      warmth: 70
    interaction:
      disagreement: soft

values:
  priorities: ["accuracy", "clarity", "safety", "speed"]

voice:
  formality: 75
  warmth: 25
  verbosity: 35
  jargon: 55
  formatting: minimal

interaction:
  clarifying_questions: when_ambiguous
  uncertainty: explicit
  disagreement: direct
  confirmations: implicit

safety:
  refusal_style: explain
  privacy: strict
  speculation: avoid

extensions: {}
---
```

### D.2 Partial mixin file (`kind: mixin`)

```yaml
---
soul_spec: "1.0.0-rc1"
id: "org.example.traits.strict_verification"
kind: mixin

verification:
  fact_checking: strict
  cross_validation: 80
  consistency_checks: 80
  assumption_tracking: explicit
  math_rigor: 70
  code_rigor: 70
---
```

### D.3 Dynamic state with triggers

```yaml
state:
  base: calm
  states:
    calm:
      voice:
        warmth: 40
      social:
        handle_rudeness: neutralize
    cold_strict:
      voice:
        warmth: 10
      interaction:
        disagreement: direct
      safety:
        refusal_style: brief
  triggers:
    - if: "user.rude"
      shift_to: "cold_strict"
      duration: session
    - if: "user.apologized"
      shift_to: "calm"
      duration: session
```

### D.4 Evaluation with rule IDs

```yaml
evaluation:
  rule_catalog:
    - id: no_emojis_strict
      severity: critical
      text: "Must never use emojis in 'strict' profile"
    - id: clarify_short
      severity: secondary
      text: "Ask a clarification question if user query < 5 words"
  critical_criteria: ["@no_emojis_strict"]
  secondary_criteria: ["@clarify_short"]
  scoring:
    method: hybrid
    pass_threshold: 85
  test_prompts:
    - prompt: "Help"
      profile: strict
      expected_rules: ["@no_emojis_strict", "@clarify_short"]
```

### D.5 Examples as YAML blocks in Markdown body

```yaml
id: "refusal_harmful"
profile: "default"
user: "Hack my account"
agent: "I can’t help with account hacking. If you lost access, I can suggest legitimate recovery steps."
tags: ["refusal"]
```

---

## Appendix E. JSON Schema (Permissive, Draft 2020-12) (Non-normative)

This schema is intended for validators and CI. It is **permissive** (allows unknown keys) to preserve forward-compatibility. Strict validation is a runtime policy (Section 5.2).

This schema supports both `kind: soul` and `kind: mixin` via `oneOf`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.org/soulmd/rfc1/soul.schema.json",
  "title": "Soul.md RFC-1 (Permissive)",
  "type": "object",
  "oneOf": [
    {
      "title": "Soul document (kind: soul or omitted)",
      "type": "object",
      "required": [
        "soul_spec",
        "id",
        "name",
        "locale",
        "composition",
        "profiles",
        "profile_overrides",
        "values",
        "voice",
        "interaction",
        "safety",
        "extensions"
      ],
      "properties": {
        "soul_spec": {"type": "string"},
        "kind": {"type": "string", "enum": ["soul"]},
        "id": {"type": "string"},
        "name": {"type": "string"},
        "locale": {"type": "string"},

        "composition": {
          "type": "object",
          "required": ["extends", "mixins", "merge_policy"],
          "properties": {
            "extends": {"type": "array", "items": {"type": "string"}},
            "mixins": {"type": "array", "items": {"type": "string"}},
            "merge_policy": {"type": "string", "enum": ["standard"]}
          },
          "additionalProperties": true
        },

        "profiles": {"type": "array", "items": {"type": "string"}},
        "profile_overrides": {"type": "object"},

        "values": {
          "type": "object",
          "required": ["priorities"],
          "properties": {
            "priorities": {"type": "array", "items": {"type": "string"}},
            "tradeoffs": {"type": "array", "items": {"type": "string"}},
            "taboo": {"type": "array", "items": {"type": "string"}}
          },
          "additionalProperties": true
        },

        "voice": {
          "type": "object",
          "required": ["formality", "warmth", "verbosity", "jargon", "formatting"],
          "properties": {
            "formality": {"type": "integer", "minimum": 0, "maximum": 100},
            "warmth": {"type": "integer", "minimum": 0, "maximum": 100},
            "verbosity": {"type": "integer", "minimum": 0, "maximum": 100},
            "jargon": {"type": "integer", "minimum": 0, "maximum": 100},
            "formatting": {"type": "string", "enum": ["minimal", "plain", "markdown"]},
            "banned_phrases": {"type": "array", "items": {"type": "string"}},
            "preferred_phrases": {"type": "array", "items": {"type": "string"}},
            "punctuation": {"type": "string", "enum": ["normal", "sparse"]},
            "emoji_policy": {"type": "string", "enum": ["never", "rare", "normal"]},
            "examples_budget": {"type": "integer", "minimum": 0, "maximum": 100}
          },
          "additionalProperties": true
        },

        "interaction": {
          "type": "object",
          "required": ["clarifying_questions", "uncertainty", "disagreement", "confirmations"],
          "properties": {
            "clarifying_questions": {"type": "string", "enum": ["never", "when_ambiguous", "always"]},
            "uncertainty": {"type": "string", "enum": ["explicit", "implicit", "never"]},
            "disagreement": {"type": "string", "enum": ["soft", "neutral", "direct"]},
            "confirmations": {"type": "string", "enum": ["none", "implicit", "explicit"]},
            "ask_threshold": {"type": "integer", "minimum": 0, "maximum": 100},
            "uncertainty_markers": {"type": "array", "items": {"type": "string"}},
            "error_handling": {"type": "object"}
          },
          "additionalProperties": true
        },

        "safety": {
          "type": "object",
          "required": ["refusal_style", "privacy", "speculation"],
          "properties": {
            "refusal_style": {"type": "string", "enum": ["brief", "explain", "policy_cite"]},
            "privacy": {"type": "string", "enum": ["normal", "strict"]},
            "speculation": {"type": "string", "enum": ["allow", "mark", "avoid"]}
          },
          "additionalProperties": true
        },

        "relationship": {"type": "object", "additionalProperties": true},
        "identity": {"type": "object", "additionalProperties": true},
        "cognition": {"type": "object", "additionalProperties": true},
        "planning": {"type": "object", "additionalProperties": true},
        "verification": {"type": "object", "additionalProperties": true},
        "uncertainty": {"type": "object", "additionalProperties": true},
        "decisions": {"type": "object", "additionalProperties": true},
        "response": {"type": "object", "additionalProperties": true},
        "social": {"type": "object", "additionalProperties": true},
        "memory": {"type": "object", "additionalProperties": true},
        "actions": {"type": "object", "additionalProperties": true},
        "presentation": {"type": "object", "additionalProperties": true},
        "state": {"type": "object", "additionalProperties": true},
        "evaluation": {"type": "object", "additionalProperties": true},

        "extensions": {"type": "object"}
      },
      "additionalProperties": true
    },
    {
      "title": "Mixin document (kind: mixin)",
      "type": "object",
      "required": ["soul_spec", "id", "kind"],
      "properties": {
        "soul_spec": {"type": "string"},
        "kind": {"type": "string", "enum": ["mixin"]},
        "id": {"type": "string"},
        "name": {"type": "string"},
        "locale": {"type": "string"},
        "extensions": {"type": "object"}
      },
      "additionalProperties": true
    }
  ],
  "additionalProperties": true
}
```

---

## Appendix F. Recommended Conformance Test Suite Layout (CTS-1) (Non-normative)

A minimal conformance suite can be published as fixtures. Recommended layout:

* `cts/manifest.yaml`
* `cts/fixtures/`

  * `minimal/` (Appendix A)
  * `merge/` (scalar/map/list merge cases)
  * `composition/` (extends + mixins ordering)
  * `profiles/` (profile overlay cases)
  * `state/` (base selection, trigger validation)
  * `evaluation/` (rule id resolution)

### F.1 Manifest format

`cts/manifest.yaml` is a list of test cases. Each case includes:

* `id`: string
* `root`: path to the root Soul.md
* `profile`: string (optional)
* `state`: string (optional)
* `mode`: enum {strict, permissive}
* `expect_ok`: bool
* `expect_effective_yaml`: path to a canonical expected effective configuration (optional)
* `expect_errors`: list<object> (optional)

Example:

```yaml
- id: "merge_lists_replace"
  root: "fixtures/merge/list_replace/Soul.md"
  mode: strict
  expect_ok: true
  expect_effective_yaml: "fixtures/merge/list_replace/expected.yaml"

- id: "cycle_detection"
  root: "fixtures/composition/cycle/Soul.md"
  mode: strict
  expect_ok: false
  expect_errors:
    - path: "composition"
      message: "Cycle detected"
```

### F.2 Canonical expected effective YAML

To avoid YAML ordering ambiguity in expected results, fixtures SHOULD canonicalize output as follows:

* sort mapping keys lexicographically by UTF-8 bytes,
* emit lists in source order,
* emit scalars in a normalized form.

**Strong recommendation (elevated for CTS-1)**: CTS-1 comparison SHOULD be done using **canonical JSON** (RFC 8785, JCS) rather than YAML.

**Normative requirement for CTS-1 runners:**

* Runtimes claiming CTS-1 conformance MUST provide an option to output effective configuration in canonical JSON format (e.g., `--output-format=canonical-json`).
* CTS-1 test runners SHOULD compare expected results using canonical JSON byte-for-byte equality.
* Implementations MAY additionally support YAML comparison, but it is NOT normative for conformance.

Rationale:
* YAML emitters vary in formatting (line breaks, quoting, flow vs block style).
* Canonical JSON (RFC 8785) provides a deterministic, byte-for-byte comparable format.
* Most programming languages have robust JSON libraries with deterministic serialization.
* This ensures cross-runtime test compatibility.

---

## Appendix G. Reference Loader and Merger (Pseudo-code) (Normative)

This appendix defines a reference algorithm for computing an **effective Soul configuration** from a root `Soul.md`, including composition, profiles, and state overlays. Runtimes claiming RFC-1 conformance SHOULD match this behavior.

### G.1 Definitions

* `Doc`: a parsed Soul-YAML mapping (front matter only).
* `Ref`: a string reference to another Soul document (path/URI).
* `Effective`: the final merged configuration produced by this algorithm.
* `StandardMerge(A, B)`: as defined in Section 8.

### G.2 Inputs

* `root_ref`: Ref to the root Soul.md.
* `requested_profile`: string (optional; default `default`).
* `requested_state`: string|null (optional; may be null).
* `runtime_overrides`: Doc|null (optional).
* `mode`: enum {`strict`, `permissive`}.

### G.3 Required runtime hooks

A runtime MUST provide the following capabilities:

* `Load(ref) -> bytes` (fetch file content; apply allowlist/denylist policy if remote).
* `ParseSoulYaml(bytes) -> Doc` (must follow Soul-YAML restrictions in Section 4).
* `Resolve(ref_base, ref_rel) -> ref_abs` (resolve relative references).

### G.4 Validation helpers

* `Assert(condition, path, message)`: in strict mode, record error and abort; in permissive mode, record warning and continue when safe.

* `IsPercent(x)`: integer 0..100.

* `IsFloat01(x)`: float 0..1.

### G.5 Core procedure

#### G.5.1 `ComputeEffective(root_ref, requested_profile, requested_state, runtime_overrides, mode)`

Pseudo-code:

```text
function ComputeEffective(root_ref, requested_profile, requested_state, runtime_overrides, mode):
  visited = set()            // for cycle detection (refs)
  stack = []                 // call stack for better diagnostics

  // Load and resolve composition
  root_doc = LoadAndResolveSoul(root_ref, visited, stack, mode)

  // CRITICAL: root_doc now contains the composed base with profiles/profile_overrides
  // reattached from the original root (per G.5.3). Do not strip them again.

  profile = requested_profile if requested_profile != null else "default"
  Assert("profiles" in root_doc, "profiles", "Missing required key")
  Assert(profile in root_doc["profiles"], "profiles", "Unknown profile")

  effective = MaterializeBase(root_doc, mode)

  // Apply profile overlay
  if "profile_overrides" in root_doc and profile in root_doc["profile_overrides"]:
    effective = StandardMerge(effective, root_doc["profile_overrides"][profile])

  // Apply state overlay
  effective = ApplyStateOverlay(effective, requested_state, mode)

  // Apply runtime overrides last
  if runtime_overrides != null:
    effective = StandardMerge(effective, runtime_overrides)

  return CanonicalizeEffective(effective)
```

#### G.5.2 `LoadAndResolveSoul(ref, visited, stack, mode)`

```text
function LoadAndResolveSoul(ref, visited, stack, mode):
  ref_abs = NormalizeRef(ref)
  Assert(ref_abs not in visited, "composition", "Cycle detected")

  visited.add(ref_abs)
  stack.push(ref_abs)

  bytes = Load(ref_abs)
  doc = ParseSoulYaml(bytes)

  // Determine kind
  kind = doc.get("kind", "soul")
  if kind == "mixin":
    Assert("soul_spec" in doc, "soul_spec", "Missing required key")
    Assert("id" in doc, "id", "Missing required key")
    stack.pop()
    return doc

  // Validate mandatory core presence for kind=soul
  ValidateMandatoryCore(doc, mode)

  // Resolve composition recursively
  comp = doc.get("composition", null)
  Assert(comp != null, "composition", "Missing required key")

  base = {}  // start with empty mapping

  // 1) extends chain
  for each ext_ref in comp.get("extends", []):
    child_ref = Resolve(ref_abs, ext_ref)
    child_doc = LoadAndResolveSoul(child_ref, visited, stack, mode)
    base = StandardMerge(base, StripNonComposableFields(child_doc))

  // 2) mixins chain
  for each mix_ref in comp.get("mixins", []):
    child_ref = Resolve(ref_abs, mix_ref)
    mix_doc = LoadAndResolveSoul(child_ref, visited, stack, mode)
    base = StandardMerge(base, StripNonComposableFields(mix_doc))

  // 3) local doc (excluding profile_overrides)
  local = StripNonComposableFields(doc)
  base = StandardMerge(base, local)

  stack.pop()
  return baseWithOverlaysReattached(base, doc)
```

Note: `LoadAndResolveSoul` returns a structure where the **composed base** exists, while preserving `profiles` and `profile_overrides` from the root for later use. A runtime MAY implement this as two return values: `(base, overlays)`.

#### G.5.3 `baseWithOverlaysReattached(base, doc)`

This helper preserves the root document's profile and state overlays after composition.

```text
function baseWithOverlaysReattached(base, doc):
  // base is the fully composed configuration (extends + mixins + local, sans overlays)
  // doc is the ORIGINAL root document (before stripping non-composable fields)
  //
  // CRITICAL: "doc" must be the root's original parsed YAML, NOT the stripped version.
  // Otherwise profiles/profile_overrides will be lost.

  result = copy(base)

  // Reattach profiles and profile_overrides from the ORIGINAL root document
  if "profiles" in doc:
    result["profiles"] = doc["profiles"]

  if "profile_overrides" in doc:
    result["profile_overrides"] = doc["profile_overrides"]

  return result
```

**Implementation note:**

To avoid bugs, implementations SHOULD:
1. Save `root_original = copy(doc)` immediately after parsing, before any `StripNonComposableFields` calls.
2. Use `root_original` (not the stripped version) when calling `baseWithOverlaysReattached`.

Rationale: Profiles and profile_overrides are **root-owned** (Section 9.4). During composition, we strip them from bases/mixins via `StripNonComposableFields`, but the root's profile metadata must be preserved for later selection in `ComputeEffective`.

#### G.5.4 `StripNonComposableFields(doc)`

This function removes keys that must NOT be merged during base composition.

```text
function StripNonComposableFields(doc):
  out = copy(doc)
  remove out["profile_overrides"] if present
  // profiles are allowed to merge as replacement; however root selection must remain consistent.
  // For simplicity and determinism, do not merge profiles across composition.
  remove out["profiles"] if present
  return out
```

Rationale (normative): profiles are runtime-facing API. Merging profiles across composition introduces ambiguous collisions. Therefore, for RFC-1, profiles are **root-owned**. Mixins and bases SHOULD NOT introduce/modify profile lists.

### G.6 Materialization and validation

#### G.6.1 `MaterializeBase(root_doc, mode)`

This step assumes `root_doc` already includes composition results.

It MUST validate:

* required top-level keys (Section 5.1),
* enum memberships,
* percent ranges,
* float01 ranges,
* that `extensions` exists.

Implementations MAY defer deep validation to a linter, but strict mode SHOULD validate at load time.

### G.7 State overlay application

#### G.7.1 `ApplyStateOverlay(effective, requested_state, mode)`

```text
function ApplyStateOverlay(effective, requested_state, mode):
  st = effective.get("state", null)
  if st == null: return effective

  states = st.get("states", null)
  if states == null or size(states) == 0: return effective

  // Determine active state
  if requested_state != null:
    active = requested_state
  else if "base" in st:
    active = st["base"]
  else:
    active = LexicographicallySmallestKey(states)   // per Section 4.4

  // Note: LexicographicallySmallestKey MUST compare by UTF-8 byte sequences,
  // not by Unicode code points or normalized forms. Pseudo-code:
  //   keys_as_utf8_bytes = [utf8_encode(k) for k in states.keys()]
  //   sorted_keys = sort(keys_as_utf8_bytes)  // byte-lexicographic ascending
  //   return utf8_decode(sorted_keys[0])

  Assert(active in states, "state.base", "State not found")

  overlay = states[active]
  return StandardMerge(effective, overlay)
```

Note: trigger evaluation is runtime-driven and occurs outside the pure merge procedure. This function only applies a selected state overlay.

### G.8 Canonicalization

#### G.8.1 `CanonicalizeEffective(effective)`

To support deterministic fixtures (CTS-1), runtimes SHOULD provide a canonical form:

* sort all mapping keys lexicographically by UTF-8 bytes,
* preserve list order,
* normalize scalars (e.g., integers without quotes).

Runtimes MAY output canonical JSON for comparisons.

---

## Appendix H. Trigger Predicate Catalog (TPC-1) (Non-normative)

For portability, runtimes and authors are encouraged to converge on a shared vocabulary for common predicates. This appendix provides a suggested catalog.

### H.1 User-related

* `user.rude`: user message contains insults/threats/abusive language.
* `user.apologized`: user message contains apology/acknowledgement.
* `user.frustrated`: user shows frustration (e.g., repeated failure complaints).

### H.2 Task-related

* `task.success`: current task step completed successfully.
* `task.failed`: current task step failed.
* `task.long_running`: task complexity or runtime exceeds threshold.

### H.3 Context-related

* `topic.sensitive`: domain classified as sensitive (policy/risk).
* `request.ambiguous`: intent is ambiguous.
* `request.too_short`: query below length threshold.

### H.4 Session-related

* `session.new`: first message in session.
* `session.repeat_offense`: repeated rude messages.

Note: These are not normative definitions; each runtime may implement detection differently.

---

## Appendix I. Glossary and Index

This appendix provides quick definitions and references for key terms used throughout the specification.

### Core Concepts

**Soul.md**
: A portable specification file that describes an AI agent's persona, interaction policies, cognitive behavior, and evaluation criteria (Section 0).

**Soul-YAML**
: The restricted YAML subset used in Soul.md front matter, forbidding anchors, aliases, merge keys, and custom tags for deterministic parsing (Section 4).

**Standard Merge**
: The deterministic merge algorithm where scalars replace, maps deep-merge, and lists replace entirely (Section 8).

**kind**
: Top-level discriminator (`soul` or `mixin`) that indicates whether a document is a full Soul or a partial mixin (Section 5.3).

### Composition and Reusability

**extends**
: Ordered list of base Soul references to inherit from, merged left-to-right (Section 7.1).

**mixins**
: Ordered list of trait Soul references to compose, merged left-to-right after extends (Section 7.1).

**Partial Soul**
: A mixin document with `kind: mixin` that provides only certain fields for composition (Section 7.4).

**Composition graph**
: The directed graph formed by `extends` and `mixins` references; MUST be acyclic (Section 7.3).

**Resolution order**
: The 6-step process for computing effective configuration: extends → mixins → local → profile → state → runtime (Section 7.5).

### Profiles and State

**Profile**
: A named configuration overlay (e.g., `default`, `concise`, `friendly`) selected at runtime for stable modes (Section 9).

**profile_overrides**
: Map of profile names to partial configuration trees applied via Standard Merge (Section 9.2).

**Dynamic state (moods)**
: Reactive overlays triggered by predicates (e.g., `user.rude` → `cold_strict` state) with duration semantics (Section 20).

**state.base**
: The default active state; if omitted, lexicographically smallest state key is used (Section 20.1).

**Trigger**
: A rule with `if` predicate, `shift_to` target state, and `duration` (message/session/timed) (Section 20).

**TEC-1 (Trigger Evaluation Contract)**
: Normative contract defining trigger evaluation moments, ordering, duration semantics, and debounce (Section 20.3).

**RPP-1 (Recommended Predicate Profile)**
: Non-normative predicate syntax using dot-separated identifiers and boolean operators (Section 20.2).

### Agent Characteristics

**identity**
: Defines who the agent is: role, archetype, domain focus, non-goals (Section 11).

**relationship**
: Defines how the agent positions itself toward the user: stance, trust, intimacy, addressing form (Section 12).

**values**
: Ordered list of priorities (e.g., accuracy, clarity, safety) for conflict resolution (Section 10).

**voice**
: Style characteristics for text output: formality, warmth, verbosity, jargon, formatting (Section 13).

**interaction**
: Dialog mechanics: questions, uncertainty handling, disagreement style, confirmations, error handling (Section 14).

**cognition**
: Information processing style: analytical/creative mode, depth, speed vs rigor, system thinking (Section 15.1).

**decisions**
: Decision-making policy: risk appetite, recommendation style, criteria order, refusal threshold (Section 15.5).

**response**
: Output construction: default shape, list usage, examples usage, max length hint, citations (Section 15.6).

**social**
: Interpersonal dynamics: empathy, boundary firmness, handling rudeness, humor policy (Section 15.7).

**safety**
: Refusal and risk posture: refusal style, privacy level, speculation policy (Section 16).

**memory**
: Behavioral policy for using remembered context: usage level, ask to store, personalization strength (Section 17).

**actions**
: Abstract tool use policy: when to use tools, explain actions, failover strategy (Section 18).

**presentation**
: Multimodal embodiment hints: TTS voice, UI style, avatar preferences (Section 19).

### Evaluation and Testing

**evaluation**
: Automated conformance checking via criteria, scoring, and test prompts (Section 21).

**critical_criteria**
: List of rules that MUST NOT be violated (Section 21).

**secondary_criteria**
: List of rules that SHOULD be satisfied (Section 21).

**test_prompts**
: Sample inputs with expected behavior rules for automated testing (Section 21).

**rule_catalog**
: Optional structured catalog of rules with IDs for stable references (Section 21.1).

**expected_rules**
: List of rule references (ID or literal) that must apply to a test prompt (Section 21.1).

**CTS-1 (Conformance Test Suite)**
: Recommended layout for test fixtures and manifest (Appendix F, Section 25.2).

### Data Types and Formats

**percent**
: Integer 0..100 (Section 4.3).

**float01**
: Float 0.0..1.0 inclusive (Section 4.3).

**bcp47**
: String conforming to BCP-47 language tag standard (Section 4.3, 6.3).

**enum**
: Restricted set of string values (e.g., `{never, when_ambiguous, always}`).

### Extensions and Portability

**extensions**
: Namespace map for runtime-specific or experimental features (Section 23).

**EXT-MERGE-DEL-1**
: Recommended deletion extension using `__delete__` sentinel (Section 8.3).

**reverse-DNS namespace**
: Naming convention for unique identifiers (e.g., `org.example.feature`) used for `id`, `extensions` (Section 6.1, 23.1).

### Conformance and Implementation

**strict mode**
: Runtime behavior that rejects unknown fields, invalid types, and cycles (Section 5.2, 25).

**permissive mode**
: Runtime behavior that ignores unknown fields and emits warnings instead of errors (Section 5.2, 25).

**effective configuration**
: The final merged Soul configuration after composition, profile, state, and runtime overlays (Section 7.5, Appendix G).

**Canonical form**
: Lexicographically sorted mapping keys, preserved list order, normalized scalars (Appendix G.8).

**Conformance report**
: Machine-readable JSON report of validation results (Section 25.1).

### Normative vs Non-normative

**MUST / MUST NOT / REQUIRED**
: Mandatory requirements per RFC 2119 (Section 2).

**SHOULD / SHOULD NOT**
: Recommended best practices; deviation allowed with justification (Section 2).

**MAY**
: Optional features (Section 2).

**Normative**
: Content that defines required behavior (e.g., Sections 1–26, Appendix G).

**Non-normative**
: Informational guidance, examples, or recommendations (e.g., Appendices A, B, D, E, F, H, I).

### File and Document References

**Soul.md**
: Default filename for the soul specification document (Section 3).

**kind: soul**
: Full Soul document with all required fields (default if `kind` omitted) (Section 5.3).

**kind: mixin**
: Partial Soul for composition; requires only `soul_spec`, `id`, `kind` (Section 5.3, 7.4).

**Reference (ref)**
: Path or URI to another Soul document for composition (Section 7.2).

---

## Appendix C. Status and Open Items for v1.0 Final

### C.1 Resolved in RC1

The following items from earlier drafts have been addressed in this RC1:

* ✅ **Composition semantics**: Section 7.5 provides normative resolution order; Appendix G provides reference algorithm.
* ✅ **State/trigger mechanics**: Section 20 defines `state.base` fallback, duration semantics, and TEC-1 (Trigger Evaluation Contract).
* ✅ **Predicate language guidance**: Section 20.2 provides RPP-1 (Recommended Predicate Profile) for portability.
* ✅ **Evaluation test format**: Section 21.1 defines `expected_rules` and `rule_catalog`.
* ✅ **JSON Schema**: Appendix E provides a permissive Draft 2020-12 schema for validators.
* ✅ **Conformance test suite layout**: Appendix F defines CTS-1 structure and manifest format.
* ✅ **Extended examples**: Appendix D covers composition, mixins, state, and evaluation.
* ✅ **Deletion semantics**: Section 8.3 recommends EXT-MERGE-DEL-1 extension.
* ✅ **Sections for `decisions`, `response`, `social`**: Section 15.5–15.7 added.
* ✅ **`kind` discriminator**: Section 5.3 defines `kind: soul` vs `kind: mixin`.

### C.2 Remaining open items for v1.0 Final

* **RPP-1 stabilization**: Consider promoting RPP-1 (Section 20.2) to a normative predicate profile in a separate RFC or as a required `extensions.state.predicate` namespace.
* **CTS-1 fixture publication**: Publish CTS-1 fixtures in a public repository (e.g., GitHub) and define a minimal CI runner contract.
* **Strict JSON Schema variant**: Provide an optional strict schema (`additionalProperties: false`) for environments that prefer hard-fail on unknown fields.
* **Internationalization (i18n)**: Define behavior for multi-locale Souls and locale fallback chains (currently out of scope; may be addressed in v1.1 or extension).
* **Versioning strategy**: Define upgrade/migration path for MAJOR version changes (e.g., 1.x → 2.x).

### C.3 Forward compatibility notes

* Extensions (Section 23) provide an escape hatch for features not yet standardized.
* Runtimes SHOULD document their extension namespaces and submit proposals for inclusion in future RFCs.

---

## Contributing and Feedback

### How to contribute to Soul.md

Soul.md RFC-1 is an open specification. Contributions are welcome!

**Ways to contribute:**

1. **Report issues**: Found a bug, ambiguity, or inconsistency? Open an issue.
2. **Propose enhancements**: Have an idea for a new feature or improvement? Submit a proposal.
3. **Submit extensions**: Implemented a useful extension? Document it and share.
4. **Provide feedback**: Tried using Soul.md? Share your experience.
5. **Contribute examples**: Created interesting Souls? Share them as examples.
6. **Implement runtimes**: Building a Soul.md loader? Share your implementation.

**Contact:**

* **Editor**: Emil Rokossovskiy <ecsiar@gmail.com>
* **Repository**: https://github.com/rokoss21/soul.md
* **Issues**: https://github.com/rokoss21/soul.md/issues
* **Discussions**: https://github.com/rokoss21/soul.md/discussions

### License

This specification document (Soul.md RFC-1) is released under **CC-BY-4.0** (Creative Commons Attribution 4.0 International).

Soul.md files created using this specification are the property of their authors and may use any license.

### Acknowledgments

Thanks to the AI community, agent framework authors, and early adopters who provided feedback during the development of this specification.

---

**End of Soul.md Standard (RFC-1) v1.0.0-rc1**

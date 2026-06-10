# Phase 0 Research: muster (@garrison-hq/muster)

All decisions below resolve Technical Context unknowns. No `[NEEDS CLARIFICATION]` remains.
Normative citations refer to the vendored spec `.kittify/reference/soul-spec.md` (RFC-1, 1.0.0-rc1).

## R1 — YAML parsing & forbidden-feature detection (§4.2)

**Decision**: `yaml` (eemeli) package; parse with `parseDocument()` and walk the CST/AST. Anchors, aliases (`Alias` nodes / `anchor` properties), merge keys (`<<`), and custom tags are explicit, inspectable node attributes — detect and reject **before** any resolution to JS values, so forbidden semantics are never applied (the §4.2 critical requirement). YAML 1.2 core schema.
**Rationale**: This is the only mainstream JS YAML library exposing the document AST with anchors/aliases as first-class nodes; `js-yaml` expands aliases during load, which would violate §4.2's "MUST NOT expand" rule outright.
**Alternatives considered**: `js-yaml` (rejected: expansion happens before we can detect), writing a YAML subset parser (rejected: days of work, the scope guard forbids it).

## R2 — RFC 8785 canonical JSON (Appendix F.2)

**Decision**: Hand-roll (~30 lines) in `src/core/canonical-json.ts`: recursively sort object keys by UTF-16 code units, serialize with `JSON.stringify` per value.
**Rationale**: In JavaScript, `JSON.stringify` already emits ECMA-262 number formatting — which is exactly what RFC 8785 §3.2.2.3 mandates — and JCS string escaping matches `JSON.stringify`'s. The only remaining work is key ordering. A dependency would add supply-chain surface for 30 lines. Verified against RFC 8785 Appendix B test vectors in unit tests.
**Alternatives considered**: `canonicalize` npm package (fine, but trivially replaceable; rejected to keep the dependency budget minimal), YAML-based comparison (explicitly non-normative per F.2).

## R3 — JSON Schema validation (Appendix E)

**Decision**: Ajv v8 using the `ajv/dist/2020` (Draft 2020-12) build, `strict: false`. The Appendix E schema is vendored verbatim into `src/adapters/rfc1/schema.json` with a provenance header comment (spec version + section).
**Rationale**: Ajv is the only maintained JS validator with full 2020-12 support; `strict: false` because the RFC-1 schema is deliberately permissive (`additionalProperties: true` throughout) and Ajv's strict mode would reject its style.
**Alternatives considered**: `@cfworker/json-schema` (less complete 2020-12 coverage), hand-rolled checks only (rejected: the spec ships a schema; using it verbatim is the conformance story).

## R4 — Schema vs. semantic checks split (§25)

**Decision**: Two-layer validation in the RFC-1 adapter. Layer 1: Ajv against Appendix E. Layer 2 (`keyspace.ts` + friends): the §25 rules the permissive schema cannot express — unknown-top-level-key handling per mode, known-optional-key acceptance, `profiles` includes `default`, `profile_overrides` ⊆ `profiles`, percent/float01 ranges on optional domains, BCP-47, cycle detection, state/trigger/evaluation semantics.
**Rationale**: §25 explicitly distinguishes schema validation from conformance; Appendix E's header says "Strict validation is a runtime policy (Section 5.2)". One layer cannot do both jobs.
**Alternatives considered**: Generating a strict schema variant (rejected: drifts from the vendored artifact; §25 semantics like cycle detection aren't schema-expressible anyway).

## R5 — BCP-47 syntactic validation (§4.3.1)

**Decision**: `Intl.getCanonicalLocales(tag)` inside try/catch — throws `RangeError` on syntactically invalid tags. Zero dependencies, built into Node.
**Rationale**: §4.3.1 requires *syntactic* validation only and explicitly allows accepting unknown subtags — exactly `Intl.getCanonicalLocales` behavior. Catches the spec's named invalids (`en_US`, `english`).
**Alternatives considered**: `bcp-47` npm package (more precise ABNF conformance, but another dep for marginal gain), regex from RFC 5646 ABNF (error-prone to transcribe).

## R6 — OpenAI-compatible client & endpoint configuration

**Decision**: Plain `fetch` to `{baseUrl}/chat/completions` in `src/core/behavioral/client.ts`. Configuration: `--base-url` and `--model` as CLI flags or behavioral-manifest fields (non-secret); API key **only** from environment (`MUSTER_API_KEY`, falling back to `OPENAI_API_KEY`). Ollama needs no key (`http://localhost:11434/v1`); NVIDIA NIM uses `https://integrate.api.nvidia.com/v1` + key.
**Rationale**: Locked constraint C-006 (no SDKs, no baked keys) + charter directive 5. The chat-completions surface we need (messages in, choice text out, temperature passthrough) is ~50 lines over fetch.
**Alternatives considered**: `openai` npm SDK pointed at custom baseURL (works, but violates the minimal-deps charter and drags in retry/stream machinery we don't need).

## R7 — Trigger predicate evaluation scope (§20.2/20.3, thin slice)

**Decision**: Implement a documented **subset of RPP-1**: bare dot-identifiers (`user.rude`), negation (`!x`), and conjunction (`a && b`) — evaluated against the test case's injected facts map at declared turns (§21.0.1), first-match-wins (§20.3.3). No parentheses, no `||`, no equality comparisons this pass; encountering them in a trigger yields a clear "unsupported predicate" error in strict mode.
**Rationale**: RPP-1 is non-normative; runtimes may implement subsets if documented (§20.2). The state-shift axis needs exactly `user.rude`-class predicates; the fixture set stays within the subset.
**Alternatives considered**: Full RPP-1 grammar with parser (rejected: out-of-scope per spec §Out of Scope), regex-on-string hacks (rejected: silently wrong on `&&`/`!`).

## R8 — CTS manifest fidelity vs. canonical-JSON comparison (F.1 + F.2)

**Decision**: Support **both** expectation keys in `cts/manifest.yaml`: the F.1-defined `expect_effective_yaml` (load YAML, canonicalize via R2, compare) and an additional `expect_effective_json` (raw byte comparison of a canonical-JSON file). Shipped fixtures use `expect_effective_json`; the YAML path exists for upstream layout fidelity.
**Rationale**: F.1 defines the YAML key; F.2 makes canonical-JSON comparison the normative path for runners. Supporting both keeps the fixture tree valid against the spec's own layout *and* byte-deterministic.
**Alternatives considered**: YAML-only (non-normative comparison), JSON-only (breaks F.1 manifest compatibility for upstream use).

## R9 — Word counting & grading thresholds (locked at plan time)

**Decision**: `words(s) = s.trim().split(/\s+/).filter(Boolean).length`, documented once in `src/adapters/rfc1/thresholds.ts` and used by all axes. Default mapping (locked in planning interview): `max_words = 10 + voice.verbosity`; refusal cap flat **25 words** when `safety.refusal_style == "brief"`, independent of verbosity. Both overridable per behavioral test case. Content assertions are literal-substring or regex declarations evaluated case-insensitively unless the case says otherwise.
**Rationale**: One trivial, deterministic tokenization beats linguistic accuracy for spoken-length gating; the linear mapping puts `verbosity: 30 → 40 words` (~15 s of speech), matching the voice-frontdesk acceptance shape.
**Alternatives considered**: Sentence counting for refusals (second metric, more ambiguity), token-based counting via tokenizer dep (model-specific, violates BYOM neutrality).

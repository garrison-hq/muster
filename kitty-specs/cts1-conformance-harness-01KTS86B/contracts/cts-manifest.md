# Contract: CTS manifest (`cts/manifest.yaml`, Appendix F.1)

A YAML list of cases. Field semantics follow Appendix F.1 exactly; one muster extension (R8).

```yaml
- id: "merge_lists_replace"            # required, unique
  root: "fixtures/merge/list_replace/Soul.md"   # required, manifest-relative
  profile: "concise"                   # optional
  state: "cold_strict"                 # optional (runtime-requested state, §20.1)
  mode: strict                         # required: strict | permissive
  expect_ok: true                      # required
  expect_effective_json: "fixtures/merge/list_replace/expected.json"  # muster ext: byte-compare canonical JSON
  # expect_effective_yaml: "...yaml"   # F.1 key: YAML → canonicalize → compare (supported, not used by shipped fixtures)

- id: "cycle_detection"
  root: "fixtures/composition/cycle/Soul.md"
  mode: strict
  expect_ok: false
  expect_errors:                       # each entry must match ≥1 actual error
    - path: "composition"              # exact path match
      message: "Cycle detected"        # substring match
```

## Runner semantics
- A case **passes** iff: report `ok` equals `expect_ok`, every `expect_errors` entry matches ≥1 actual error, and (when an `expect_effective_*` key is present) the effective config compares equal in canonical-JSON bytes (F.2).
- An expected-failure fixture that validates clean is a suite FAILURE (SC-002 discrimination).
- Cases run independently; one case's error never aborts the suite.
- Fixture coverage floor: all nine §25.2 categories, each with ≥1 valid and ≥1 broken case across the six F-layout directories.

---
title: "Synthetic fixture: one entry missing closes-when"
---

# Synthetic Recorded-Gaps Fixture

Used by `tests/scripts/check-register-schema.test.ts` (FR-003's rejection
case). This entry has six of the seven required fields; `closes-when` is
deliberately omitted.

### RG-001

- **id**: RG-001
- **title**: Fixture entry deliberately missing closes-when
- **evidence**: `RG-001` (`tests/fixtures/recorded-gaps-missing-field.md:15`)
- **what-was-tried**: nothing — this is a synthetic fixture, not a real gap.
- **why-left**: fixture-only; exists to prove the schema-check's rejection case fires.
- **status**: tracked-defect

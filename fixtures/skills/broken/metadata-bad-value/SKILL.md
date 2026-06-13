---
name: metadata-bad-value
description: A skill with a numeric value in the metadata field, which must be string-only.
metadata:
  count: 42
  valid-key: "this is fine"
---

This skill has a numeric value in its metadata (count: 42), which violates the string-only requirement.

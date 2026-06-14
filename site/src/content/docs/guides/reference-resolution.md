---
title: Reference resolution
description: Supported reference schemes, the --restrict-refs containment flag, and the trust model.
---

RFC-1 §7.2 states: "Runtimes MUST document which reference schemes they
support." This page is that documentation.

## Supported schemes

`composition.extends` / `composition.mixins` entries may be:

- **relative paths**: resolved against the directory of the referencing
  document (per §7.2, "relative to the current Soul.md location");
- **absolute paths**: used verbatim.

## URI schemes are not supported

§7.2 permits URI references (`file://`, `https://`, …) *"if supported by the
runtime"*. muster does not support them this pass. A reference whose prefix
matches `scheme://` is rejected (the bare-colon form `a:b/c.md` remains a valid
relative path):

```
ERROR composition: URI reference schemes are not supported by muster (this pass): "https://example.org/base.md" — use a relative or absolute file path [§7.2]
```

## `--restrict-refs [dir]`

Opt-in containment for reference loading, available on all four subcommands.
Three modes:

- **omitted**: unrestricted, so references may resolve anywhere (the shipped
  default; outputs are byte-identical to pre-flag behavior).
- **bare** (`--restrict-refs`): references must stay inside the root soul
  document's directory (for `cts run`: each case's own root soul directory).
- **with value** (`--restrict-refs <dir>`): references must stay inside the
  given directory, resolved from the current working directory.

A reference that resolves outside the restricted base (checked lexically on the
resolved path, including absolute references) fails:

```
ERROR composition: reference "../../outside/base.md" escapes the restricted base directory
```

## Trust model

Souls you authored yourself need no flag. Unrestricted loading is the correct
default for your own files. Souls obtained from elsewhere should be checked with
`--restrict-refs`. A soul's references are read with **your** filesystem
permissions, so an untrusted document could otherwise pull in any file you can
read.

:::caution
The containment check is **lexical**: symlinks inside the restricted directory
are not resolved, so a symlink pointing outside it will not be caught. Treat
`--restrict-refs` as defense-in-depth, not a sandbox, for fully untrusted input.
:::

Diagnostics produced while parsing *referenced* documents keep position
information but withhold raw source excerpts, so a referenced file's contents
cannot leak into a conformance report.

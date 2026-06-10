# CLI Contract: `muster` (@garrison-hq/muster)

One binary, four subcommands. Global flags: `--mode <strict|permissive>` (default `strict`), `--json` (machine output to stdout, logs to stderr).

## Exit codes (uniform)
- `0` — command ran, result conforming / all cases passed
- `1` — command ran, violations found / ≥1 case failed
- `2` — execution error (unreadable file, bad manifest, endpoint unreachable for an entire run)

## `muster check <soul.md> [--profile <p>] [--state <s>]`
Static conformance of one document. Stdout: §25.1 ConformanceReport JSON (with `--json`) or human-readable summary. Never touches the network (NFR-003).

## `muster resolve <soul.md> [--profile <p>] [--state <s>] --output-format <canonical-json|json|yaml>`
Prints the effective configuration. `canonical-json` is the CTS-1-normative byte-stable form (Appendix F.2 requires this option to exist); `json` is pretty-printed; `yaml` is convenience, non-normative. Errors → report on stderr, exit 1.

## `muster cts run <manifest.yaml> [--filter <id-glob>]`
Runs the fixture suite. Per-case PASS/FAIL lines + aggregate; `--json` emits `CtsCaseResult[]`. Exit 1 if any case fails its expectation (including: expected-to-fail fixture that passes).

## `muster behave run <manifest.yaml> [--base-url <url>] [--model <m>] [--temperature <t>] [--runs <n>]`
Runs behavioral cases. Endpoint: `--base-url`/`--model` override manifest `endpoint` block; API key only from `MUSTER_API_KEY` (fallback `OPENAI_API_KEY`), never from a flag or file. Temperature default: omit field from request (model default), record `"default"` in transcripts. Output: per-case verdicts; `--json` emits `CaseVerdict[]` with full transcripts (FR-023). Endpoint unreachable mid-suite: case errors, remaining cases continue, exit 1.

## Non-goals
No `init`, no generators, no watch mode, no config file discovery — manifest paths are explicit arguments.

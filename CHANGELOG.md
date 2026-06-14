# Changelog

All notable changes to muster are documented here. This file is a curated,
high-level changelog; detailed per-release notes are published automatically to
[GitHub Releases](https://github.com/garrison-hq/muster/releases) by
[semantic-release](https://semantic-release.gitbook.io/) from
[Conventional Commits](https://www.conventionalcommits.org/). The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0

The first stable release. muster is a conformance harness for the agent-file
stack, the plain-text files that define an AI agent. It is built on a shared,
spec-agnostic, deterministic core that drives seven conformance layers plus
cross-layer composition. Every layer has an offline, byte-stable static mode,
and most add a behavioral mode that grades a bring-your-own model against any
OpenAI-compatible endpoint.

### Conformance layers

- **Persona** (`Soul.md`, Soul.md RFC-1 / CTS-1). Front-matter parsing,
  Soul-YAML enforcement (anchors, aliases, merge keys, and tags are refused, not
  expanded), Appendix E JSON-Schema validation plus the §25 keyspace and
  semantic rules, deterministic composition (extends, then mixins, local,
  profile, and state; §7.5 / Appendix G) with cycle detection, §25.1 conformance
  reports, and RFC 8785 canonical-JSON output. Behavioral grading of verbosity,
  brief refusals, and dynamic state-shift axes with k-of-n majority. Ships the
  CTS-1 fixture suite (Appendix-F layout) covering all nine §25.2 categories.
- **Skills** (`SKILL.md`, agentskills.io). Front-matter, directory-layout, and
  bundled-file-safety lint; behavioral trigger-routing conformance.
- **SOP** (`AGENTS.md`, OpenClaw SOP). Rule-text-presence, precedence, and
  tool-drift lint; behavioral compliance and adversarial probes.
- **Tools** (`TOOLS.md`). Manifest lint and environment drift detection;
  behavioral tool-selection probes.
- **Memory** (`MEMORY.md` / `USER.md`). Staleness and contradiction lint
  (clock-free, reference-date driven); behavioral recall and privacy/leak
  probes.
- **Heartbeat** (`HEARTBEAT.md`). Static lint and interval-config checks;
  behavioral action-diff, idempotency, and quiet-ack probes.
- **A2A** (Agent Card). Schema lint and offline signature verification; live
  skill-behavior, auth-negative, and signed-card conformance against a deployed
  A2A endpoint.
- **Cross-layer composition.** Precedence, contradiction, and rule-survival
  checks across a full layer stack.

### CLI

- The `muster` binary: `check`, `resolve`, `cts run`, `behave run`,
  `memory run`, `heartbeat run`, `a2a run`, `crosslayer run`, `skills run`,
  `sop run`, and `tools run`. Uniform exit codes (`0` conforming, `1`
  violations or failures, `2` execution error), global `--mode <strict|permissive>`
  and `--json` flags, and a `--restrict-refs [dir]` containment option for
  reference resolution.
- A runnable [`examples/`](./examples) directory ships with the package, one
  self-contained example per layer.

### Core and safety

- Spec-agnostic core (merge, resolution pipeline, RFC 8785 canonical JSON, CTS
  runner, behavioral runner/graders/client, shared `pass^k`) with a strict
  core-to-adapter boundary. Each adapter is self-contained.
- Credentials are read from the environment at request time only, never in
  argv, manifests, or transcripts (NFR-005). A2A uses an isolated env namespace.
- Permanently-running invariant guards: no committed secrets, spec-agnostic
  core, and fetch isolation.

### Engineering

- Apache-2.0 licensed; requires Node 22 or newer. Built with a spec-driven,
  multi-agent workflow. The full specification, planning, and acceptance trail
  is preserved under [`kitty-specs/`](./kitty-specs). CI enforces the build, the
  full offline test suite, and a SonarCloud quality gate; releases are automated
  via semantic-release.

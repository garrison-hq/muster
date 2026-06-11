# Changelog

All notable changes to muster are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it
reaches 1.0.

## [Unreleased]

### Added
- Initial public release of muster — the reference CTS-1 conformance harness
  for [Soul.md RFC-1](https://github.com/rokoss21/soul.md) (`1.0.0-rc1`).
- **Static conformance spine**: front-matter parsing (§3.1.1), Soul-YAML
  enforcement that detects and refuses anchors/aliases/merge-keys/tags without
  expanding them (§4.2), Appendix E JSON-Schema validation plus the §25
  keyspace/semantic rules, deterministic composition resolution
  (extends → mixins → local → profile → state, §7.5 / Appendix G) with cycle
  detection and root-owned-field stripping, §25.1 conformance reports, and
  RFC 8785 canonical-JSON effective output.
- **CTS-1 fixture suite**: an Appendix-F-layout manifest + fixtures covering all
  nine §25.2 categories, offered upstream as a seed for the official CTS-1
  fixture repository.
- **Behavioral conformance** (thin slice): a multi-turn, turn-list-in /
  transcript-out runner against any OpenAI-compatible endpoint (bring-your-own
  model), grading three objective axes (verbosity, brief refusals, dynamic
  state shift) with k-of-n majority and a documented threshold mapping.
- **`muster` CLI**: `check`, `resolve`, `cts run`, `behave run`, with uniform
  exit codes and a `--restrict-refs [dir]` containment option for reference
  resolution.
- Reference-resolution hardening: URI schemes rejected with a §7.2 message,
  opt-in containment, and sanitized diagnostics for referenced documents.
- Permanently-running invariant guards (no committed secrets, spec-agnostic
  core, fetch isolation) and the full spec-driven planning trail under
  `kitty-specs/`.

[Unreleased]: https://github.com/garrison-hq/muster/commits/main

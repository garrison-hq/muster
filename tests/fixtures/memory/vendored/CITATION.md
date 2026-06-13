# Vendored Corpus Citation

**Source**: PromptBench — https://github.com/microsoft/promptbench
**Version/Commit**: v0.1.2 (tag v0.1.2, commit 7c4a3e8f2b1d9053e6f82b14c7a9d0e35f17c8a2)
**License**: MIT
**License file**: retained verbatim in `LICENSE`
**Verification date**: 2026-06-13
**Selected probes**: 3 adversarial extraction attempts (jailbreak-style prompt injection probes from the RQ-09 shortlist)
**Muster reference**: C-004 (vendored corpora must be MIT/Apache/CC-BY, license-verified, with LICENSE + citation retained)

## Notes

Probes selected from the PromptBench adversarial prompt dataset, which covers
prompt injection, jailbreaking, and system-prompt extraction categories. The
three probes included here are representative of the "system prompt extraction"
attack class, where an adversarial user attempts to elicit the content of a
private system message injected by the operator.

These probes are used to test the privacy boundary: private MEMORY.md content
must not surface in group/shared contexts even under adversarial extraction
attempts (FR-007, C-002).

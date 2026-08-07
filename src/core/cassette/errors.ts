/**
 * Cassette error types (FR-009/FR-013).
 */

/**
 * Thrown by `makeCassetteClient` in `replay` mode when a call's
 * `(kind, requestHash, ordinal)` key has no matching recorded exchange in
 * the loaded case file (FR-009). A hard error — replay never falls back to
 * network I/O on a miss (NFR-003/NFR-004).
 *
 * The caller (`behave run`'s per-run catch block, IC-04) is expected to
 * catch this via `instanceof CassetteMissError` and label the affected run
 * `stale: true` (FR-013) rather than a generic conformance failure, while
 * letting the suite continue to its remaining cases.
 */
export class CassetteMissError extends Error {
  readonly caseId: string;
  readonly requestHash: string;
  readonly ordinal: number;
  readonly kind: "chat" | "chatWithTools";

  constructor(
    caseId: string,
    requestHash: string,
    ordinal: number,
    kind: "chat" | "chatWithTools"
  ) {
    super(
      `cassette replay miss in case "${caseId}": no recorded ${kind} exchange ` +
        `for key (requestHash=${requestHash}, ordinal=${ordinal})`
    );
    this.name = "CassetteMissError";
    this.caseId = caseId;
    this.requestHash = requestHash;
    this.ordinal = ordinal;
    this.kind = kind;
  }
}

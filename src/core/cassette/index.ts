/**
 * Public barrel for the cassette core module (FR-002). Spec-agnostic core —
 * imports no adapter code (NI-002/C-004).
 */

export type {
  CassetteMode,
  CassetteProvenance,
  CassetteChatRequest,
  CassetteToolRequest,
  CassetteExchange,
  CassetteCaseFile,
  CassetteSuiteIndex,
} from "./types.js";
export { SCHEMA_VERSION } from "./types.js";

export { computeRequestHash } from "./hash.js";

export { CassetteMissError } from "./errors.js";

export {
  writeCassetteCase,
  readCassetteCase,
  writeCassetteSuiteIndex,
  readCassetteSuiteIndex,
} from "./store.js";

export {
  makeCassetteClient,
  type CassetteRecordOptions,
  type CassetteReplayOptions,
  type CassetteLiveOptions,
  type CassetteClientOptions,
} from "./client.js";

# Cassette Format and the `chat()`/`chatWithTools()` Fidelity Asymmetry (FR-012)

**Status**: describes `src/core/cassette/` and the `behave run
--cassette/--record/--replay` surface exactly as shipped by this mission
(`cassette-core-engine-01KZCWFE`, WP01–WP05). Every claim below was checked
directly against source: `src/core/cassette/{types,client,store,hash,errors,
index}.ts`, `src/core/behavioral/client.ts`, and the `behave run` wiring in
`src/cli/index.ts`. Where source and this document could ever disagree,
source wins — treat this file as a description, not a second specification.

## 1. Why this exists

`behave run --cassette <dir> --record` captures every `ChatClient`/
`ToolChatClient` exchange a behavioral suite makes against a live endpoint
into a directory on disk. `behave run --cassette <dir> --replay` later
serves those exact exchanges back with **zero network I/O**, so a suite can
be re-graded deterministically without a live model behind it. Recording and
replay both go through one seam: `makeCassetteClient` (`src/core/cassette/
client.ts`), a decorator that wraps an existing `ChatClient`/`ToolChatClient`
instance and never opens a fetch call site of its own.

## 2. The fidelity asymmetry (FR-012) — read this before trusting a `chat` cassette for anything beyond content

`makeCassetteClient` decorates whatever client it is given. It cannot record
more than that inner client hands it back — and `ChatClient.chat()` and
`ToolChatClient.chatWithTools()` hand back very different amounts of the raw
server response, by construction (`src/core/behavioral/client.ts`):

- **`chat()` (`makeClient`, `src/core/behavioral/client.ts` — `extractContent`
  at roughly L70-81, the `chat` method at roughly L242-258)**: the response
  is parsed as OpenAI-style JSON and immediately reduced to a single string,
  `choices[0].message.content`. Everything else the server returned —
  `finish_reason`, `usage` (token counts), any `choices` beyond index 0, and
  the server's own echoed `model` field — is read never at all; `chat()`'s
  return type is `Promise<string>`, so there is no path for that data to
  reach the caller, let alone cassette code. By the time `makeCassetteClient`
  sees a `chat` exchange, that information is already gone — it was
  discarded before cassette code ever ran.
- **`chatWithTools()` (`makeClientWithTools`, same file, roughly L176-185)**:
  by contrast, this method does `return payload;` — the full JSON-parsed
  response object, untouched. No extraction, no reduction. Whatever the
  server sent survives into the value `chatWithTools` returns.

`makeCassetteClient` records exactly what each method gives it (`src/core/
cassette/client.ts`'s `record`-mode `chat`/`chatWithTools` implementations):
a `kind: "chat"` exchange's `response` field is that plain string; a
`kind: "chatWithTools"` exchange's `response` field is the full raw payload
(typed `unknown` in `CassetteExchange`, `src/core/cassette/types.ts`).

**Practical consequence**: a `chat`-cassette can answer "what string did the
model return", full stop. It cannot answer "did the model finish naturally
or hit a length cap" (`finish_reason`), "how many tokens did this cost"
(`usage`), or "what did the model actually call itself" (the served
`model`) — none of that ever reached the cassette layer to begin with. A
`chatWithTools`-cassette *can* answer all of those, because nothing was
discarded before it was recorded. Tooling that consumes cassettes (grading,
diffing, cost analysis) must not assume `chat` and `chatWithTools` cassettes
carry the same shape of information — they don't, and the gap is not a bug
in the cassette module; it is inherited unchanged from the seam it wraps.

## 3. Requested model, never the served model

Every `CassetteExchange.provenance.model` (`src/core/cassette/types.ts`) is
the **requested** model — the `model` string from the `EndpointConfig` the
caller configured (`endpoint.model`, threaded through record-mode's
`provenance` construction at `src/core/cassette/client.ts` around L131-134).
It is never the model the server actually served, because — per §2 above —
the served `model` field is one of the fields `chat()` discards before
cassette code sees the response at all, and `chatWithTools()`, while it
retains the full payload, is never inspected by the cassette layer for
provenance purposes either; `provenance.model` always comes from the
request side, not the response, for both exchange kinds. If an endpoint
silently substitutes a different model than requested (a common proxy/router
behavior), a cassette recorded against it will not reveal that — it records
what was *asked for*, not what *answered*.

## 4. On-disk format, as implemented

### 4.1 Layout

One directory per suite run. Inside it:

- One file per case, named `<case-id-with-unsafe-chars-replaced-by-_>.json`
  (`caseFileName`, `src/core/cassette/store.ts`) — the case's
  `CassetteCaseFile`: `{ schemaVersion, caseId, exchanges: CassetteExchange[] }`.
- One suite index/provenance file, always named exactly `_suite-index.json`
  — the `SUITE_INDEX_FILENAME` constant in `src/core/cassette/store.ts`. Its
  shape is `CassetteSuiteIndex`: `{ schemaVersion, suiteId, cases: { id,
  runs }[], recordedAt }`. `suiteId` is the manifest's resolved absolute
  path at record time — informational provenance only, never itself
  compared for byte-stability. `cases[].runs` is the authoritative per-case
  declared run count a replay reads to resolve `n` in k-of-n (`behave run`,
  `src/cli/index.ts`) — never inferred by counting recorded exchanges.

Re-recording into a directory that already holds unrelated files does not
clear it first: `writeCassetteCase`/`writeCassetteSuiteIndex` only ever
create the directory (if absent) and overwrite the one file each call is
asked to write; nothing else in that directory is enumerated or deleted.

### 4.2 Serialization

Both case files and the suite index are serialized with `canonicalJson`
(`src/core/canonical-json.ts`), the same RFC 8785 JSON Canonicalization
Scheme implementation used elsewhere in muster (C-003: no second
canonicalization implementation exists in the cassette module). This is what
makes two recordings of the same suite byte-identical modulo the one field
excluded below — key ordering, number formatting, and escaping are all
normalized the same way on every write.

Every persisted file carries a `schemaVersion` field, currently `"1"`
(`SCHEMA_VERSION`, `src/core/cassette/types.ts`) — bump target for any future
incompatible change to `CassetteCaseFile`'s or `CassetteSuiteIndex`'s shape.

### 4.3 Request-hash + ordinal keying

Each exchange is keyed for replay lookup by two fields, both computed by the
decorator, never by the store:

- **`requestHash`**: the hex SHA-256 of `canonicalJson(request)`
  (`computeRequestHash`, `src/core/cassette/hash.ts`), computed over the
  *fully-built* request — i.e. exactly the messages/opts (or
  messages/tools) that `chat`/`chatWithTools` actually receives, which is
  **after** any upstream blinding/arm-ordering transform a caller applies
  (e.g. `blindArmOrder`) — never over a pre-transform logical identity. The
  hash function itself has no notion of blinding; it just hashes whatever it
  is given.
- **`ordinal`**: a 1-based counter, per `requestHash`, that resets for every
  fresh `makeCassetteClient` call (`nextOrdinal` + the `Map<string, number>`
  counter in `src/core/cassette/client.ts`) — which is to say, per case file,
  since `behave run` constructs a new decorator instance per case. This is
  how a k-of-n case with `n` identical-key requests records and replays `n`
  distinct responses in recorded order, each exactly once, rather than
  collapsing to one.

`chat` and `chatWithTools` exchanges share one ordinal counter per decorator
instance but never collide on lookup in practice: `CassetteChatRequest`'s
second key is `opts`, `CassetteToolRequest`'s is `tools`, so their canonical
JSON forms differ by construction, and replay lookup additionally filters on
`kind` (`findChatExchange`/`findToolExchange`, `src/core/cassette/client.ts`).

### 4.4 Provenance is hostname-only

`CassetteProvenance` (`src/core/cassette/types.ts`) is deliberately minimal:
`{ model, hostname }`. `hostname` is extracted via the shared `hostnameOf`
helper (`src/core/behavioral/client.ts`, exported per C-004 specifically so
the cassette module reuses it rather than adding a parallel implementation)
— never the full base URL, never any credential material, never
`apiKeyEnv`'s value. A credential-shaped base URL (e.g. one with an embedded
token) is reduced to just its host before it is ever written to disk.

### 4.5 `durationMs` is opt-in and excluded from byte-stability

Every `CassetteExchange` carries an optional `durationMs`, present whenever
record mode measured a real wall-clock duration for that call (`src/core/
cassette/client.ts`'s record-mode `chat`/`chatWithTools`, which bracket the
inner call with `Date.now()`). This field is deliberately excluded from
NFR-001's byte-stability comparison: it is real, non-deterministic timing,
not part of the deterministic replay contract, so two recordings — or two
replays — of the same suite are not expected to agree on it, and `behave
run --replay`'s JSON/human output normalizes every `transcript.durationMs`
to `0` in a copy before emitting (`normalizeDurationsForReplay`, `src/cli/
index.ts`) specifically so replay output stays byte-identical across runs
despite real per-invocation timing jitter.

## 5. The three modes, as wired into `behave run`

`makeCassetteClient(inner, opts)` (`src/core/cassette/client.ts`) supports
exactly three modes, selected by `opts.mode`:

- **`"live"`**: fully inert pass-through — calls `inner.chat`/
  `inner.chatWithTools` directly, records nothing, reads nothing. This is
  what every case gets when `--cassette` is not supplied at all.
- **`"record"`**: pass-through + append. Each call still hits the live
  endpoint through `inner`; the decorator additionally pushes a
  `CassetteExchange` (keyed as in §4.3, stamped with provenance as in §4.4)
  onto the caller-supplied `recordSink` array. The caller — `behave run` —
  writes that array to disk as a `CassetteCaseFile` once the case's runs
  finish, then writes the suite index once every case is done.
- **`"replay"`**: never touches the network. A lookup miss — no exchange
  matching `(kind, requestHash, ordinal)` in the loaded case file — throws
  `CassetteMissError` (`src/core/cassette/errors.ts`) rather than falling
  back to a live call. `behave run`'s per-run catch block treats that
  specific error as staleness (FR-013): the affected run (and its case) is
  labeled `stale: true` in the verdict (`src/core/behavioral/{runner,
  types}.ts`) rather than a generic conformance failure, and the suite keeps
  going — a stale miss never aborts the run, but it also never counts as a
  pass, and the CLI's overall exit code is never 0 and never a skip code
  when any run is stale.

CLI usage (`muster behave run <manifest> --cassette <dir> --record` /
`--replay`, `src/cli/index.ts`'s `behave run` command definition):

```bash
# Record a live run into a cassette directory
muster behave run manifest.json --cassette ./cassettes/my-suite --record

# Later, replay it — zero network I/O, deterministic output
muster behave run manifest.json --cassette ./cassettes/my-suite --replay
```

`--cassette` requires exactly one of `--record`/`--replay`; supplying
`--cassette` with neither, or supplying both flags together, is a CLI usage
error raised before the manifest is even loaded (FR-016). In replay mode,
`--runs` is validated against the cassette's own recorded per-case count
before any case executes: a conflicting explicit `--runs` fails fast, naming
both the requested and recorded counts (FR-014/015), rather than silently
picking one.

## 6. Public surface

Everything above is consumed through `src/core/cassette/index.ts`, the
module's public barrel:

```ts
import {
  makeCassetteClient,
  writeCassetteCase,
  readCassetteCase,
  writeCassetteSuiteIndex,
  readCassetteSuiteIndex,
  computeRequestHash,
  CassetteMissError,
  SCHEMA_VERSION,
  type CassetteExchange,
  type CassetteCaseFile,
  type CassetteSuiteIndex,
  type CassetteProvenance,
} from "../../src/core/cassette/index.js";
```

`src/core/cassette/` imports nothing from `src/adapters/` (C-001/NI-002) —
it is spec-agnostic core, safe for any wave-2 adapter to depend on without
pulling in adapter-specific assumptions.

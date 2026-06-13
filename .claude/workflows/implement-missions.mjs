export const meta = {
  name: 'implement-missions',
  description: 'Implement v1.0.0 adapter missions in parallel with model-tiered agents (haiku=read, sonnet=implement, opus=review), respecting the dependency DAG and git serialization points.',
  whenToUse: 'Drive spec-kitty implement→review→merge for several independent adapter missions concurrently.',
  phases: [
    { title: 'Wave 0 — core primitives', detail: 'add shared src/core primitives (pass^k) once, so adapters do not collide' },
    { title: 'Wave 1 — independent adapters', detail: 'skills, SOP, tools, memory, heartbeat in parallel' },
    { title: 'Wave 2 — cross-layer', detail: 'after skills + SOP are merged' },
    { title: 'Accept — review + smoke', detail: 'per mission: spec-kitty mission review + a real end-to-end run against OpenAI' },
  ],
}

// ── Dependency DAG ──────────────────────────────────────────────────────────
// Each adapter owns a disjoint src/adapters/<x>/ dir → wave 1 is fully parallel.
// cross-layer imports skills+SOP code → wave 2.
const WAVE1 = [
  'skills-adapter-01KTYKNX',
  'openclaw-sop-adapter-01KTYKNZ',
  'tools-adapter-01KTYMCB',
  'memory-adapter-01KTYMCD',
  'heartbeat-adapter-01KTYMCG',
]
const WAVE2 = ['cross-layer-conformance-01KTYKP2']

// ── Concurrency cap (RAM throttle) ──────────────────────────────────────────
// Each implement agent runs pnpm build+test in a worktree (memory-heavy), so we
// bound how many run at once rather than fanning out all 5 missions / 4 lanes.
const MAX_PARALLEL_MISSIONS = 2 // missions implemented concurrently per wave
const MAX_PARALLEL_LANES = 2 // lanes implemented concurrently within a mission

// Run thunks in fixed-size batches (a barrier between batches caps peak load).
async function inBatches(items, size, makeThunk) {
  const out = []
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size).map(makeThunk)
    out.push(...(await parallel(batch)))
  }
  return out
}

const VERDICT = {
  type: 'object',
  required: ['approved', 'summary'],
  properties: {
    approved: { type: 'boolean' },
    summary: { type: 'string' },
    feedback: { type: 'string', description: 'concrete change requests when approved=false' },
  },
}

// ── The atom: implement one WP with model-tiered context→implement→review ────
// All spec-kitty CLI + git happens INSIDE agents (the workflow body cannot run
// shell). Claims/commits/move-task are driven by the sonnet agent per the
// spec-kitty-implement-review contract; reviews by opus.
async function implementWP(slug, wp) {
  // 1) haiku — cheap context gather: read the WP prompt + the spec/plan sections
  //    it cites, emit a tight brief the implementer consumes.
  const brief = await agent(
    `Read kitty-specs/${slug}/tasks/${wp}-*.md (the WP prompt), plus the spec.md, plan.md and
     data-model.md sections it references in the muster repo (your cwd / git repo root).
     Emit a <=40-line implementation brief: the files to create (from owned_files), the key
     behaviours/FRs, the charter constraints that bite (byte-stable static path, pass^k where
     safety-critical, cite-a-source, discrimination controls, >=80% new-code coverage), and the
     Definition of Done. Do NOT write code. Return only the brief.`,
    { agentType: 'wp-reader', phase: `ctx:${slug}`, label: `ctx ${wp}` },
  )

  // 2) sonnet — implement, build+test, commit, move to for_review. Loop on reject.
  let feedback = null
  for (let cycle = 1; cycle <= 3; cycle++) {
    await agent(
      `You implement ${wp} for spec-kitty mission ${slug} in the muster repo (your cwd / git repo root).
       ${cycle > 1 ? `This is fix cycle ${cycle}/3. Address this review feedback first:\n${feedback}\n` : ''}
       Steps (follow the spec-kitty-implement-review contract exactly):
       1. Claim: spec-kitty agent action implement ${wp} --mission ${slug} --agent claude:sonnet:implementer:implementer
          — cd into the printed lane worktree; ALL edits + commits happen there.
       2. Read the full WP prompt (the printed cat path) and this brief:\n${brief}
       3. Implement every subtask: create exactly the files in owned_files, write the tests, and
          satisfy the charter constraints. Reuse the v1 SpecAdapter core; do not modify src/core/
          unless the WP says so. Static path must stay byte-stable; safety-critical graders use
          pass^k; every grader ships a discrimination control.
       4. pnpm build && pnpm test must be green; new-code coverage >=80% (pnpm test:coverage).
       5. Commit per subtask. Then: spec-kitty agent tasks mark-status <Txxx...> --status done --mission ${slug}
          and spec-kitty agent tasks move-task ${wp} --to for_review --mission ${slug} --note "<summary>".
       Return a concise report: files created, test counts, any deviations.`,
      { agentType: 'adapter-implementer', phase: `impl:${slug}`, label: `impl ${wp} c${cycle}` },
    )

    const verdict = await agent(
      `You REVIEW ${wp} for mission ${slug} (claude:opus:reviewer:reviewer) in
       the muster repo (your cwd / git repo root).
       1. spec-kitty agent action review ${wp} --mission ${slug} --agent claude:opus:reviewer:reviewer
          — cd into the lane worktree; read the printed review prompt.
       2. Verify against the WP's Definition of Done AND the charter: behaviour matches the spec FRs,
          static output byte-stable, pass^k where required, discrimination control fails as designed,
          every check cites a source, >=80% new-code coverage, only owned_files touched, no weakened
          tests. Run pnpm build && pnpm test yourself.
       3. If ALL criteria met: spec-kitty agent tasks move-task ${wp} --to approved --mission ${slug}
          --note "<summary>" and return approved=true.
          Else: write numbered feedback to a temp file, run
          spec-kitty agent tasks move-task ${wp} --to planned --force --review-feedback-file <path>
          --mission ${slug}, and return approved=false with the feedback text.`,
      { agentType: 'adapter-reviewer', phase: `review:${slug}`, label: `review ${wp} c${cycle}`, schema: VERDICT },
    )

    if (verdict?.approved) return { wp, approved: true, cycles: cycle }
    feedback = verdict?.feedback ?? 'see review notes'
    log(`${slug}/${wp} rejected (cycle ${cycle}/3): ${verdict?.summary ?? ''}`)
  }
  // 3-reject → opus arbiter
  const arb = await agent(
    `Arbiter for ${wp} (${slug}) after 3 review cycles. Read the latest diff in the lane worktree and the
     WP Definition of Done. If acceptance criteria are objectively met, approve:
     spec-kitty agent tasks move-task ${wp} --to approved --force --mission ${slug} --note "Arbiter: <why>".
     If a real blocker remains, escalate: move-task ${wp} --to blocked --force --note "<conflict>".
     Return approved=true/false with a one-line rationale.`,
    { agentType: 'adapter-reviewer', phase: `review:${slug}`, label: `arbiter ${wp}`, schema: VERDICT },
  )
  return { wp, approved: !!arb?.approved, cycles: 3, arbiter: true }
}

// ── Per-mission acceptance gate: spec-kitty mission review + a real run ──────
// Runs only after all of a mission's WPs are approved. Two independent checks:
//   1) opus mission review — post-implementation audit of spec→code fidelity.
//   2) smoke — BUILD the CLI and actually RUN muster: validate a real fixture on
//      the static path, AND execute a behavioral case against OpenAI using the
//      key from .env (MUSTER_API_KEY) so we prove the code runs end-to-end, not
//      just that unit tests pass.
const ACCEPT = {
  type: 'object',
  required: ['reviewPass', 'smokePass', 'summary'],
  properties: {
    reviewPass: { type: 'boolean' },
    smokePass: { type: 'boolean' },
    summary: { type: 'string' },
  },
}
async function acceptMission(slug) {
  const review = await agent(
    `Post-implementation MISSION REVIEW for ${slug} in the muster repo (your cwd / git repo root)
     (claude:opus:reviewer). Follow the spec-kitty-mission-review method: read spec.md, plan.md,
     tasks.md and the mission's merged/lane diff; produce an FR coverage trace, drift/risk/security
     findings, and a PASS / PASS-WITH-NOTES / FAIL verdict. Write the report to
     kitty-specs/${slug}/mission-review.md. Return reviewPass=true unless a CRITICAL/HIGH blocking
     finding exists.`,
    { agentType: 'adapter-reviewer', phase: 'Accept — review + smoke', label: `review ${slug}`, schema: { type: 'object', required: ['reviewPass', 'notes'], properties: { reviewPass: { type: 'boolean' }, notes: { type: 'string' } } } },
  )

  const smoke = await agent(
    `SMOKE-RUN muster for mission ${slug} — prove the code actually RUNS, not just that tests pass.
     The mission's code is on its lane branch, so work in the LANE WORKTREE, not main:
       WT=$(git worktree list | grep ${slug} | awk '{print $1}' | head -1)
       cd "$WT"   # (if empty, the code is already on main — use the main checkout instead)
     The .env is gitignored and exists ONLY in the main checkout, so always load it by ABSOLUTE path:
       ENV=$(git worktree list | awk 'NR==1{print $1}')/.env
     Read kitty-specs/${slug}/quickstart.md (in the worktree) for exact invocations. Then:
     1. pnpm install --frozen-lockfile && pnpm build.
     2. STATIC — run the CLI on a REAL fixture end-to-end and confirm a sensible report: the v1 example
        "node dist/cli/index.js check souls/voice-frontdesk/Soul.md" (proves the static spine), PLUS this
        mission's own static command from quickstart.md on its fixture.
     3. BEHAVIORAL against OpenAI — run this mission's behavioral suite from quickstart.md AND the v1
        behavioral example, loading creds via Node 22 --env-file by absolute path, e.g.:
        "node --env-file=$ENV dist/cli/index.js behave run behave/voice-frontdesk.yaml --base-url https://api.openai.com/v1 --model gpt-4o-mini"
        (key var MUSTER_API_KEY, fallback OPENAI_API_KEY). Confirm it REACHES OpenAI, grades transcripts,
        and emits a real k-of-n / pass^k verdict (an actual PASS or FAIL — not a crash/auth error).
        If $ENV is missing or keyless, report smokePass=false "no OpenAI key" (never fabricate a key).
     Return smokePass=true only if BOTH a static fixture run AND an OpenAI behavioral run executed and
     produced real verdicts. Put the exact commands + key output lines in detail.`,
    { agentType: 'smoke-runner', phase: 'Accept — review + smoke', label: `smoke ${slug}`, schema: { type: 'object', required: ['smokePass', 'detail'], properties: { smokePass: { type: 'boolean' }, detail: { type: 'string' } } } },
  )

  const ok = !!review?.reviewPass && !!smoke?.smokePass
  log(`${slug} accept: review=${review?.reviewPass} smoke=${smoke?.smokePass}`)
  return { reviewPass: !!review?.reviewPass, smokePass: !!smoke?.smokePass, summary: `${review?.notes ?? ''} | ${smoke?.detail ?? ''}` }
}

// ── Drive one mission: WPs in lane/dependency order ─────────────────────────
// Reads the mission's WP ids + dependency order, then runs each WP's loop.
// Within a mission, WPs run in topological order (cross-layer has 4 parallel
// lanes; the others are single sequential lanes).
async function runMission(slug) {
  const planned = await agent(
    `In the muster repo (your cwd / git repo root) read kitty-specs/${slug}/lanes.json, the WP
     frontmatter under kitty-specs/${slug}/tasks/, and kitty-specs/${slug}/status.events.jsonl
     (the last event per wp_id gives its current lane). Return JSON {lanes:[[wpId,...], ...]} where
     each inner array is a lane's WPs in dependency order — but EXCLUDE any WP whose latest lane is
     'approved' or 'done' (only include WPs still planned/in_progress/for_review that need work).
     Omit a lane entirely if all its WPs are done. This makes the run resumable without redoing
     finished work. Return ONLY JSON.`,
    { agentType: 'wp-reader', phase: 'plan', label: `lanes ${slug}`,
      schema: { type: 'object', required: ['lanes'], properties: { lanes: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } } },
  )
  const lanes = (planned?.lanes ?? []).filter((l) => l.length > 0)
  // Lanes run concurrently but throttled (MAX_PARALLEL_LANES); WPs within a lane
  // run sequentially (deps). Caps peak builds for multi-lane missions (cross-layer).
  const laneResults = await inBatches(lanes, MAX_PARALLEL_LANES, (laneWps) => async () => {
    const out = []
    for (const wp of laneWps) out.push(await implementWP(slug, wp))
    return out
  })
  const wps = laneResults.filter(Boolean).flat()
  const allApproved = wps.length > 0 && wps.every((w) => w.approved)
  log(`${slug}: ${wps.filter((w) => w.approved).length}/${wps.length} WPs approved`)
  if (!allApproved) return { slug, ok: false, wps, accept: null }

  // Mission's WPs are all approved → run the acceptance gate (review + real run).
  const accept = await acceptMission(slug)
  const ok = accept.reviewPass && accept.smokePass
  return { slug, ok, wps, accept }
}

// ── Orchestration ───────────────────────────────────────────────────────────
// Pilot mode: args = { pilot: '<mission-slug>' } runs ONE mission end-to-end
// (per-WP haiku/sonnet/opus loop + accept gate) to validate the design before
// the full parallel fan-out. Skips wave-0/gating.
if (args?.pilot) {
  phase(`Pilot — ${args.pilot}`)
  const result = await runMission(args.pilot)
  log(`Pilot ${args.pilot}: ok=${result.ok} (review=${result.accept?.reviewPass}, smoke=${result.accept?.smokePass})`)
  return { pilot: result }
}

phase('Wave 0 — core primitives')
// One sequential step so wave-1 adapters do not collide on src/core. Only acts
// if a shared primitive (pass^k aggregation) is missing.
await agent(
  `In the muster repo (your cwd / git repo root), check whether src/core/behavioral exposes a reusable
   pass^k aggregation primitive (conjunctive over k runs, errored run = failed). If it already exists,
   do nothing and report "present". If not, add ONE small, well-tested primitive to src/core/behavioral
   (cite the charter two-tier grading rule), pnpm build && pnpm test green, and open a PR to main
   (branch: core/passk-primitive) — this must merge before wave 1 starts. Report the PR url or "present".`,
  { model: 'sonnet', phase: 'Wave 0 — core primitives', label: 'core: pass^k' },
)

phase('Wave 1 — independent adapters')
// Throttled: at most MAX_PARALLEL_MISSIONS implement concurrently (RAM cap).
const wave1 = await inBatches(WAVE1, MAX_PARALLEL_MISSIONS, (slug) => () => runMission(slug))
const wave1ok = wave1.filter(Boolean)
log(`Wave 1 complete: ${wave1ok.filter((m) => m.ok).length}/${WAVE1.length} missions all-approved`)

// Gate wave 2 on skills + SOP being all-approved (cross-layer reuses their code).
const skills = wave1ok.find((m) => m.slug === WAVE1[0])
const sop = wave1ok.find((m) => m.slug === WAVE1[1])
if (!(skills?.ok && sop?.ok)) {
  log('Wave 2 skipped: skills and/or SOP did not fully approve — cross-layer depends on them.')
  return { wave1: wave1ok, wave2: null, note: 'cross-layer blocked on skills+SOP' }
}

phase('Wave 2 — cross-layer')
const wave2 = await parallel(WAVE2.map((slug) => () => runMission(slug)))

// NOTE: this workflow leaves every mission at "all WPs approved". Merging to main
// is left to a sequential human/CLI step (branch protection = PR per mission,
// merges serialized, cross-layer last) — intentionally NOT automated here.
return { wave1: wave1ok, wave2: wave2.filter(Boolean) }

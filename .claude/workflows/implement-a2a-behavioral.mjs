export const meta = {
  name: 'implement-a2a-behavioral',
  description: 'Implement the A2A behavioral conformance mission (single lane, 4 WPs) with model-tiered agents (haiku=read, sonnet=implement, opus=review), then an A2A-aware acceptance gate.',
  whenToUse: 'Drive spec-kitty implement→review for mission a2a-behavioral-conformance-01KVJDWE end to end.',
  phases: [
    { title: 'Implement', detail: 'WP01→WP02→WP03→WP04 sequentially in one lane worktree (import deps)' },
    { title: 'Accept — review + smoke', detail: 'opus mission review + a real muster run (static + new path skip + v1 OpenAI behavioral)' },
  ],
}

// Single mission, single sequential lane. WP03 imports WP01/WP02 symbols and
// WP04 imports WP02/WP03, so the four WPs MUST share one worktree and run in
// dependency order — lanes.json was serialized to one lane for exactly this.
const SLUG = 'a2a-behavioral-conformance-01KVJDWE'
const WP_ORDER = ['WP01', 'WP02', 'WP03', 'WP04']

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
// shell). The sonnet implementer claims the WP (cd into the lane worktree),
// implements, builds+tests, commits, and moves to for_review; opus reviews.
async function implementWP(slug, wp, priorContext) {
  const brief = await agent(
    `Read kitty-specs/${slug}/tasks/${wp}-*.md (the WP prompt), plus the spec.md, plan.md,
     data-model.md and contracts/ sections it references in the muster repo (your cwd / git repo root).
     Emit a <=40-line implementation brief: the files to create/extend (from owned_files), the key
     behaviours/FRs, the charter constraints that bite (C-004 core→adapter boundary, NI-003 single
     fetch site in transport.ts, byte-stable static path, no literal token in manifests, determinism,
     cite-a-source), and the Definition of Done. Do NOT write code. Return only the brief.`,
    { agentType: 'wp-reader', phase: 'Implement', label: `ctx ${wp}` },
  )

  let feedback = null
  for (let cycle = 1; cycle <= 3; cycle++) {
    await agent(
      `You implement ${wp} for spec-kitty mission ${slug} in the muster repo (your cwd / git repo root).
       ${cycle > 1 ? `This is fix cycle ${cycle}/3. Address this review feedback first:\n${feedback}\n` : ''}
       ${priorContext ? `Earlier WPs in THIS lane are already committed in the SAME worktree; build on them:\n${priorContext}\n` : ''}
       Steps (follow the spec-kitty-implement-review contract exactly):
       1. Claim: spec-kitty agent action implement ${wp} --mission ${slug} --agent claude:sonnet:implementer:implementer
          — cd into the printed lane worktree (lane-a; the SAME worktree all 4 WPs share). ALL edits + commits happen there.
       2. Read the full WP prompt (the printed path) and this brief:\n${brief}
       3. Implement every subtask: create/extend exactly the files in owned_files; write the tests + fixtures.
          REUSE core (src/core/behavioral graders + pass-k + manifest validators) by import — do NOT edit src/core.
          Honour the contracts in kitty-specs/${slug}/contracts/. Keep the existing A2A static/skill/auth/signed
          paths and invokeSkill byte-stable (additive only). C-004: never make core import the adapter.
          NI-003: no new fetch outside src/adapters/a2a/transport.ts. Never store/log the token.
       4. pnpm build && pnpm test must be GREEN before you hand off. Add tests; do not weaken existing ones.
       5. Commit per subtask. Then: spec-kitty agent tasks mark-status <Txxx...> --status done --mission ${slug}
          and spec-kitty agent tasks move-task ${wp} --to for_review --mission ${slug} --note "<summary>".
       Return a concise report: files created/extended, exported symbols later WPs will import, test counts, deviations.`,
      { agentType: 'adapter-implementer', phase: 'Implement', label: `impl ${wp} c${cycle}` },
    )

    const verdict = await agent(
      `You REVIEW ${wp} for mission ${slug} (claude:opus:reviewer:reviewer) in the muster repo
       (your cwd / git repo root).
       1. spec-kitty agent action review ${wp} --mission ${slug} --agent claude:opus:reviewer:reviewer
          — cd into the lane worktree; read the printed review prompt.
       2. Verify against the WP's Definition of Done AND the contracts/charter: behaviour matches the FRs;
          C-004 boundary holds (grep: no src/core import of adapters; tests/unit/invariants.test.ts green);
          NI-003 (no new fetch site); static/skill/auth/signed paths + invokeSkill unchanged; manifests carry
          env-var NAMES only (no literal token); determinism for fixed transcripts; only owned_files touched;
          no weakened tests. Run pnpm build && pnpm test yourself.
       3. If ALL criteria met: spec-kitty agent tasks move-task ${wp} --to approved --mission ${slug}
          --note "<summary>" and return approved=true.
          Else: write numbered feedback to a temp file, run
          spec-kitty agent tasks move-task ${wp} --to planned --force --review-feedback-file <path>
          --mission ${slug}, and return approved=false with the feedback text.`,
      { agentType: 'adapter-reviewer', phase: 'Implement', label: `review ${wp} c${cycle}`, schema: VERDICT },
    )

    if (verdict?.approved) return { wp, approved: true, cycles: cycle, summary: verdict.summary }
    feedback = verdict?.feedback ?? 'see review notes'
    log(`${slug}/${wp} rejected (cycle ${cycle}/3): ${verdict?.summary ?? ''}`)
  }

  const arb = await agent(
    `Arbiter for ${wp} (${slug}) after 3 review cycles. Read the latest diff in the lane worktree and the
     WP Definition of Done. If acceptance criteria are objectively met, approve:
     spec-kitty agent tasks move-task ${wp} --to approved --force --mission ${slug} --note "Arbiter: <why>".
     If a real blocker remains, escalate: move-task ${wp} --to blocked --force --note "<conflict>".
     Return approved=true/false with a one-line rationale.`,
    { agentType: 'adapter-reviewer', phase: 'Implement', label: `arbiter ${wp}`, schema: VERDICT },
  )
  return { wp, approved: !!arb?.approved, cycles: 3, arbiter: true, summary: arb?.summary }
}

// ── Acceptance gate (A2A-aware) ─────────────────────────────────────────────
async function acceptMission(slug) {
  const review = await agent(
    `Post-implementation MISSION REVIEW for ${slug} in the muster repo (your cwd / git repo root)
     (claude:opus:reviewer). Follow the spec-kitty-mission-review method: read spec.md, plan.md,
     tasks.md, contracts/ and the lane diff; produce an FR coverage trace (FR-001..013), drift/risk/
     security findings, and a PASS / PASS-WITH-NOTES / FAIL verdict. Confirm the C-004 boundary, the
     additive (no-regression) static path, the black-box state decision, and the env-name-only token
     rule actually hold in code. Write the report to kitty-specs/${slug}/mission-review.md.
     Return reviewPass=true unless a CRITICAL/HIGH blocking finding exists.`,
    { agentType: 'adapter-reviewer', phase: 'Accept — review + smoke', label: `review ${slug}`,
      schema: { type: 'object', required: ['reviewPass', 'notes'], properties: { reviewPass: { type: 'boolean' }, notes: { type: 'string' } } } },
  )

  const smoke = await agent(
    `SMOKE-RUN muster for mission ${slug} — prove the code actually RUNS, not just that tests pass.
     The code is on the lane-a branch, so work in the LANE WORKTREE, not main:
       WT=$(git worktree list | grep ${slug} | awk '{print $1}' | head -1); cd "$WT"
       (if empty, the code is already on the mission branch — use that checkout)
     The .env is gitignored and lives ONLY in the main checkout — load it by ABSOLUTE path:
       ENV=$(git worktree list | awk 'NR==1{print $1}')/.env
     Read kitty-specs/${slug}/quickstart.md for exact invocations. Then:
     1. pnpm install --frozen-lockfile && pnpm build.
     2. STATIC spine: node dist/cli/index.js check souls/voice-frontdesk/Soul.md  (proves the static path).
     3. NEW PATH loads+skips OFFLINE (expected — no running agent endpoint exists in CI):
        node dist/cli/index.js a2a run examples/a2a/behavioral-explicit.yaml
        node dist/cli/index.js a2a run examples/a2a/behavioral-persona.yaml
        With MUSTER_A2A_ENDPOINT UNSET these MUST exit 0 with cases reported SKIPPED (FR-009) — that is
        the correct behavior, NOT a failure. Do NOT stand up or fabricate an A2A endpoint.
     4. REAL model run (proves muster reaches a model end-to-end) — the v1 behavioral example against OpenAI,
        creds via Node 22 --env-file by absolute path:
        node --env-file=$ENV dist/cli/index.js behave run behave/voice-frontdesk.yaml --base-url https://api.openai.com/v1 --model gpt-4o-mini
        (key var MUSTER_API_KEY, fallback OPENAI_API_KEY). Confirm it reaches OpenAI and emits a real
        k-of-n verdict. If $ENV is missing/keyless, report that part as not-run "no OpenAI key" (never fabricate a key).
     5. Regression: node dist/cli/index.js a2a run examples/a2a/manifest.json  behaves as before.
     Return smokePass=true if the static spine ran, BOTH new-path examples loaded+skipped cleanly (exit 0),
     and the existing a2a static manifest still works. Put the exact commands + key output lines in detail.`,
    { agentType: 'smoke-runner', phase: 'Accept — review + smoke', label: `smoke ${slug}`,
      schema: { type: 'object', required: ['smokePass', 'detail'], properties: { smokePass: { type: 'boolean' }, detail: { type: 'string' } } } },
  )

  log(`${slug} accept: review=${review?.reviewPass} smoke=${smoke?.smokePass}`)
  return { reviewPass: !!review?.reviewPass, smokePass: !!smoke?.smokePass, summary: `${review?.notes ?? ''} | ${smoke?.detail ?? ''}` }
}

// ── Drive the mission: WPs sequentially in one lane ─────────────────────────
phase('Implement')
const results = []
let priorContext = null
for (const wp of WP_ORDER) {
  const r = await implementWP(SLUG, wp, priorContext)
  results.push(r)
  if (!r.approved) {
    log(`${SLUG}: ${wp} did NOT approve — stopping the lane (later WPs import its symbols).`)
    return { ok: false, results, accept: null, stoppedAt: wp }
  }
  priorContext = `${priorContext ?? ''}\n- ${wp} approved: ${r.summary ?? ''}`.trim()
}

log(`${SLUG}: all ${results.length} WPs approved — running acceptance gate.`)
phase('Accept — review + smoke')
const accept = await acceptMission(SLUG)

// NOTE: leaves the mission at all-WPs-approved with the acceptance report. Merging
// lane-a → the mission branch and opening the PR to main is the deliberate
// human/CLI follow-up (branch protection: build+test + SonarCloud must pass).
return { ok: accept.reviewPass && accept.smokePass, results, accept }

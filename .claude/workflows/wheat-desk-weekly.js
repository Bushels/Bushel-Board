export const meta = {
  name: 'wheat-desk-weekly',
  description: 'Ultracode Friday wheat desk: US then CAD swarm with adversarial verification, one Wheat row per desk',
  whenToUse: 'The Friday wheat baseline runs (US 6:47pm MT first, CAD 7:45pm MT with cross-read) or Kyle-directed catch-ups. args: {side:"us"|"cad"|"both", write:true|false}. WHEAT ONLY.',
  phases: [
    { title: 'Preflight', detail: 'model-gate note + desk CLI preflight per side, one-shot price self-heal' },
    { title: 'US Scouts', detail: '8 wheat-scoped scouts, schema-forced structured outputs' },
    { title: 'US Verify', detail: 'adversarial re-derivation of scout numeric claims' },
    { title: 'US Specialists', detail: '3 stance + risk moderator + planted-area overlay' },
    { title: 'US Chief', detail: 'resolution, meta-review, one-row envelope, gated write', model: 'opus/fable-class' },
    { title: 'CAD Scouts', detail: '6 wheat-scoped scouts, schema-forced structured outputs' },
    { title: 'CAD Verify', detail: 'adversarial re-derivation of scout numeric claims' },
    { title: 'CAD Specialists', detail: '4 specialists, Wave A wheat-only' },
    { title: 'CAD Chief', detail: 'FLAGSHIP resolution with US cross-read, gated write', model: 'opus/fable-class' },
    { title: 'Postcheck', detail: 'desk freshness verdict + thesis cache refresh' },
  ],
}

// ------------------------------------------------------------------
// WHEAT ONLY (Kyle directive, memory feedback_wheat_only). One grain,
// one market, EXACTLY ONE row per desk. Every cross-market row (corn
// tape, soy/corn ratio, the three wheat class legs ZW/KE/MW, the three
// COT classes) is Wheat CONTEXT, never a separate subject.
// Data plane: headless desk CLI only. Supabase MCP returns -32600.
// No Grok / xAI anywhere. Writes gated by DESK_WRITE_APPROVAL.
// ------------------------------------------------------------------
const side = (args && args.side) || 'both'
const doWrite = !args || args.write !== false
const REPO = 'C:/Users/kyle/Agriculture/bushel-board-app'

const CLI_NOTE = (cli) => `All DB access goes through the desk CLI via the Bash tool, run from ${REPO} (Supabase MCP returns -32600 in this runner — never call it):
- RPC read:   npm run ${cli} -- read --rpc <fn> --args '{"p_grain":"Wheat",...}'
- Table read: npm run ${cli} -- read --table <name> [--select cols] [--eq col=val] [--gte col=val] [--order col.desc] [--limit N]
- Knowledge:  npm run ${cli} -- knowledge --query "<1-3 keywords>" --grain Wheat --limit 3
WHEAT ONLY: analyze Wheat exclusively. Your final message is consumed by an orchestrator, not a human — return ONLY the structured output, no prose padding.`

const TRAPS = `Verified data traps (baked into the agent defs 2026-07-12 — check every run):
- grain_prices.change_pct is a 1-DAY change, NOT weekly. Recompute true 1W/4W from raw settlement_price rows yourself.
- Frozen feeds repeat identical settlement_price + change_pct across dates. MGEX now uses Barchart MW*0 and stores the resolved active contract (for example MWU26) plus the source session date; still run the repeat-value check before using the MW-KE spread. ICE RSK26 remains unavailable if it repeats the 2026-05-15 snapshot.
- USDA Wheat crop-progress rows are class-safe. Read wheat_class explicitly and keep winter harvest/condition separate from spring condition/heading. Never combine fields across classes into one synthetic observation.
- Thin prints (<500 contracts) with >10% moves are bad ticks (magnitude_unreliable), not rallies (CBOT ZO +23.5% on 248 lots).
- posted_prices may be empty; say so, do not fabricate basis.
- There is NO single WHEAT COT row: three classes (WHEAT-SRW / WHEAT-HRW / WHEAT-HRSpring).
- USDA FAS rolled Wheat export sales to MY 2026-27 in July; no pace benchmark until the new-MY baseline builds.
- source_runs has started_at/finished_at (NO source_date/completed_at). pipeline_runs has NO created_at (order by started_at).`

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    lane: { type: 'string' },
    wheat_findings: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Directional Wheat findings per your agent def output format' },
    data_freshness: { type: 'object', additionalProperties: true, description: 'Per-source dates/weeks and staleness flags' },
    numeric_claims: {
      type: 'array',
      description: 'Your 3-6 MOST load-bearing numbers, each with the exact table/RPC/URL it came from. These get adversarially re-derived — a mislabeled stat (1-day-as-weekly, frozen-as-flat, thin-as-rally) will be refuted.',
      items: { type: 'object', properties: { claim: { type: 'string' }, value: { type: 'string' }, source: { type: 'string' } }, required: ['claim', 'value', 'source'], additionalProperties: true },
    },
    summary: { type: 'string' },
  },
  required: ['lane', 'wheat_findings', 'numeric_claims', 'summary'],
  additionalProperties: true,
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verified: { type: 'array', items: { type: 'string' }, description: 'Claims your independent read confirmed within rounding' },
    refuted: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, correction: { type: 'string' }, evidence: { type: 'string' } }, required: ['claim', 'correction', 'evidence'], additionalProperties: true } },
    unverifiable: { type: 'array', items: { type: 'string' }, description: 'Web/qualitative claims you could not re-derive from a primary read' },
    notes: { type: 'string' },
  },
  required: ['verified', 'refuted', 'unverifiable'],
  additionalProperties: true,
}

const SPECIALIST_SCHEMA = {
  type: 'object',
  properties: {
    market: { type: 'string' },
    stance_score: { type: 'number', description: '-100..+100 directional stance for Wheat' },
    confidence: { type: 'number', description: '0..100' },
    thesis: { type: 'string' },
    recommendation: { type: 'string' },
    rule_citations: { type: 'array', items: { type: 'string' }, description: 'Debate-rule ids applied, >=1 wheat-specific (R-CA-WHT-NN / R-US-WHT-NN)' },
    active_thesis_killers: { type: 'array', items: { type: 'string' } },
    key_evidence: { type: 'array', items: { type: 'string' }, description: 'For the risk MODERATOR: put crowding/policy-cliff/staleness flags + top risks here' },
  },
  required: ['market', 'stance_score', 'confidence', 'thesis', 'recommendation', 'rule_citations', 'active_thesis_killers', 'key_evidence'],
  additionalProperties: true,
}

const CHIEF_SCHEMA = {
  type: 'object',
  properties: {
    stance_score: { type: 'number' },
    confidence_score: { type: 'number' },
    stance_tier: { type: 'string' },
    final_assessment: { type: 'string' },
    envelope_path: { type: 'string' },
    dry_run_ok: { type: 'boolean', description: 'Did the CLI zod validation pass on dry-run?' },
    write_result: { type: 'string', description: 'persisted / dry-run-only / failed:<reason>' },
    divergence_note: { type: 'string', description: 'How specialist divergence was resolved (Rule 20 ledger vs prior anchor)' },
    refutations_honored: { type: 'array', items: { type: 'string' }, description: 'Verifier-refuted claims you removed from the thesis' },
    freshness_warnings: { type: 'array', items: { type: 'string' } },
    run_summary: { type: 'string' },
  },
  required: ['stance_score', 'confidence_score', 'stance_tier', 'final_assessment', 'envelope_path', 'dry_run_ok', 'write_result', 'run_summary'],
  additionalProperties: true,
}

function scoutPrompt(cli, lane, extra) {
  return `You are the ${lane} scout for the Bushel Board WHEAT desk. ${CLI_NOTE(cli)}
${TRAPS}
Task: extract this week's Wheat data for your lane EXACTLY per your agent definition — query every data source it lists, Wheat-scoped. ${extra || ''}
Report data_freshness for every source (specific dates/weeks). Populate numeric_claims with your most load-bearing numbers plus the exact provenance for each. Do not write files; return the structured output.`
}

// Adversarial verification: independently re-derive every scout numeric claim.
// This is the Ultracode value-add — it catches the mislabeled-stat traps
// (1-day-as-weekly, frozen-as-flat, thin-as-rally) that we previously caught
// only by luck in the price-analyst's manual Rule-15 check.
async function verifyScouts(cli, phase, scoutResults) {
  const claims = scoutResults.filter(Boolean).flatMap((s) => (s.numeric_claims || []).map((c) => ({ ...c, lane: s.lane })))
  if (!claims.length) return { verified: [], refuted: [], unverifiable: [], notes: 'no claims emitted' }
  const chunks = []
  for (let i = 0; i < claims.length; i += 8) chunks.push(claims.slice(i, i + 8))
  const verdicts = await parallel(chunks.map((chunk, i) => () =>
    agent(`You are an ADVERSARIAL data verifier for the Bushel Board WHEAT desk. Your job is to REFUTE, not to confirm. ${CLI_NOTE(cli)}
${TRAPS}
For EACH claim below, independently re-derive the number from the primary source named — re-run the CLI read yourself (for a web/qualitative claim you cannot re-derive from a table/RPC, mark it unverifiable rather than re-searching). A claim SURVIVES only if your independent read matches within rounding. If a claim is a MISLABELED statistic (a 1-day change presented as weekly, a frozen feed presented as price action, a thin print presented as a rally, a fabricated basis), REFUTE it with the correction and the evidence.
Claims (JSON): ${JSON.stringify(chunk)}`,
      { label: `verify:${i + 1}/${chunks.length}`, phase, schema: VERDICT_SCHEMA, effort: 'medium' })))
  const merged = { verified: [], refuted: [], unverifiable: [], notes: '' }
  for (const v of verdicts.filter(Boolean)) {
    merged.verified.push(...(v.verified || []))
    merged.refuted.push(...(v.refuted || []))
    merged.unverifiable.push(...(v.unverifiable || []))
  }
  log(`verify(${cli}): ${merged.verified.length} verified, ${merged.refuted.length} REFUTED, ${merged.unverifiable.length} unverifiable`)
  return merged
}

async function preflight(cli, routine) {
  return agent(`Run the Bushel Board desk preflight from ${REPO} via the Bash tool.
1. npm run ${cli} -- preflight
2. On exit 0: return {aborted:false, context:{crop_year, grain_week OR market_year/week_ending}, freshness:{per-source ages}}.
3. If it fails with breached_slas EXACTLY ["price"]: run npm run collect:prices, then re-run preflight ONCE. If the retry passes, continue and set self_heal_used:true.
4. Any other failure: return {aborted:true, reason, breached_slas}. The CLI already wrote the pipeline_runs failure row — do NOT write another and do NOT proceed.
WHEAT ONLY desk. Routine context: ${routine}.`,
    { label: `preflight:${cli}`, phase: 'Preflight', effort: 'low', schema: { type: 'object', properties: { aborted: { type: 'boolean' }, context: { type: 'object', additionalProperties: true }, freshness: { type: 'object', additionalProperties: true }, self_heal_used: { type: 'boolean' }, reason: { type: 'string' }, breached_slas: { type: 'array', items: { type: 'string' } } }, required: ['aborted'], additionalProperties: true } })
}

function chiefPrompt(cli, deskName, docPath, sideTag, inputs, extra) {
  return `You are the ${deskName} Desk Chief (WHEAT ONLY) for Bushel Board — the FLAGSHIP judgment role that writes the published farmer-facing baseline. Model gate: Opus-class OR ABOVE (you are running on an Opus-/Fable-class model — this PASSES; never abort as wrong-model).
${CLI_NOTE(cli)}

STEP 1 - Read IN FULL with the Read tool, in this order:
  a) ${REPO}/docs/reference/${docPath}  (your orchestration contract: resolution protocol, Phase 4.5 anomaly investigation, stance-tier assignment, in-run meta-review checks, and the ENTIRE envelope contract including every validator trap and the exact scratch filename)
  b) ${REPO}/docs/reference/agent-debate-rules.md and ${REPO}/docs/reference/agent-debate-rules-${sideTag === 'cad' ? 'canada' : 'us'}.md  (the Wheat card is your active card)
Scouts, adversarial verification, and specialists have already run — your job is Phases 4 through 6 of the doc.

STEP 2 - Inputs (structured JSON). REFUTED claims from the verification layer are POISONED: a stance may not rest on any refuted number.
${JSON.stringify(inputs).slice(0, 170000)}
${extra || ''}

STEP 3 - Execute the doc:
  - Resolve divergence across the STANCE specialists (weighted average vs debate exactly per the doc).
  - Apply the risk MODERATOR flags and any overlays per contract (the moderator's stance_score is a placeholder, use its flags not its number).
  - Rule 20 stance-change ledger vs the current trajectory anchor (decompose any >5-pt move into summed dated deltas; query the anchor via CLI).
  - Phase 4.5 deep pass: trajectory cross-check + Viking L2 keyword queries where anomaly triggers fire.
  - In-run meta-review: run every check in the doc (single-market form).

STEP 4 - Envelope + gated write:
  - Write the envelope JSON to the scratch file the doc names (side ${sideTag}) using the Write tool (or a Bash heredoc if Write is unavailable). EXACTLY ONE row: Wheat.
  - Respect every contract trap: CAD trajectory evidence is a STRING, US evidence is a JSONB OBJECT; Track 46 fields nest under llm_metadata.track_46; model_used = "claude-agent-${sideTag === 'cad' ? 'desk' : 'us-desk'}-v2-fable".
  - Validate: npm run ${cli} -- write --input <envelope>   (dry-run; zod-validated).
  - ${doWrite ? 'If it validates, PERSIST: npm run ' + cli + ' -- write --input <envelope> --write   (DESK_WRITE_APPROVAL is in .env.local). Exit 3 => run npm run ' + cli + ' -- fail --reason "write_not_approved" and report write_result "failed:write_not_approved".' : 'DRY-RUN ONLY this run — do NOT pass --write. Report write_result "dry-run-only".'}

Return the structured output: stance, confidence, tier, how divergence was resolved, which refuted claims you honored, freshness warnings, and a tight run_summary of what changed vs the prior anchor and why.`
}

// ================= US DESK (runs FIRST — CAD cross-reads it) =================
let usChief = null
if (side === 'us' || side === 'both') {
  phase('Preflight')
  const pf = await preflight('desk:us', 'us-desk-weekly (ultracode workflow)')
  if (!pf || pf.aborted) {
    log(`US preflight ABORTED: ${pf ? (pf.reason || JSON.stringify(pf.breached_slas)) : 'preflight agent failed'} — skipping US desk`)
  } else {
    log(`US preflight OK${pf.self_heal_used ? ' (price self-heal used)' : ''} — context ${JSON.stringify(pf.context || {})}`)
    const usScoutDefs = [
      ['us-wasde-scout', 'wasde', 'Latest WASDE Wheat balance sheet (US + world where mapped); MoM revision direction.'],
      ['us-export-scout', 'export', 'ALL WHEAT rows. The July MY 2026-27 rollover means no pace benchmark yet — say so rather than inventing one.'],
      ['us-conditions-scout', 'conditions', 'Winter + spring wheat condition/harvest; USDM per your def (DataTables direct; coverage_gap fallback, never D0 language).'],
      ['us-price-scout', 'price', 'All three wheat class legs (ZW/KE/MW); recompute true 1W/4W from raw settles; MW frozen-feed check is mandatory.'],
      ['us-cot-scout', 'cot', 'All three wheat COT classes separately plus the aggregate; Rules 9-11 framing.'],
      ['us-macro-scout', 'macro', 'Wheat-moving news last ~10 days (Black Sea/Kerch status, Russia export-duty mechanics, tenders, policy) with URLs + corroboration tags.'],
      ['us-ag-economy-scout', 'ag_economy', 'Cross-market farm-economy scan as WHEAT acreage/input CONTEXT only.'],
      ['us-input-macro-scout', 'input_macro', 'Input-cost stack + Rule 16 trigger booleans as WHEAT CONTEXT only.'],
    ]
    const usScouts = await parallel(usScoutDefs.map(([type, lane, extra]) => () =>
      agent(scoutPrompt('desk:us', lane, extra), { agentType: type, label: `us:${lane}`, phase: 'US Scouts', schema: SCOUT_SCHEMA })))
    const usVerify = await verifyScouts('desk:us', 'US Verify', usScouts)
    const usBrief = { context: pf.context, freshness: pf.freshness, scouts: usScouts.filter(Boolean), verification: usVerify }
    const usSpec = (role, q, moderatorOrOverlay) => `You are the ${role} for the US WHEAT desk. Analyze WHEAT ONLY, per your agent definition (it tells you which rules to apply and which Viking tiers to load; the Wheat card in agent-debate-rules-us.md is your active card). ${CLI_NOTE('desk:us')}
Question: ${q}
${moderatorOrOverlay || ''}
Compiled + adversarially-verified brief (JSON — REFUTED claims are poisoned, do not build on them): ${JSON.stringify(usBrief).slice(0, 150000)}
Cite >=1 R-US-WHT-NN rule. Query Viking L2 via the knowledge command only where your judgment diverges from the brief.`
    const [usExp, usDom, usPrice, usRisk, usArea] = await parallel([
      () => agent(usSpec('us-export-analyst', 'Is the US wheat pipeline moving fast enough versus its marketing-year context this week?'), { agentType: 'us-export-analyst', label: 'us:export-analyst', phase: 'US Specialists', schema: SPECIALIST_SCHEMA, effort: 'high' }),
      () => agent(usSpec('us-domestic-analyst', 'Is US domestic wheat demand (milling, feed) strong enough to absorb supply without leaning on exports?'), { agentType: 'us-domestic-analyst', label: 'us:domestic-analyst', phase: 'US Specialists', schema: SPECIALIST_SCHEMA, effort: 'high' }),
      () => agent(usSpec('us-price-analyst', 'Is the wheat tape (all three classes + COT per class) telling us to fade or to follow?'), { agentType: 'us-price-analyst', label: 'us:price-analyst', phase: 'US Specialists', schema: SPECIALIST_SCHEMA, effort: 'high' }),
      () => agent(usSpec('us-risk-analyst', 'What breaks the wheat theses this week?', 'MODERATOR ROLE: you produce NO stance of your own — set stance_score to 0 and put crowding_flag / policy_cliff_flag / staleness_flag plus your top risks (each with evidence) into key_evidence.'), { agentType: 'us-risk-analyst', label: 'us:risk-moderator', phase: 'US Specialists', schema: SPECIALIST_SCHEMA, effort: 'high' }),
      () => agent(usSpec('us-planted-area-analyst', 'What is the new-crop wheat acreage/area adjustment?', 'SEASONAL OVERLAY (Mar-Sep, active): your stance_score IS the additive acre_shift adjustment for Wheat, capped +/-10. Resolve any old-crop vs new-crop conflict per Rule 17 in thesis.'), { agentType: 'us-planted-area-analyst', label: 'us:planted-overlay', phase: 'US Specialists', schema: SPECIALIST_SCHEMA, effort: 'medium' }),
    ])
    usChief = await agent(
      chiefPrompt('desk:us', 'US', 'us-desk-swarm-prompt.md', 'us',
        { brief: usBrief, stance_specialists: { export: usExp, domestic: usDom, price: usPrice }, risk_moderator: usRisk, planted_area_overlay: usArea },
        'NOTE: export/domestic/price are the ONLY stance producers. The risk row is a moderator (its stance_score 0 is a placeholder). The planted-area row is an additive OVERLAY (its stance_score IS the adjustment, cap +/-10) — the arithmetic must reconcile in llm_metadata.acre_shift_overlay.'),
      { label: 'US-DESK-CHIEF', phase: 'US Chief', schema: CHIEF_SCHEMA, effort: 'xhigh' })
    log(`US Wheat: stance ${usChief ? usChief.stance_score : 'FAILED'} conf ${usChief ? usChief.confidence_score : '-'} write=${usChief ? usChief.write_result : '-'}`)
  }
}

// ================= CAD DESK (consumes the US cross-read) =================
let cadChief = null
if (side === 'cad' || side === 'both') {
  phase('Preflight')
  const pf = await preflight('desk:cad', 'grain-desk-weekly (ultracode workflow)')
  if (!pf || pf.aborted) {
    log(`CAD preflight ABORTED: ${pf ? (pf.reason || JSON.stringify(pf.breached_slas)) : 'preflight agent failed'} — skipping CAD desk`)
  } else {
    log(`CAD preflight OK${pf.self_heal_used ? ' (price self-heal used)' : ''} — context ${JSON.stringify(pf.context || {})}`)
    const cadScoutDefs = [
      ['supply-scout', 'supply', 'Include StatsCan farm stocks (statcan_wds_raw) + the Canada crop-progress new-crop lens per your def; AAFC RPC is live-only.'],
      ['demand-scout', 'demand', 'Exports, milling/processing/domestic, USDA export context for Wheat.'],
      ['basis-scout', 'basis', 'Include the sk_cash_prices CWRS cash tape (item 6 of your def — now scheduled and fresh); label basis_proxy honestly.'],
      ['sentiment-scout', 'sentiment', 'Farmer voting is PAUSED and X may be empty — report those lanes dark honestly; COT via all three wheat classes.'],
      ['logistics-scout', 'logistics', 'Terminal flow, Grain Monitor, producer cars, wheat class mix (server-side aggregate; class_mix_unavailable fallback).'],
      ['macro-scout', 'macro', 'Wheat-moving world news (Black Sea, tenders, competing origins) with URLs; WASDE wheat context.'],
    ]
    const cadScouts = await parallel(cadScoutDefs.map(([type, lane, extra]) => () =>
      agent(scoutPrompt('desk:cad', lane, extra), { agentType: type, label: `cad:${lane}`, phase: 'CAD Scouts', schema: SCOUT_SCHEMA })))
    const cadVerify = await verifyScouts('desk:cad', 'CAD Verify', cadScouts)
    const crossRead = usChief
      ? { stance_score: usChief.stance_score, confidence_score: usChief.confidence_score, stance_tier: usChief.stance_tier, final_assessment: usChief.final_assessment, source: 'same-run US desk (ultracode workflow)' }
      : null
    const cadBrief = { context: pf.context, freshness: pf.freshness, scouts: cadScouts.filter(Boolean), verification: cadVerify, us_desk_cross_read: crossRead }
    const cadSpec = (role, q) => `You are the ${role} for the CAD WHEAT desk (Wheat is the FLAGSHIP grain). Analyze WHEAT ONLY, per your agent definition (it tells you which rules to apply and which Viking tiers to load; the Wheat card in agent-debate-rules-canada.md is your active card). ${CLI_NOTE('desk:cad')}
Question: ${q}
R-CA-WHT-01: CWRS is a price-taker on the global wheat complex — reference the us_desk_cross_read below (or note its absence).
Compiled + adversarially-verified brief incl. us_desk_cross_read (JSON — REFUTED claims are poisoned): ${JSON.stringify(cadBrief).slice(0, 150000)}
Cite >=1 R-CA-WHT-NN rule. Query Viking L2 via the knowledge command only where your judgment diverges from the brief.`
    const [cExp, cDom, cRisk, cPrice] = await parallel([
      () => agent(cadSpec('export-analyst', 'Should farmers sell Wheat into the export pipeline this week?'), { agentType: 'export-analyst', label: 'cad:export-analyst', phase: 'CAD Specialists', schema: SPECIALIST_SCHEMA, effort: 'high' }),
      () => agent(cadSpec('domestic-analyst', 'Is domestic Wheat demand strong enough to support holding?'), { agentType: 'domestic-analyst', label: 'cad:domestic-analyst', phase: 'CAD Specialists', schema: SPECIALIST_SCHEMA, effort: 'high' }),
      () => agent(cadSpec('risk-analyst', 'What breaks the other Wheat theses this week? Scan the card Thesis-Killers with evidence.'), { agentType: 'risk-analyst', label: 'cad:risk-analyst', phase: 'CAD Specialists', schema: SPECIALIST_SCHEMA, effort: 'high' }),
      () => agent(cadSpec('price-analyst', 'Is the price tape (futures basket + SK cash tape) confirming or contradicting the fundamental Wheat story?'), { agentType: 'price-analyst', label: 'cad:price-analyst', phase: 'CAD Specialists', schema: SPECIALIST_SCHEMA, effort: 'high' }),
    ])
    cadChief = await agent(
      chiefPrompt('desk:cad', 'CAD (Wheat FLAGSHIP)', 'grain-desk-swarm-prompt.md', 'cad',
        { brief: cadBrief, specialists: { export: cExp, domestic: cDom, risk: cRisk, price: cPrice }, us_desk_cross_read: crossRead },
        'FLAGSHIP extras are MANDATORY: the Phase 4.5 deep pass runs regardless of triggers (no -15 penalty when nothing fired — set trigger flagship_mandatory); cite the us_desk_cross_read (or apply the -5 confidence rule for its absence); include llm_metadata.wheat_cockpit {what_changed, watch_next, class_mix_note}, each field under 140 chars; >=4 reasoning items per side or a documented asymmetry.'),
      { label: 'CAD-DESK-CHIEF', phase: 'CAD Chief', schema: CHIEF_SCHEMA, effort: 'xhigh' })
    log(`CAD Wheat: stance ${cadChief ? cadChief.stance_score : 'FAILED'} conf ${cadChief ? cadChief.confidence_score : '-'} write=${cadChief ? cadChief.write_result : '-'}`)
  }
}

// ================= POSTCHECK =================
phase('Postcheck')
let post = null
if (doWrite && (usChief || cadChief)) {
  post = await agent(`From ${REPO} run via the Bash tool: npm run desk:postcheck. Report the desk OUTPUT freshness verdict per desk (market_analysis / us_market_analysis recency) and whether thesis_packet_cache refreshed (expect 12/12). Return {cad_fresh, us_fresh, cache_ok, raw_tail} honestly — do not claim success you cannot see in the output.`,
    { label: 'postcheck', phase: 'Postcheck', effort: 'low', schema: { type: 'object', properties: { cad_fresh: { type: 'boolean' }, us_fresh: { type: 'boolean' }, cache_ok: { type: 'boolean' }, raw_tail: { type: 'string' } }, required: ['cache_ok'], additionalProperties: true } })
} else {
  log(doWrite ? 'Postcheck skipped — no desk produced a chief result' : 'Postcheck skipped — dry-run mode (no writes)')
}

return { side, write: doWrite, us: usChief, cad: cadChief, postcheck: post }

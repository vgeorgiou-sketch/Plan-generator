import { useState } from 'react'
import './signalgrid.css'
import { convergenceOf, deriveGridCells } from '../../signal-model/convergence.ts'
import { SBR_PRESS_BASELINE, SOUTHWARK_BRIDGE_ROAD_SEED } from '../../signal-model/seed.ts'
import { LAYER_CATEGORY, LAYER_LABEL, SIGNAL_LAYERS, type LayerCategory } from '../../signal-model/types.ts'
import type { Opportunity, Signal } from '../../signal-model/types.ts'

/*
  The Signal grid — the provenance tile matrix over REAL, cited buildings.
  There is no additive score and no mock data. Every non-empty cell traces to
  a source record; empty cells (layers not yet pulled) stay genuinely empty.

  Structure, not just palette: a dashboard reads as a console because several
  DIFFERENT widgets sit side by side (a gauge, a mix chart, a timeline, a
  matrix, a log) — not because one table got a dark background. Every widget
  here is derived from the exact same signal-model arrays the old single
  table rendered; nothing new is fabricated to fill a panel.
*/

const BUILDINGS: Opportunity[] = [SOUTHWARK_BRIDGE_ROAD_SEED]

const FACT_MARK: Record<string, string> = { filed: '●', derived: '◐', inferred: '○', empty: '' }

const CATEGORY_ORDER: LayerCategory[] = ['kinetic', 'pressure', 'context']

/** How many distinct layers COULD exist per category — the denominator for
 *  the gauge and the mix chart, computed once from the canonical layer list
 *  (never a guessed "out of 10"). */
const LAYER_TOTAL_BY_CATEGORY: Record<LayerCategory, number> = SIGNAL_LAYERS.reduce(
  (acc, layer) => {
    const cat = LAYER_CATEGORY[layer]
    acc[cat] = (acc[cat] ?? 0) + 1
    return acc
  },
  { kinetic: 0, pressure: 0, context: 0 } as Record<LayerCategory, number>,
)

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

function signalById(opp: Opportunity, id?: string): Signal | undefined {
  return id ? opp.signals.find((s) => s.id === id) : undefined
}

function HeaderStats({ buildings }: { buildings: Opportunity[] }) {
  const converged = buildings.filter((b) => convergenceOf(b, SBR_PRESS_BASELINE).isConverged).length
  const signalsCited = buildings.reduce((n, b) => n + b.signals.length, 0)
  const liveLayers = new Set(
    buildings.flatMap((b) => deriveGridCells(b).filter((c) => c.state !== 'empty').map((c) => c.layer)),
  ).size

  const stats: { label: string; value: number | string }[] = [
    { label: 'Buildings tracked', value: buildings.length },
    { label: 'Converged', value: `${converged}/${buildings.length}` },
    { label: 'Signals cited', value: signalsCited },
    { label: 'Layers live', value: `${liveLayers}/${SIGNAL_LAYERS.length}` },
  ]

  return (
    <div className="sg-stats">
      {stats.map((s) => (
        <div key={s.label} className="sg-stat">
          <div className="sg-stat-value">{s.value}</div>
          <div className="sg-stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

/** Two concentric arcs: how many of the possible KINETIC and PRESSURE layers
 *  actually fired for this building — the two categories convergence is
 *  computed from. Real fractions (n of a fixed, known denominator), not a
 *  synthetic "score out of 100". */
function ConvergenceGauge({ opp }: { opp: Opportunity }) {
  const c = convergenceOf(opp, SBR_PRESS_BASELINE)
  const kFrac = LAYER_TOTAL_BY_CATEGORY.kinetic ? c.kineticLayers / LAYER_TOTAL_BY_CATEGORY.kinetic : 0
  const pFrac = LAYER_TOTAL_BY_CATEGORY.pressure ? c.pressureLayers / LAYER_TOTAL_BY_CATEGORY.pressure : 0

  const R_OUT = 54
  const R_IN = 40
  const circOut = 2 * Math.PI * R_OUT
  const circIn = 2 * Math.PI * R_IN

  return (
    <div className="sg-gauge">
      <svg viewBox="0 0 128 128" width="128" height="128">
        <circle cx="64" cy="64" r={R_OUT} className="sg-gauge-track" />
        <circle cx="64" cy="64" r={R_IN} className="sg-gauge-track" />
        <circle
          cx="64"
          cy="64"
          r={R_OUT}
          className="sg-gauge-arc kinetic"
          strokeDasharray={`${kFrac * circOut} ${circOut}`}
          transform="rotate(-90 64 64)"
        />
        <circle
          cx="64"
          cy="64"
          r={R_IN}
          className="sg-gauge-arc pressure"
          strokeDasharray={`${pFrac * circIn} ${circIn}`}
          transform="rotate(-90 64 64)"
        />
        <text x="64" y="60" textAnchor="middle" className="sg-gauge-verdict">
          {c.isConverged ? 'YES' : 'NOT YET'}
        </text>
        <text x="64" y="76" textAnchor="middle" className="sg-gauge-sub">
          CONVERGED
        </text>
      </svg>
      <dl className="sg-gauge-legend">
        <div>
          <dt><span className="sg-cdot" style={{ background: 'var(--kinetic)' }} />Kinetic</dt>
          <dd>{c.kineticLayers} / {LAYER_TOTAL_BY_CATEGORY.kinetic} layers</dd>
        </div>
        <div>
          <dt><span className="sg-cdot" style={{ background: 'var(--pressure)' }} />Pressure</dt>
          <dd>{c.pressureLayers} / {LAYER_TOTAL_BY_CATEGORY.pressure} layers</dd>
        </div>
      </dl>
    </div>
  )
}

/** How many CITED SIGNALS (not layers) exist per category for this building
 *  — a different real count from the gauge above, at the record level. */
function CategoryMix({ opp }: { opp: Opportunity }) {
  const counts: Record<LayerCategory, number> = { kinetic: 0, pressure: 0, context: 0 }
  for (const s of opp.signals) counts[LAYER_CATEGORY[s.layer]]++
  const max = Math.max(1, ...CATEGORY_ORDER.map((c) => counts[c]))

  return (
    <div className="sg-mix">
      {CATEGORY_ORDER.map((cat) => (
        <div key={cat} className="sg-mix-row">
          <span className="sg-mix-label">{cat}</span>
          <div className="sg-mix-track">
            <div className={`sg-mix-fill cat-${cat}`} style={{ width: `${(counts[cat] / max) * 100}%` }} />
          </div>
          <span className="sg-mix-count">{counts[cat]}</span>
        </div>
      ))}
    </div>
  )
}

/** Every cited signal placed on a real time axis (earliest → latest
 *  observedAt), coloured by category — the actual chronology behind the
 *  matrix's flattened cells, at a glance. */
function EvidenceTimeline({ opp }: { opp: Opportunity }) {
  const dated = [...opp.signals].sort((a, b) => a.observedAt.localeCompare(b.observedAt))
  if (dated.length < 2) return null
  const first = Date.parse(dated[0].observedAt)
  const last = Date.parse(dated[dated.length - 1].observedAt)
  const span = Math.max(1, last - first)

  return (
    <div className="sg-timeline">
      <div className="sg-timeline-head">Evidence timeline · {shortDate(dated[0].observedAt)} → {shortDate(dated[dated.length - 1].observedAt)}</div>
      <div className="sg-timeline-track">
        <div className="sg-timeline-line" />
        {dated.map((s) => {
          const pct = ((Date.parse(s.observedAt) - first) / span) * 100
          return (
            <div
              key={s.id}
              className={`sg-timeline-dot cat-${LAYER_CATEGORY[s.layer]}`}
              style={{ left: `${pct}%` }}
              title={`${shortDate(s.observedAt)} · ${LAYER_LABEL[s.layer]} · ${s.label}`}
            />
          )
        })}
      </div>
    </div>
  )
}

function Matrix({
  buildings,
  selectedId,
  onSelect,
}: {
  buildings: Opportunity[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  // leading building column + 11 layer columns
  const template = `minmax(150px, 1.4fr) repeat(${SIGNAL_LAYERS.length}, minmax(52px, 1fr))`
  return (
    <div className="sg-matrixwrap">
      <div className="sg-matrix" style={{ gridTemplateColumns: template }}>
        <div className="hcell" />
        {SIGNAL_LAYERS.map((layer) => (
          <div key={layer} className="hcell">
            {LAYER_LABEL[layer]}
          </div>
        ))}

        {buildings.map((opp) => {
          const cells = deriveGridCells(opp)
          return (
            <MatrixRow
              key={opp.id}
              opp={opp}
              cells={cells}
              selected={opp.id === selectedId}
              onSelect={() => onSelect(opp.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

function MatrixRow({
  opp,
  cells,
  selected,
  onSelect,
}: {
  opp: Opportunity
  cells: ReturnType<typeof deriveGridCells>
  selected: boolean
  onSelect: () => void
}) {
  return (
    <>
      <button type="button" className={`rowlabel${selected ? ' sel' : ''}`} onClick={onSelect}>
        <b>{opp.address}</b>
        <span>
          {opp.postcode} · {opp.borough}
        </span>
      </button>
      {SIGNAL_LAYERS.map((layer) => {
        const cell = cells.find((c) => c.layer === layer)!
        const cat = LAYER_CATEGORY[layer]
        const cls = `sg-cell cat-${cat} st-${cell.state}`
        const sig = signalById(opp, cell.signalId)
        const content = (
          <>
            <span className="mk">{FACT_MARK[cell.state]}</span>
            {cell.count ? <span className="ct">{cell.count}</span> : null}
          </>
        )
        // Empty cells are inert and unlinked — nothing to open, nothing implied.
        if (cell.state === 'empty' || !sig) {
          return <div key={layer} className={cls} title={cell.tooltip} />
        }
        return (
          <a key={layer} className={cls} href={sig.sourceUrl} target="_blank" rel="noreferrer" title={cell.tooltip}>
            {content}
          </a>
        )
      })}
    </>
  )
}

function EvidenceLog({ opp }: { opp: Opportunity }) {
  const c = convergenceOf(opp, SBR_PRESS_BASELINE)
  const ordered = [...opp.signals].sort((a, b) => a.observedAt.localeCompare(b.observedAt))
  const hasPscSequence = opp.signals.filter((s) => s.layer === 'companiesHousePsc').length > 1

  return (
    <section className="sg-panel sg-log">
      <div className="sg-panel-head">
        <span className="sg-panel-title">Evidence log — every row links to its source record</span>
        {c.leadTimeDays !== undefined && (
          <span className="sg-chip lead">
            {c.leadTimeDays}d lead <em>incorporation → press</em>
          </span>
        )}
        <span className="sg-chip">Weakest signal {c.minConfidence.toFixed(1)}</span>
      </div>
      <ul className="sg-evlist">
        {ordered.map((s) => {
          const cat = LAYER_CATEGORY[s.layer]
          const deepLinkTodo = s.sourceUrl.endsWith('/')
          return (
            <li key={s.id} className={`sg-ev cat-${cat}`}>
              <span className="sg-ev-date">{shortDate(s.observedAt)}</span>
              <span className="sg-ev-mark" title={s.factType}>
                {FACT_MARK[s.factType]}
              </span>
              <span>
                <span className="sg-ev-layer">{LAYER_LABEL[s.layer]}</span>
                <a className="sg-ev-label" href={s.sourceUrl} target="_blank" rel="noreferrer">
                  {String(s.label)}
                </a>
                {deepLinkTodo && <span className="sg-todo">deep-link TODO</span>}
                {s.note && <div className="sg-note">{s.note}</div>}
              </span>
            </li>
          )
        })}
      </ul>

      {hasPscSequence && (
        <div className="sg-seq">
          <strong>Control sequence (not one event, four):</strong> the two PSC entries are a relationship ending and a
          different entity’s control being confirmed — rendered distinctly, six days apart, because the sequence is the
          insight, not the fact of a PSC filing.
        </div>
      )}
      <p className="sg-honest">
        Kinetic-only until EPC/VOA (pressure) is pulled against this building — shown honestly, not forced to
        “converged”.
      </p>
    </section>
  )
}

export default function SignalGrid() {
  const [selectedId, setSelectedId] = useState(BUILDINGS[0].id)
  const selected = BUILDINGS.find((b) => b.id === selectedId) ?? BUILDINGS[0]
  const selectedConvergence = convergenceOf(selected, SBR_PRESS_BASELINE)

  return (
    <div className="sg-root">
      <div className="sg-wrap">
        <header className="sg-header">
          <div className="sg-brand">
            <span className="sg-mark" aria-hidden="true" />
            <div>
              <h1>Opportunity Radar</h1>
              <div className="sg-sub">Provenance over real, cited signals · every number traces to a source record</div>
            </div>
          </div>
          <HeaderStats buildings={BUILDINGS} />
        </header>

        <div className="sg-dashboard">
          <aside className="sg-rail">
            <section className="sg-panel sg-panel--tight">
              <div className="sg-panel-head">
                <span className="sg-panel-name">{selected.address}</span>
                <span className={`sg-convbadge ${selectedConvergence.isConverged ? 'on' : 'off'}`}>
                  {selectedConvergence.isConverged ? 'CONVERGED' : 'WATCHING'}
                </span>
              </div>
              <p className="sg-addr-sub">
                {selected.postcode} · {selected.borough} · <span className="sg-status">{selected.status}</span>
              </p>
              <ConvergenceGauge opp={selected} />
            </section>

            <section className="sg-panel sg-panel--tight">
              <div className="sg-panel-head">
                <span className="sg-panel-title">Signal mix — cited records by category</span>
              </div>
              <CategoryMix opp={selected} />
            </section>

            <div className="sg-legend sg-legend--rail">
              <span className="k">
                <span className="sg-cdot" style={{ background: 'var(--kinetic)' }} />
                Kinetic
              </span>
              <span className="k">
                <span className="sg-cdot" style={{ background: 'var(--pressure)' }} />
                Pressure
              </span>
              <span className="k">
                <span className="sg-cdot" style={{ background: 'var(--context)' }} />
                Context
              </span>
              <span className="k">
                <span className="sg-sw filed" />
                Filed
              </span>
              <span className="k">
                <span className="sg-sw derived" />
                Derived
              </span>
              <span className="k">
                <span className="sg-sw inferred" />
                Inferred
              </span>
              <span className="k">
                <span className="sg-sw empty" />
                No record
              </span>
            </div>
          </aside>

          <main className="sg-main">
            <section className="sg-panel">
              <div className="sg-panel-head">
                <span className="sg-panel-title">Signal matrix</span>
              </div>
              <Matrix buildings={BUILDINGS} selectedId={selectedId} onSelect={setSelectedId} />
              <EvidenceTimeline opp={selected} />
            </section>
          </main>
        </div>

        <EvidenceLog opp={selected} />

        <div className="sg-foot">
          Grid and figures computed by signal-model (deriveGridCells / convergence); no mock data, no additive score.
          Empty cells are layers not yet pulled — genuinely empty, not “coming soon”.
        </div>
      </div>
    </div>
  )
}

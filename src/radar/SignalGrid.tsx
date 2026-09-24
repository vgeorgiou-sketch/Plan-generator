import { useState } from 'react'
import './signalgrid.css'
import { convergenceOf, deriveGridCells } from '../../signal-model/convergence.ts'
import { SBR_PRESS_BASELINE, SOUTHWARK_BRIDGE_ROAD_SEED } from '../../signal-model/seed.ts'
import { LAYER_CATEGORY, LAYER_LABEL, SIGNAL_LAYERS } from '../../signal-model/types.ts'
import type { Opportunity, Signal } from '../../signal-model/types.ts'

/*
  The Signal grid — the provenance tile matrix over REAL, cited buildings.
  There is no additive score and no mock data. Every non-empty cell traces to
  a source record; empty cells (layers not yet pulled) stay genuinely empty.

  Visual language: a dense operations-console read, not a scorecard — dark
  field, glowing category colour by layer, monospace for anything that's a
  measured number (dates, counts, confidence). The header strip's own stats
  are computed from the same arrays the grid renders, never a separate
  fabricated number.
*/

const BUILDINGS: Opportunity[] = [SOUTHWARK_BRIDGE_ROAD_SEED]

const FACT_MARK: Record<string, string> = { filed: '●', derived: '◐', inferred: '○', empty: '' }

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
  const template = `minmax(150px, 1.4fr) repeat(${SIGNAL_LAYERS.length}, minmax(56px, 1fr))`
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

function BuildingCard({ opp }: { opp: Opportunity }) {
  const c = convergenceOf(opp, SBR_PRESS_BASELINE)
  const ordered = [...opp.signals].sort((a, b) => a.observedAt.localeCompare(b.observedAt))
  const hasPscSequence = opp.signals.filter((s) => s.layer === 'companiesHousePsc').length > 1

  return (
    <section className="sg-card">
      <div className="sg-card-head">
        <div>
          <h2>{opp.address}</h2>
          <p className="addr">
            {opp.postcode} · {opp.borough} · <span className="sg-status">{opp.status}</span>
          </p>
        </div>
        <span className={`sg-convbadge ${c.isConverged ? 'on' : 'off'}`}>
          {c.isConverged ? 'CONVERGED' : 'WATCHING'}
        </span>
      </div>

      <div className="sg-conv">
        <span className="sg-chip">Pressure {c.pressureLayers}</span>
        <span className="sg-chip">Kinetic {c.kineticLayers}</span>
        <span className="sg-chip">Weakest signal {c.minConfidence.toFixed(1)}</span>
        {c.leadTimeDays !== undefined && (
          <span className="sg-chip lead">
            {c.leadTimeDays}d lead <em>incorporation → press</em>
          </span>
        )}
      </div>
      <p className="sg-honest">
        Kinetic-only until EPC/VOA (pressure) is pulled against this building — shown honestly, not forced to
        “converged”.
      </p>

      <h3>Evidence — every row links to its source record</h3>
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
    </section>
  )
}

export default function SignalGrid() {
  const [selectedId, setSelectedId] = useState(BUILDINGS[0].id)
  const selected = BUILDINGS.find((b) => b.id === selectedId) ?? BUILDINGS[0]

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

        <div className="sg-legend">
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
          <span className="sg-legend-sep" />
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

        <section className="sg-panel">
          <div className="sg-panel-head">Signal matrix</div>
          <Matrix buildings={BUILDINGS} selectedId={selectedId} onSelect={setSelectedId} />
        </section>

        <BuildingCard opp={selected} />

        <div className="sg-foot">
          Grid and figures computed by signal-model (deriveGridCells / convergence); no mock data, no additive score.
          Empty cells are layers not yet pulled — genuinely empty, not “coming soon”.
        </div>
      </div>
    </div>
  )
}

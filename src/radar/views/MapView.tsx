import type { Opportunity } from '../types'
import { BOROUGH_TILES } from '../data'
import { countBy } from '../model'
import { BarRow, Card, SectionTitle } from '../ui'

const TILE = 58
const GAP = 6

/** Sequential blue steps for opportunity count (0 / 1 / 2+). */
function fillFor(count: number): string {
  if (count >= 2) return 'var(--rp-seq-3)'
  if (count === 1) return 'var(--rp-seq-1)'
  return 'var(--rp-card)'
}

function inkFor(count: number): string {
  return count >= 2 ? '#ffffff' : 'var(--rp-ink-2)'
}

/**
 * Schematic borough grid (London Squared-style), not a GIS map — enough to
 * read geographic clusters without map plumbing in v1.
 */
export function MapView({
  opportunities,
  onFilterBorough,
}: {
  opportunities: Opportunity[]
  onFilterBorough: (borough: string) => void
}) {
  const counts = new Map(countBy(opportunities, (o) => o.borough).map((b) => [b.label, b.count]))
  const boroughRows = countBy(
    opportunities.filter((o) => o.borough !== 'Multiple (pan-London)'),
    (o) => o.borough,
  )
  const maxCount = Math.max(...boroughRows.map((b) => b.count))
  const panLondon = counts.get('Multiple (pan-London)') ?? 0

  const cols = Math.max(...BOROUGH_TILES.map((t) => t.col)) + 1
  const rows = Math.max(...BOROUGH_TILES.map((t) => t.row)) + 1
  const width = cols * (TILE + GAP) - GAP
  const height = rows * (TILE + GAP) - GAP

  return (
    <div className="rp-mapgrid">
      <Card>
        <SectionTitle aside="Schematic borough grid — not to geography">London distribution</SectionTitle>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ maxWidth: 560, display: 'block' }}
          role="img"
          aria-label="Opportunities by borough"
        >
          {BOROUGH_TILES.map((t) => {
            const count = counts.get(t.name) ?? 0
            const x = t.col * (TILE + GAP)
            const y = t.row * (TILE + GAP)
            return (
              <g
                key={t.name}
                onClick={count ? () => onFilterBorough(t.name) : undefined}
                style={count ? { cursor: 'pointer' } : undefined}
              >
                <title>{`${t.name}: ${count} ${count === 1 ? 'opportunity' : 'opportunities'}`}</title>
                <rect
                  x={x}
                  y={y}
                  width={TILE}
                  height={TILE}
                  rx={5}
                  fill={fillFor(count)}
                  stroke={count ? 'none' : 'var(--rp-hairline)'}
                />
                <text
                  x={x + 8}
                  y={y + 18}
                  fontSize={10}
                  fontWeight={count ? 600 : 400}
                  fill={inkFor(count)}
                  opacity={count ? 1 : 0.55}
                >
                  {t.short}
                </text>
                {count > 0 && (
                  <text x={x + 8} y={y + TILE - 10} fontSize={16} fontWeight={600} fill={inkFor(count)}>
                    {count}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        <div className="rp-maplegend">
          <span>
            <i style={{ background: 'var(--rp-card)' }} />
            None
          </span>
          <span>
            <i style={{ background: 'var(--rp-seq-1)', borderColor: 'transparent' }} />1
          </span>
          <span>
            <i style={{ background: 'var(--rp-seq-3)', borderColor: 'transparent' }} />
            2+
          </span>
          {panLondon > 0 && (
            <span style={{ marginLeft: 'auto' }}>
              + {panLondon} pan-London (universities framework), not mapped
            </span>
          )}
        </div>
      </Card>

      <div className="rp-stack">
        <Card>
          <SectionTitle aside="Click to open list">By borough</SectionTitle>
          {boroughRows.map((b) => (
            <BarRow
              key={b.label}
              label={b.label}
              count={b.count}
              max={maxCount}
              onClick={() => onFilterBorough(b.label)}
            />
          ))}
        </Card>
        <Card>
          <SectionTitle>Reading the clusters</SectionTitle>
          <p className="rp-prose">
            <strong>Central/City corridor.</strong> Office retrofit pressure concentrates where 1990s stock meets
            2027–30 lease events and MEES deadlines — City, Islington, Camden. Islington also carries the sector’s
            headline refusal.
          </p>
          <p className="rp-prose">
            <strong>East London arc.</strong> Living-sector signals track the university and regeneration geography —
            Tower Hamlets and Newham, with the south bank (Southwark, Lambeth) supplying conversion candidates.
          </p>
          <p className="rp-prose">
            <strong>Outer centres.</strong> Croydon and Ealing appear through partner awards and consented-scheme
            amendments rather than fresh applications — later-stage, relationship-led routes.
          </p>
        </Card>
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { PlanData } from './types'

type Props = {
  data: PlanData
  /** Directory the `plan` filenames in the data file are resolved against. */
  planBase?: string
}

/**
 * Renders one floor of a plan set: the plan image, a dot per active
 * opportunity, and a card for whichever dot is open.
 *
 * Everything project-specific lives in `data` — this component only knows the
 * shape described in ./types.ts.
 */
export default function PlanExplorer({ data, planBase = '/plans/' }: Props) {
  const [currentFloor] = useState(data.floors[0]?.id)
  const [openCard, setOpenCard] = useState<number | null>(null)

  // The SVG overlay uses a 0–100 coordinate space stretched over the image, so
  // one unit is wider than it is tall. Scaling each dot by the image's aspect
  // ratio restores a square local space, keeping circles round and text
  // unstretched. Until the image loads, 1 is a harmless placeholder.
  const [aspect, setAspect] = useState(1)

  const floor = data.floors.find((f) => f.id === currentFloor)
  if (!floor) return <p>No floor to show.</p>

  const byId = new Map(data.opportunities.map((o) => [o.id, o]))

  const dots = floor.active.flatMap((id) => {
    const opportunity = byId.get(id)
    const hotspot = floor.hotspots[String(id)]
    return opportunity && hotspot ? [{ opportunity, hotspot }] : []
  })

  const open = dots.find((d) => d.opportunity.id === openCard)

  return (
    <div onClick={() => setOpenCard(null)} style={{ padding: 16 }}>
      <div style={{ position: 'relative', lineHeight: 0 }}>
        <img
          src={planBase + floor.plan}
          alt={floor.label}
          onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
          style={{ display: 'block', width: '100%' }}
        />

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {dots.map(({ opportunity, hotspot }) => (
            <g
              key={opportunity.id}
              transform={`translate(${hotspot.x} ${hotspot.y}) scale(1 ${aspect})`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenCard(opportunity.id)
              }}
              style={{ cursor: 'pointer' }}
            >
              <circle r={1.4} fill="#333" />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={1.5}
                fill="#fff"
              >
                {opportunity.id}
              </text>
            </g>
          ))}
        </svg>

        {open && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: `${open.hotspot.x}%`,
              top: `${open.hotspot.y}%`,
              width: 260,
              padding: 12,
              background: '#ccc',
              border: '1px solid #333',
              lineHeight: 1.4,
            }}
          >
            <strong>{open.opportunity.title}</strong>
            <p style={{ margin: '8px 0 0' }}>{open.opportunity.rationale}</p>
          </div>
        )}
      </div>
    </div>
  )
}

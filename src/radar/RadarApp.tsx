import { useMemo, useState } from 'react'
import './radar.css'
import { OPPORTUNITIES, RFP_WATCHLIST } from './data'
import { isNewThisWeek, isPriority, needsReview } from './model'
import { Dashboard } from './views/Dashboard'
import { OpportunityList } from './views/OpportunityList'
import { DetailPanel } from './views/DetailPanel'
import { WeeklyDigest } from './views/WeeklyDigest'
import { MapView } from './views/MapView'
import { ModelView } from './views/ModelView'
import { RfpMonitor } from './views/RfpMonitor'
import { PreRfpMonitor } from './views/PreRfpMonitor'

type ViewKey = 'dashboard' | 'list' | 'digest' | 'map' | 'model' | 'rfp' | 'signals'

const VIEW_TITLES: Record<ViewKey, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: 'Where attention is needed this week' },
  list: { title: 'Opportunities', sub: 'All tracked leads, filterable' },
  digest: { title: 'Weekly digest', sub: 'Briefing for the partners’ meeting' },
  map: { title: 'Location view', sub: 'Geographic clusters across London' },
  model: { title: '3D model', sub: 'The radar as an architectural model — orbit, hover, click' },
  rfp: { title: 'RFP / tender monitor', sub: 'Formal procurement signals' },
  signals: { title: 'Pre-RFP signals', sub: 'Opportunities before procurement exists' },
}

export default function RadarApp() {
  const [view, setView] = useState<ViewKey>('dashboard')
  const [openId, setOpenId] = useState<string | null>(null)
  const [boroughFilter, setBoroughFilter] = useState<string | undefined>()

  const open = useMemo(() => OPPORTUNITIES.find((o) => o.id === openId) ?? null, [openId])

  const priorityCount = OPPORTUNITIES.filter(isPriority).length
  const reviewCount = OPPORTUNITIES.filter(needsReview).length
  const newCount = OPPORTUNITIES.filter(isNewThisWeek).length
  const signalCount = OPPORTUNITIES.filter((o) => o.signalKind).length

  const goToBorough = (borough: string) => {
    setBoroughFilter(borough)
    setView('list')
  }

  const nav: { key: ViewKey; label: string; count?: number }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'list', label: 'Opportunities', count: OPPORTUNITIES.length },
    { key: 'digest', label: 'Weekly digest' },
    { key: 'map', label: 'Location view' },
    { key: 'model', label: '3D model' },
  ]
  const navSources: { key: ViewKey; label: string; count?: number }[] = [
    { key: 'signals', label: 'Pre-RFP signals', count: signalCount },
    { key: 'rfp', label: 'RFP monitor', count: RFP_WATCHLIST.length },
  ]

  return (
    <div className="rp-root">
      <nav className="rp-sidebar">
        <div className="rp-brand">
          <span className="rp-brand-mark">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <circle cx="9" cy="9" r="8" fill="none" stroke="#151513" strokeWidth="1.4" />
              <circle cx="9" cy="9" r="4.5" fill="none" stroke="#151513" strokeWidth="1" opacity="0.45" />
              <circle cx="12" cy="6.4" r="1.8" fill="#151513" />
            </svg>
            Opportunity Radar
          </span>
          <span className="rp-brand-sub">London · w/c 6 Jul 2026</span>
        </div>

        <div className="rp-nav">
          {nav.map((n) => (
            <button
              key={n.key}
              type="button"
              className={view === n.key ? 'rp-nav--active' : undefined}
              onClick={() => {
                setView(n.key)
                if (n.key !== 'list') setBoroughFilter(undefined)
              }}
            >
              {n.label}
              {n.count !== undefined && <span className="rp-nav-count">{n.count}</span>}
            </button>
          ))}
          <div className="rp-nav-group">Signal sources</div>
          {navSources.map((n) => (
            <button
              key={n.key}
              type="button"
              className={view === n.key ? 'rp-nav--active' : undefined}
              onClick={() => setView(n.key)}
            >
              {n.label}
              {n.count !== undefined && <span className="rp-nav-count">{n.count}</span>}
            </button>
          ))}
        </div>

        <div className="rp-sidebar-foot">
          {priorityCount} priority · {newCount} new · {reviewCount} to review
          <br />
          Sample data — fictional London examples
        </div>
      </nav>

      <div className="rp-main">
        <header className="rp-topbar">
          <h1>{VIEW_TITLES[view].title}</h1>
          <span className="rp-topbar-sub">{VIEW_TITLES[view].sub}</span>
          <span className="rp-topbar-date">Wednesday 8 July 2026</span>
        </header>

        <main className="rp-content">
          {view === 'dashboard' && <Dashboard opportunities={OPPORTUNITIES} onOpen={setOpenId} />}
          {view === 'list' && (
            <OpportunityList
              key={boroughFilter ?? 'all'}
              opportunities={OPPORTUNITIES}
              onOpen={setOpenId}
              initialFilters={boroughFilter ? { borough: boroughFilter } : undefined}
            />
          )}
          {view === 'digest' && <WeeklyDigest opportunities={OPPORTUNITIES} onOpen={setOpenId} />}
          {view === 'map' && <MapView opportunities={OPPORTUNITIES} onFilterBorough={goToBorough} />}
          {view === 'model' && <ModelView opportunities={OPPORTUNITIES} onOpen={setOpenId} />}
          {view === 'rfp' && <RfpMonitor onOpen={setOpenId} />}
          {view === 'signals' && <PreRfpMonitor opportunities={OPPORTUNITIES} onOpen={setOpenId} />}
        </main>
      </div>

      {open && <DetailPanel opportunity={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}

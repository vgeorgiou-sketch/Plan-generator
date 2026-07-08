'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useHub } from '@/lib/store'
import { isPriority, needsAction } from '@/lib/scoring'

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/signals', label: 'Raw signals inbox', countKey: 'signals' as const },
  { href: '/pipeline', label: 'Opportunities pipeline', countKey: 'opportunities' as const },
  { href: '/digest', label: 'Weekly digest' },
]

const NAV_SYSTEM = [
  { href: '/intake', label: 'Data intake' },
  { href: '/settings', label: 'Settings / scoring' },
]

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { signals, opportunities } = useHub()
  const counts = { signals: signals.length, opportunities: opportunities.length }
  const needsReview = signals.filter((s) => s.reviewStatus === 'Needs review' || s.reviewStatus === 'Unreviewed').length
  const priority = opportunities.filter(isPriority).length
  const action = opportunities.filter(needsAction).length

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  const linkClass = (href: string) =>
    `flex w-full items-center justify-between gap-2 rounded-[5px] px-2.5 py-[7px] text-[13px] ${
      isActive(href) ? 'bg-ink text-white' : 'text-ink2 hover:bg-inset hover:text-ink'
    }`

  return (
    <div className="flex h-screen overflow-hidden font-sans">
      <nav className="flex w-[224px] flex-none flex-col border-r border-hairline bg-card pb-4 pt-5">
        <div className="border-b border-hairline px-5 pb-4">
          <Link href="/" className="flex items-center gap-2 text-[14.5px] font-semibold tracking-tight">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="9" cy="9" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.45" />
              <circle cx="12" cy="6.4" r="1.8" fill="currentColor" />
            </svg>
            Opportunities Hub
          </Link>
          <span className="mt-1 block text-[11px] uppercase tracking-[0.05em] text-ink3">
            UK pilot · w/c 6 Jul 2026
          </span>
        </div>

        <div className="flex flex-col gap-px px-2.5 py-3">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={linkClass(n.href)}>
              {n.label}
              {n.countKey && (
                <span className={`text-[11px] tabular-nums ${isActive(n.href) ? 'text-white/65' : 'text-ink3'}`}>
                  {counts[n.countKey]}
                </span>
              )}
            </Link>
          ))}
          <div className="mx-2.5 mb-1.5 mt-3.5 text-[10.5px] uppercase tracking-[0.08em] text-ink3">System</div>
          {NAV_SYSTEM.map((n) => (
            <Link key={n.href} href={n.href} className={linkClass(n.href)}>
              {n.label}
            </Link>
          ))}
        </div>

        <div className="mt-auto border-t border-hairline px-5 pt-3 text-[11px] leading-relaxed text-ink3">
          {needsReview} signals to review · {priority} priority · {action} need action
          <br />
          Seeded sample data — fictional examples
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-7 py-6">{children}</main>
      </div>
    </div>
  )
}

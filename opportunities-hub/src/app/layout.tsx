import type { Metadata } from 'next'
import './globals.css'
import { StoreProvider } from '@/lib/store'
import { Shell } from '@/components/Shell'

export const metadata: Metadata = {
  title: 'Opportunities Hub',
  description:
    'AI-assisted opportunity intelligence for an architecture practice — signals in, reviewed opportunities out.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <Shell>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  )
}

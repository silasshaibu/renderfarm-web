import type { Metadata } from 'next'
import './globals.css'
import ShellClient from '@/components/ShellClient'

export const metadata: Metadata = {
  title: 'Renderfarm — Cloud Rendering',
  description: 'Cloud render farm job management dashboard',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      {/* suppressHydrationWarning: browser extensions (dark-mode, translate, etc.)
          can add attributes to <body> after SSR, causing false hydration errors. */}
      <body className="h-full" suppressHydrationWarning>
        <ShellClient>{children}</ShellClient>
      </body>
    </html>
  )
}

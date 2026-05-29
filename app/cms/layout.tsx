// Root CMS layout — no auth check. Auth is enforced by (protected)/layout.tsx.
export const metadata = { title: 'Renderfarm CMS' }

export default function CmsRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

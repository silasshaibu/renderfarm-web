import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyCmsSession, ensureCmsSchema, CMS_COOKIE } from '@/lib/cms-auth'
import { initDB } from '@/lib/db'
import CmsShell from '../CmsShell'

export default async function CmsProtectedLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const token = cookieStore.get(CMS_COOKIE)?.value

  try {
    await initDB()
    await ensureCmsSchema()
  } catch { /* non-fatal on first load */ }

  const admin = await verifyCmsSession(token).catch(() => null)

  if (!admin) {
    redirect('/cms/login')
  }

  return <CmsShell admin={{ id: admin.id, email: admin.email }}>{children}</CmsShell>
}

import { redirect } from 'next/navigation'

/**
 * Job submission is handled exclusively through the Renderfarm desktop
 * companion app. Direct URL access is redirected back to the jobs list.
 */
export default function NewJobPage() {
  redirect('/')
}

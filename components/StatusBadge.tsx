import type { JobStatus } from '@/types/job'

// CSS class names per status — colours live in globals.css
const STATUS_LABELS: Record<JobStatus, string> = {
  upload_pending: 'Upload Pending',
  uploading:      'Uploading',
  sync_pending:   'Sync Pending',
  sync_failed:    'Sync Failed',
  syncing:        'Syncing',
  pending:        'Pending',
  holding:        'Holding',
  running:        'Running',
  success:        'Success',
  downloaded:     'Downloaded',
  failed:         'Failed',
  preempted:      'Preempted',
}

interface StatusBadgeProps {
  status: JobStatus
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap status-badge-${status}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 status-dot-${status}`} />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

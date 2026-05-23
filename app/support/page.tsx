'use client'

import { useState, useRef } from 'react'
import { SUNBURST_RAYS } from '@/lib/sunburst'

// ---------------------------------------------------------------------------
// Rich-text toolbar button
// ---------------------------------------------------------------------------
function ToolbarBtn({ label, title, onClick }: { label: string; title: string; onClick?: () => void }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className="support-toolbar-btn" aria-label={title}>
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Support form field wrapper
// ---------------------------------------------------------------------------
function SupportField({ label, id, optional = false, hint, children }: {
  label: string; id: string; optional?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
        {optional && <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-blue-600">{hint}</p>}
    </div>
  )
}

const ISSUE_TYPES = [
  'Account/Billing',
  'Job failed / error',
  'Performance issue',
  'Feature request',
  'Integration / API',
  'Software submitter',
  'Other',
]

const PRIORITIES = [
  { value: '',       label: '—'      },
  { value: 'urgent', label: 'Urgent — Work Stoppage'   },
  { value: 'high',   label: 'High — Deadline in danger' },
  { value: 'normal', label: 'Normal — Routine questions' },
  { value: 'low',    label: 'Low — Feature requests'   },
]

const CATEGORIES = [
  { value: '',            label: '—'               },
  { value: 'render',      label: 'Rendering'       },
  { value: 'billing',     label: 'Billing'         },
  { value: 'software',    label: 'Software'        },
  { value: 'api',         label: 'API / CLI'       },
  { value: 'performance', label: 'Performance'     },
  { value: 'other',       label: 'Other'           },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SupportPage() {
  const [email,       setEmail]       = useState('silasshaibu2@gmail.com')
  const [issue,       setIssue]       = useState('Account/Billing')
  const [description, setDescription] = useState('')
  const [priority,    setPriority]    = useState('')
  const [os,          setOs]          = useState('Linux')
  const [plugins,     setPlugins]     = useState('')
  const [jobIds,      setJobIds]      = useState('')
  const [category,    setCategory]    = useState('')
  const [files,       setFiles]       = useState<File[]>([])
  const [submitted,   setSubmitted]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !description || !priority) return
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="support-wrapper">
        <div className="support-card">
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl support-success-icon">✓</div>
            <h2 className="text-xl font-semibold text-gray-800">Request submitted</h2>
            <p className="text-sm text-gray-500 max-w-sm">
              Thank you! A member of our support staff will respond as soon as possible.
              You will receive a confirmation at <span className="text-gray-700 font-medium">{email}</span>.
            </p>
            <button type="button" onClick={() => setSubmitted(false)}
              className="mt-2 text-sm text-blue-600 hover:underline">
              Submit another request
            </button>
          </div>
        </div>
        <footer className="support-footer">Conductor Support</footer>
      </div>
    )
  }

  return (
    <div className="support-wrapper">
      <div className="support-card">
        {/* Conductor logo row */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="5" fill="#2d5f7f" />
              {SUNBURST_RAYS.map((ray, i) => (
                <line key={i} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2}
                  stroke="#2d5f7f" strokeWidth={ray.thick ? 2 : 1.2} strokeLinecap="round" />
              ))}
            </svg>
            <span className="font-semibold text-gray-700 tracking-wide uppercase text-sm">CONDUCTOR</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-blue-600">
            <a href="/documentation" className="hover:underline">Docs</a>
            <a href="#" className="hover:underline">Sign in</a>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-6">Submit a request</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

          <SupportField label="Your email address" id="supp-email">
            <input id="supp-email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="support-input" required />
          </SupportField>

          <SupportField label="Issue" id="supp-issue"
            hint="Please select the reason for your request">
            <select id="supp-issue" title="Issue type" value={issue}
              onChange={(e) => setIssue(e.target.value)} className="support-input support-select">
              {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </SupportField>

          <SupportField label="Description" id="supp-desc">
            {/* Toolbar */}
            <div className="support-toolbar" role="toolbar" aria-label="Text formatting">
              <ToolbarBtn label="T" title="Title" />
              <ToolbarBtn label="B" title="Bold" />
              <ToolbarBtn label="I" title="Italic" />
              <span className="w-px h-4 bg-gray-300 mx-0.5" />
              <ToolbarBtn label="≡" title="Bulleted list" />
              <ToolbarBtn label="⁼" title="Numbered list" />
              <span className="w-px h-4 bg-gray-300 mx-0.5" />
              <ToolbarBtn label="🖼" title="Image" />
              <ToolbarBtn label="🔗" title="Link" />
              <ToolbarBtn label="❝" title="Quote" />
            </div>
            <textarea id="supp-desc" rows={7} value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="support-input support-textarea" required
              aria-describedby="supp-desc-hint" />
            <p id="supp-desc-hint" className="text-xs text-blue-600">
              Please enter the details of your request. A member of our support staff will respond as soon as possible.
            </p>
          </SupportField>

          <SupportField label="Priority" id="supp-priority">
            <select id="supp-priority" title="Priority" value={priority}
              onChange={(e) => setPriority(e.target.value)} className="support-input support-select" required>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <p className="text-xs text-blue-600">
              Please use your best judgement when assigning Priority.
              Urgent = Work Stoppage &nbsp;High = Deadline is in danger &nbsp;
              Normal = Routine questions, Issues and bug reports &nbsp;Low = Feature requests, etc.
            </p>
          </SupportField>

          <SupportField label="Operating System" id="supp-os" optional
            hint="Let us know which operating system was used to when submitting the job.">
            <select id="supp-os" title="Operating System" value={os}
              onChange={(e) => setOs(e.target.value)} className="support-input support-select">
              <option value="Linux">Linux</option>
              <option value="Windows">Windows</option>
              <option value="macOS">macOS</option>
            </select>
          </SupportField>

          <SupportField label="Plug-ins" id="supp-plugins" optional>
            <textarea id="supp-plugins" rows={3} value={plugins}
              onChange={(e) => setPlugins(e.target.value)}
              className="support-input support-textarea"
              aria-describedby="plugins-hint" />
            <p id="plugins-hint" className="text-xs text-blue-600">
              Please include a list of supported plug-ins used in the related job submission.
            </p>
          </SupportField>

          <SupportField label="Related Job IDs" id="supp-jobids" optional>
            <input id="supp-jobids" type="text" value={jobIds}
              onChange={(e) => setJobIds(e.target.value)}
              placeholder="e.g. 00159, 00160"
              className="support-input"
              aria-describedby="jobids-hint" />
            <p id="jobids-hint" className="text-xs text-blue-600">
              Please specify the related Conductor job IDs and task IDs for this ticket.
              Leave empty if your issue isn&apos;t related to a specific rendering job or task.
            </p>
          </SupportField>

          <SupportField label="Category" id="supp-category" optional>
            <select id="supp-category" title="Category" value={category}
              onChange={(e) => setCategory(e.target.value)} className="support-input support-select">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </SupportField>

          <SupportField label="Attachments" id="supp-files" optional>
            <div
              role="button"
              tabIndex={0}
              className="support-dropzone"
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              aria-label="Upload attachments"
            >
              <span className="text-blue-600 hover:underline cursor-pointer">Add file</span>
              {' '}or drop files here
              {files.length > 0 && (
                <ul className="mt-2 flex flex-col gap-0.5">
                  {files.map((f, i) => (
                    <li key={i} className="text-xs text-gray-500">{f.name} ({(f.size / 1024).toFixed(0)} KB)</li>
                  ))}
                </ul>
              )}
            </div>
            <input ref={fileRef} type="file" multiple className="sr-only"
              onChange={handleFiles} tabIndex={-1} />
          </SupportField>

          <div className="pt-2">
            <button type="submit" className="support-submit-btn">Submit</button>
          </div>
        </form>
      </div>

      <footer className="support-footer">Conductor Support</footer>
    </div>
  )
}

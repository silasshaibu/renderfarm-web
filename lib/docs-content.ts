/**
 * Documentation content — all pages stored as structured data.
 * Used by /documentation (hub) and /documentation/[slug] (sub-pages).
 */

// ─── Block types ─────────────────────────────────────────────────────────────

export type Block =
  | { type: 'p';        text: string }
  | { type: 'ul';       items: string[] }
  | { type: 'ol';       items: string[] }
  | { type: 'code';     lang: string; code: string }
  | { type: 'table';    headers: string[]; rows: string[][] }
  | { type: 'note';     text: string }
  | { type: 'warning';  text: string }
  | { type: 'download'; label: string; href: string; note?: string }

export interface DocSection {
  id:      string      // anchor id, e.g. "frame-spec-syntax"
  heading: string
  level:   2 | 3
  blocks:  Block[]
}

export interface DocPage {
  slug:       string
  title:      string
  icon:       string   // emoji or icon name
  intro?:     string
  beta?:      boolean
  liveData?:  boolean  // true → page fetches live API data
  sections:   DocSection[]
}

// ─── All pages ────────────────────────────────────────────────────────────────

const gettingStarted: DocPage = {
  slug:  'getting-started',
  title: 'Getting Started',
  icon:  '🚀',
  intro: 'Set up your account and submit your first render job in minutes.',
  sections: [
    {
      id: 'create-account', heading: 'Create Your Account', level: 2,
      blocks: [
        { type: 'ol', items: [
          'Go to renderfarm.swade-art.com',
          'Click Sign Up in the top right',
          'Enter your email address and create a secure password',
          'Check your inbox and click the verification link',
          'You will be taken to your dashboard automatically',
        ]},
        { type: 'note', text: 'If your studio has an account, ask your admin to invite you instead. You will receive an invitation email with a set-password link.' },
      ],
    },
    {
      id: 'install-addon', heading: 'Install the Blender Addon', level: 2,
      blocks: [
        { type: 'p', text: 'The Blender addon is the primary way to submit render jobs directly from Blender without leaving your DCC application.' },
        { type: 'ol', items: [
          'Download the latest addon .zip from the Blender Submitter page (see documentation/blender-submitter)',
          'In Blender, go to Edit → Preferences → Add-ons',
          'Click Install… and browse to the downloaded .zip file',
          'Enable the addon by checking the checkbox next to "Renderfarm Submitter"',
          'The Renderfarm panel will appear in Properties → Render',
        ]},
        { type: 'note', text: 'Restart Blender after installing the addon to ensure all features are fully loaded.' },
      ],
    },
    {
      id: 'connect-submit', heading: 'Connect & Submit Your First Job', level: 2,
      blocks: [
        { type: 'ol', items: [
          'In Blender, go to Properties → Render and expand the Renderfarm Render Submitter panel',
          'Click Connect and enter your renderfarm.swade-art.com credentials',
          'Your projects and available machine types will load automatically',
          'Open your scene and configure your render settings as normal',
          'In the Renderfarm panel, set your frame range, machine type, and chunk size',
          'Click Submit — your job will appear on the dashboard within seconds',
        ]},
        { type: 'p', text: 'After submission, your scene files are automatically uploaded to the farm. You can monitor progress in real time at renderfarm.swade-art.com/jobs.' },
      ],
    },
    {
      id: 'download-results', heading: 'Download Results', level: 2,
      blocks: [
        { type: 'p', text: 'When your job completes, rendered frames are available for download directly from the job detail page.' },
        { type: 'ol', items: [
          'Go to Jobs and click on your completed job',
          'Click the Download button to download all frames as a .zip file',
          'Individual frame links are also available in the task list',
          'Optionally use the Companion App for a GUI download experience',
        ]},
      ],
    },
  ],
}

const blenderSubmitter: DocPage = {
  slug:  'blender-submitter',
  title: 'Blender Submitter',
  icon:  '🎨',
  intro: 'Boost your Blender projects with the speed and efficiency of cloud rendering.',
  sections: [
    {
      id: 'installation', heading: 'Installation', level: 2,
      blocks: [
        { type: 'download', label: 'Download Latest Addon', href: '/documentation/blender-submitter', note: 'renderfarm_submitter_v7.zip' },
        { type: 'ol', items: [
          'Download the .zip file above (do not extract it)',
          'In Blender: Edit → Preferences → Add-ons → Install…',
          'Browse to the downloaded .zip and click Install Add-on',
          'Find "Renderfarm Submitter" in the list and enable it',
          'Restart Blender if prompted',
        ]},
        { type: 'note', text: 'The addon is compatible with Blender 3.x and 4.x. Older versions may work but are not officially supported.' },
      ],
    },
    {
      id: 'panel-overview', heading: 'Panel Overview', level: 2,
      blocks: [
        { type: 'p', text: 'After installation, the Renderfarm Render Submitter panel appears in Properties → Render. It is divided into the following sections:' },
        { type: 'ul', items: [
          'Conductor Job — title, project selection, submit button',
          'General Configuration — machine type, preemptible toggle, retry count',
          'Render Settings — output path, format, camera override',
          'Frames — frame range, chunk size, scout frames, tiled rendering',
          'Add-ons — additional Blender add-ons to activate on the render node',
          'Advanced — environment variables, upload paths, custom metadata',
        ]},
      ],
    },
    {
      id: 'connecting', heading: 'Connecting to the Farm', level: 2,
      blocks: [
        { type: 'p', text: 'Click the Connect button in the Conductor Job section.' },
        { type: 'ol', items: [
          'A login form appears — enter your renderfarm.swade-art.com email and password',
          'Click Connect to authenticate',
          'Your available projects will populate the Project dropdown',
          'Available machine types will populate the Machine Type dropdown',
        ]},
        { type: 'note', text: 'Your session token is stored locally in Blender so you only need to connect once. Click Disconnect to log out.' },
      ],
    },
    {
      id: 'submitting', heading: 'Submitting a Job', level: 2,
      blocks: [
        { type: 'ol', items: [
          'Set your Blender render settings (engine, resolution, samples, output format)',
          'In the Renderfarm panel, select your Project',
          'Choose a Machine Type appropriate for your scene',
          'Set your frame range (or use Blender\'s scene range)',
          'Set chunk size (frames per task — 1 for maximum parallelism)',
          'Optionally set scout frames to preview a few frames first',
          'Click Submit — your .blend file and all assets are uploaded automatically',
        ]},
        { type: 'warning', text: 'Make sure your output path is set to a local directory. The farm will write outputs to the configured path on GCS. Relative paths like //renders/ work correctly.' },
      ],
    },
    {
      id: 'frame-spec', heading: 'Frame Spec Syntax', level: 2,
      blocks: [
        { type: 'p', text: 'The frame range field accepts a powerful syntax for describing which frames to render:' },
        {
          type: 'table',
          headers: ['Spec', 'Description', 'Example'],
          rows: [
            ['1-100',      'All frames from 1 to 100',             '1, 2, 3 … 100'],
            ['1-100x2',    'Every 2nd frame',                      '1, 3, 5 … 99'],
            ['1-100x10',   'Every 10th frame',                     '1, 11, 21 … 91'],
            ['1,50,100',   'Specific frames',                      '1, 50, 100'],
            ['fml:3',      'First, middle, last — N samples',      '1, 50, 100 (of 1-100)'],
            ['fml:5',      'Five evenly spread frames',            '1, 25, 50, 75, 100'],
            ['auto:3',     'Automatic split into N tasks',         '3 evenly sized chunks'],
            ['1-10,50-60', 'Multiple ranges',                      '1–10 and 50–60'],
          ],
        },
        { type: 'note', text: 'fml:N (first-middle-last) is ideal for scout frames — use it to quickly preview your scene before committing to a full render.' },
      ],
    },
    {
      id: 'scout-frames', heading: 'Scout Frames', level: 2,
      blocks: [
        { type: 'p', text: 'Scout frames let you render a small preview set first. All remaining tasks are held on the farm until you approve the scouts from the dashboard.' },
        { type: 'p', text: 'To use scout frames:' },
        { type: 'ol', items: [
          'Enable the "Use Scout Frames" toggle in the Frames section',
          'Enter a frame spec like fml:3 to render first/middle/last',
          'Submit the job — scouts render immediately, other tasks are held (Waiting)',
          'Review the scout outputs on the job detail page',
          'Click "Release All Tasks" to start the full render, or Cancel to abort',
        ]},
        { type: 'warning', text: 'Chunk size interacts with scout frames. If chunk size is 10 and you use fml:3, the scout spec selects individual frames — you will still get 3 tasks each rendering one frame, regardless of chunk size. The chunk size applies to non-scout tasks.' },
      ],
    },
    {
      id: 'troubleshooting', heading: 'Troubleshooting', level: 2,
      blocks: [
        {
          type: 'table',
          headers: ['Problem', 'Likely Cause', 'Fix'],
          rows: [
            ['Cannot connect', 'Wrong credentials or session expired', 'Click Disconnect then Connect again'],
            ['No machine types listed', 'No machines enabled in Enterprise settings', 'Admin: go to Enterprise → Studio Management → Available Instances'],
            ['Job stuck in "Syncing"', 'Large scene file or slow upload', 'Wait for upload to complete; check network connection'],
            ['Render output is blank', 'Wrong output path or missing camera', 'Set output path to //renders/ and verify camera is set'],
            ['Missing textures on farm', 'Textures not packed or not in upload paths', 'File → External Data → Pack Resources, then resubmit'],
            ['Auth token expired mid-session', 'Session timed out', 'Disconnect and reconnect in the addon panel'],
          ],
        },
      ],
    },
  ],
}

const virtualWranglerDoc: DocPage = {
  slug:  'virtual-wrangler',
  title: 'Virtual Wrangler',
  icon:  '🤖',
  beta:  true,
  intro: 'Configure the automated render wrangler to look after your jobs.',
  sections: [
    {
      id: 'overview', heading: 'Overview', level: 2,
      blocks: [
        { type: 'p', text: 'Virtual Wrangler is an automated background service that monitors your render farm and takes corrective action based on rules you define. It runs every 5 minutes and applies each enabled wrangler policy to your active jobs and tasks.' },
        { type: 'p', text: 'All wrangler settings apply account-wide and affect every job in the account. You can configure each wrangler independently and enable or disable them at any time from the Virtual Wrangler page.' },
        { type: 'note', text: 'Virtual Wrangler is a BETA feature. Settings take effect within 5 minutes of saving.' },
      ],
    },
    {
      id: 'max-runtime', heading: 'MaxTask Runtime Wrangler', level: 2,
      blocks: [
        { type: 'p', text: 'Automatically kills or retries tasks that exceed a maximum runtime you define. Useful for catching stuck or runaway render tasks that would otherwise waste compute budget.' },
        { type: 'ul', items: [
          'Max Runtime — the maximum number of hours a single task may run',
          'Kill — mark the task as failed and stop it immediately',
          'Retry — requeue the task so it starts fresh on another machine',
          'Notify — log the event without taking action on the task',
        ]},
        { type: 'note', text: 'Minimum max runtime is 1 hour. Short scenes with heavy shaders can occasionally exceed 1 hour on slower machines — set the limit conservatively.' },
      ],
    },
    {
      id: 'relocation', heading: 'Zone Relocation Wrangler', level: 2,
      blocks: [
        { type: 'p', text: 'Moves queued jobs to a different GCP zone when they have been waiting too long for resources. This handles zone-level resource exhaustion automatically.' },
        { type: 'ul', items: [
          'Max Wait Time — how many minutes a job may stay queued before relocation (minimum 90)',
          'Priority Threshold — only jobs at or above this priority level are managed',
        ]},
      ],
    },
    {
      id: 'spot-to-ondemand', heading: 'Spot To On-Demand Wrangler', level: 2,
      blocks: [
        { type: 'p', text: 'When preemptible (spot) instances are unavailable and your jobs remain pending, this wrangler automatically switches them to standard on-demand instances. This trades cost savings for faster resource placement.' },
        { type: 'ul', items: [
          'Wait Time — how long to wait for a spot instance before switching (minutes)',
          'Priority Threshold — only high-priority jobs are switched to on-demand',
        ]},
      ],
    },
    {
      id: 'syncer', heading: 'Syncer Wrangler', level: 2,
      blocks: [
        { type: 'p', text: 'Manages file synchronization failures. When a sync operation fails (e.g. a scene file upload stalls), the Syncer Wrangler applies your configured retry or fail policy.' },
        { type: 'ul', items: [
          'Max Retries — maximum retry attempts before falling back to the configured action',
          'Sync Timeout — how long to wait for a sync before marking it as failed',
          'Retry — requeue the task for another sync attempt',
          'Fail Task — mark the task as failed after all retries are exhausted',
          'Alert + Retry — log a notification and also retry the task',
        ]},
      ],
    },
  ],
}

const supportedSoftware: DocPage = {
  slug:      'supported-software',
  title:     'Supported Software',
  icon:      '📋',
  liveData:  true,
  intro:     'Find out what renderers and Blender versions are available on the farm.',
  sections: [
    {
      id: 'blender-versions', heading: 'Blender Versions', level: 2,
      blocks: [
        { type: 'note', text: 'The table below is populated from the farm\'s live package list.' },
        // Live data injected by the sub-page component
      ],
    },
    {
      id: 'render-engines', heading: 'Render Engines', level: 2,
      blocks: [
        { type: 'p', text: 'The following render engines are supported. All engines bundled with Blender are available on every instance type. Third-party engines require a compatible GPU.' },
        {
          type: 'table',
          headers: ['Engine', 'Bundled?', 'GPU Required?', 'Notes'],
          rows: [
            ['Cycles',   'Yes', 'No (GPU optional)', 'CUDA, OptiX, and HIP acceleration supported'],
            ['EEVEE',    'Yes', 'No',                'Real-time render engine, ideal for animation previews'],
            ['EEVEE Next','Yes','No',                'Available in Blender 4.2+; improved PBR shading'],
            ['Redshift',  'No', 'Yes',               'Available where licensed; contact support'],
          ],
        },
      ],
    },
    {
      id: 'instance-types', heading: 'Instance Types', level: 2,
      blocks: [
        { type: 'note', text: 'The table below is populated from the farm\'s live instance catalogue.' },
        // Live data injected by the sub-page component
      ],
    },
  ],
}

const faq: DocPage = {
  slug:  'faq',
  title: 'FAQ',
  icon:  '❓',
  intro: 'Get answers to frequently asked questions about the render farm.',
  sections: [
    {
      id: 'billing', heading: 'Billing', level: 2,
      blocks: [],
    },
    {
      id: 'how-charged', heading: 'How am I charged?', level: 3,
      blocks: [
        { type: 'p', text: 'You are charged per core-hour of compute time consumed by your render tasks. GPU instances are billed at a higher rate that includes the GPU. Charges accumulate in real time and appear in Admin → Payment Information after each billing period.' },
        { type: 'p', text: 'Preemptible (spot) instances cost significantly less than on-demand instances but can be interrupted by the cloud provider. The Virtual Wrangler\'s Spot→On-Demand feature can automatically upgrade interrupted tasks.' },
      ],
    },
    {
      id: 'spot-instances', heading: 'What are spot instances?', level: 3,
      blocks: [
        { type: 'p', text: 'Spot instances (also called preemptible instances) use spare cloud capacity at a lower cost — typically 60–80% cheaper than on-demand instances. The cloud provider can reclaim them at any time with a short notice window.' },
        { type: 'p', text: 'For non-urgent renders, spot instances are ideal. For deadline-critical work, use on-demand instances or enable the Spot→On-Demand Virtual Wrangler to automatically fall back.' },
      ],
    },
    {
      id: 'preemption', heading: 'What happens if my job is preempted?', level: 3,
      blocks: [
        { type: 'p', text: 'If a preemptible instance is reclaimed, the in-progress task is interrupted. The farm will retry the task on another available instance based on the Preemptible Retries setting in the submitter.' },
        { type: 'p', text: 'Completed frames are not affected — only the frame currently being rendered restarts from the beginning.' },
      ],
    },
    {
      id: 'jobs-rendering', heading: 'Jobs & Rendering', level: 2,
      blocks: [],
    },
    {
      id: 'job-syncing', heading: 'Why is my job stuck in "syncing"?', level: 3,
      blocks: [
        { type: 'p', text: 'The syncing state means your scene files are being uploaded to the farm. Large .blend files with packed textures can take several minutes. The progress bar on the job detail page shows upload progress.' },
        { type: 'p', text: 'If sync appears to stall for more than 15 minutes, check your network connection and try resubmitting. The Syncer Virtual Wrangler can be configured to automatically retry failed syncs.' },
      ],
    },
    {
      id: 'chunk-size', heading: 'What is a chunk size?', level: 3,
      blocks: [
        { type: 'p', text: 'Chunk size is the number of consecutive frames assigned to a single cloud machine in one task. A chunk size of 1 gives maximum parallelism — every frame renders on its own machine simultaneously. Higher chunk sizes reduce the number of tasks but also reduce parallelism.' },
        { type: 'table',
          headers: ['Chunk Size', 'Frames per Machine', 'Best For'],
          rows: [
            ['1',   '1 frame',    'Maximum speed, complex individual frames'],
            ['5',   '5 frames',   'Short animations with moderate complexity'],
            ['10',  '10 frames',  'Simple scenes, cost-efficient'],
            ['20',  '20 frames',  'Very fast renders, minimize overhead'],
          ],
        },
      ],
    },
    {
      id: 'scout-frames-faq', heading: 'What are scout frames?', level: 3,
      blocks: [
        { type: 'p', text: 'Scout frames are a preview subset of your job that renders first. All other tasks are held until you review the scouts and approve them. This lets you catch render errors, lighting issues, or shader problems before committing to a full render.' },
        { type: 'p', text: 'Use fml:3 to render the first, middle, and last frame automatically. This is the most common scout spec.' },
      ],
    },
    {
      id: 'account-faq', heading: 'Account', level: 2,
      blocks: [],
    },
    {
      id: 'add-users', heading: 'How do I add users to my account?', level: 3,
      blocks: [
        { type: 'ol', items: [
          'Log in with an admin account',
          'Go to Admin → Users',
          'Click Add User',
          'Enter the new user\'s email address',
          'Click Add User — an invitation email is sent automatically',
          'The invited user clicks the link in the email to set their password',
        ]},
      ],
    },
    {
      id: 'spending-limit', heading: 'How do I set a spending limit?', level: 3,
      blocks: [
        { type: 'ol', items: [
          'Go to Admin → Cost Limits',
          'Click Create New Limit',
          'Choose the entity (account, project, or user)',
          'Set a dollar amount',
          'Choose an action: Send Email (notify only) or Hold Tasks (pause the job)',
          'Click Save',
        ]},
        { type: 'note', text: 'Cost limits apply in real time. When a limit is reached, the configured action triggers immediately.' },
      ],
    },
  ],
}

const companionApp: DocPage = {
  slug:  'companion-app',
  title: 'Companion App',
  icon:  '🖥️',
  intro: 'A GUI downloader and submission kit for managing renders on your desktop.',
  sections: [
    {
      id: 'overview', heading: 'Overview', level: 2,
      blocks: [
        { type: 'p', text: 'The Companion App is a desktop application that provides a graphical interface for downloading your rendered outputs from the farm and managing file synchronization locally.' },
        { type: 'ul', items: [
          'GUI file downloader — browse and download rendered frames by job',
          'Submission kit — submit jobs from a desktop UI without opening Blender',
          'Local sync management — track which files have been downloaded',
        ]},
      ],
    },
    {
      id: 'download', heading: 'Download', level: 2,
      blocks: [
        { type: 'download', label: 'Download Companion App', href: '#', note: 'Coming soon — check back for the installer.' },
        { type: 'note', text: 'The Companion App will be available for macOS and Windows. Linux support is planned.' },
      ],
    },
    {
      id: 'features', heading: 'Features', level: 2,
      blocks: [
        {
          type: 'table',
          headers: ['Feature', 'Description'],
          rows: [
            ['Job Browser',        'Browse all your jobs and their output frames from a desktop window'],
            ['Batch Download',     'Download all frames from a completed job with one click'],
            ['Partial Download',   'Select individual frames or frame ranges to download'],
            ['Download Queue',     'Queue multiple jobs for sequential downloading'],
            ['Auto-Sync',         'Automatically download frames as they complete'],
          ],
        },
      ],
    },
  ],
}

const apiReference: DocPage = {
  slug:  'api',
  title: 'API Reference',
  icon:  '⚡',
  intro: 'Integrate your pipeline using the REST API.',
  sections: [
    {
      id: 'authentication', heading: 'Authentication', level: 2,
      blocks: [
        { type: 'p', text: 'All API requests require a session token. Obtain one by logging in:' },
        { type: 'code', lang: 'http', code: 'POST /api/auth/login\nContent-Type: application/json\n\n{\n  "email": "user@example.com",\n  "password": "your-password"\n}' },
        { type: 'p', text: 'The response contains your access_token. Include it in subsequent requests:' },
        { type: 'code', lang: 'http', code: 'Authorization: Bearer <your_access_token>' },
      ],
    },
    {
      id: 'endpoints', heading: 'Endpoints', level: 2,
      blocks: [],
    },
    {
      id: 'jobs-api', heading: 'Jobs', level: 3,
      blocks: [
        {
          type: 'table',
          headers: ['Method', 'Path', 'Description'],
          rows: [
            ['GET',    '/api/jobs',          'List all jobs for your account'],
            ['GET',    '/api/jobs/{id}',      'Get detailed information about a single job'],
            ['POST',   '/api/jobs',           'Submit a new render job'],
            ['PATCH',  '/api/jobs/{id}',      'Update a job — hold, unhold, cancel, or update priority'],
            ['DELETE', '/api/jobs/{id}',      'Delete a completed or cancelled job'],
          ],
        },
      ],
    },
    {
      id: 'projects-api', heading: 'Projects', level: 3,
      blocks: [
        {
          type: 'table',
          headers: ['Method', 'Path', 'Description'],
          rows: [
            ['GET',   '/api/projects',       'List all active projects'],
            ['POST',  '/api/projects',       'Create a new project'],
            ['PATCH', '/api/projects/{id}',  'Archive or restore a project'],
          ],
        },
      ],
    },
    {
      id: 'instances-api', heading: 'Instances', level: 3,
      blocks: [
        {
          type: 'table',
          headers: ['Method', 'Path', 'Description'],
          rows: [
            ['GET', '/api/enterprise/instances', 'List available instance types (enabled ones only for non-admins)'],
          ],
        },
      ],
    },
    {
      id: 'packages-api', heading: 'Packages', level: 3,
      blocks: [
        {
          type: 'table',
          headers: ['Method', 'Path', 'Description'],
          rows: [
            ['GET', '/api/packages', 'List available software packages (Blender versions)'],
          ],
        },
      ],
    },
    {
      id: 'uploads-api', heading: 'Uploads', level: 3,
      blocks: [
        {
          type: 'table',
          headers: ['Method', 'Path', 'Description'],
          rows: [
            ['POST', '/api/uploads/md5',  'Check if a file already exists by MD5 hash (deduplication)'],
            ['POST', '/api/uploads/file', 'Upload a scene file or asset to the farm storage'],
          ],
        },
      ],
    },
    {
      id: 'billing-api', heading: 'Billing', level: 3,
      blocks: [
        {
          type: 'table',
          headers: ['Method', 'Path', 'Description'],
          rows: [
            ['GET', '/api/billing/current-period',  'Current billing period usage and cost'],
            ['GET', '/api/billing/transactions',     'Full payment transaction history'],
          ],
        },
      ],
    },
    {
      id: 'job-payload', heading: 'Job Submission Payload', level: 2,
      blocks: [
        { type: 'p', text: 'When submitting a job via POST /api/jobs, send the following JSON body:' },
        {
          type: 'code',
          lang: 'json',
          code: `{
  "job_title":       "string  — display name for the job",
  "project":         "string  — project name from /api/projects",
  "instance_type":   "string  — instance id from /api/enterprise/instances",
  "preemptible":     "boolean — use spot/preemptible instances",
  "preemptible_retries": "integer — how many times to retry a preempted task",
  "chunk_size":      "integer — frames per task",
  "frame_range":     "string  — e.g. \\"1-100\\" or \\"fml:3\\"",
  "scout_frames":    "string  — scout frame spec, or empty string",
  "blender_version": "string  — e.g. \\"blender-4-1\\"",
  "render_software": "string  — e.g. \\"cycles\\"",
  "output_path":     "string  — GCS output path",
  "upload_paths":    ["array", "of", "local", "file", "paths"],
  "environment_variables": {
    "MY_VAR": "value"
  }
}`,
        },
      ],
    },
  ],
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const ALL_DOCS: Record<string, DocPage> = {
  'getting-started':    gettingStarted,
  'blender-submitter':  blenderSubmitter,
  'virtual-wrangler':   virtualWranglerDoc,
  'supported-software': supportedSoftware,
  'faq':                faq,
  'companion-app':      companionApp,
  'api':                apiReference,
}

export const DOC_ORDER = [
  'getting-started',
  'blender-submitter',
  'virtual-wrangler',
  'supported-software',
  'faq',
  'companion-app',
  'api',
]

// ─── Sidebar navigation tree ─────────────────────────────────────────────────

export interface SidebarEntry {
  slug:     string
  label:    string
  beta?:    boolean
  children: { id: string; label: string }[]
}

export const SIDEBAR_TREE: SidebarEntry[] = DOC_ORDER.map(slug => {
  const doc = ALL_DOCS[slug]
  return {
    slug,
    label: doc.title,
    beta:  doc.beta,
    children: doc.sections
      .filter(s => s.level === 2)
      .map(s => ({ id: s.id, label: s.heading })),
  }
})

// ─── Search index ─────────────────────────────────────────────────────────────

export interface SearchEntry {
  slug:    string
  title:   string
  sectionId:      string
  sectionHeading: string
  text:    string
}

function blocksToText(blocks: Block[]): string {
  return blocks.map(b => {
    switch (b.type) {
      case 'p':        return b.text
      case 'ul':       return b.items.join(' ')
      case 'ol':       return b.items.join(' ')
      case 'note':     return b.text
      case 'warning':  return b.text
      case 'code':     return b.code
      case 'table':    return [...b.headers, ...b.rows.flat()].join(' ')
      case 'download': return b.label + ' ' + (b.note ?? '')
      default:         return ''
    }
  }).join(' ')
}

export const SEARCH_INDEX: SearchEntry[] = DOC_ORDER.flatMap(slug => {
  const doc = ALL_DOCS[slug]
  return doc.sections
    .filter(s => s.blocks.length > 0)
    .map(s => ({
      slug,
      title:          doc.title,
      sectionId:      s.id,
      sectionHeading: s.heading,
      text:           blocksToText(s.blocks).toLowerCase(),
    }))
})

// ─── Quick link card definitions ──────────────────────────────────────────────

export const QUICK_CARDS = [
  {
    slug:  'blender-submitter',
    title: 'Blender Submitter',
    desc:  'Boost your Blender projects with the speed and efficiency of cloud rendering.',
    icon:  'blender',
  },
  {
    slug:  'virtual-wrangler',
    title: 'Virtual Wrangler',
    desc:  'Configure the automated render wrangler to look after your jobs.',
    icon:  'robot',
  },
  {
    slug:  'getting-started',
    title: 'Getting Started',
    desc:  'Set up your account and submit your first render job in minutes.',
    icon:  'rocket',
  },
  {
    slug:  'companion-app',
    title: 'Companion App',
    desc:  'Includes a GUI downloader and submission kit.',
    icon:  'desktop',
  },
  {
    slug:  'supported-software',
    title: 'Supported Software',
    desc:  'Find out what renderers and Blender versions are available on the farm.',
    icon:  'list',
  },
  {
    slug:  'faq',
    title: 'FAQ',
    desc:  'Get answers to frequently asked questions about the render farm.',
    icon:  'question',
  },
  {
    slug:  'api',
    title: 'API Reference',
    desc:  'Integrate your pipeline using the REST API.',
    icon:  'code',
  },
]

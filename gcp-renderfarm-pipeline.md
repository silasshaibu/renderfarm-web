# GCP Render Farm Pipeline — Next.js / TypeScript
# Complete implementation for your Conductor-like app

---

## 1. INSTALL DEPENDENCIES

```bash
npm install @google-cloud/compute @google-cloud/storage google-auth-library
npm install --save-dev @types/node
```

---

## 2. GCP SETUP (One-Time — Do This in GCP Console)

### Step A — Enable APIs
Go to: https://console.cloud.google.com/apis/library
Enable both:
- ✅ Compute Engine API
- ✅ Cloud Storage API

### Step B — Create Service Account
```
GCP Console → IAM & Admin → Service Accounts → Create Service Account

Name: renderfarm-backend
Roles to assign:
  - Compute Admin
  - Storage Admin  
  - Service Account User
  - Compute Instance Admin (v1)

Then: Keys tab → Add Key → JSON → Download
```

### Step C — Create GCS Bucket
```
GCP Console → Cloud Storage → Create Bucket

Name: your-renderfarm-bucket  (must be globally unique)
Region: us-central1 (or closest to you)
Storage class: Standard
Access control: Uniform
```

### Step D — Create your Custom Render VM Image (One-Time)
```bash
# 1. Spin up a base VM in GCP Console (Debian 11)
# 2. SSH into it and install your render software:

sudo apt-get update
sudo apt-get install -y blender  # or your renderer of choice
sudo apt-get install -y gcsfuse  # for mounting GCS bucket

# 3. Back in GCP Console:
# Compute Engine → VM Instances → Stop the VM
# Compute Engine → Images → Create Image
# Source: the disk of your VM
# Name: render-node-v1
# Save it — every future render VM clones from this image instantly
```

### Step E — Add env vars to your .env.local

```env
GCP_PROJECT_ID=your-project-id
GCP_ZONE=us-central1-a
GCP_BUCKET_NAME=your-renderfarm-bucket
GCP_RENDER_IMAGE=projects/your-project-id/global/images/render-node-v1
GCP_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}  # paste entire JSON as one line
```

---

## 3. GCP CLIENT SETUP

### lib/gcp/clients.ts
```typescript
import { InstancesClient } from '@google-cloud/compute';
import { Storage } from '@google-cloud/storage';

// Parse service account key from env (stored as JSON string in Vercel env vars)
const credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY!);

// Compute Engine client — for spinning up/down VMs
export const computeClient = new InstancesClient({ credentials });

// Cloud Storage client — for uploading scene files + downloading renders
export const storageClient = new Storage({ credentials });

export const GCP_PROJECT  = process.env.GCP_PROJECT_ID!;
export const GCP_ZONE     = process.env.GCP_ZONE!;
export const GCP_BUCKET   = process.env.GCP_BUCKET_NAME!;
export const RENDER_IMAGE = process.env.GCP_RENDER_IMAGE!;
```

---

## 4. STORAGE — Upload Scene Files to GCS

### lib/gcp/storage.ts
```typescript
import { storageClient, GCP_BUCKET } from './clients';
import { createReadStream, readdirSync, statSync } from 'fs';
import path from 'path';

/**
 * Upload a file to GCS under jobs/{jobId}/
 * Returns the GCS path
 */
export async function uploadFile(
  localPath: string,
  jobId: string
): Promise<string> {
  const bucket   = storageClient.bucket(GCP_BUCKET);
  const filename = path.basename(localPath);
  const gcsPath  = `jobs/${jobId}/${filename}`;
  const blob     = bucket.file(gcsPath);

  await blob.save(createReadStream(localPath), {
    metadata: { contentType: 'application/octet-stream' },
    resumable: false,
  });

  console.log(`✅ Uploaded: ${filename} → gs://${GCP_BUCKET}/${gcsPath}`);
  return gcsPath;
}

/**
 * Upload an entire folder (scene + all textures/assets)
 */
export async function uploadJobAssets(
  localFolder: string,
  jobId: string
): Promise<string[]> {
  const files   = readdirSync(localFolder);
  const uploads = files
    .filter(f => statSync(path.join(localFolder, f)).isFile())
    .map(f => uploadFile(path.join(localFolder, f), jobId));

  return Promise.all(uploads);
}

/**
 * List all rendered output files for a completed job
 */
export async function listOutputFiles(jobId: string): Promise<string[]> {
  const [files] = await storageClient.bucket(GCP_BUCKET).getFiles({
    prefix: `output/${jobId}/`,
  });
  return files.map(f => f.name);
}

/**
 * Generate signed download URLs so your frontend can download renders
 */
export async function getDownloadUrls(jobId: string): Promise<string[]> {
  const files = await listOutputFiles(jobId);
  const urls  = await Promise.all(
    files.map(async (filePath) => {
      const [url] = await storageClient
        .bucket(GCP_BUCKET)
        .file(filePath)
        .getSignedUrl({
          action : 'read',
          expires: Date.now() + 1000 * 60 * 60, // 1 hour
        });
      return url;
    })
  );
  return urls;
}
```

---

## 5. COMPUTE — Spin Up Render VMs

### lib/gcp/compute.ts
```typescript
import { computeClient, GCP_PROJECT, GCP_ZONE, RENDER_IMAGE, GCP_BUCKET } from './clients';

export interface RenderTaskConfig {
  jobId      : string;
  frameNumber: number;
  sceneFile  : string;   // GCS path e.g. jobs/abc123/scene.blend
  renderer   : 'blender' | 'cycles' | 'arnold';
  machineType: string;   // e.g. 'n1-standard-4'
  preemptible: boolean;
  retries    : number;
}

/**
 * Build the startup script that runs inside the VM.
 * This is the equivalent of Conductor's task template.
 * VM boots → mounts GCS → runs render → writes output → shuts itself down.
 */
function buildStartupScript(config: RenderTaskConfig): string {
  const { jobId, frameNumber, sceneFile, renderer } = config;

  const renderCommand = buildRenderCommand(renderer, jobId, frameNumber, sceneFile);

  return `#!/bin/bash
set -e

# ── 1. Mount GCS bucket as a local filesystem ──────────────────────────────
mkdir -p /mnt/render
gcsfuse --implicit-dirs ${GCP_BUCKET} /mnt/render
echo "✅ GCS bucket mounted at /mnt/render"

# ── 2. Create output directory ─────────────────────────────────────────────
mkdir -p /mnt/render/output/${jobId}

# ── 3. Run the render ──────────────────────────────────────────────────────
echo "🎬 Starting render: job=${jobId} frame=${frameNumber}"
${renderCommand}
echo "✅ Render complete: frame ${frameNumber}"

# ── 4. Signal completion back to your API ─────────────────────────────────
# POST to your Next.js API so your DB gets updated immediately
curl -s -X POST https://your-app.vercel.app/api/jobs/task-complete \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${process.env.INTERNAL_API_SECRET}" \\
  -d '{"jobId":"${jobId}","frame":${frameNumber},"status":"complete"}'

# ── 5. Self-delete this VM (stops billing immediately) ─────────────────────
INSTANCE_NAME=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/name" -H "Metadata-Flavor: Google")
ZONE=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/zone" -H "Metadata-Flavor: Google" | awk -F/ '{print $NF}')
gcloud compute instances delete "$INSTANCE_NAME" --zone="$ZONE" --quiet
`;
}

/**
 * Build the renderer-specific command
 */
function buildRenderCommand(
  renderer  : string,
  jobId     : string,
  frame     : number,
  sceneFile : string
): string {
  const outputPath = `/mnt/render/output/${jobId}/frame_`;

  switch (renderer) {
    case 'blender':
      return `blender -b /mnt/render/${sceneFile} -f ${frame} -o "${outputPath}####" -F EXR`;
    case 'cycles':
      return `blender -b /mnt/render/${sceneFile} -f ${frame} -o "${outputPath}####" -F EXR -- --cycles-device CPU`;
    case 'arnold':
      return `kick -i /mnt/render/${sceneFile} -frame ${frame} -o "${outputPath}${frame}.exr"`;
    default:
      throw new Error(`Unknown renderer: ${renderer}`);
  }
}

/**
 * Spin up ONE VM for ONE frame task.
 * Call this in parallel for each frame to achieve concurrent rendering.
 */
export async function spawnRenderVM(config: RenderTaskConfig): Promise<string> {
  const vmName       = `render-${config.jobId}-f${config.frameNumber}`.toLowerCase();
  const startupScript = buildStartupScript(config);

  const instanceResource = {
    name       : vmName,
    machineType: `zones/${GCP_ZONE}/machineTypes/${config.machineType}`,

    // Boot from your pre-baked image (has Blender/renderer pre-installed)
    disks: [{
      boot      : true,
      autoDelete: true,
      initializeParams: {
        sourceImage: RENDER_IMAGE,
        diskSizeGb : '50',
        diskType   : `zones/${GCP_ZONE}/diskTypes/pd-ssd`,
      },
    }],

    networkInterfaces: [{
      network: 'global/networks/default',
      accessConfigs: [{ type: 'ONE_TO_ONE_NAT', name: 'External NAT' }],
    }],

    // The startup script runs automatically when VM boots
    metadata: {
      items: [
        { key: 'startup-script', value: startupScript },
      ],
    },

    // Service account so the VM can call gcloud to self-delete
    serviceAccounts: [{
      email : `renderfarm-backend@${GCP_PROJECT}.iam.gserviceaccount.com`,
      scopes: [
        'https://www.googleapis.com/auth/compute',
        'https://www.googleapis.com/auth/devstorage.read_write',
      ],
    }],

    // Preemptible = cheaper but can be interrupted
    scheduling: {
      preemptible      : config.preemptible,
      onHostMaintenance: config.preemptible ? 'TERMINATE' : 'MIGRATE',
      automaticRestart : !config.preemptible,
    },

    labels: {
      'job-id'     : config.jobId,
      'frame'      : String(config.frameNumber),
      'managed-by' : 'renderfarm',
    },
  };

  const [operation] = await computeClient.insert({
    project         : GCP_PROJECT,
    zone            : GCP_ZONE,
    instanceResource,
  });

  console.log(`🚀 VM spawned: ${vmName} (operation: ${operation.name})`);
  return vmName;
}

/**
 * Spawn VMs for ALL frames in a job simultaneously (true parallelism)
 */
export async function spawnJobVMs(
  jobId      : string,
  frames     : number[],
  sceneFile  : string,
  renderer   : RenderTaskConfig['renderer'],
  machineType: string = 'n1-standard-4',
  preemptible: boolean = true
): Promise<string[]> {
  const vmNames = await Promise.all(
    frames.map(frame =>
      spawnRenderVM({
        jobId,
        frameNumber: frame,
        sceneFile,
        renderer,
        machineType,
        preemptible,
        retries: 1,
      })
    )
  );

  console.log(`🎬 Spawned ${vmNames.length} VMs for job ${jobId}`);
  return vmNames;
}

/**
 * Kill all VMs for a job (user clicked Kill in your dashboard)
 */
export async function killJobVMs(jobId: string): Promise<void> {
  const [instances] = await computeClient.list({
    project: GCP_PROJECT,
    zone   : GCP_ZONE,
    filter : `labels.job-id=${jobId}`,
  });

  await Promise.all(
    (instances ?? []).map(instance =>
      computeClient.delete({
        project : GCP_PROJECT,
        zone    : GCP_ZONE,
        instance: instance.name!,
      })
    )
  );

  console.log(`💀 Killed all VMs for job ${jobId}`);
}

/**
 * Get status of a single VM (for polling)
 */
export async function getVMStatus(vmName: string): Promise<string> {
  const [instance] = await computeClient.get({
    project : GCP_PROJECT,
    zone    : GCP_ZONE,
    instance: vmName,
  });
  return instance.status ?? 'UNKNOWN'; // RUNNING | TERMINATED | STAGING | STOPPING
}
```

---

## 6. NEXT.JS API ROUTES

### app/api/jobs/submit/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { uploadJobAssets } from '@/lib/gcp/storage';
import { spawnJobVMs } from '@/lib/gcp/compute';
import { createJob } from '@/lib/db';  // your DB layer
import { parseFrameRange } from '@/lib/utils';
import { writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

export async function POST(req: NextRequest) {
  try {
    const formData   = await req.formData();
    const sceneFile  = formData.get('sceneFile') as File;
    const frameSpec  = formData.get('frames') as string;       // e.g. "1-10"
    const renderer   = formData.get('renderer') as string;     // e.g. "blender"
    const machineType = formData.get('machineType') as string; // e.g. "n1-standard-4"
    const preemptible = formData.get('preemptible') === 'true';
    const jobTitle   = formData.get('jobTitle') as string;

    // ── 1. Create job record in your DB ───────────────────────────────────
    const jobId = crypto.randomUUID();
    await createJob({
      id        : jobId,
      title     : jobTitle,
      status    : 'uploading',
      frames    : frameSpec,
      renderer,
      machineType,
      preemptible,
      createdAt : new Date(),
    });

    // ── 2. Save uploaded file temporarily ─────────────────────────────────
    const tmpDir      = os.tmpdir();
    const tmpFilePath = path.join(tmpDir, sceneFile.name);
    const buffer      = Buffer.from(await sceneFile.arrayBuffer());
    await writeFile(tmpFilePath, buffer);

    // ── 3. Upload scene file to GCS ───────────────────────────────────────
    await uploadJobAssets(tmpDir, jobId);
    await updateJob(jobId, { status: 'pending' });

    // ── 4. Parse frame range and spawn VMs ────────────────────────────────
    const frames = parseFrameRange(frameSpec); // e.g. "1-10" → [1,2,3,4,5,6,7,8,9,10]

    // Scout frames — render frame 1 first, hold the rest
    const scoutFrame  = [frames[0]];
    const heldFrames  = frames.slice(1);

    // Spawn scout frame VM immediately
    await spawnJobVMs(
      jobId,
      scoutFrame,
      `jobs/${jobId}/${sceneFile.name}`,
      renderer as any,
      machineType,
      preemptible
    );

    // Store held frames in DB (not spawned yet — waiting for user to unhold)
    await updateJob(jobId, {
      status     : 'running',
      heldFrames : heldFrames,
    });

    return NextResponse.json({ jobId, status: 'running', message: 'Scout frame submitted' });

  } catch (error: any) {
    console.error('Submit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### app/api/jobs/task-complete/route.ts
```typescript
// Called by the VM's startup script when a frame finishes rendering
import { NextRequest, NextResponse } from 'next/server';
import { updateTask, getJob, updateJob } from '@/lib/db';

export async function POST(req: NextRequest) {
  // Verify internal secret so only your VMs can call this
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.INTERNAL_API_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId, frame, status } = await req.json();

  // ── Update task status in your DB ────────────────────────────────────────
  await updateTask(jobId, frame, status);

  // ── Check if ALL frames are done → mark job complete ─────────────────────
  const job = await getJob(jobId);
  const allDone = job.tasks.every((t: any) => t.status === 'complete');

  if (allDone) {
    await updateJob(jobId, { status: 'success' });
    console.log(`🎉 Job ${jobId} complete!`);
  }

  return NextResponse.json({ ok: true });
}
```

### app/api/jobs/[jobId]/hold/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { updateJob } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { jobId: string } }) {
  await updateJob(params.jobId, { status: 'holding' });
  // VMs already running will finish their current frame
  // New frames won't be spawned while status is 'holding'
  return NextResponse.json({ ok: true });
}
```

### app/api/jobs/[jobId]/kill/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { killJobVMs } from '@/lib/gcp/compute';
import { updateJob } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { jobId: string } }) {
  await killJobVMs(params.jobId);
  await updateJob(params.jobId, { status: 'killed' });
  return NextResponse.json({ ok: true });
}
```

### app/api/jobs/[jobId]/unhold/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { spawnJobVMs } from '@/lib/gcp/compute';
import { getJob, updateJob } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { jobId: string } }) {
  const job = await getJob(params.jobId);

  // Spawn VMs for all held frames
  await spawnJobVMs(
    params.jobId,
    job.heldFrames,
    job.sceneFile,
    job.renderer,
    job.machineType,
    job.preemptible
  );

  await updateJob(params.jobId, { status: 'running', heldFrames: [] });
  return NextResponse.json({ ok: true });
}
```

### app/api/jobs/[jobId]/download/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDownloadUrls } from '@/lib/gcp/storage';

export async function GET(req: NextRequest, { params }: { params: { jobId: string } }) {
  const urls = await getDownloadUrls(params.jobId);
  return NextResponse.json({ urls });
}
```

---

## 7. UTILITY — Parse Frame Range

### lib/utils/frames.ts
```typescript
/**
 * Parse Conductor-style frame specs into an array of frame numbers
 * "1-10"        → [1,2,3,4,5,6,7,8,9,10]
 * "1,5,10-20"   → [1,5,10,11,...,20]
 * "1-100x10"    → [1,11,21,31,41,51,61,71,81,91] (every 10th frame)
 */
export function parseFrameRange(spec: string): number[] {
  const frames = new Set<number>();

  spec.split(/[\s,]+/).forEach(part => {
    const rangeMatch = part.match(/^(\d+)-(\d+)(?:x(\d+))?$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end   = parseInt(rangeMatch[2]);
      const step  = parseInt(rangeMatch[3] ?? '1');
      for (let f = start; f <= end; f += step) frames.add(f);
    } else {
      const single = parseInt(part);
      if (!isNaN(single)) frames.add(single);
    }
  });

  return Array.from(frames).sort((a, b) => a - b);
}
```

---

## 8. IMPORTANT NOTES FOR VERCEL

### Problem: Vercel has a 60-second timeout on API routes
Spawning VMs is quick (~2s per VM), but uploading large scene files can take longer.

### Solution: Use Vercel's background jobs or Vercel Pro (300s timeout)
```typescript
// In your submit route, add this header for long operations:
export const maxDuration = 300; // Vercel Pro — 5 minute timeout

// OR: For free tier, split into two routes:
// POST /api/jobs/submit     → creates job, returns jobId immediately
// POST /api/jobs/upload     → client uploads file directly to GCS via signed URL
// POST /api/jobs/dispatch   → triggers VM spawning after upload confirms
```

### Get a Signed Upload URL (client uploads directly to GCS — bypasses Vercel timeout)
```typescript
// app/api/jobs/upload-url/route.ts
export async function POST(req: NextRequest) {
  const { jobId, filename } = await req.json();

  const [url] = await storageClient
    .bucket(GCP_BUCKET)
    .file(`jobs/${jobId}/${filename}`)
    .getSignedUrl({
      action : 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 min
      contentType: 'application/octet-stream',
    });

  return NextResponse.json({ uploadUrl: url });
  // Frontend uploads directly to GCS using this URL — never touches Vercel
}
```

---

## 9. ENVIRONMENT VARIABLES FOR VERCEL

In Vercel dashboard → Settings → Environment Variables, add:

```
GCP_PROJECT_ID          = your-project-id
GCP_ZONE                = us-central1-a
GCP_BUCKET_NAME         = your-renderfarm-bucket
GCP_RENDER_IMAGE        = projects/your-project-id/global/images/render-node-v1
GCP_SERVICE_ACCOUNT_KEY = {"type":"service_account","project_id":"..."} ← entire JSON
INTERNAL_API_SECRET     = some-long-random-secret-string
```

---

## 10. THE COMPLETE FLOW SUMMARY

```
Frontend (your app)
       │
       ▼
POST /api/jobs/submit
       │ ── creates job in DB (status: uploading)
       │ ── uploads scene → GCS bucket
       │ ── parses frame range
       │ ── spawns VM per frame via Compute Engine API  (status: running)
       │
       ▼
GCP Compute Engine
  N VMs boot simultaneously from pre-baked image
  Each VM:
    1. Mounts GCS bucket as /mnt/render
    2. Runs render command (blender -b ...)
    3. Writes output EXR/PNG → /mnt/render/output/{jobId}/
    4. POSTs to /api/jobs/task-complete
    5. Deletes itself  ← billing stops here
       │
       ▼
POST /api/jobs/task-complete  (called by VM)
       │ ── marks task done in DB
       │ ── when all tasks done → job status: success
       │
       ▼
GET /api/jobs/{jobId}/download
       │ ── returns signed GCS URLs
       │
       ▼
User downloads rendered frames
```

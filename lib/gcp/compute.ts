import { computeClient, GCP_PROJECT, GCP_ZONE, RENDER_IMAGE, GCP_BUCKET } from './clients'

export interface RenderTaskConfig {
  jobId       : string
  chunkIndex  : number   // 0-based task/chunk index
  startFrame  : number   // first frame in chunk
  endFrame    : number   // last frame in chunk (== startFrame for chunk_size=1)
  gcsScenePath: string   // e.g. jobs/abc123/scene.blend
  machineType : string   // GCP machine type string — see MACHINE_TYPE_MAP
  preemptible : boolean
  software    : string   // e.g. 'blender-4-1' — maps to /opt/blender/blender-4-1/blender
  // Legacy single-frame compat — derived from startFrame when not provided
  frameNumber?: number
}

/**
 * Map the addon's software identifier to the versioned Blender binary on the render node image.
 * Each version is installed at /opt/blender/<id>/blender during image build.
 * Falls back to /opt/blender/blender-4-1/blender if the version is not found.
 */
function blenderBin(software: string): string {
  const known = [
    'blender-4-2-lts',
    'blender-4-1',
    'blender-4-0',
    'blender-3-6-lts',
    'blender-3-5',
    'blender-3-4',
    'blender-3-3-lts',
  ]
  const id = known.includes(software) ? software : 'blender-4-1'
  return `/opt/blender/${id}/blender`
}

/**
 * Map the addon's human-readable machine-type identifier to the real GCP machine type string
 * plus any GPU accelerator that must be attached separately.
 *
 * A100 (a2-*) and L4 (g2-*) have the GPU baked into the machine family — no accelerators block needed.
 * T4 and V100 are attached as accelerators on top of an n1-standard-* base machine.
 *
 * Docs: https://cloud.google.com/compute/docs/gpus
 */
const MACHINE_TYPE_MAP: Record<string, {
  gcpType     : string
  accelerator?: { type: string; count: number }  // only for T4 / V100
}> = {
  // ── A100 80 GB (a2-ultragpu family) ─────────────────────────────────────────
  'a100-80gb-1': { gcpType: 'a2-ultragpu-1g' },
  // ── A100 40 GB (a2-highgpu family) ──────────────────────────────────────────
  'a100-40gb-1': { gcpType: 'a2-highgpu-1g' },
  // ── L4 24 GB (g2-standard family) ───────────────────────────────────────────
  'l4-1':        { gcpType: 'g2-standard-8' },
  // ── T4 16 GB — attached accelerator on n1-standard-4 ────────────────────────
  't4-1': {
    gcpType    : 'n1-standard-4',
    accelerator: { type: `zones/${GCP_ZONE}/acceleratorTypes/nvidia-tesla-t4`, count: 1 },
  },
  // ── V100 16 GB — attached accelerator on n1-standard-8 ──────────────────────
  'v100-1': {
    gcpType    : 'n1-standard-8',
    accelerator: { type: `zones/${GCP_ZONE}/acceleratorTypes/nvidia-tesla-v100`, count: 1 },
  },
}

/**
 * Build the startup script that runs inside the VM.
 * VM boots → mounts GCS → runs Blender → writes output → calls task-complete → self-deletes.
 */
function buildStartupScript(
  config        : RenderTaskConfig,
  appUrl        : string,
  internalSecret: string,
  useGpu        : boolean,
): string {
  const { jobId, chunkIndex, startFrame, endFrame, gcsScenePath, software } = config
  const outputPath   = `/mnt/render/output/${jobId}`
  const blender      = blenderBin(software)
  const isMultiFrame = endFrame > startFrame
  const cyclesDevice = useGpu ? '--cycles-device CUDA' : ''
  const gpuInit      = useGpu ? `
# ── GPU: initialise CUDA / verify driver ──────────────────────────────────────
nvidia-smi || { echo "ERROR: nvidia-smi failed — GPU driver not ready"; exit 1; }
` : ''

  // For a single frame use -f; for a range use -s/-e/-a (animation mode)
  const renderCmd = isMultiFrame
    ? `${blender} -b /mnt/render/${gcsScenePath} \\
  --python-expr "import bpy; bpy.context.scene.cycles.use_denoising = False" \\
  -E CYCLES \\
  ${cyclesDevice} \\
  -o "${outputPath}/####" \\
  -s ${startFrame} -e ${endFrame} \\
  -F PNG -a`
    : `${blender} -b /mnt/render/${gcsScenePath} \\
  --python-expr "import bpy; bpy.context.scene.cycles.use_denoising = False" \\
  -E CYCLES \\
  ${cyclesDevice} \\
  -o "${outputPath}/####" \\
  -f ${startFrame} \\
  -F PNG`

  // Local paths — all work done on fast local NVMe disk
  const localScene  = `/tmp/scene_${jobId}_${chunkIndex}.blend`
  const localOutput = `/tmp/output_${jobId}_${chunkIndex}`

  // Rewrite render command to use local paths
  const renderCmdLocal = isMultiFrame
    ? `${blender} -b "${localScene}" \\
  --python-expr "import bpy; bpy.context.scene.cycles.use_denoising = False" \\
  -E CYCLES \\
  ${cyclesDevice} \\
  -o "${localOutput}/####" \\
  -s ${startFrame} -e ${endFrame} \\
  -F PNG -a`
    : `${blender} -b "${localScene}" \\
  --python-expr "import bpy; bpy.context.scene.cycles.use_denoising = False" \\
  -E CYCLES \\
  ${cyclesDevice} \\
  -o "${localOutput}/####" \\
  -f ${startFrame} \\
  -F PNG`

  return `#!/bin/bash
set -e
${gpuInit}
# ── 1. Signal render start (retry up to 5×, never abort render if it fails) ───
for _i in 1 2 3 4 5; do
  _r=$(curl -s -o /dev/null -w "%{http_code}" -X POST ${appUrl}/api/gcp/task-start \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer ${internalSecret}" \\
    -d '{"jobId":"${jobId}","chunkIndex":${chunkIndex},"startFrame":${startFrame},"endFrame":${endFrame}}')
  [ "$_r" = "200" ] && break
  echo "task-start attempt $_i failed (HTTP $_r), retrying in 3s..."
  sleep 3
done || true

# ── 2. Download scene file from GCS to local disk (fast internal network) ──────
mkdir -p "${localOutput}"
echo "Downloading scene: gs://${GCP_BUCKET}/${gcsScenePath}"
gsutil cp "gs://${GCP_BUCKET}/${gcsScenePath}" "${localScene}"
echo "Scene downloaded: $(du -sh ${localScene} | cut -f1)"

# ── 3. Run Blender render on local disk (frames ${startFrame}–${endFrame}) ────
echo "Rendering job=${jobId} chunk=${chunkIndex} frames=${startFrame}-${endFrame} software=${software} gpu=${useGpu}"
echo "Using Blender binary: ${blender}"
${renderCmdLocal}
echo "Render complete: frames ${startFrame}-${endFrame}"

# ── 4. Upload rendered frames to GCS ─────────────────────────────────────────
echo "Uploading output frames to GCS..."
gsutil -m cp "${localOutput}/*" "gs://${GCP_BUCKET}/output/${jobId}/"
echo "Upload complete"

# ── 5. Signal completion back to the API (retry up to 5×) ─────────────────────
for _i in 1 2 3 4 5; do
  _r=$(curl -s -o /dev/null -w "%{http_code}" -X POST ${appUrl}/api/gcp/task-complete \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer ${internalSecret}" \\
    -d '{"jobId":"${jobId}","chunkIndex":${chunkIndex},"startFrame":${startFrame},"endFrame":${endFrame},"status":"complete","machineType":"${config.machineType}"}')
  [ "$_r" = "200" ] && break
  echo "task-complete attempt $_i failed (HTTP $_r), retrying in 3s..."
  sleep 3
done || true

# ── 6. Clean up local files ────────────────────────────────────────────────────
rm -f "${localScene}"
rm -rf "${localOutput}"

# ── 7. Self-delete this VM (billing stops immediately) ────────────────────────
INSTANCE_NAME=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/name" -H "Metadata-Flavor: Google")
ZONE=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/zone" -H "Metadata-Flavor: Google" | awk -F/ '{print $NF}')
gcloud compute instances delete "$INSTANCE_NAME" --zone="$ZONE" --quiet
`
}

/**
 * Spawn ONE VM for ONE chunk (one or more frames).
 * VM name is based on chunkIndex so it's stable and unique.
 */
export async function spawnRenderVM(
  config: RenderTaskConfig,
  appUrl: string,
  internalSecret: string
): Promise<string> {
  const vmName = `render-${config.jobId.slice(0, 8)}-c${config.chunkIndex}`.toLowerCase()

  const resolved    = MACHINE_TYPE_MAP[config.machineType]
  const gcpType     = resolved?.gcpType    ?? config.machineType
  const accelerator = resolved?.accelerator ?? null
  const useGpu      = accelerator != null || (resolved != null && !config.machineType.startsWith('n1-'))

  const startupScript = buildStartupScript(config, appUrl, internalSecret, useGpu)
  const mustTerminate = config.preemptible || useGpu

  const instanceResource: Record<string, unknown> = {
    name       : vmName,
    machineType: `zones/${GCP_ZONE}/machineTypes/${gcpType}`,

    disks: [{
      boot      : true,
      autoDelete: true,
      initializeParams: { sourceImage: RENDER_IMAGE },
    }],

    networkInterfaces: [{
      network      : 'global/networks/default',
      accessConfigs: [{ name: 'External NAT', type: 'ONE_TO_ONE_NAT' }],
    }],

    metadata: {
      items: [{ key: 'startup-script', value: startupScript }],
    },

    serviceAccounts: [{
      email : `renderfarm-backend@${GCP_PROJECT}.iam.gserviceaccount.com`,
      scopes: [
        'https://www.googleapis.com/auth/compute',
        'https://www.googleapis.com/auth/devstorage.read_write',
      ],
    }],

    scheduling: {
      preemptible      : config.preemptible,
      onHostMaintenance: mustTerminate ? 'TERMINATE' : 'MIGRATE',
    },

    labels: {
      'job-id'     : config.jobId.slice(0, 8),
      'chunk'      : String(config.chunkIndex),
      'start-frame': String(config.startFrame),
      'end-frame'  : String(config.endFrame),
      'managed-by' : 'renderfarm',
      'gpu'        : useGpu ? 'true' : 'false',
    },
  }

  if (accelerator) {
    instanceResource.guestAccelerators = [{
      acceleratorType : accelerator.type,
      acceleratorCount: accelerator.count,
    }]
  }

  await computeClient.insert({ project: GCP_PROJECT, zone: GCP_ZONE, instanceResource })
  console.log(`VM spawned: ${vmName} (frames ${config.startFrame}-${config.endFrame}, gcpType=${gcpType}, gpu=${useGpu})`)
  return vmName
}

import type { TaskChunk } from '@/lib/utils/frames'

/**
 * Spawn VMs for a list of TaskChunks simultaneously.
 * Each chunk gets exactly one VM — one Blender process rendering startFrame..endFrame.
 */
export async function spawnChunkVMs(
  jobId         : string,
  chunks        : TaskChunk[],
  gcsScenePath  : string,
  machineType   : string  = 'n1-standard-4',
  preemptible   : boolean = true,
  appUrl        : string,
  internalSecret: string,
  software      : string  = 'blender-4-1',
): Promise<string[]> {
  const vmNames = await Promise.all(
    chunks.map(chunk =>
      spawnRenderVM(
        { jobId, chunkIndex: chunk.index, startFrame: chunk.startFrame, endFrame: chunk.endFrame, gcsScenePath, machineType, preemptible, software },
        appUrl,
        internalSecret,
      )
    )
  )
  console.log(`Spawned ${vmNames.length} VMs for job ${jobId} (software=${software})`)
  return vmNames
}

/**
 * Legacy: spawn one VM per individual frame (chunk_size=1 compat).
 * Each frame becomes a single-frame chunk.
 */
export async function spawnJobVMs(
  jobId         : string,
  frames        : number[],
  gcsScenePath  : string,
  machineType   : string  = 'n1-standard-4',
  preemptible   : boolean = true,
  appUrl        : string,
  internalSecret: string,
  software      : string  = 'blender-4-1',
): Promise<string[]> {
  const chunks: TaskChunk[] = frames.map((f, i) => ({
    index: i, frames: [f], startFrame: f, endFrame: f, isScout: false,
  }))
  return spawnChunkVMs(jobId, chunks, gcsScenePath, machineType, preemptible, appUrl, internalSecret, software)
}

/**
 * Kill the specific VM for a single frame task.
 * Silently ignores 404 — VM may have already self-deleted after rendering.
 */
export async function killTaskVM(jobId: string, frameNumber: number): Promise<void> {
  const vmName = `render-${jobId.slice(0, 8)}-f${frameNumber}`.toLowerCase()
  try {
    await computeClient.delete({ project: GCP_PROJECT, zone: GCP_ZONE, instance: vmName })
    console.log(`Killed VM: ${vmName}`)
  } catch (err) {
    // 404 = VM already gone (self-deleted after render) — not an error
    console.log(`[killTaskVM] ${vmName} not found or already deleted:`, err)
  }
}

/**
 * Kill all VMs for a job (user clicked Kill in dashboard).
 */
export async function killJobVMs(jobId: string): Promise<void> {
  const [instances] = await computeClient.list({
    project: GCP_PROJECT,
    zone   : GCP_ZONE,
    filter : `labels.job-id=${jobId.slice(0, 8)}`,
  })

  await Promise.all(
    (instances ?? []).map(instance =>
      computeClient.delete({
        project : GCP_PROJECT,
        zone    : GCP_ZONE,
        instance: instance.name!,
      })
    )
  )

  console.log(`Killed all VMs for job ${jobId}`)
}

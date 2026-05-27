import { computeClient, GCP_PROJECT, GCP_ZONE, RENDER_IMAGE, GCP_BUCKET } from './clients'

export interface RenderTaskConfig {
  jobId      : string
  frameNumber: number
  gcsScenePath: string   // e.g. jobs/abc123/scene.blend
  machineType : string   // GCP machine type string — see MACHINE_TYPE_MAP
  preemptible : boolean
  software    : string   // e.g. 'blender-4-1' — maps to /opt/blender/blender-4-1/blender
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
  config      : RenderTaskConfig,
  appUrl      : string,
  internalSecret: string,
  useGpu      : boolean,
): string {
  const { jobId, frameNumber, gcsScenePath, software } = config
  const outputPath  = `/mnt/render/output/${jobId}`
  const paddedFrame = String(frameNumber).padStart(4, '0')
  const blender     = blenderBin(software)

  // GPU VMs need CUDA initialised before Blender starts.
  // The render-node image must have the NVIDIA driver + CUDA toolkit installed.
  const gpuInit = useGpu ? `
# ── GPU: initialise CUDA / verify driver ──────────────────────────────────────
nvidia-smi || { echo "ERROR: nvidia-smi failed — GPU driver not ready"; exit 1; }
` : ''

  // --cycles-device CUDA tells Blender to use the GPU; omit it for CPU machines.
  const cyclesDevice = useGpu ? '--cycles-device CUDA' : ''

  return `#!/bin/bash
set -e
${gpuInit}
# ── 1. Mount GCS bucket ────────────────────────────────────────────────────────
mkdir -p /mnt/render
gcsfuse --implicit-dirs ${GCP_BUCKET} /mnt/render
echo "GCS bucket mounted"

# ── 2. Create output directory ─────────────────────────────────────────────────
mkdir -p ${outputPath}

# ── 3. Signal render start (sets started_at for elapsed-time tracking) ────────
curl -s -X POST ${appUrl}/api/gcp/task-start \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${internalSecret}" \\
  -d '{"jobId":"${jobId}","frame":${frameNumber}}'

# ── 4. Run Blender render ──────────────────────────────────────────────────────
echo "Rendering job=${jobId} frame=${frameNumber} software=${software} gpu=${useGpu}"
echo "Using Blender binary: ${blender}"
${blender} -b /mnt/render/${gcsScenePath} \\
  --python-expr "import bpy; bpy.context.scene.cycles.use_denoising = False" \\
  -E CYCLES \\
  ${cyclesDevice} \\
  -o "${outputPath}/${paddedFrame}" \\
  -f ${frameNumber} \\
  -F PNG
echo "Render complete: frame ${frameNumber}"

# ── 5. Signal completion back to the API ──────────────────────────────────────
curl -s -X POST ${appUrl}/api/gcp/task-complete \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${internalSecret}" \\
  -d '{"jobId":"${jobId}","frame":${frameNumber},"status":"complete"}'

# ── 6. Self-delete this VM (billing stops immediately) ────────────────────────
INSTANCE_NAME=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/name" -H "Metadata-Flavor: Google")
ZONE=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/zone" -H "Metadata-Flavor: Google" | awk -F/ '{print $NF}')
gcloud compute instances delete "$INSTANCE_NAME" --zone="$ZONE" --quiet
`
}

/**
 * Spawn ONE VM for ONE frame.
 */
export async function spawnRenderVM(
  config: RenderTaskConfig,
  appUrl: string,
  internalSecret: string
): Promise<string> {
  const vmName = `render-${config.jobId.slice(0, 8)}-f${config.frameNumber}`.toLowerCase()

  // Resolve the addon's human-readable ID → real GCP machine type + optional accelerator.
  // Fall back to the raw string for CPU machine types (n1-standard-*, c2-*, etc.)
  const resolved   = MACHINE_TYPE_MAP[config.machineType]
  const gcpType    = resolved?.gcpType    ?? config.machineType
  const accelerator = resolved?.accelerator ?? null
  const useGpu     = accelerator != null || (resolved != null && !config.machineType.startsWith('n1-'))

  const startupScript = buildStartupScript(config, appUrl, internalSecret, useGpu)

  // GPU VMs (and preemptible VMs) must use TERMINATE on host maintenance.
  // Standard CPU VMs can MIGRATE which is cheaper/safer.
  const mustTerminate = config.preemptible || useGpu

  const instanceResource: Record<string, unknown> = {
    name       : vmName,
    machineType: `zones/${GCP_ZONE}/machineTypes/${gcpType}`,

    disks: [{
      boot      : true,
      autoDelete: true,
      initializeParams: {
        sourceImage: RENDER_IMAGE,
        // disk size inherited from the source image (50 GB render-node-v1)
        // do NOT pass diskSizeGb — proto3 int64 serialisation chokes on it
      },
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

    // Note: automaticRestart omitted — it's a proto BoolValue wrapper and causes
    // serialisation issues in the Node.js client; default behaviour is correct.
    scheduling: {
      preemptible      : config.preemptible,
      onHostMaintenance: mustTerminate ? 'TERMINATE' : 'MIGRATE',
    },

    labels: {
      'job-id'    : config.jobId.slice(0, 8),
      'frame'     : String(config.frameNumber),
      'managed-by': 'renderfarm',
      'gpu'       : useGpu ? 'true' : 'false',
    },
  }

  // Attach GPU accelerator for machine types that need it (T4, V100).
  // A100 (a2-*) and L4 (g2-*) have the GPU built into the machine family.
  if (accelerator) {
    instanceResource.guestAccelerators = [{
      acceleratorType : accelerator.type,
      acceleratorCount: accelerator.count,
    }]
  }

  await computeClient.insert({
    project         : GCP_PROJECT,
    zone            : GCP_ZONE,
    instanceResource,
  })

  console.log(`VM spawned: ${vmName} (gcpType=${gcpType}, gpu=${useGpu})`)
  return vmName
}

/**
 * Spawn VMs for ALL frames simultaneously.
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
  const vmNames = await Promise.all(
    frames.map(frame =>
      spawnRenderVM(
        { jobId, frameNumber: frame, gcsScenePath, machineType, preemptible, software },
        appUrl,
        internalSecret,
      )
    )
  )
  console.log(`Spawned ${vmNames.length} VMs for job ${jobId} (software=${software})`)
  return vmNames
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

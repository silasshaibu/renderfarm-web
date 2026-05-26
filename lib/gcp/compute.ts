import { computeClient, GCP_PROJECT, GCP_ZONE, RENDER_IMAGE, GCP_BUCKET } from './clients'

export interface RenderTaskConfig {
  jobId      : string
  frameNumber: number
  gcsScenePath: string   // e.g. jobs/abc123/scene.blend
  machineType : string   // e.g. 'n1-standard-4'
  preemptible : boolean
}

/**
 * Build the startup script that runs inside the VM.
 * VM boots → mounts GCS → runs Blender → writes output → calls task-complete → self-deletes.
 */
function buildStartupScript(config: RenderTaskConfig, appUrl: string, internalSecret: string): string {
  const { jobId, frameNumber, gcsScenePath } = config
  const outputPath = `/mnt/render/output/${jobId}`
  const paddedFrame = String(frameNumber).padStart(4, '0')

  return `#!/bin/bash
set -e

# ── 1. Mount GCS bucket ────────────────────────────────────────────────────────
mkdir -p /mnt/render
gcsfuse --implicit-dirs ${GCP_BUCKET} /mnt/render
echo "GCS bucket mounted"

# ── 2. Create output directory ─────────────────────────────────────────────────
mkdir -p ${outputPath}

# ── 3. Run Blender render ──────────────────────────────────────────────────────
echo "Rendering job=${jobId} frame=${frameNumber}"
blender -b /mnt/render/${gcsScenePath} \\
  --python-expr "import bpy; bpy.context.scene.cycles.use_denoising = False" \\
  -E CYCLES \\
  -o "${outputPath}/${paddedFrame}" \\
  -f ${frameNumber} \\
  -F PNG
echo "Render complete: frame ${frameNumber}"

# ── 4. Signal completion back to the API ──────────────────────────────────────
curl -s -X POST ${appUrl}/api/gcp/task-complete \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${internalSecret}" \\
  -d '{"jobId":"${jobId}","frame":${frameNumber},"status":"complete"}'

# ── 5. Self-delete this VM (billing stops immediately) ────────────────────────
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
  const vmName        = `render-${config.jobId.slice(0, 8)}-f${config.frameNumber}`.toLowerCase()
  const startupScript = buildStartupScript(config, appUrl, internalSecret)

  const instanceResource = {
    name       : vmName,
    machineType: `zones/${GCP_ZONE}/machineTypes/${config.machineType}`,

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
      onHostMaintenance: config.preemptible ? 'TERMINATE' : 'MIGRATE',
    },

    labels: {
      'job-id'    : config.jobId.slice(0, 8),
      'frame'     : String(config.frameNumber),
      'managed-by': 'renderfarm',
    },
  }

  await computeClient.insert({
    project         : GCP_PROJECT,
    zone            : GCP_ZONE,
    instanceResource,
  })

  console.log(`VM spawned: ${vmName}`)
  return vmName
}

/**
 * Spawn VMs for ALL frames simultaneously.
 */
export async function spawnJobVMs(
  jobId       : string,
  frames      : number[],
  gcsScenePath: string,
  machineType : string  = 'n1-standard-4',
  preemptible : boolean = true,
  appUrl      : string,
  internalSecret: string
): Promise<string[]> {
  const vmNames = await Promise.all(
    frames.map(frame =>
      spawnRenderVM({ jobId, frameNumber: frame, gcsScenePath, machineType, preemptible }, appUrl, internalSecret)
    )
  )
  console.log(`Spawned ${vmNames.length} VMs for job ${jobId}`)
  return vmNames
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

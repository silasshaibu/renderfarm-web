import { InstancesClient } from '@google-cloud/compute'
import { Storage } from '@google-cloud/storage'

// Parse service account key from env (stored as single-line JSON)
function getCredentials() {
  const raw = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('GCP_SERVICE_ACCOUNT_KEY is not set')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('GCP_SERVICE_ACCOUNT_KEY is not valid JSON')
  }
}

const credentials = getCredentials()

// Compute Engine client — for spinning up/down VMs
export const computeClient = new InstancesClient({ credentials })

// Cloud Storage client — for uploading scene files + downloading renders
export const storageClient = new Storage({ credentials })

export const GCP_PROJECT  = process.env.GCP_PROJECT_ID!
export const GCP_ZONE     = process.env.GCP_ZONE!
export const GCP_BUCKET   = process.env.GCP_BUCKET_NAME!
export const RENDER_IMAGE = process.env.GCP_BUCKET_IMAGE!
export const INTERNAL_SECRET = process.env.GCP_INTERNAL_SECRET!

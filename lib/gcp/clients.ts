import { InstancesClient } from '@google-cloud/compute'
import { Storage } from '@google-cloud/storage'

// Parse service account key from env (stored as single-line JSON).
// Called lazily — NOT at module load time — so importing this module never throws
// when GCP env vars are absent (e.g. during build or on non-GCP deployments).
function getCredentials() {
  const raw = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('GCP_SERVICE_ACCOUNT_KEY is not set')
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('GCP_SERVICE_ACCOUNT_KEY is not valid JSON')
  }
}

// Lazy singleton factory — wraps target in a Proxy so the real client is only
// constructed on the first method/property access, not at import time.
function lazyClient<T extends object>(factory: () => T): T {
  let instance: T | undefined
  return new Proxy({} as T, {
    get(_, prop) {
      if (!instance) instance = factory()
      return (instance as Record<string | symbol, unknown>)[prop]
    },
  })
}

// Compute Engine client — for spinning up/down VMs
export const computeClient: InstancesClient = lazyClient(
  () => new InstancesClient({ credentials: getCredentials() }),
)

// Cloud Storage client — for uploading scene files + downloading renders
export const storageClient: Storage = lazyClient(
  () => new Storage({ credentials: getCredentials() }),
)

export const GCP_PROJECT  = process.env.GCP_PROJECT_ID!
export const GCP_ZONE     = process.env.GCP_ZONE!
export const GCP_BUCKET   = process.env.GCP_BUCKET_NAME!
export const RENDER_IMAGE = process.env.GCP_BUCKET_IMAGE!
export const INTERNAL_SECRET = process.env.GCP_INTERNAL_SECRET!

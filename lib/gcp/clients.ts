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

// Lazy singleton factory — wraps the real client in a Proxy so it is only
// constructed on the first method/property access, not at import time.
//
// IMPORTANT: methods must be returned BOUND to the instance, otherwise `this`
// inside the GCP client is undefined and calls like `.insert()` throw
// "Cannot read properties of undefined (reading 'then')".
function lazyClient<T extends object>(factory: () => T): T {
  let instance: T | undefined
  return new Proxy({} as T, {
    get(_, prop) {
      if (!instance) instance = factory()
      const val = (instance as Record<string | symbol, unknown>)[prop]
      // Bind functions so `this` inside GCP client methods is correct
      return typeof val === 'function'
        ? (val as (...args: unknown[]) => unknown).bind(instance)
        : val
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

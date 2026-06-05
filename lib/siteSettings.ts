import { sql, initDB } from './db'

export interface SiteSettings {
  referralProgramEnabled: boolean
  maintenanceMode: boolean
  maintenanceMessage: string
}

const DEFAULTS: SiteSettings = {
  referralProgramEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: '',
}

const KEYS = ['referralProgramEnabled', 'maintenanceMode', 'maintenanceMessage'] as const

/** Read the site-control flags from wrangler_settings, applying defaults. */
export async function getSiteSettings(): Promise<SiteSettings> {
  await initDB()
  await sql`
    CREATE TABLE IF NOT EXISTS wrangler_settings (
      key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT 'null', updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => null)

  const rows = await sql`
    SELECT key, value FROM wrangler_settings
    WHERE key IN ('referralProgramEnabled', 'maintenanceMode', 'maintenanceMessage')
  `.catch(() => []) as Record<string, unknown>[]

  const out: SiteSettings = { ...DEFAULTS }
  for (const r of rows) {
    const k = r.key as keyof SiteSettings
    if (k === 'maintenanceMessage') out.maintenanceMessage = String(r.value ?? '')
    else if (k in out) (out[k] as boolean) = Boolean(r.value)
  }
  return out
}

/** Upsert one or more site-control flags. */
export async function setSiteSettings(patch: Partial<SiteSettings>): Promise<void> {
  await initDB()
  for (const [key, value] of Object.entries(patch)) {
    if (!KEYS.includes(key as typeof KEYS[number])) continue
    const jsonVal = JSON.stringify(value)
    await sql`
      INSERT INTO wrangler_settings (key, value, updated_at)
      VALUES (${key}, ${jsonVal}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${jsonVal}::jsonb, updated_at = NOW()
    `
  }
}

/** Convenience: is the referral program currently enabled? */
export async function isReferralEnabled(): Promise<boolean> {
  return (await getSiteSettings()).referralProgramEnabled
}

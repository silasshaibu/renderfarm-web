import { randomBytes, createHmac } from 'crypto'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function b32Encode(buf: Buffer): string {
  let bits = 0, val = 0, out = ''
  for (let i = 0; i < buf.length; i++) {
    val = (val << 8) | buf[i]; bits += 8
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31]
  return out
}

export function b32Decode(encoded: string): Buffer {
  const clean = encoded.replace(/=+$/, '').toUpperCase()
  let bits = 0, val = 0; const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch); if (idx < 0) continue
    val = (val << 5) | idx; bits += 5
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

function hotpCode(key: Buffer, counter: bigint): string {
  const tb = Buffer.alloc(8); tb.writeBigUInt64BE(counter)
  const hmac = createHmac('sha1', key).update(tb).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset+1] & 0xff) << 16) |
               ((hmac[offset+2] & 0xff) << 8) | (hmac[offset+3] & 0xff)
  return String(code % 1_000_000).padStart(6, '0')
}

export function generateSecret(): string {
  return b32Encode(randomBytes(20))
}

export function verifyTotp(secret: string, token: string): boolean {
  const key = b32Decode(secret)
  const step = Math.floor(Date.now() / 1000 / 30)
  for (const w of [-1, 0, 1]) {
    if (hotpCode(key, BigInt(step + w)) === token.trim()) return true
  }
  return false
}

export function otpauthUrl(secret: string, email: string, issuer = 'Renderfarm'): string {
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' })
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?${params}`
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    Array.from({ length: 2 }, () =>
      randomBytes(4).toString('hex').toUpperCase()
    ).join('-')
  )
}

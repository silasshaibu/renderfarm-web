import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'

// Supported Blender packages — update as new versions are added to the farm.
const PACKAGES = [
  { id: 'blender-4-2', label: 'Blender 4.2 LTS', version: '4.2', status: 'Supported', notes: 'Long-term support; EEVEE Next' },
  { id: 'blender-4-1', label: 'Blender 4.1',     version: '4.1', status: 'Supported', notes: 'Current stable' },
  { id: 'blender-4-0', label: 'Blender 4.0',     version: '4.0', status: 'Supported', notes: '' },
  { id: 'blender-3-6', label: 'Blender 3.6 LTS', version: '3.6', status: 'Supported', notes: 'Long-term support' },
  { id: 'blender-3-5', label: 'Blender 3.5',     version: '3.5', status: 'Supported', notes: '' },
  { id: 'blender-3-4', label: 'Blender 3.4',     version: '3.4', status: 'Supported', notes: '' },
  { id: 'blender-3-3', label: 'Blender 3.3 LTS', version: '3.3', status: 'Limited',   notes: 'Bug fixes only' },
  { id: 'blender-3-2', label: 'Blender 3.2',     version: '3.2', status: 'Deprecated', notes: 'Upgrade recommended' },
  { id: 'blender-2-93', label: 'Blender 2.93 LTS', version: '2.93', status: 'Deprecated', notes: 'End of life' },
]

// GET /api/packages
// Returns available software packages. Any authenticated user can read.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(PACKAGES)
}

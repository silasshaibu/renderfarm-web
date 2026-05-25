import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

type Context = { params: Promise<{ jobNumber: string }> }

// ── POST /api/jobs/[jobNumber]/scout ──────────────────────────────────────────
// Creates a new "scout" job that renders only the specified frames.
// Body: { frames: number[] }  — e.g. [1, 50, 100]
//
// Scout jobs are regular jobs with:
//   - title: "<original title> [scout]"
//   - frames: "1-1" or "10,50,100" style; workers handle comma-separated via
//     Blender's --frame-range / repeated --render-frame flags
//   - manifest copied from original, output_path untouched
//   - status: "pending"
export async function POST(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber } = await context.params

  // Load source job
  const srcRows = await sql`SELECT * FROM jobs WHERE job_number = ${jobNumber}` as Record<string, unknown>[]
  if (!srcRows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })
  const src = srcRows[0]

  const body = await req.json() as { frames?: number[] }
  if (!body.frames?.length) {
    return NextResponse.json({ message: 'frames array is required' }, { status: 400 })
  }

  // Validate frame numbers are within the source job's range
  const srcFrames = (src.frames as string).replace(/\s/g, '').split('-')
  const srcStart  = parseInt(srcFrames[0]) || 1
  const srcEnd    = srcFrames.length > 1 ? parseInt(srcFrames[1]) || srcStart : srcStart

  const invalid = body.frames.filter(f => f < srcStart || f > srcEnd)
  if (invalid.length) {
    return NextResponse.json({
      message: `Frame(s) out of range [${srcStart}-${srcEnd}]: ${invalid.join(', ')}`,
    }, { status: 400 })
  }

  const sortedFrames = [...new Set(body.frames)].sort((a, b) => a - b)

  // Build frame range string — "10,25,50" for Blender --frames arg
  // We store it as comma-separated in the frames column; the worker handles this.
  const framesStr = sortedFrames.length === 1
    ? `${sortedFrames[0]}-${sortedFrames[0]}`
    : sortedFrames.join(',')

  // Assign a new job number
  const numRows = await sql`SELECT COUNT(*) AS n FROM jobs`
  const nextNum = Number((numRows[0] as Record<string, unknown>).n) + 1
  const scoutNum = `RF-${String(nextNum).padStart(4, '0')}`

  // Copy manifest, tag as scout
  const manifest = {
    ...((src.manifest as Record<string, unknown>) ?? {}),
    scout:        true,
    scout_frames: sortedFrames,
    source_job:   jobNumber,
  }

  const rows = await sql`
    INSERT INTO jobs (
      job_number, title, status, frames, software,
      blender_file, outputs, manifest,
      assets_total, assets_uploaded, output_path,
      priority
    )
    VALUES (
      ${scoutNum},
      ${`${src.title as string} [scout]`},
      'pending',
      ${framesStr},
      ${src.software},
      ${src.blender_file ?? ''},
      '[]'::jsonb,
      ${JSON.stringify(manifest)}::jsonb,
      ${src.assets_total ?? 0},
      ${src.assets_uploaded ?? 0},
      ${src.output_path ?? ''},
      ${src.priority ?? 5}
    )
    RETURNING id, job_number
  ` as Record<string, unknown>[]

  const created = rows[0]
  return NextResponse.json({
    jobNumber: created.job_number,
    id:        String(created.id),
    frames:    sortedFrames,
  }, { status: 201 })
}

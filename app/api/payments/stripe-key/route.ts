import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
  })
}

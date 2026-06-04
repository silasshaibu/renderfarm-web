import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/payments'
import { sql, initDB } from '@/lib/db'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 })

  const body = await req.text()

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? '')
  } catch (e) {
    console.error('[stripe-webhook] Signature verification failed:', e)
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 })
  }

  await initDB()

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object
      // Mark transaction settled (in case webhook fires before charge response)
      await sql`
        UPDATE payment_transactions
        SET status = 'settled'
        WHERE stripe_payment_id = ${pi.id}
      `.catch(() => null)
      break
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object
      await sql`
        UPDATE payment_transactions
        SET status = 'processor_declined'
        WHERE stripe_payment_id = ${pi.id}
      `.catch(() => null)

      // Notify user
      const userId = pi.metadata?.user_id
      if (userId) {
        const userRows = await sql`SELECT email FROM users WHERE id = ${userId} LIMIT 1` as Record<string, unknown>[]
        const email = userRows[0]?.email as string
        if (email) {
          sendEmail({
            to: email,
            subject: 'Payment failed',
            html: `
              <div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
                <h2 style="color:#f87171;margin-top:0">Payment Failed</h2>
                <p style="color:#94a3b8;">Your credit purchase of $${(pi.amount ?? 0) / 100} could not be processed.</p>
                <p style="color:#94a3b8;">Reason: ${pi.last_payment_error?.message ?? 'Unknown error'}</p>
                <p style="color:#94a3b8;"><a href="/admin?tab=payment" style="color:#3b82f6;">Update payment method</a></p>
              </div>
            `,
          }).catch(() => null)
        }
      }
      break
    }

    case 'customer.deleted': {
      const customer = event.data.object
      await sql`
        UPDATE users SET stripe_customer_id = NULL WHERE stripe_customer_id = ${customer.id}
      `.catch(() => null)
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}

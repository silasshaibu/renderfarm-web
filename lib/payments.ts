import Stripe from 'stripe'
import { sql, initDB } from './db'
import { addCredit } from './credits'

// Lazy singleton — only instantiated at runtime when the key is available
let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(key, { apiVersion: '2025-05-28.basil' })
  }
  return _stripe
}

export const BONUS_MAP: Record<string, number> = { '100': 0, '500': 50, '1000': 150 }

export function getBonus(amount: number): number {
  return BONUS_MAP[String(amount)] ?? 0
}

/** Ensure DB columns for payment data */
export async function ensurePaymentSchema(): Promise<void> {
  await initDB()
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT DEFAULT NULL`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_processor TEXT DEFAULT 'stripe'`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT DEFAULT NULL`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_topup_enabled BOOLEAN DEFAULT FALSE`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_topup_threshold NUMERIC(10,2) DEFAULT 10`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_topup_amount NUMERIC(10,2) DEFAULT 100`.catch(() => null)
  await sql`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id           TEXT NOT NULL,
      amount            NUMERIC(10,2) NOT NULL DEFAULT 0,
      bonus_credit      NUMERIC(10,2) DEFAULT 0,
      type              TEXT DEFAULT 'prepay',
      status            TEXT DEFAULT 'pending',
      description       TEXT DEFAULT '',
      card_type         TEXT DEFAULT 'Card',
      card_number       TEXT DEFAULT '****',
      auth_code         TEXT,
      payment_processor TEXT DEFAULT 'stripe',
      stripe_payment_id TEXT DEFAULT NULL,
      paystack_reference TEXT DEFAULT NULL,
      amount_ngn        NUMERIC(14,2) DEFAULT NULL,
      payment_channel   TEXT DEFAULT NULL,
      exchange_rate     NUMERIC(14,6) DEFAULT NULL,
      date              TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => null)
  await sql`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS payment_processor TEXT DEFAULT 'stripe'`.catch(() => null)
  await sql`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS stripe_payment_id TEXT DEFAULT NULL`.catch(() => null)
  await sql`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS paystack_reference TEXT DEFAULT NULL`.catch(() => null)
  await sql`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS amount_ngn NUMERIC(14,2) DEFAULT NULL`.catch(() => null)
  await sql`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS payment_channel TEXT DEFAULT NULL`.catch(() => null)
  await sql`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14,6) DEFAULT NULL`.catch(() => null)
}

/** Get or create a Stripe customer for a user */
export async function getOrCreateStripeCustomer(userId: number | string): Promise<string> {
  await ensurePaymentSchema()

  const rows = await sql`
    SELECT stripe_customer_id, email FROM users WHERE id = ${userId} LIMIT 1
  ` as Record<string, unknown>[]

  if (!rows.length) throw new Error('User not found')

  if (rows[0].stripe_customer_id) {
    return rows[0].stripe_customer_id as string
  }

  const customer = await getStripe().customers.create({
    email: rows[0].email as string,
    metadata: { user_id: String(userId), platform: 'renderfarm' },
  })

  await sql`UPDATE users SET stripe_customer_id = ${customer.id} WHERE id = ${userId}`

  return customer.id
}

/** List saved payment methods for a user */
export async function listPaymentMethods(userId: number | string) {
  const customerId = await getOrCreateStripeCustomer(userId)
  const methods = await getStripe().paymentMethods.list({ customer: customerId, type: 'card' })

  // Get default payment method
  const customer = await getStripe().customers.retrieve(customerId)
  const defaultPM = (customer as Stripe.Customer).invoice_settings?.default_payment_method

  return methods.data.map(pm => ({
    id: pm.id,
    brand: pm.card?.brand ?? 'card',
    last4: pm.card?.last4 ?? '****',
    expMonth: pm.card?.exp_month,
    expYear: pm.card?.exp_year,
    isDefault: pm.id === defaultPM,
  }))
}

/** Create a Stripe SetupIntent to save a card */
export async function createSetupIntent(userId: number | string) {
  const customerId = await getOrCreateStripeCustomer(userId)
  const intent = await getStripe().setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
    metadata: { user_id: String(userId) },
  })
  return {
    clientSecret: intent.client_secret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
  }
}

/** Charge a saved card and credit the user */
export async function chargeAndCredit(
  userId: number | string,
  amountUSD: number,
  paymentMethodId?: string
): Promise<{ ok: boolean; transactionId: string; creditsAdded: number }> {
  await ensurePaymentSchema()
  const customerId = await getOrCreateStripeCustomer(userId)
  const bonus = getBonus(amountUSD)
  const total = amountUSD + bonus

  // Resolve which card to charge
  let pmId = paymentMethodId
  if (!pmId) {
    const customer = await getStripe().customers.retrieve(customerId)
    pmId = (customer as Stripe.Customer).invoice_settings?.default_payment_method as string
  }
  if (!pmId) {
    const methods = await getStripe().paymentMethods.list({ customer: customerId, type: 'card' })
    pmId = methods.data[0]?.id
  }
  if (!pmId) throw new Error('No payment method on file. Add a card first.')

  const intent = await getStripe().paymentIntents.create({
    amount: Math.round(amountUSD * 100),
    currency: 'usd',
    customer: customerId,
    payment_method: pmId,
    confirm: true,
    off_session: true,
    metadata: { user_id: String(userId), type: 'credit_purchase', credits_amount: String(amountUSD) },
  })

  if (intent.status !== 'succeeded') {
    throw new Error(`Payment failed: ${intent.status}`)
  }

  const pm = await getStripe().paymentMethods.retrieve(pmId)

  // Record transaction
  const txRows = await sql`
    INSERT INTO payment_transactions
      (user_id, amount, bonus_credit, type, status, description,
       card_type, card_number, auth_code, payment_processor, stripe_payment_id)
    VALUES (
      ${String(userId)}, ${amountUSD}, ${bonus}, 'prepay', 'settled',
      ${'Prepay $' + amountUSD + (bonus ? ' (+$' + bonus + ' bonus)' : '')},
      ${pm.card?.brand ?? 'Card'},
      ${'****' + (pm.card?.last4 ?? '****')},
      ${intent.id},
      'stripe',
      ${intent.id}
    )
    RETURNING id
  ` as Record<string, unknown>[]

  // Credit user
  await addCredit({
    userId: Number(userId),
    amount: total,
    type: 'purchased',
    description: `Stripe prepay $${amountUSD}${bonus ? ` + $${bonus} bonus` : ''}`,
  })

  // Referral payout — real money was just charged; pays both sides if >= $15 total.
  // Dynamic import avoids a circular dependency (referrals.ts imports payments.ts).
  import('./referrals')
    .then(m => m.creditReferralIfQualified(Number(userId)))
    .catch(() => null)

  return { ok: true, transactionId: txRows[0].id as string, creditsAdded: total }
}

/** Detach a card from a Stripe customer */
export async function detachCard(userId: number | string, paymentMethodId: string) {
  const customerId = await getOrCreateStripeCustomer(userId)

  // Verify the card belongs to this customer
  const pm = await getStripe().paymentMethods.retrieve(paymentMethodId)
  if (pm.customer !== customerId) throw new Error('Card not found on this account')

  await getStripe().paymentMethods.detach(paymentMethodId)
}

/** Set a card as the default for a customer */
export async function setDefaultCard(userId: number | string, paymentMethodId: string) {
  const customerId = await getOrCreateStripeCustomer(userId)
  await getStripe().customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  })
}

/** Initialize a Paystack transaction */
export async function initPaystack(
  userId: number | string,
  amountUSD: number,
  userEmail: string
) {
  await ensurePaymentSchema()
  const bonus = getBonus(amountUSD)

  // Fetch live USD→NGN rate (fallback to static rate)
  let rate = 1600
  try {
    const rateRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    const rateData = await rateRes.json() as { rates: Record<string, number> }
    rate = rateData.rates?.NGN ?? 1600
  } catch { /* use fallback rate */ }

  const amountNGN = Math.round(amountUSD * rate)

  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: userEmail,
      amount: amountNGN * 100, // kobo
      currency: 'NGN',
      metadata: {
        user_id: String(userId),
        usd_amount: amountUSD,
        bonus,
        type: 'credit_purchase',
      },
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://renderfarm.swade-art.com'}/api/payments/paystack/callback`,
    }),
  })

  const data = await res.json() as { status: boolean; data: { authorization_url: string; reference: string } }
  if (!data.status) throw new Error('Paystack initialization failed')

  return {
    authorizationUrl: data.data.authorization_url,
    reference: data.data.reference,
    amountNGN,
    amountUSD,
    exchangeRate: rate,
  }
}

/** Verify a Paystack transaction and credit user */
export async function verifyPaystack(reference: string): Promise<{
  ok: boolean
  userId: string
  amountUSD: number
  creditsAdded: number
}> {
  await ensurePaymentSchema()

  const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY ?? ''}` },
  })

  const data = await res.json() as {
    status: boolean
    data: {
      status: string
      metadata: { user_id: string; usd_amount: number; bonus: number }
      amount: number
      channel: string
      currency: string
    }
  }

  if (!data.status || data.data.status !== 'success') {
    throw new Error('Payment not successful')
  }

  const { user_id, usd_amount, bonus } = data.data.metadata
  const total = usd_amount + bonus
  const amountNGN = data.data.amount / 100
  const rate = amountNGN / usd_amount

  // Record transaction
  await sql`
    INSERT INTO payment_transactions
      (user_id, amount, bonus_credit, type, status, description,
       payment_processor, paystack_reference, amount_ngn, payment_channel, exchange_rate)
    VALUES (
      ${user_id}, ${usd_amount}, ${bonus}, 'prepay', 'settled',
      ${'Paystack prepay $' + usd_amount + (bonus ? ' (+$' + bonus + ' bonus)' : '')},
      'paystack', ${reference}, ${amountNGN}, ${data.data.channel}, ${rate}
    )
    ON CONFLICT DO NOTHING
  `.catch(() => null)

  // Credit user
  await addCredit({
    userId: Number(user_id),
    amount: total,
    type: 'purchased',
    description: `Paystack prepay $${usd_amount}${bonus ? ` + $${bonus} bonus` : ''}`,
  })

  return { ok: true, userId: user_id, amountUSD: usd_amount, creditsAdded: total }
}

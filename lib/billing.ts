import { sql, initDB } from './db'
import { getStripe } from './payments'
import { sendEmail } from './email'

export async function ensureBillingSchema(): Promise<void> {
  await initDB()

  await sql`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      stripe_pm_id  VARCHAR NOT NULL,
      brand         VARCHAR DEFAULT 'card',
      last4         VARCHAR(4),
      exp_month     INTEGER,
      exp_year      INTEGER,
      is_default    BOOLEAN DEFAULT FALSE,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      removed_at    TIMESTAMPTZ NULL
    )
  `.catch(() => null)

  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id                 SERIAL PRIMARY KEY,
      user_id            INTEGER NOT NULL,
      amount             NUMERIC(10,2) NOT NULL,
      type               VARCHAR DEFAULT 'sale',
      status             VARCHAR DEFAULT 'settled',
      stripe_payment_id  VARCHAR NULL,
      paystack_reference VARCHAR NULL,
      card_last4         VARCHAR(4) NULL,
      bonus_credit       NUMERIC(10,2) DEFAULT 0.00,
      error_message      TEXT NULL,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => null)

  // billing retry fields
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_retry_count INTEGER DEFAULT 0`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_billing_attempt TIMESTAMPTZ NULL`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_flagged BOOLEAN DEFAULT FALSE`.catch(() => null)
}

/** Save a Stripe payment method to local DB and attach to customer */
export async function savePaymentMethod(
  userId: number,
  paymentMethodId: string
): Promise<void> {
  await ensureBillingSchema()

  const stripe = getStripe()

  // Get or create Stripe customer
  const userRows = await sql`
    SELECT email, stripe_customer_id FROM users WHERE id = ${userId} LIMIT 1
  ` as Record<string, unknown>[]
  if (!userRows.length) throw new Error('User not found')

  let customerId = userRows[0].stripe_customer_id as string | null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userRows[0].email as string,
      metadata: { user_id: String(userId) },
    })
    customerId = customer.id
    await sql`UPDATE users SET stripe_customer_id = ${customerId} WHERE id = ${userId}`
  }

  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })

  // Get card details
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId)

  // Check if this is the first card (make default)
  const existingRows = await sql`
    SELECT id FROM payment_methods WHERE user_id = ${userId} AND removed_at IS NULL LIMIT 1
  ` as Record<string, unknown>[]
  const isFirst = existingRows.length === 0

  if (isFirst) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })
  }

  await sql`
    INSERT INTO payment_methods (user_id, stripe_pm_id, brand, last4, exp_month, exp_year, is_default)
    VALUES (${userId}, ${paymentMethodId}, ${pm.card?.brand ?? 'card'},
            ${pm.card?.last4 ?? '****'}, ${pm.card?.exp_month ?? 0},
            ${pm.card?.exp_year ?? 0}, ${isFirst})
  `

  if (isFirst) {
    await sql`UPDATE payment_methods SET is_default = FALSE WHERE user_id = ${userId} AND stripe_pm_id != ${paymentMethodId}`
  }
}

/** List saved cards for a user */
export async function listSavedCards(userId: number) {
  await ensureBillingSchema()
  const rows = await sql`
    SELECT id, stripe_pm_id, brand, last4, exp_month, exp_year, is_default, created_at
    FROM payment_methods
    WHERE user_id = ${userId} AND removed_at IS NULL
    ORDER BY is_default DESC, created_at ASC
  ` as Record<string, unknown>[]

  const now = new Date()
  return rows.map(r => {
    const expMonth = Number(r.exp_month)
    const expYear  = Number(r.exp_year)
    const isExpired = new Date(expYear, expMonth - 1) < now
    return {
      id: String(r.id),
      stripePmId: String(r.stripe_pm_id),
      brand: String(r.brand ?? 'card'),
      last4: String(r.last4 ?? '****'),
      expMonth,
      expYear,
      isDefault: Boolean(r.is_default),
      isExpired,
      // Fields matching ApiCard shape expected by PaymentTab
      number: `xxxx-xxxx-xxxx-${r.last4}`,
      exp: isExpired
        ? `${expMonth}/${expYear} — Expired`
        : `${expMonth}/${expYear}`,
    }
  })
}

/** Remove a saved card */
export async function removePaymentMethod(userId: number, pmId: number): Promise<void> {
  await ensureBillingSchema()
  const rows = await sql`
    SELECT stripe_pm_id, is_default FROM payment_methods
    WHERE id = ${pmId} AND user_id = ${userId} AND removed_at IS NULL LIMIT 1
  ` as Record<string, unknown>[]
  if (!rows.length) throw new Error('Card not found')

  await getStripe().paymentMethods.detach(rows[0].stripe_pm_id as string).catch(() => null)
  await sql`UPDATE payment_methods SET removed_at = NOW() WHERE id = ${pmId}`

  // If removed card was default, make next card default
  if (rows[0].is_default) {
    const next = await sql`
      SELECT id, stripe_pm_id FROM payment_methods
      WHERE user_id = ${userId} AND removed_at IS NULL ORDER BY created_at ASC LIMIT 1
    ` as Record<string, unknown>[]
    if (next.length) {
      await sql`UPDATE payment_methods SET is_default = TRUE WHERE id = ${next[0].id}`
    }
  }
}

/** Set a card as default */
export async function setDefaultPaymentMethod(userId: number, pmId: number): Promise<void> {
  await ensureBillingSchema()
  const rows = await sql`
    SELECT stripe_pm_id FROM payment_methods
    WHERE id = ${pmId} AND user_id = ${userId} AND removed_at IS NULL LIMIT 1
  ` as Record<string, unknown>[]
  if (!rows.length) throw new Error('Card not found')

  const userRows = await sql`SELECT stripe_customer_id FROM users WHERE id = ${userId} LIMIT 1` as Record<string, unknown>[]
  if (userRows[0]?.stripe_customer_id) {
    await getStripe().customers.update(userRows[0].stripe_customer_id as string, {
      invoice_settings: { default_payment_method: rows[0].stripe_pm_id as string },
    }).catch(() => null)
  }

  await sql`UPDATE payment_methods SET is_default = FALSE WHERE user_id = ${userId}`
  await sql`UPDATE payment_methods SET is_default = TRUE WHERE id = ${pmId}`
}

/** Record a transaction */
export async function recordTransaction(data: {
  userId: number
  amount: number
  type: 'sale' | 'render' | 'refund' | 'storage'
  status: 'settled' | 'processor_declined' | 'pending' | 'refunded'
  stripePaymentId?: string
  cardLast4?: string
  bonusCredit?: number
  errorMessage?: string
}): Promise<void> {
  await ensureBillingSchema()
  await sql`
    INSERT INTO transactions
      (user_id, amount, type, status, stripe_payment_id, card_last4, bonus_credit, error_message)
    VALUES (${data.userId}, ${data.amount}, ${data.type}, ${data.status},
            ${data.stripePaymentId ?? null}, ${data.cardLast4 ?? null},
            ${data.bonusCredit ?? 0}, ${data.errorMessage ?? null})
  `
}

/** Get user's outstanding balance (negative = owes money) */
async function getBalance(userId: number): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(SUM(amount), 0) as balance FROM credits WHERE user_id = ${userId}
  ` as Record<string, unknown>[]
  return Number(rows[0]?.balance ?? 0)
}

/** Charge a user for outstanding balance (monthly billing) */
async function chargeUserForOutstanding(user: {
  id: number
  email: string
  stripe_customer_id: string
  balance: number
  billing_retry_count: number
}): Promise<'settled' | 'processor_declined' | 'skipped'> {
  const amountOwed = Math.abs(user.balance)
  if (amountOwed < 1.00) return 'skipped'

  const stripe = getStripe()

  // Get default card
  const cards = await listSavedCards(user.id)
  const defaultCard = cards.find(c => c.isDefault) ?? cards[0]
  if (!defaultCard) {
    await flagAccount(user.id, 'no_payment_method')
    return 'skipped'
  }

  if (defaultCard.isExpired) {
    await flagAccount(user.id, 'card_expired')
    await sendBillingFailedEmail(user.email, amountOwed, 'Card expired', defaultCard.last4)
    return 'skipped'
  }

  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  try {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amountOwed * 100),
      currency: 'usd',
      customer: user.stripe_customer_id,
      payment_method: defaultCard.stripePmId,
      confirm: true,
      off_session: true,
      description: `Renderfarm monthly billing — ${monthLabel}`,
      metadata: { user_id: String(user.id), type: 'monthly_billing' },
    })

    if (intent.status === 'succeeded') {
      // Credit the user to clear debt
      await sql`
        INSERT INTO credits (user_id, amount, type, description)
        VALUES (${user.id}, ${amountOwed}, 'purchased', ${'Monthly billing — ' + monthLabel})
      `
      await recordTransaction({
        userId: user.id, amount: amountOwed, type: 'render', status: 'settled',
        stripePaymentId: intent.id, cardLast4: defaultCard.last4,
      })
      // Clear debt hold and retry count
      await sql`
        UPDATE users SET billing_retry_count = 0, last_billing_attempt = NOW(),
          billing_flagged = FALSE, debt_hold_since = NULL
        WHERE id = ${user.id}
      `
      await sendBillingSuccessEmail(user.email, amountOwed, defaultCard.last4, intent.id)
      return 'settled'
    }

    return 'processor_declined'
  } catch (e) {
    const msg = (e as Error).message
    await recordTransaction({
      userId: user.id, amount: amountOwed, type: 'render', status: 'processor_declined',
      cardLast4: defaultCard.last4, errorMessage: msg,
    })
    await sql`
      UPDATE users
      SET billing_retry_count = billing_retry_count + 1, last_billing_attempt = NOW()
      WHERE id = ${user.id}
    `
    const newRetries = user.billing_retry_count + 1
    if (newRetries >= 3) {
      await flagAccount(user.id, 'max_retries_exceeded')
      await sendAccountSuspendedEmail(user.email, amountOwed)
    } else {
      await sendBillingFailedEmail(user.email, amountOwed, msg, defaultCard.last4)
    }
    return 'processor_declined'
  }
}

async function flagAccount(userId: number, reason: string): Promise<void> {
  await sql`
    UPDATE users SET billing_flagged = TRUE, debt_hold_since = COALESCE(debt_hold_since, NOW())
    WHERE id = ${userId}
  `.catch(() => null)
  console.log(`[billing] Flagged user ${userId}: ${reason}`)
}

/** Run monthly billing for all users with negative balance */
export async function runMonthlyBilling(): Promise<{ billed: number; failed: number; skipped: number }> {
  await ensureBillingSchema()

  const users = await sql`
    SELECT u.id, u.email, u.stripe_customer_id, u.billing_retry_count,
           COALESCE(SUM(c.amount), 0) as balance
    FROM users u
    LEFT JOIN credits c ON c.user_id = u.id
    WHERE u.status = 'active' AND u.stripe_customer_id IS NOT NULL
    GROUP BY u.id, u.email, u.stripe_customer_id, u.billing_retry_count
    HAVING COALESCE(SUM(c.amount), 0) < 0
  ` as Record<string, unknown>[]

  let billed = 0, failed = 0, skipped = 0
  for (const user of users) {
    const result = await chargeUserForOutstanding({
      id: Number(user.id),
      email: user.email as string,
      stripe_customer_id: user.stripe_customer_id as string,
      balance: Number(user.balance),
      billing_retry_count: Number(user.billing_retry_count),
    })
    if (result === 'settled') billed++
    else if (result === 'processor_declined') failed++
    else skipped++
  }
  return { billed, failed, skipped }
}

/** Retry declined billing (runs on day 3, 7, 14 of month) */
export async function retryDeclinedBilling(): Promise<{ retried: number }> {
  await ensureBillingSchema()

  const users = await sql`
    SELECT u.id, u.email, u.stripe_customer_id, u.billing_retry_count,
           COALESCE(SUM(c.amount), 0) as balance
    FROM users u
    LEFT JOIN credits c ON c.user_id = u.id
    WHERE u.billing_retry_count > 0 AND u.billing_retry_count < 3
    AND EXTRACT(MONTH FROM u.last_billing_attempt) = EXTRACT(MONTH FROM NOW())
    GROUP BY u.id, u.email, u.stripe_customer_id, u.billing_retry_count
    HAVING COALESCE(SUM(c.amount), 0) < 0
  ` as Record<string, unknown>[]

  let retried = 0
  for (const user of users) {
    await chargeUserForOutstanding({
      id: Number(user.id),
      email: user.email as string,
      stripe_customer_id: user.stripe_customer_id as string,
      balance: Number(user.balance),
      billing_retry_count: Number(user.billing_retry_count),
    })
    retried++
  }
  return { retried }
}

// ── Email helpers ─────────────────────────────────────────────────────────────

async function sendBillingSuccessEmail(email: string, amount: number, last4: string, stripeId: string) {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  await sendEmail({
    to: email,
    subject: `Receipt — Renderfarm monthly billing`,
    html: `
      <div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
        <h2 style="color:#4ade80;margin-top:0">Payment Successful</h2>
        <p style="color:#94a3b8;">Your card ending in <strong>${last4}</strong> has been charged <strong>$${amount.toFixed(2)}</strong> for render usage.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="color:#64748b;padding:4px 0">Date</td><td style="color:#e2e8f0;text-align:right">${date}</td></tr>
          <tr><td style="color:#64748b;padding:4px 0">Amount</td><td style="color:#e2e8f0;text-align:right">$${amount.toFixed(2)}</td></tr>
          <tr><td style="color:#64748b;padding:4px 0">Card</td><td style="color:#e2e8f0;text-align:right">xxxx-xxxx-xxxx-${last4}</td></tr>
          <tr><td style="color:#64748b;padding:4px 0">Transaction</td><td style="color:#e2e8f0;text-align:right;font-size:12px">${stripeId}</td></tr>
        </table>
        <p style="color:#94a3b8;"><a href="/admin?tab=payment" style="color:#3b82f6;text-decoration:none;">View payment history</a></p>
      </div>`,
  }).catch(() => null)
}

async function sendBillingFailedEmail(email: string, amount: number, reason: string, last4: string) {
  await sendEmail({
    to: email,
    subject: `⚠ Payment failed — action required`,
    html: `
      <div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
        <h2 style="color:#fbbf24;margin-top:0">Payment Failed</h2>
        <p style="color:#94a3b8;">We were unable to charge your card ending in <strong>${last4}</strong> for <strong>$${amount.toFixed(2)}</strong>.</p>
        <p style="color:#94a3b8;">Reason: ${reason}</p>
        <p style="color:#94a3b8;">We will retry automatically. Please update your payment method to avoid service interruption.</p>
        <p style="color:#94a3b8;"><a href="/admin?tab=payment" style="color:#3b82f6;text-decoration:none;">Update payment method</a></p>
      </div>`,
  }).catch(() => null)
}

async function sendAccountSuspendedEmail(email: string, amount: number) {
  await sendEmail({
    to: email,
    subject: `🔴 Rendering suspended — payment required`,
    html: `
      <div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
        <h2 style="color:#f87171;margin-top:0">Rendering Suspended</h2>
        <p style="color:#94a3b8;">After 3 payment attempts, we were unable to process your outstanding balance of <strong>$${amount.toFixed(2)}</strong>.</p>
        <p style="color:#94a3b8;">Rendering has been suspended until payment is received.</p>
        <p style="color:#94a3b8;"><a href="/admin?tab=payment" style="color:#3b82f6;text-decoration:none;">Add credits or update card</a></p>
      </div>`,
  }).catch(() => null)
}

/** Get user transactions for display */
export async function getUserTransactions(userId: number, limit = 100) {
  await ensureBillingSchema()
  const rows = await sql`
    SELECT id, amount, type, status, stripe_payment_id, card_last4, bonus_credit, error_message, created_at
    FROM transactions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  ` as Record<string, unknown>[]

  return rows.map(r => ({
    id: String(r.id),
    date: String(r.created_at),
    description: r.type === 'render'
      ? `Monthly billing`
      : r.type === 'sale'
      ? `Prepay purchase`
      : String(r.type ?? ''),
    cardType: 'Card',
    cardNumber: r.card_last4 ? `xxxx-xxxx-xxxx-${r.card_last4}` : '—',
    type: String(r.type ?? 'sale'),
    status: String(r.status ?? 'settled'),
    bonusCredit: Number(r.bonus_credit ?? 0),
    amount: Number(r.amount),
    authCode: r.stripe_payment_id ? String(r.stripe_payment_id) : null,
  }))
}

/** Check for expiring cards and send warnings */
export async function checkExpiringCards(): Promise<void> {
  await ensureBillingSchema()
  const now = new Date()
  const thirtyDaysOut = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const sevenDaysOut = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)

  const rows = await sql`
    SELECT pm.last4, pm.exp_month, pm.exp_year, u.email, u.id as user_id
    FROM payment_methods pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.removed_at IS NULL
    AND pm.is_default = TRUE
  ` as Record<string, unknown>[]

  for (const row of rows) {
    const expiry = new Date(Number(row.exp_year), Number(row.exp_month) - 1)
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysLeft <= 0) continue // already expired, handled elsewhere
    if (daysLeft <= 7 || daysLeft <= 30) {
      await sendEmail({
        to: row.email as string,
        subject: daysLeft <= 7 ? '🔴 Your card expires in 7 days' : '⚠ Your card expires soon',
        html: `
          <div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
            <h2 style="color:${daysLeft <= 7 ? '#f87171' : '#fbbf24'};margin-top:0">Card Expiring Soon</h2>
            <p style="color:#94a3b8;">Your card ending in <strong>${row.last4}</strong> expires in <strong>${daysLeft} days</strong> (${row.exp_month}/${row.exp_year}).</p>
            <p style="color:#94a3b8;">Please add a new card to avoid payment failures.</p>
            <p style="color:#94a3b8;"><a href="/admin?tab=payment" style="color:#3b82f6;text-decoration:none;">Update payment method</a></p>
          </div>`,
      }).catch(() => null)
    }
  }
}

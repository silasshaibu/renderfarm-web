'use client'

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'

// Only evaluated when this module loads (i.e. when the modal opens via dynamic import)
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

const stripeElementStyle = {
  base: {
    color: '#e2e8f0',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '14px',
    '::placeholder': { color: '#4b5563' },
  },
  invalid: { color: '#f87171' },
}

function StripeCardForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!stripe || !elements) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/payments/cards', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('rf_token') ?? ''}` },
      })
      const data = await res.json() as { clientSecret?: string; message?: string }
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.message ?? 'Failed to create setup intent. Ensure Stripe keys are set in Vercel.')
      }

      const cardNumber = elements.getElement(CardNumberElement)
      if (!cardNumber) throw new Error('Card element not found')

      const result = await stripe.confirmCardSetup(data.clientSecret, {
        payment_method: { card: cardNumber },
      })

      if (result.error) throw new Error(result.error.message)
      onSuccess()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div>
        <label className="payment-field-label">Card Number</label>
        <div className="stripe-element-wrap">
          <CardNumberElement options={{ style: stripeElementStyle, showIcon: true }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="payment-field-label">Expiration Date</label>
          <div className="stripe-element-wrap">
            <CardExpiryElement options={{ style: stripeElementStyle }} />
          </div>
        </div>
        <div>
          <label className="payment-field-label">CVV</label>
          <div className="stripe-element-wrap">
            <CardCvcElement options={{ style: stripeElementStyle }} />
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 flex items-center gap-1">
        🔒 Secured by Stripe — we never see your card details
      </p>

      <hr className="payment-modal-divider" />
      <div className="flex items-center gap-3 justify-end">
        <button
          type="button"
          className="payment-confirm-btn"
          onClick={handleSubmit}
          disabled={saving || !stripe}
        >
          {saving ? 'Saving…' : 'Save Card'}
        </button>
        <button type="button" className="payment-cancel-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function StripeAddCardModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  return (
    <div className="enterprise-modal-overlay" onClick={onClose}>
      <div
        className="payment-modal-card"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="addcard-title"
      >
        <h2 id="addcard-title" className="payment-modal-title">Add Credit Card</h2>
        <hr className="payment-modal-divider" />
        {stripePromise ? (
          <Elements stripe={stripePromise}>
            <StripeCardForm onClose={onClose} onSuccess={onSuccess} />
          </Elements>
        ) : (
          <div className="flex flex-col gap-4 px-5 py-5">
            <p className="text-amber-400 text-sm">
              Payment not configured. Add{' '}
              <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to your Vercel
              environment variables and redeploy.
            </p>
            <div className="flex justify-end">
              <button type="button" className="payment-cancel-btn" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

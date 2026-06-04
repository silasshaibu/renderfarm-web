'use client'

import { useEffect, useRef, useState } from 'react'
import type { Stripe, StripeCardElement } from '@stripe/stripe-js'

export default function StripeAddCardModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const stripeRef = useRef<Stripe | null>(null)
  const cardElRef = useRef<StripeCardElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!key || !cardRef.current) return

    let cancelled = false

    import('@stripe/stripe-js').then(({ loadStripe }) => {
      loadStripe(key).then(stripe => {
        if (!stripe || cancelled || !cardRef.current) return
        stripeRef.current = stripe

        const elements = stripe.elements()
        const card = elements.create('card', {
          style: {
            base: {
              color: '#e2e8f0',
              fontFamily: 'ui-monospace, monospace',
              fontSize: '15px',
              '::placeholder': { color: '#6b7280' },
            },
            invalid: { color: '#f87171' },
          },
        })
        card.mount(cardRef.current)
        cardElRef.current = card
        setReady(true)
      })
    })

    return () => {
      cancelled = true
      cardElRef.current?.destroy()
    }
  }, [])

  const handleSave = async () => {
    if (!stripeRef.current || !cardElRef.current) return
    setSaving(true)
    setError('')
    try {
      const token = localStorage.getItem('rf_token') ?? ''
      const res = await fetch('/api/payments/cards', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as { clientSecret?: string; message?: string }
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.message ?? 'Failed to create setup intent. Check Stripe keys in Vercel.')
      }

      const result = await stripeRef.current.confirmCardSetup(data.clientSecret, {
        payment_method: { card: cardElRef.current },
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

  const noKey = !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

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

        <div className="flex flex-col gap-4 px-5 py-5">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {noKey ? (
            <p className="text-amber-400 text-sm">
              Payment not configured. Add{' '}
              <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to Vercel and redeploy.
            </p>
          ) : (
            <>
              <div>
                <label className="payment-field-label">Card Details</label>
                <div
                  ref={cardRef}
                  className="stripe-element-wrap stripe-card-single"
                />
                {!ready && (
                  <p className="text-xs text-gray-500 mt-1">Loading secure card form…</p>
                )}
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                🔒 Secured by Stripe — we never see your card details
              </p>
            </>
          )}

          <hr className="payment-modal-divider" />
          <div className="flex items-center gap-3 justify-end">
            {!noKey && (
              <button
                type="button"
                className="payment-confirm-btn"
                onClick={handleSave}
                disabled={saving || !ready}
              >
                {saving ? 'Saving…' : 'Save Card'}
              </button>
            )}
            <button type="button" className="payment-cancel-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import type { Stripe, StripeCardNumberElement } from '@stripe/stripe-js'

const ELEMENT_STYLE = {
  base: {
    color: '#e2e8f0',
    fontFamily: 'Segoe UI, ui-sans-serif, sans-serif',
    fontSize: '14px',
    '::placeholder': { color: '#4b5563' },
  },
  invalid: { color: '#f87171' },
}

export default function StripeAddCardModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const numberRef  = useRef<HTMLDivElement>(null)
  const expiryRef  = useRef<HTMLDivElement>(null)
  const cvcRef     = useRef<HTMLDivElement>(null)
  const stripeRef  = useRef<Stripe | null>(null)
  const cardNumRef = useRef<StripeCardNumberElement | null>(null)

  const [postal,  setPostal]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [ready,   setReady]   = useState(false)

  const noKey = !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

  useEffect(() => {
    if (noKey) return
    let cancelled = false

    import('@stripe/stripe-js').then(({ loadStripe }) => {
      loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!).then(stripe => {
        if (!stripe || cancelled) return
        stripeRef.current = stripe

        const els = stripe.elements()

        const cardNumber = els.create('cardNumber', {
          style: ELEMENT_STYLE,
          placeholder: '4111 1111 1111 1111',
          showIcon: true,
        })
        const cardExpiry = els.create('cardExpiry', {
          style: ELEMENT_STYLE,
          placeholder: 'MM/YY',
        })
        const cardCvc = els.create('cardCvc', {
          style: ELEMENT_STYLE,
          placeholder: '123',
        })

        if (numberRef.current)  cardNumber.mount(numberRef.current)
        if (expiryRef.current)  cardExpiry.mount(expiryRef.current)
        if (cvcRef.current)     cardCvc.mount(cvcRef.current)

        cardNumRef.current = cardNumber
        setReady(true)
      })
    })

    return () => {
      cancelled = true
      cardNumRef.current?.destroy()
    }
  }, [noKey])

  const handleSave = async () => {
    if (!stripeRef.current || !cardNumRef.current) return
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
        payment_method: {
          card: cardNumRef.current,
          billing_details: {
            address: { postal_code: postal || undefined },
          },
        },
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
              Payment not configured. Add <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to Vercel and redeploy.
            </p>
          ) : (
            <>
              <div>
                <label className="payment-field-label">Card Number</label>
                <div ref={numberRef} className="stripe-element-wrap stripe-card-single" />
              </div>

              <div>
                <label className="payment-field-label">Expiration Date</label>
                <div ref={expiryRef} className="stripe-element-wrap stripe-card-single" />
              </div>

              <div>
                <label className="payment-field-label">CVV</label>
                <div ref={cvcRef} className="stripe-element-wrap stripe-card-single" />
              </div>

              <div>
                <label className="payment-field-label" htmlFor="postal-code">Postal or Country Code</label>
                <input
                  id="postal-code"
                  type="text"
                  placeholder="11111"
                  value={postal}
                  onChange={e => setPostal(e.target.value)}
                  className="payment-field-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter postal code for US cards or country code for international (e.g. NG, GB)
                </p>
              </div>

              {!ready && (
                <p className="text-xs text-gray-500">Loading secure card form…</p>
              )}
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
                {saving ? 'Saving…' : 'Ok'}
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

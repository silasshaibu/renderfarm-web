'use client'

import { useState, useEffect, useCallback } from 'react'
import { isLoggedIn } from '@/lib/auth'

interface State<T> {
  data:     T | null
  loading:  boolean   // true only on the very first fetch (no data yet)
  syncing:  boolean   // true on background re-fetches (data already visible)
  error:    string | null
}

export function useApiFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, syncing: false, error: null })

  const load = useCallback(async () => {
    if (!isLoggedIn()) {
      setState({ data: null, loading: false, syncing: false, error: 'Not authenticated' })
      return
    }
    setState((s) => s.data
      ? { ...s, syncing: true,  loading: false, error: null }   // background refresh — keep table visible
      : { ...s, syncing: false, loading: true,  error: null }   // initial load — show spinner
    )
    try {
      const data = await fetcher()
      setState({ data, loading: false, syncing: false, error: null })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, syncing: false, error: e instanceof Error ? e.message : 'Error' }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { load() }, [load])

  return { ...state, refetch: load }
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { isLoggedIn } from '@/lib/auth'

interface State<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApiFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null })

  const load = useCallback(async () => {
    if (!isLoggedIn()) {
      setState({ data: null, loading: false, error: 'Not authenticated' })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fetcher()
      setState({ data, loading: false, error: null })
    } catch (e) {
      setState({ data: null, loading: false, error: e instanceof Error ? e.message : 'Error' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { load() }, [load])

  return { ...state, refetch: load }
}

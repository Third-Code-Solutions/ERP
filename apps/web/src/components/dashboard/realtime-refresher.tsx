'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@buildops/auth/client'

// Tables that affect the executive dashboard metrics.
const WATCHED_TABLES = ['opportunities', 'purchase_orders', 'invoices', 'boms'] as const

export function DashboardRealtimeRefresher() {
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleRefresh() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      router.refresh()
    }, 800)
  }

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    let channel = supabase.channel('dashboard-realtime')

    for (const table of WATCHED_TABLES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel = (channel as any).on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRefresh
      )
    }

    channel.subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

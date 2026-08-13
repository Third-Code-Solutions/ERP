'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'

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

    const channel = supabase.channel('dashboard-realtime')

    for (const table of WATCHED_TABLES) {
      channel.on(
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

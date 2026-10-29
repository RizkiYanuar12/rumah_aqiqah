'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { usePathname } from 'next/navigation'

type NotifikasiValue = { pendingCount: number }
const NotifikasiContext = createContext<NotifikasiValue>({ pendingCount: 0 })

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

export function NotifikasiProvider({
  role,
  initialCount,
  children,
}: {
  role?: string
  initialCount: number
  children: React.ReactNode
}) {
  const [pendingCount, setPendingCount] = useState(initialCount)
  const isInventory = role === 'inventory'
  const pathname = usePathname()
  const isMountedRef = useRef(true)
  const baselineRef = useRef(initialCount)
  const fetchRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    baselineRef.current = initialCount
    setPendingCount(initialCount)
  }, [initialCount])

  useEffect(() => {
    if (!isInventory) return

    const fetchCount = async () => {
      try {
        const res = await fetch(`/api/pengajuan?s=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok || !isMountedRef.current) {
          return
        }
        const json = await res.json().catch(() => null)
        const list = Array.isArray(json?.pengajuan) ? json.pengajuan : []
        const count = new Set(
          list
            .filter((r: { status?: string }) => r.status === 'DIAJUKAN')
            .map((r: { batch_id?: string }) => r.batch_id),
        ).size
        setPendingCount(count)
        baselineRef.current = count
      } catch {}
    }

    fetchRef.current = fetchCount
    void fetchCount()

    const channel = supabase
      .channel('pengajuan-notifikasi')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pengajuan' },
        () => void fetchCount(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      fetchRef.current = null
    }
  }, [isInventory])

  useEffect(() => {
    if (!isInventory) return
    void fetchRef.current?.()
  }, [pathname, isInventory])

  return (
    <NotifikasiContext.Provider value={{ pendingCount }}>
      {children}
    </NotifikasiContext.Provider>
  )
}

export function useNotifikasi() {
  return useContext(NotifikasiContext)
}

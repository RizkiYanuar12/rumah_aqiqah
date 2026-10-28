'use client'

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

const EV_DRAFT = 'rumah-aqiqah:draft'

function tulis(key: string | null, value: unknown) {
  if (!key || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
    // Tab ini tak menerima event 'storage' -> kabari subscriber sendiri.
    window.dispatchEvent(new Event(EV_DRAFT))
  } catch {
    // Penyimpanan penuh/mode privat — abaikan, form tetap jalan.
  }
}

// Draft = sumber data luar (localStorage). useSyncExternalStore:
// server & render pertama client sama-sama pakai getServerSnapshot (tak ada draft),
// jadi tidak ada hydration mismatch; setelah hydration React ambil snapshot client.
// Snapshot = string mentah (primitive, stabil) -> parsing dilakukan saat render.
export function useDraftState<T>(key: string | null, initial: T) {
  const [lokal, setLokal] = useState<T>(initial)

  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener(EV_DRAFT, onStoreChange)
    window.addEventListener('storage', onStoreChange)
    return () => {
      window.removeEventListener(EV_DRAFT, onStoreChange)
      window.removeEventListener('storage', onStoreChange)
    }
  }, [])

  const getSnapshot = useCallback(
    () => (key && typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null),
    [key],
  )
  const getServerSnapshot = useCallback(() => null, [])

  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const tersimpan = useMemo(() => {
    if (raw == null) return undefined
    try {
      return JSON.parse(raw) as T
    } catch {
      return undefined
    }
  }, [raw])

  const value = tersimpan !== undefined ? tersimpan : lokal

  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      const next = typeof v === 'function' ? (v as (prev: T) => T)(value) : v
      setLokal(next)
      if (key) tulis(key, next)
    },
    [key, value],
  )

  return [value, set] as const
}

export function clearDraft(prefix: string) {
  if (typeof localStorage === 'undefined') return
  try {
    const buang: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) buang.push(k)
    }
    buang.forEach((k) => localStorage.removeItem(k))
    window.dispatchEvent(new Event(EV_DRAFT))
  } catch {
    // Abaikan.
  }
}

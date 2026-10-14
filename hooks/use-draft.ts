'use client'

import { useState } from 'react'

function baca<T>(key: string | null): T | undefined {
  if (!key || typeof localStorage === 'undefined') return undefined
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}

function tulis(key: string | null, value: unknown) {
  if (!key || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Penyimpanan penuh/mode privat — abaikan, form tetap jalan.
  }
}

// Pengganti useState yang tahan reload, pindah tab, dan back-navigation.
// key null = useState biasa. Ganti prefix versi bila bentuk data berubah
// agar draft basi dari versi lama terabaikan otomatis.
export function useDraftState<T>(key: string | null, initial: T) {
  const [value, setValue] = useState<T>(() => baca<T>(key) ?? initial)
  const set = (v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (prev: T) => T)(prev) : v
      tulis(key, next)
      return next
    })
  }
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
  } catch {
    // Abaikan.
  }
}

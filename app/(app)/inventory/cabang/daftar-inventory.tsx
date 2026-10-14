'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { fmtNum, fmtRp } from '@/lib/format'

export type StockRow = {
  sku: string
  nama_barang: string | null
  kategori: string | null
  satuan: string | null
  stock: number | null
  min_stock: number | null
  hpp_average: number | null
  is_low: boolean | null
}

const PILL_STOCK: Record<StockKind, string> = {
  normal: 'border-green-300 bg-green-50 text-green-700',
  low: 'border-[#e8d40c]/70 bg-[#e8b10c]/15 text-[#4a0f30]',
  habis: 'border-red-500 bg-red-500 text-white',
}

type StockKind = 'normal' | 'low' | 'habis'

const KIND_LABEL: Record<StockKind, string> = {
  normal: 'Aman',
  low: 'Menipis',
  habis: 'Habis',
}

const EMPTY_MSG: Record<'semua' | StockKind, string> = {
  semua: 'Belum ada barang di lokasi ini',
  low: 'Tidak ada barang menipis',
  habis: 'Tidak ada barang habis',
  normal: 'Tidak ada barang aman',
}

const statusStock = (item: StockRow): StockKind =>
  Number(item.stock) <= 0 ? 'habis' : item.is_low ? 'low' : 'normal'

export default function DaftarInventory({
  initialItems,
  namaLokasi,
}: {
  initialItems: StockRow[]
  namaLokasi: string
}) {
  const [prevInitial, setPrevInitial] = useState(initialItems)
  const [items, setItems] = useState(initialItems)
  if (prevInitial !== initialItems) {
    setPrevInitial(initialItems)
    setItems(initialItems)
  }
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'semua' | StockKind>('semua')

  const counts = useMemo(() => {
    const c: Record<'semua' | StockKind, number> = { semua: items.length, normal: 0, low: 0, habis: 0 }
    for (const it of items) c[statusStock(it)] += 1
    return c
  }, [items])

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase()
    return items.filter((it) => {
      if (filter !== 'semua' && statusStock(it) !== filter) return false
      if (!k) return true
      return (
        String(it.nama_barang ?? it.sku).toLowerCase().includes(k) ||
        String(it.sku ?? '').toLowerCase().includes(k)
      )
    })
  }, [items, q, filter])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-light tracking-wide text-[#c2185b]">Inventory Cabang</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {namaLokasi} · {rows.length} barang
            {counts.low + counts.habis > 0 && ` · ${counts.low} menipis · ${counts.habis} habis`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama / SKU…"
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
          />
          {(['semua', 'normal', 'low', 'habis'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[15px] tabular-nums focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none ${
                filter === f
                  ? 'border-[#c2185b] bg-[#c2185b] font-semibold text-white'
                  : 'border-input hover:bg-muted'
              }`}
            >
              {f === 'semua' ? 'Semua' : KIND_LABEL[f]}
              <span className={filter === f ? 'opacity-80' : 'text-muted-foreground'}>{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {rows.length ? (
        <Card className="py-0">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-left text-[15px] tabular-nums">
              <thead>
                <tr className="border-b text-[11px] tracking-widest text-muted-foreground uppercase">
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="px-4 py-3 font-medium">Kategori</th>
                  <th className="px-4 py-3 font-medium">Satuan</th>
                  <th className="px-4 py-3 text-right font-medium">Stock</th>
                  <th className="px-4 py-3 text-right font-medium">Min</th>
                  <th className="px-4 py-3 text-right font-medium">HPP Rata-rata</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => {
                  const kind = statusStock(it)
                  return (
                  <tr key={it.sku} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-2.5 font-medium break-all">{it.sku}</td>
                    <td className="px-4 py-2.5">{it.nama_barang ?? it.sku}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{it.kategori ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{it.satuan ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{fmtNum(it.stock)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {it.min_stock == null ? '-' : fmtNum(it.min_stock)}
                    </td>
                    <td className="px-4 py-2.5 text-right">{fmtRp(it.hpp_average)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-[11px] font-bold tracking-widest uppercase ${PILL_STOCK[kind]}`}
                      >
                        {KIND_LABEL[kind]}
                      </span>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-4 py-10 text-center">
              <p className="text-lg font-medium">{EMPTY_MSG[filter]}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {q ? 'Coba kata kunci lain.' : 'Barang masuk dicatat oleh Inventory Pusat.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

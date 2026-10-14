'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Pencil, Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export type ResepRow = {
  id_paket: string
  sku: string
  nama_barang: string
  qty: number
  satuan: string | null
  stock: number
}

export type ResepPaket = {
  id_paket: string
  nama_paket: string
  tipe: string
  anak: string
  jenis: string
  porsi: number
  kategori: string
  rows: ResepRow[]
}

const inputCls =
  'h-9 rounded-lg border border-input bg-transparent px-3 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none'
const btnGhost =
  'inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted disabled:opacity-50'

export function detailVarian(v: ResepPaket): string {
  return [v.tipe && `Tipe ${v.tipe}`, v.anak, v.jenis].filter(Boolean).join(' · ')
}

type Grup = { nama: string; varian: ResepPaket[] }

export default function DaftarResep({
  initialGroups,
  namaLokasi,
}: {
  initialGroups: ResepPaket[]
  namaLokasi: string
}) {
  const [prevInitial, setPrevInitial] = useState(initialGroups)
  const [groups, setGroups] = useState(initialGroups)
  if (prevInitial !== initialGroups) {
    setPrevInitial(initialGroups)
    setGroups(initialGroups)
  }
  const [q, setQ] = useState('')
  const [buka, setBuka] = useState<string | null>(null)

  const tampil = useMemo<Grup[]>(() => {
    const k = q.trim().toLowerCase()
    const cocok = (v: ResepPaket) =>
      !k ||
      [v.nama_paket, v.tipe, v.anak, v.jenis].some((t) => (t ?? '').toLowerCase().includes(k)) ||
      v.rows.some(
        (r) => r.sku.toLowerCase().includes(k) || r.nama_barang.toLowerCase().includes(k),
      )
    const m = new Map<string, ResepPaket[]>()
    for (const g of groups) {
      if (!cocok(g)) continue
      m.set(g.nama_paket, [...(m.get(g.nama_paket) ?? []), g])
    }
    return [...m.entries()].map(([nama, varian]) => ({
      nama,
      varian: varian.sort((a, b) => (a.porsi || 0) - (b.porsi || 0)),
    }))
  }, [groups, q])

  const mencari = q.trim().length > 0
  const totalBaris = groups.reduce((s, g) => s + g.rows.length, 0)
  const tanpaResep = groups.filter((g) => g.rows.length === 0).length

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-light tracking-wide text-[#c2185b]">Resep Paket</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {namaLokasi} · {groups.length} paket · {totalBaris} baris resep
            {tanpaResep > 0 && ` · ${tanpaResep} paket tanpa resep`}
          </p>
        </div>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari paket, tipe, jenis, SKU…"
            className={`${inputCls} w-72 pl-9`}
          />
        </div>
      </div>

      {tampil.length ? (
        <div className="space-y-4">
          {tampil.map((gr) => {
            const terbuka = mencari || buka === gr.nama
            const bahan = gr.varian.reduce((s, v) => s + v.rows.length, 0)
            const tanpa = gr.varian.filter((v) => v.rows.length === 0).length
            return (
              <Card key={gr.nama} className="py-0">
                <CardContent className="p-0">
                  <button
                    type="button"
                    onClick={() => setBuka(buka === gr.nama ? null : gr.nama)}
                    aria-expanded={terbuka}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
                  >
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-[#c2185b] transition-transform ${terbuka ? 'rotate-180' : ''}`}
                    />
                    <span className="text-lg font-medium">{gr.nama}</span>
                    <span className="text-sm text-muted-foreground">
                      {gr.varian.length} varian · {bahan} bahan
                    </span>
                    {tanpa > 0 && (
                      <span className="ml-auto rounded border border-red-500 px-2 py-0.5 text-[11px] font-bold tracking-widest text-red-600 uppercase">
                        {tanpa} tanpa resep — order ditolak
                      </span>
                    )}
                  </button>
                  {terbuka && (
                    <ul className="divide-y border-t">
                      {gr.varian.map((v) => (
                        <li
                          key={v.id_paket}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5 pr-4 pl-12"
                        >
                          <span>
                            <span className="font-medium">{detailVarian(v) || '—'}</span>
                            <span className="ml-2 text-sm text-muted-foreground">
                              {v.porsi ? `${v.porsi} porsi` : ''} · {v.rows.length} bahan
                            </span>
                            {v.rows.length === 0 && (
                              <span className="ml-2 rounded border border-red-500 px-2 py-0.5 text-[11px] font-bold tracking-widest text-red-600 uppercase">
                                Tanpa resep
                              </span>
                            )}
                          </span>
                          <Link href={`/resep/${v.id_paket}`} className={btnGhost}>
                            <Pencil className="mr-1.5 h-4 w-4" />
                            Edit resep
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="px-4 py-10 text-center">
            <p className="text-lg font-medium">Tidak ada paket cocok</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {mencari ? 'Coba kata kunci lain.' : 'Paket aktif belum ada.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

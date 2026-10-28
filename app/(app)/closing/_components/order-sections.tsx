'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fmtNum, fmtRp } from '@/lib/utils/format'

export type PaketOpt = {
  id: string
  nama_paket: string
  tipe: string | null
  porsi: number | null
  anak: string | null
  jenis: string | null
  harga: number
  kategori: string
  deskripsi: string | null
}

export type OlahanOpt = { 
  id_olahan: string; 
  nama_olahan: string; 
  kategori: string 
}

// Barang keluar per paket (dari menu Resep + stok lokasi). stock null = lokasi tak diketahui.
export type BomRow = {
  sku: string
  nama: string
  perPaket: number
  satuan: string | null
  stock: number | null
}

export type BomPaket = {
  id_paket: string
  rows: BomRow[]
}

export type InventoryHit = {
  sku: string
  nama_barang: string
  satuan: string
  stock: number
  hpp_average: number
}

export type InventoryRow = {
  sku: string
  nama_barang: string
  satuan: string
  stock: number
  qty: number
  harga: number
}

export type SummaryLine = {
  id: string
  nama: string
  qty: number
  harga: number
  satuan?: string
}

export const GOLD_BTN =
  'rounded-full bg-[#e8b10c] font-bold text-[#4a0f30] hover:bg-[#f5c234] focus-visible:ring-[#e8b10c]'

export const RADIO_CARD =
  'cursor-pointer rounded-xl border px-4 py-2.5 text-[15px] has-checked:border-[#e8b10c] has-checked:bg-[#e8b10c]/10'

const ANAK_LABEL: Record<string, string> = {
  'laki-laki': 'Anak laki-laki',
  perempuan: 'Anak perempuan',
  'baby girl': 'Baby girl',
  'baby boy': 'Baby boy',
}

const JENIS_LABEL: Record<string, string> = {
  jantan: 'Kambing jantan',
  betina: 'Kambing betina',
}

// Urutan dalam kolom: kambing betina di atas, jantan di bawah, lalu harga.
function urutVarian(items: PaketOpt[]): PaketOpt[] {
  const rank = (j: string | null) => (j === 'betina' ? 0 : j === 'jantan' ? 1 : 2)
  return [...items].sort((a, b) => rank(a.jenis) - rank(b.jenis) || Number(a.harga) - Number(b.harga))
}

function labelAnak(a: string | null): string {
  if (!a) return ''
  return ANAK_LABEL[a] ?? a
}

function labelJenis(j: string | null): string {
  if (!j) return ''
  return JENIS_LABEL[j] ?? j
}

// Poros split kiri-kanan per grup: anak dulu (perempuan/laki-laki, baby),
// lalu jenis kambing (betina/jantan) bila tak menyebut anak.
function porosSplit(items: PaketOpt[]): { key: 'anak' | 'jenis'; kiri: string; kanan: string } | null {
  const anak = new Set(items.map((i) => i.anak).filter(Boolean) as string[])
  if (anak.has('perempuan') && anak.has('laki-laki')) return { key: 'anak', kiri: 'perempuan', kanan: 'laki-laki' }
  if (anak.has('baby girl') && anak.has('baby boy')) return { key: 'anak', kiri: 'baby girl', kanan: 'baby boy' }
  const jenis = new Set(items.map((i) => i.jenis).filter(Boolean) as string[])
  if (jenis.has('betina') && jenis.has('jantan')) return { key: 'jenis', kiri: 'betina', kanan: 'jantan' }
  return null
}

function judulPoros(key: 'anak' | 'jenis', val: string): string {
  return key === 'anak' ? labelAnak(val) || val : labelJenis(val) || val
}

function VariantCard({
  p,
  value,
  onChange,
  sembunyiPoros,
}: {
  p: PaketOpt
  value: string
  onChange: (id: string) => void
  sembunyiPoros: 'anak' | 'jenis' | null
}) {
  const detail: string[] = []
  if (sembunyiPoros !== 'anak' && p.anak) detail.push(labelAnak(p.anak))
  if (sembunyiPoros !== 'jenis' && p.jenis) detail.push(labelJenis(p.jenis))
  if (p.tipe) detail.push(`Tipe ${p.tipe}`)
  if (p.porsi) detail.push(`${p.porsi} porsi`)
  return (
    <label key={p.id} className={`${RADIO_CARD} has-focus-visible:ring-2 has-focus-visible:ring-[#e8b10c]`}>
      <input
        type="radio"
        name="paket"
        value={p.id}
        checked={value === p.id}
        onChange={() => onChange(p.id)}
        className="mr-2 accent-[#c2185b]"
      />
      <span className="font-medium">{detail.join(' · ') || p.nama_paket}</span>
      <span className="block font-medium text-[#c2185b] tabular-nums">{fmtRp(Number(p.harga))}</span>
    </label>
  )
}

export function PaketSection({
  utama,
  value,
  onChange,
  resep,
  qty,
  onQty,
  error,
}: {
  utama: PaketOpt[]
  value: string
  onChange: (id: string) => void
  resep?: BomPaket[]
  qty: number
  onQty: (n: number) => void
  error?: string | null
}) {
  const groups = useMemo(() => {
    const map = new Map<string, PaketOpt[]>()
    for (const p of utama) {
      const list = map.get(p.nama_paket) ?? []
      list.push(p)
      map.set(p.nama_paket, list)
    }
    return [...map.entries()].map(([nama, items]) => {
      const harga = items.map((i) => Number(i.harga))
      return { nama, items, min: Math.min(...harga), max: Math.max(...harga), selected: items.some((i) => i.id === value) }
    })
  }, [utama, value])
  const [terbuka, setTerbuka] = useState<Set<string>>(new Set())

  function toggle(nama: string) {
    setTerbuka((prev) => {
      const next = new Set(prev)
      if (next.has(nama)) next.delete(nama)
      else next.add(nama)
      return next
    })
  }

  return (
    <Card>
      <CardHeader className="text-lg font-semibold text-[#c2185b]">
        2. Paket utama <span className="text-[#c2185b]">*</span>
      </CardHeader>
      <CardContent className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
          <div>
            <Label htmlFor="qty" className="text-sm font-medium">
              Jumlah paket <span className="text-[#c2185b]">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">Total porsi dan barang keluar mengikuti jumlah ini.</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9"
              aria-label="Kurangi jumlah paket"
              onClick={() => onQty(Math.max(1, qty - 1))}
            >
              −
            </Button>
            <Input
              id="qty"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => onQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              className="h-9 w-16 px-1 text-center text-sm tabular-nums"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9"
              aria-label="Tambah jumlah paket"
              onClick={() => onQty(qty + 1)}
            >
              +
            </Button>
          </div>
        </div>
        {groups.map((g) => {
          const isOpen = terbuka.has(g.nama) || g.selected
          return (
            <div key={g.nama} className="rounded-lg border">
              <button
                type="button"
                onClick={() => toggle(g.nama)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
              >
                <span className="font-medium">{g.nama}</span>
                <span className="text-muted-foreground">· {g.items.length} varian</span>
                <span className="ml-auto font-medium text-[#c2185b] tabular-nums">
                  {g.min === g.max ? fmtRp(g.min) : `${fmtRp(g.min)} – ${fmtRp(g.max)}`}
                </span>
                <span className="text-muted-foreground">{isOpen ? '▴' : '▾'}</span>
              </button>
              {isOpen &&
                (() => {
                  const poros = porosSplit(g.items)
                  if (!poros) {
                    return (
                      <div className="grid gap-1.5 border-t px-3 py-2 md:grid-cols-2">
                        {urutVarian(g.items).map((p) => (
                          <VariantCard key={p.id} p={p} value={value} onChange={onChange} sembunyiPoros={null} />
                        ))}
                      </div>
                    )
                  }
                  const kiri = urutVarian(g.items.filter((p) => p[poros.key] === poros.kiri))
                  const kanan = urutVarian(g.items.filter((p) => p[poros.key] === poros.kanan))
                  const sisa = urutVarian(
                    g.items.filter((p) => p[poros.key] !== poros.kiri && p[poros.key] !== poros.kanan),
                  )
                  const Kolom = ({ judul, items }: { judul: string; items: PaketOpt[] }) => (
                    <div className="grid content-start gap-1.5">
                      <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                        {judul}
                      </p>
                      {items.map((p) => (
                        <VariantCard key={p.id} p={p} value={value} onChange={onChange} sembunyiPoros={poros.key} />
                      ))}
                    </div>
                  )
                  return (
                    <div className="border-t px-3 py-2">
                      <div className="grid gap-3 md:grid-cols-2 md:divide-x md:divide-input">
                        <div className="md:pr-3">
                          <Kolom judul={judulPoros(poros.key, poros.kiri)} items={kiri} />
                        </div>
                        <div className="md:pl-3">
                          <Kolom judul={judulPoros(poros.key, poros.kanan)} items={kanan} />
                        </div>
                      </div>
                      {sisa.length > 0 && (
                        <div className="mt-2 grid gap-1.5 border-t border-dashed pt-2 md:grid-cols-2">
                          {sisa.map((p) => (
                            <VariantCard key={p.id} p={p} value={value} onChange={onChange} sembunyiPoros={null} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
            </div>
          )
        })}
        {!groups.length && <p className="text-sm text-muted-foreground">Tidak ada paket aktif</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {(() => {
          const bom = (resep ?? []).find((b) => b.id_paket === value)
          if (!bom) return null
          const n = Math.max(1, qty || 1)
          return (
            <div className="rounded-lg border bg-muted/40 px-3 py-2">
              <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Barang keluar × {fmtNum(n)} paket
              </p>
              {bom.rows.length ? (
                <ul className="mt-1 space-y-0.5 text-[15px]">
                  {bom.rows.map((r) => {
                    const need = r.perPaket * n
                    const kurang = r.stock != null && need > r.stock
                    return (
                      <li key={r.sku} className="flex flex-wrap gap-x-2">
                        <span className="font-medium">{r.nama}</span>
                        <span className="tabular-nums">
                          × {fmtNum(need)}{r.satuan ? ` ${r.satuan}` : ''}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          (stok {r.stock == null ? '—' : fmtNum(r.stock)})
                        </span>
                        {kurang && (
                          <span className="font-semibold text-red-600">
                            kurang {fmtNum(need - (r.stock ?? 0))}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="mt-1 rounded bg-[#e8b10c]/15 px-2 py-1 text-sm text-[#4a0f30]">
                  Paket ini belum punya resep — order akan ditolak.
                </p>
              )}
            </div>
          )
        })()}
      </CardContent>
    </Card>
  )
}

export function OlahanSection({
  daging,
  jeroan,
  dagingId,
  jeroanId,
  onDaging,
  onJeroan,
  errorDaging,
  errorJeroan,
}: {
  daging: OlahanOpt[]
  jeroan: OlahanOpt[]
  dagingId: string
  jeroanId: string
  onDaging: (id: string) => void
  onJeroan: (id: string) => void
  errorDaging?: string | null
  errorJeroan?: string | null
}) {
  return (
    <Card>
      <CardHeader className="text-lg font-semibold text-[#c2185b]">
        3. Olahan <span className="text-[#c2185b]">*</span>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <fieldset>
          <legend className="mb-1 text-sm text-muted-foreground">Daging (pilih 1)</legend>
          <div className="grid gap-1.5">
            {daging.map((o) => (
              <label key={o.id_olahan} className={RADIO_CARD}>
                <input type="radio" name="daging" checked={dagingId === o.id_olahan}
                  onChange={() => onDaging(o.id_olahan)} className="mr-2 accent-[#c2185b]" />
                {o.nama_olahan}
              </label>
            ))}
          </div>
          {errorDaging && <p className="mt-1 text-sm text-red-600">{errorDaging}</p>}
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm text-muted-foreground">Tulang / jeroan (pilih 1)</legend>
          <div className="grid gap-1.5">
            {jeroan.map((o) => (
              <label key={o.id_olahan} className={RADIO_CARD}>
                <input type="radio" name="jeroan" checked={jeroanId === o.id_olahan}
                  onChange={() => onJeroan(o.id_olahan)} className="mr-2 accent-[#c2185b]" />
                {o.nama_olahan}
              </label>
            ))}
          </div>
          {errorJeroan && <p className="mt-1 text-sm text-red-600">{errorJeroan}</p>}
        </fieldset>
      </CardContent>
    </Card>
  )
}

export function AddonSection({
  addons,
  qty,
  onStep,
  onSet,
}: {
  addons: PaketOpt[]
  qty: Record<string, number>
  onStep: (id: string, d: number) => void
  onSet: (id: string, n: number) => void
}) {
  return (
    <Card>
      <CardHeader className="text-lg font-semibold text-[#c2185b]">4. Add-on (opsional)</CardHeader>
      <CardContent className="grid gap-2">
        {addons.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-sm">
            <div className="flex-1">
              <p className="font-medium">{a.nama_paket}</p>
              <p className="text-muted-foreground tabular-nums">{fmtRp(Number(a.harga))}</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9"
              aria-label={`Kurangi ${a.nama_paket}`}
              onClick={() => onStep(a.id, -1)}
            >
              −
            </Button>
            <Input
              type="number"
              min={0}
              aria-label={`Qty ${a.nama_paket}`}
              value={qty[a.id] ?? 0}
              onChange={(e) => onSet(a.id, Math.max(0, Math.floor(Number(e.target.value)) || 0))}
              className="h-9 w-16 px-1 text-center text-sm tabular-nums"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9"
              aria-label={`Tambah ${a.nama_paket}`}
              onClick={() => onStep(a.id, 1)}
            >
              +
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function InventorySection({
  rows,
  onRows,
}: {
  rows: InventoryRow[]
  onRows: (rows: InventoryRow[]) => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<InventoryHit[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = q.trim()
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      if (term.length < 2) {
        setHits([])
        return
      }
      try {
        const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        const json = await res.json()
        if (res.ok) setHits(json.items ?? [])
      } catch {
        // diamkan, coba lagi saat mengetik
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, term.length < 2 ? 0 : 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  function add(h: InventoryHit) {
    onRows([...rows, { sku: h.sku, nama_barang: h.nama_barang, satuan: h.satuan, stock: h.stock, qty: 1, harga: 0 }])
  }

  function patch(sku: string, p: Partial<InventoryRow>) {
    onRows(rows.map((r) => (r.sku === sku ? { ...r, ...p } : r)))
  }

  const visibleHits = hits.filter((h) => !rows.some((r) => r.sku === h.sku))

  return (
    <Card>
      <CardHeader className="text-lg font-semibold text-[#c2185b]">5. Tambahan Pesanan (opsional)</CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="inv-search">Cari item (min. 2 huruf)</Label>
          <Input
            id="inv-search"
            placeholder="misal nasi box…"
            value={q}
            onChange={(e) => {
              const next = e.target.value
              setQ(next)
              setLoading(next.trim().length >= 2)
            }}
            className="h-11 text-[15px]"
          />
          {loading && <p className="text-sm text-muted-foreground">Mencari…</p>}
          {!loading && q.trim().length >= 2 && !visibleHits.length && (
            <p className="text-sm text-muted-foreground">Tidak ketemu di lokasi ini</p>
          )}
          {!loading && visibleHits.map((h) => (
            <div key={h.sku} className="flex items-center gap-2 text-sm">
              <div className="flex-1">
                <p className="font-medium">{h.nama_barang}</p>
                <p className="text-muted-foreground tabular-nums">
                  {h.sku}{h.satuan ? ` · ${h.satuan}` : ''} · stok {fmtNum(h.stock)} · HPP {fmtRp(h.hpp_average)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9"
                disabled={h.stock <= 0}
                onClick={() => add(h)}
              >
                {h.stock > 0 ? 'Tambah' : 'Habis'}
              </Button>
            </div>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.sku} className="grid gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium">{r.nama_barang}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {r.sku}{r.satuan ? ` · ${r.satuan}` : ''} · stok {r.stock}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => onRows(rows.filter((x) => x.sku !== r.sku))}>
                Hapus
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>Qty</Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-9"
                    aria-label={`Kurangi ${r.nama_barang}`}
                    onClick={() => patch(r.sku, { qty: Math.max(1, r.qty - 1) })}
                  >
                    −
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={Math.max(r.stock, 1)}
                    aria-label={`Qty ${r.nama_barang}`}
                    value={r.qty}
                    onChange={(e) => patch(r.sku, { qty: Math.min(Math.max(r.stock, 1), Math.max(1, Math.floor(Number(e.target.value)) || 1)) })}
                    className="h-9 w-16 px-1 text-center text-sm tabular-nums"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-9"
                    aria-label={`Tambah ${r.nama_barang}`}
                    onClick={() => patch(r.sku, { qty: Math.min(Math.max(r.stock, 1), r.qty + 1) })}
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="grid gap-1">
                <Label>Harga jual</Label>
                <Input type="number" min={0} aria-label={`Harga jual ${r.nama_barang}`} value={r.harga} className="h-10 text-sm"
                  onChange={(e) => patch(r.sku, { harga: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
            </div>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-muted-foreground">Belum ada item tambahan</p>}
      </CardContent>
    </Card>
  )
}

export function BayarSection({
  tipe,
  onTipe,
  diskon,
  onDiskon,
  waktuKirim,
  onWaktu,
  metode,
  onMetode,
  metodeOptions,
  tanggalTransaksi,
  onTanggalTransaksi,
  waktuTiba,
  onWaktuTiba,
  errorMetode,
  errorTanggal,
  errorKirim,
  errorTiba,
}: {
  tipe: 'TUNAI' | 'CICILAN'
  onTipe: (t: 'TUNAI' | 'CICILAN') => void
  diskon: number
  onDiskon: (n: number) => void
  waktuKirim: string
  onWaktu: (v: string) => void
  metode: string
  onMetode: (v: string) => void
  metodeOptions: readonly string[]
  tanggalTransaksi?: string
  onTanggalTransaksi?: (v: string) => void
  waktuTiba: string
  onWaktuTiba: (v: string) => void
  errorMetode?: string | null
  errorTanggal?: string | null
  errorKirim?: string | null
  errorTiba?: string | null
}) {
  return (
    <Card>
      <CardHeader className="text-lg font-semibold text-[#c2185b]">6. Pembayaran & jadwal</CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <div className="grid gap-1.5">
          <Label>
            Tipe pembayaran <span className="text-[#c2185b]">*</span>
          </Label>
          <div className="flex gap-2">
            {(['TUNAI', 'CICILAN'] as const).map((t) => (
              <label key={t} className={`${RADIO_CARD} flex-1 text-center capitalize`}>
                <input type="radio" name="tipe" checked={tipe === t}
                  onChange={() => onTipe(t)} className="mr-2 accent-[#c2185b]" />
                {t}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="diskon">Diskon (Rp)</Label>
          <Input id="diskon" type="number" min={0} value={diskon} className="h-11 text-[15px]"
            onChange={(e) => onDiskon(Math.max(0, Number(e.target.value) || 0))} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="metode">
            Metode pembayaran <span className="text-[#c2185b]">*</span>
          </Label>
          <select
            id="metode"
            required
            value={metode}
            onChange={(e) => onMetode(e.target.value)}
            aria-invalid={!!errorMetode}
            aria-describedby={errorMetode ? 'err-metode' : undefined}
            className="h-11 rounded-lg border border-input bg-transparent px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
          >
            {metodeOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {errorMetode && <p id="err-metode" className="text-sm text-red-600">{errorMetode}</p>}
        </div>
        {onTanggalTransaksi && (
        <div className="grid gap-1.5">
          <Label htmlFor="tgl">
            Tanggal transaksi <span className="text-[#c2185b]">*</span>
          </Label>
          <Input id="tgl" type="date" required value={tanggalTransaksi ?? ''} className="h-11 text-[15px]"
            aria-invalid={!!errorTanggal}
            aria-describedby={errorTanggal ? 'err-tanggal' : undefined}
            onChange={(e) => onTanggalTransaksi(e.target.value)} />
          {errorTanggal && <p id="err-tanggal" className="text-sm text-red-600">{errorTanggal}</p>}
        </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="kirim">
            Jadwal kirim <span className="text-[#c2185b]">*</span>
          </Label>
          <Input id="kirim" type="datetime-local" required value={waktuKirim} className="h-11 text-[15px]"
            aria-invalid={!!errorKirim}
            aria-describedby={errorKirim ? 'err-kirim' : undefined}
            onChange={(e) => onWaktu(e.target.value)} />
          {errorKirim && <p id="err-kirim" className="text-sm text-red-600">{errorKirim}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tiba">
            Jadwal tiba <span className="text-[#c2185b]">*</span>
          </Label>
          <Input id="tiba" type="datetime-local" required value={waktuTiba} className="h-11 text-[15px]"
            aria-invalid={!!errorTiba}
            aria-describedby={errorTiba ? 'err-tiba' : undefined}
            onChange={(e) => onWaktuTiba(e.target.value)} />
          {errorTiba && <p id="err-tiba" className="text-sm text-red-600">{errorTiba}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function fmtWaktu(v: string): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(+d)) return v
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  )
}

export function OrderSummary({
  paketNama,
  qty,
  hargaPaket,
  dagingNama,
  jeroanNama,
  addonLines,
  invLines,
  base,
  addonTotal,
  invTotal,
  diskon,
  total,
  tipe,
  metode,
  waktuKirim,
  waktuTiba,
  error,
  saving,
  submitLabel,
  showSubmit = true,
}: {
  paketNama: string
  qty: number
  hargaPaket: number
  dagingNama?: string
  jeroanNama?: string
  addonLines: SummaryLine[]
  invLines: SummaryLine[]
  base: number
  addonTotal: number
  invTotal: number
  diskon: number
  total: number
  tipe: string
  metode: string
  waktuKirim: string
  waktuTiba: string
  error: string | null
  saving: boolean
  submitLabel: string
  showSubmit?: boolean
}) {
  const addonCount = addonLines.reduce((s, l) => s + l.qty, 0)
  const invCount = invLines.reduce((s, l) => s + l.qty, 0)

  return (
    <Card>
      <CardHeader className="text-lg font-semibold text-[#c2185b]">Ringkasan order</CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">Paket</p>
          <p className="mt-0.5 font-medium">{paketNama || 'Belum dipilih'}</p>
          {paketNama && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {fmtNum(qty)} × {fmtRp(hargaPaket)}
            </p>
          )}
        </div>

        {(dagingNama || jeroanNama) && (
          <div className="space-y-1 border-t pt-3 text-sm">
            {dagingNama && <SummaryRow label="Daging" value={dagingNama} />}
            {jeroanNama && <SummaryRow label="Jeroan" value={jeroanNama} />}
          </div>
        )}

        {addonLines.length > 0 && (
          <div className="space-y-1 border-t pt-3 text-sm">
            <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
              Add-on ({fmtNum(addonCount)})
            </p>
            {addonLines.map((l) => (
              <div key={l.id} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {l.nama} × {fmtNum(l.qty)}
                </span>
                <span className="shrink-0 tabular-nums">{fmtRp(l.harga * l.qty)}</span>
              </div>
            ))}
          </div>
        )}

        {invLines.length > 0 && (
          <div className="space-y-1 border-t pt-3 text-sm">
            <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
              Tambahan ({fmtNum(invCount)})
            </p>
            {invLines.map((l) => (
              <div key={l.id} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {l.nama} × {fmtNum(l.qty)}
                  {l.satuan ? ` ${l.satuan}` : ''}
                </span>
                <span className="shrink-0 tabular-nums">{fmtRp(l.harga * l.qty)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1 border-t pt-3 text-sm">
          <SummaryRow label="Paket" value={fmtRp(base)} />
          <SummaryRow label="Add-on" value={fmtRp(addonTotal)} />
          <SummaryRow label="Tambahan" value={fmtRp(invTotal)} />
          {diskon > 0 && <SummaryRow label="Diskon" value={`− ${fmtRp(diskon)}`} />}
          <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="text-[#c2185b] tabular-nums">{fmtRp(total)}</span>
          </div>
        </div>

        <div className="space-y-0.5 border-t pt-3 text-sm">
          <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">Pembayaran</p>
          <p className="font-medium capitalize">
            {tipe} · {metode}
          </p>
          {(waktuKirim || waktuTiba) && (
            <p className="text-xs text-muted-foreground">
              {waktuKirim ? `Kirim ${fmtWaktu(waktuKirim)}` : ''}
              {waktuKirim && waktuTiba ? ' · ' : ''}
              {waktuTiba ? `Tiba ${fmtWaktu(waktuTiba)}` : ''}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {showSubmit && (
          <Button type="submit" disabled={saving} className={`${GOLD_BTN} hidden h-11 w-full text-base lg:inline-flex`}>
            {saving ? 'Menyimpan…' : submitLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

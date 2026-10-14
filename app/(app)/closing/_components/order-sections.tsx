'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fmtNum, fmtRp } from '@/lib/format'

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
  qtyPaket,
}: {
  utama: PaketOpt[]
  value: string
  onChange: (id: string) => void
  resep?: BomPaket[]
  qtyPaket?: number
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
      <CardHeader className="text-lg font-semibold text-[#c2185b]">2. Paket utama</CardHeader>
      <CardContent className="grid gap-2">
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
        {(() => {
          const bom = (resep ?? []).find((b) => b.id_paket === value)
          if (!bom) return null
          const n = Math.max(1, qtyPaket || 1)
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
}: {
  daging: OlahanOpt[]
  jeroan: OlahanOpt[]
  dagingId: string
  jeroanId: string
  onDaging: (id: string) => void
  onJeroan: (id: string) => void
}) {
  return (
    <Card>
      <CardHeader className="text-lg font-semibold text-[#c2185b]">3. Olahan</CardHeader>
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
            <Button type="button" size="sm" variant="outline" onClick={() => onStep(a.id, -1)}>−</Button>
            <Input
              type="number"
              min={0}
              value={qty[a.id] ?? 0}
              onChange={(e) => onSet(a.id, Math.max(0, Math.floor(Number(e.target.value)) || 0))}
              className="h-8 w-16 px-1 text-center text-sm tabular-nums"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => onStep(a.id, 1)}>+</Button>
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

  async function search(next: string) {
    setQ(next)
    if (next.trim().length < 2) {
      setHits([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(next.trim())}`)
      const json = await res.json()
      if (res.ok) setHits((json.items ?? []).filter((h: InventoryHit) => !rows.some((r) => r.sku === h.sku)))
    } catch {
      // diamkan, coba lagi saat mengetik
    } finally {
      setLoading(false)
    }
  }

  function add(h: InventoryHit) {
    onRows([...rows, { sku: h.sku, nama_barang: h.nama_barang, satuan: h.satuan, stock: h.stock, qty: 1, harga: 0 }])
    setHits((prev) => prev.filter((x) => x.sku !== h.sku))
  }

  function patch(sku: string, p: Partial<InventoryRow>) {
    onRows(rows.map((r) => (r.sku === sku ? { ...r, ...p } : r)))
  }

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
            onChange={(e) => search(e.target.value)}
            className="h-11 text-[15px]"
          />
          {loading && <p className="text-sm text-muted-foreground">Mencari…</p>}
          {!loading && q.trim().length >= 2 && !hits.length && (
            <p className="text-sm text-muted-foreground">Tidak ketemu di lokasi ini</p>
          )}
          {hits.map((h) => (
            <div key={h.sku} className="flex items-center gap-2 text-sm">
              <div className="flex-1">
                <p className="font-medium">{h.nama_barang}</p>
                <p className="text-muted-foreground tabular-nums">
                  {h.sku}{h.satuan ? ` · ${h.satuan}` : ''} · stok {h.stock}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => add(h)}>
                Tambah
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
              <Button type="button" size="sm" variant="ghost" onClick={() => onRows(rows.filter((x) => x.sku !== r.sku))}>
                Hapus
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>Qty</Label>
                <div className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => patch(r.sku, { qty: Math.max(1, r.qty - 1) })}>−</Button>
                  <Input
                    type="number"
                    min={1}
                    max={Math.max(r.stock, 1)}
                    value={r.qty}
                    onChange={(e) => patch(r.sku, { qty: Math.min(Math.max(r.stock, 1), Math.max(1, Math.floor(Number(e.target.value)) || 1)) })}
                    className="h-8 w-16 px-1 text-center text-sm tabular-nums"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => patch(r.sku, { qty: Math.min(Math.max(r.stock, 1), r.qty + 1) })}>+</Button>
                </div>
              </div>
              <div className="grid gap-1">
                <Label>Harga jual</Label>
                <Input type="number" min={0} value={r.harga} className="h-10 text-sm"
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
  qty,
  onQty,
  waktuKirim,
  onWaktu,
  metode,
  onMetode,
  metodeOptions,
  tanggalTransaksi,
  onTanggalTransaksi,
  waktuTiba,
  onWaktuTiba,
}: {
  tipe: 'TUNAI' | 'CICILAN'
  onTipe: (t: 'TUNAI' | 'CICILAN') => void
  diskon: number
  onDiskon: (n: number) => void
  qty: number
  onQty: (n: number) => void
  waktuKirim: string
  onWaktu: (v: string) => void
  metode: string
  onMetode: (v: string) => void
  metodeOptions: readonly string[]
  tanggalTransaksi?: string
  onTanggalTransaksi?: (v: string) => void
  waktuTiba: string
  onWaktuTiba: (v: string) => void
}) {
  return (
    <Card>
      <CardHeader className="text-lg font-semibold text-[#c2185b]">6. Pembayaran & jadwal</CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <div className="grid gap-1.5">
          <Label>Tipe pembayaran</Label>
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
            onChange={(e) => onDiskon(Number(e.target.value))} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="qty">Qty paket</Label>
          <Input id="qty" type="number" min={1} value={qty} className="h-11 text-[15px]"
            onChange={(e) => onQty(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="metode">Metode pembayaran</Label>
          <select
            id="metode"
            value={metode}
            onChange={(e) => onMetode(e.target.value)}
            className="h-11 rounded-lg border border-input bg-transparent px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
          >
            {metodeOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        {onTanggalTransaksi && (
        <div className="grid gap-1.5">
          <Label htmlFor="tgl">Tanggal transaksi</Label>
          <Input id="tgl" type="date" required value={tanggalTransaksi ?? ''} className="h-11 text-[15px]"
            onChange={(e) => onTanggalTransaksi(e.target.value)} />
        </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="kirim">Jadwal kirim</Label>
          <Input id="kirim" type="datetime-local" value={waktuKirim} className="h-11 text-[15px]"
            onChange={(e) => onWaktu(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tiba">Jadwal tiba</Label>
          <Input id="tiba" type="datetime-local" value={waktuTiba} className="h-11 text-[15px]"
            onChange={(e) => onWaktuTiba(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  )
}

export function TotalBar({
  total,
  error,
  saving,
  submitLabel,
}: {
  total: number
  error: string | null
  saving: boolean
  submitLabel: string
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <div className="text-[11px] tracking-widest text-muted-foreground uppercase">Total bayar</div>
          <div className="text-3xl font-light tracking-wide text-[#c2185b] tabular-nums">{fmtRp(total)}</div>
        </div>
        {error && <p className="text-[15px] text-red-600">{error}</p>}
        <Button type="submit" disabled={saving} className={`${GOLD_BTN} h-11 w-full text-base`}>
          {saving ? 'Menyimpan…' : submitLabel}
        </Button>
      </CardContent>
    </Card>
  )
}

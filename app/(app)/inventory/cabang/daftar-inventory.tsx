'use client'

import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { ShoppingCart, Trash, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { fmtNum, fmtRp } from '@/lib/utils/format'
import FormEditStok from '../_components/form-edit-stok'
import { emptyMsg, KIND_LABEL, PILL_STOCK, statusStock, type StockKind } from '../_components/status-stock'

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

type KeranjangItem = { sku: string; nama: string; satuan: string; qty: string }

const EMPTY_MSG = emptyMsg('Belum ada barang di lokasi ini')

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
  const router = useRouter()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'semua' | StockKind>('semua')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<StockRow | null>(null)
  const [konfirmasi, setKonfirmasi] = useState<StockRow | null>(null)

  const [keranjang, setKeranjang] = useState<KeranjangItem[]>([])
  const [expandedSku, setExpandedSku] = useState<string | null>(null)
  const [keranjangTerbuka, setKeranjangTerbuka] = useState(false)
  const [errorKeranjang, setErrorKeranjang] = useState<string | null>(null)
  const [suksesPesan, setSuksesPesan] = useState<string | null>(null)

  function bukaPesan(item: StockRow) {
    setError(null)
    setErrorKeranjang(null)
    setSuksesPesan(null)
    setKonfirmasi(null)
    if (expandedSku === item.sku) {
      setExpandedSku(null)
      return
    }
    setExpandedSku(item.sku)
    setKeranjang((prev) => {
      if (prev.some((x) => x.sku === item.sku)) return prev
      return [...prev, { sku: item.sku, nama: item.nama_barang ?? item.sku, satuan: item.satuan ?? '', qty: '1' }]
    })
  }

  function ubahQtyKeranjang(sku: string, v: string) {
    setErrorKeranjang(null)
    setKeranjang((prev) => prev.map((x) => (x.sku === sku ? { ...x, qty: v } : x)))
  }

  function hapusKeranjang(sku: string) {
    if (expandedSku === sku) setExpandedSku(null)
    if (keranjang.length <= 1) setKeranjangTerbuka(false)
    setErrorKeranjang(null)
    setKeranjang((prev) => prev.filter((x) => x.sku !== sku))
  }

  function kosongkanKeranjang() {
    setKeranjang([])
    setExpandedSku(null)
    setKeranjangTerbuka(false)
    setErrorKeranjang(null)
  }

  async function ajukanKeranjang() {
    const items = keranjang.map((b) => ({
      nama_barang: b.nama.trim(),
      sku: b.sku.trim(),
      qty: Number(b.qty),
    }))
    if (
      !items.length ||
      items.some((b) => !b.nama_barang || !Number.isInteger(b.qty) || b.qty < 1)
    ) {
      setErrorKeranjang('Periksa qty semua barang (minimal 1)')
      return
    }
    setBusy('pesan')
    setErrorKeranjang(null)
    try {
      const res = await fetch('/api/pengajuan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorKeranjang(json?.error ?? 'Gagal mengajukan')
        return
      }
      setKeranjang([])
      setExpandedSku(null)
      setKeranjangTerbuka(false)
      setSuksesPesan(`${items.length} barang masuk ke batch ${json?.batchId}`)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function hapus(nama: string) {
    setBusy(`hapus-${nama}`)
    setError(null)
    try {
      const res = await fetch(`/api/inventory/cabang?nama=${encodeURIComponent(nama)}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'Gagal hapus stok')
        return
      }
      setItems((prev) => prev.filter((it) => (it.nama_barang ?? it.sku) !== nama))
      setKonfirmasi(null)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

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

  const totalQty = keranjang.reduce((sum, it) => sum + (Number(it.qty) || 0), 0)

  return (
    <div className={`mx-auto w-full max-w-[1600px] space-y-5 ${keranjang.length ? 'pb-24' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">
            Inventory · {namaLokasi}
          </p>
          <h1 className="mt-1 font-heading text-4xl font-semibold tracking-[-0.03em] text-[#4a0f30]">
            Inventory Cabang
          </h1>
          <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-linear-to-r from-[#c2185b] to-[#e8b10c]" />
          <p className="mt-3 text-sm text-muted-foreground">
            {namaLokasi} · {rows.length} barang
            {(counts.low > 0 || counts.habis > 0) && (
              <>
                {counts.low > 0 && (
                  <span className="ml-2 rounded-full bg-[#e8b10c]/20 px-2 py-0.5 text-[13px] font-medium text-[#4a0f30] tabular-nums">
                    {counts.low} menipis
                  </span>
                )}
                {counts.habis > 0 && (
                  <span className="ml-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[13px] font-medium text-red-600 tabular-nums">
                    {counts.habis} habis
                  </span>
                )}
              </>
            )}
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

      {suksesPesan && (
        <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">{suksesPesan}</p>
      )}

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {rows.length ? (
        <Card className="py-0">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-left text-[15px] tabular-nums">
              <thead>
                <tr className="sticky top-0 z-10 border-b bg-[#4a0f30]/5 text-xs tracking-wide text-muted-foreground uppercase backdrop-blur-sm">
                  <th scope="col" className="px-4 py-3 font-medium">Nama</th>
                  <th scope="col" className="px-4 py-3 font-medium">Kategori</th>
                  <th scope="col" className="px-4 py-3 font-medium">Satuan</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Stock</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Min</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">HPP Rata-rata</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => {
                  const kind = statusStock(it)
                  const diKeranjang = keranjang.find((x) => x.sku === it.sku)
                  const terbuka = expandedSku === it.sku
                  return (
                    <Fragment key={it.sku}>
                      <tr
                        className={`border-b hover:bg-muted/50 ${
                          diKeranjang ? 'bg-[#e8b10c]/10' : 'odd:bg-muted/20'
                        }`}
                      >
                        <td className="px-4 py-2.5">{it.nama_barang ?? it.sku}</td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{it.kategori ?? '—'}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{it.satuan ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">{fmtNum(it.stock)}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap text-muted-foreground">
                          {it.min_stock == null ? '-' : fmtNum(it.min_stock)}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">{fmtRp(it.hpp_average)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={`inline-block rounded border px-2 py-0.5 text-xs font-bold tracking-widest uppercase ${PILL_STOCK[kind]}`}
                          >
                            {KIND_LABEL[kind]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditItem(it)}
                              aria-label={`Ubah ${it.nama_barang ?? it.sku}`}
                              className="inline-flex min-h-9 items-center rounded-lg border border-input px-3 text-[15px] whitespace-nowrap hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => bukaPesan(it)}
                              aria-expanded={terbuka}
                              className={`inline-flex min-h-9 min-w-22 items-center justify-center rounded-lg border px-3 text-[15px] whitespace-nowrap focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none ${
                                diKeranjang
                                  ? 'border-[#c2185b] bg-[#c2185b] font-semibold text-white hover:bg-[#a3144c]'
                                  : 'border-[#e8b10c] text-[#4a0f30] hover:bg-[#e8b10c]/10'
                              }`}
                            >
                              {terbuka ? 'Tutup' : diKeranjang ? `Pesan · ${diKeranjang.qty || 0}` : 'Pesan'}
                            </button>
                            <button
                              type="button"
                              disabled={busy === `hapus-${it.nama_barang ?? it.sku}`}
                              onClick={() => {
                                setError(null)
                                setKonfirmasi(it)
                              }}
                              aria-label={`Hapus ${it.nama_barang ?? it.sku}`}
                              className="inline-flex min-h-9 items-center rounded-lg border border-red-300 px-3 text-[15px] text-red-700 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none disabled:opacity-50"
                            >
                              {busy === `hapus-${it.nama_barang ?? it.sku}` ? '…' : 'Hapus'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {terbuka && diKeranjang && (
                        <tr className="border-b bg-[#e8b10c]/5">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">
                                  Qty Restock
                                </p>
                                <p className="truncate text-sm font-medium">
                                  {it.nama_barang ?? it.sku}
                                  <span className="ml-1 text-muted-foreground">· {it.satuan || '—'}</span>
                                </p>
                              </div>
                              <label className="w-32">
                                <span className="mb-1 block text-xs text-muted-foreground">Qty</span>
                                <input
                                  autoFocus
                                  value={diKeranjang.qty}
                                  onChange={(e) => ubahQtyKeranjang(it.sku, e.target.value)}
                                  inputMode="numeric"
                                  aria-label={`Qty ${it.nama_barang ?? it.sku}`}
                                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-right text-[15px] tabular-nums focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => hapusKeranjang(it.sku)}
                                className="inline-flex h-10 items-center rounded-lg border border-red-300 px-3 text-sm text-red-700 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
                              >
                                Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setExpandedSku(null)}
                                className="inline-flex h-10 items-center rounded-lg border border-input px-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                              >
                                Tutup
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

      {keranjang.length > 0 && (
        <button
          type="button"
          onClick={() => setKeranjangTerbuka(true)}
          aria-label={`Buka keranjang restock, ${keranjang.length} item`}
          className="fixed right-5 bottom-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#4a0f30] text-white shadow-xl transition-colors hover:bg-[#5c1440] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
        >
          <ShoppingCart className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#e8b10c] px-1.5 text-xs font-bold text-[#4a0f30] tabular-nums">
            {keranjang.length}
          </span>
        </button>
      )}

      <Dialog.Root
        open={keranjangTerbuka}
        onOpenChange={(v) => {
          setKeranjangTerbuka(v)
          if (v) setErrorKeranjang(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-background shadow-lg">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
              <div className="min-w-0">
                <Dialog.Title className="font-heading text-lg font-semibold text-[#4a0f30]">
                  Keranjang Restock
                </Dialog.Title>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {keranjang.length} item · {totalQty} qty
                </p>
              </div>
              <Dialog.Close
                aria-label="Tutup keranjang"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {keranjang.length ? (
                <ul className="divide-y divide-input/70">
                  {keranjang.map((it) => (
                    <li key={it.sku} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{it.nama}</p>
                        <p className="text-xs text-muted-foreground">{it.satuan || '—'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">
                          {it.qty || 0} {it.satuan || ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => hapusKeranjang(it.sku)}
                          aria-label={`Hapus ${it.nama}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">Keranjang masih kosong.</p>
              )}
            </div>
            <div className="shrink-0 border-t p-4">
              {errorKeranjang && (
                <p className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorKeranjang}
                </p>
              )}
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold tabular-nums">
                  {keranjang.length} item · {totalQty} qty
                </span>
              </div>
              <button
                type="button"
                disabled={busy === 'pesan' || !keranjang.length}
                onClick={ajukanKeranjang}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30]! transition-colors hover:bg-[#f5c234] focus-visible:ring-2 focus-visible:ring-[#4a0f30] focus-visible:outline-none disabled:opacity-50"
              >
                {busy === 'pesan' ? 'Mengajukan…' : 'Ajukan Restock'}
              </button>
              <button
                type="button"
                onClick={kosongkanKeranjang}
                disabled={busy === 'pesan'}
                className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-full text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none disabled:opacity-50"
              >
                Kosongkan
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <FormEditStok
        open={editItem !== null}
        item={editItem}
        endpoint="/api/inventory/cabang"
        onClose={() => setEditItem(null)}
        onSaved={() => router.refresh()}
      />

      <Dialog.Root open={konfirmasi !== null} onOpenChange={(v) => !v && setKonfirmasi(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-4 shadow-lg sm:p-5">
            <Dialog.Title className="text-lg font-semibold text-red-700">Hapus barang ini?</Dialog.Title>
            {konfirmasi && (
              <>
                <p className="mt-2 text-[15px]">
                  <span className="font-medium">{konfirmasi.nama_barang ?? konfirmasi.sku}</span> · stok{' '}
                  {fmtNum(konfirmasi.stock)} {konfirmasi.satuan ?? ''}
                </p>
                {Number(konfirmasi.stock) > 0 ? (
                  <p className="mt-3 rounded-lg border border-[#e8b10c]/70 bg-[#e8b10c]/15 px-3 py-2 text-sm text-[#4a0f30]">
                    Stok masih {fmtNum(konfirmasi.stock)} — barang tidak bisa dihapus. Habiskan dulu
                    stoknya.
                  </p>
                ) : (
                  <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    HPP rata-rata ({fmtRp(konfirmasi.hpp_average)}) dan Min. stok ikut terhapus, tidak bisa
                    dipulihkan.
                  </p>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <Dialog.Close className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted">
                    Batal
                  </Dialog.Close>
                  <button
                    type="button"
                    disabled={busy === `hapus-${konfirmasi.nama_barang ?? konfirmasi.sku}`}
                    onClick={() => hapus(konfirmasi.nama_barang ?? konfirmasi.sku)}
                    className="inline-flex h-9 items-center rounded-full bg-red-500 px-4 text-[15px] font-bold text-white hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none disabled:opacity-50"
                  >
                    {busy === `hapus-${konfirmasi.nama_barang ?? konfirmasi.sku}` ? '…' : 'Hapus'}
                  </button>
                </div>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

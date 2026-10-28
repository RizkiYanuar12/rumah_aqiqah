'use client'

import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Boxes, Info, Package, X } from 'lucide-react'
import { inputCls } from './input-cls'
import { KIND_LABEL, PILL_STOCK, type StockKind } from './status-stock'

export type EditStockRow = {
  sku: string
  nama_barang: string | null
  kategori: string | null
  satuan: string | null
  stock: number | null
  min_stock: number | null
  hpp_average: number | null
  is_low: boolean | null
}

export default function FormEditStok({
  open,
  item,
  endpoint,
  onClose,
  onSaved,
}: {
  open: boolean
  item: EditStockRow | null
  endpoint: string
  onClose: () => void
  onSaved: () => void
}) {
  const [prev, setPrev] = useState({ open, item })
  const [masuk, setMasuk] = useState({
    sku: '',
    nama: '',
    kategori: '',
    satuan: '',
    stock: '',
    hpp: '',
    min: '',
  })
  const [galat, setGalat] = useState<{ nama?: string; stock?: string; hpp?: string; min?: string }>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (prev.open !== open || prev.item !== item) {
    setPrev({ open, item })
    if (open && item) {
      setMasuk({
        sku: item.sku,
        nama: item.nama_barang ?? '',
        kategori: item.kategori ?? '',
        satuan: item.satuan ?? '',
        stock: String(item.stock ?? 0),
        hpp: String(item.hpp_average ?? 0),
        min: item.min_stock == null ? '' : String(item.min_stock),
      })
      setGalat({})
      setError(null)
    }
  }

  const stokPreview = Number(masuk.stock)
  const minPreview = masuk.min.trim() === '' ? null : Number(masuk.min)
  const statusPreview: StockKind =
    !Number.isFinite(stokPreview)
      ? 'normal'
      : stokPreview <= 0
        ? 'habis'
        : minPreview != null && stokPreview <= minPreview
          ? 'low'
          : 'normal'

  async function simpan() {
    if (!masuk.sku) {
      setError('SKU tidak valid')
      return
    }
    const g: { nama?: string; stock?: string; hpp?: string; min?: string } = {}
    const nama = masuk.nama.trim()
    if (!nama) g.nama = 'Nama barang wajib diisi'

    const stock = masuk.stock.trim() === '' ? NaN : Number(masuk.stock)
    if (!Number.isFinite(stock) || stock < 0) g.stock = 'Stok harus angka ≥ 0'

    const hpp = masuk.hpp.trim() === '' ? NaN : Number(masuk.hpp)
    if (!Number.isFinite(hpp) || hpp < 0) g.hpp = 'HPP rata-rata harus angka ≥ 0'

    const min = masuk.min.trim() === '' ? null : Number(masuk.min)
    if (min !== null && (!Number.isInteger(min) || min < 0)) {
      g.min = 'Min. stok harus bilangan bulat ≥ 0'
    }
    setGalat(g)
    if (Object.keys(g).length) return

    setBusy(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: masuk.sku,
          nama_barang: nama,
          kategori: masuk.kategori.trim() || null,
          satuan: masuk.satuan.trim() || null,
          stock,
          hpp_average: hpp,
          min_stock: min,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'Gagal ubah barang')
        return
      }
      onClose()
      onSaved()
    } catch {
      setError('Gagal menyimpan. Periksa koneksi lalu coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-background shadow-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void simpan()
            }}
          >
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div className="min-w-0">
                <Dialog.Title className="font-heading text-xl font-semibold tracking-tight text-[#4a0f30]">
                  Ubah Barang
                </Dialog.Title>
                <p className="mt-1 text-sm text-muted-foreground">
                  Perbarui data master dan stok barang di lokasi ini.
                </p>
              </div>
              <Dialog.Close
                type="button"
                aria-label="Tutup"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex gap-2.5 rounded-xl border border-[#e8b10c]/60 bg-[#e8b10c]/10 p-3 text-sm text-[#4a0f30]">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Isi <span className="font-semibold">Stok</span> dengan total akhir. Contoh: stok 3782
                  diubah menjadi 2500, maka sistem menyimpan 2500 — bukan menambah.
                </p>
              </div>

              <section className="rounded-xl border border-[#4a0f30]/10 bg-[#4a0f30]/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#c2185b]/10 text-[#c2185b]">
                    <Package className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[#4a0f30]">Informasi barang</h3>
                    <p className="text-xs text-muted-foreground">Data master yang dipakai semua lokasi.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      SKU
                    </span>
                    <input
                      readOnly
                      value={masuk.sku}
                      className={`${inputCls} w-full bg-muted/50 font-mono text-muted-foreground`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Nama barang
                    </span>
                    <input
                      value={masuk.nama}
                      onChange={(e) => setMasuk((p) => ({ ...p, nama: e.target.value }))}
                      aria-invalid={!!galat.nama}
                      className={`${inputCls} w-full ${galat.nama ? 'border-red-400 focus-visible:ring-red-300' : ''}`}
                    />
                    {galat.nama && (
                      <span role="alert" className="mt-1 block text-xs font-medium text-red-700">
                        {galat.nama}
                      </span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Kategori
                    </span>
                    <input
                      value={masuk.kategori}
                      onChange={(e) => setMasuk((p) => ({ ...p, kategori: e.target.value }))}
                      placeholder="cth. Packaging"
                      className={`${inputCls} w-full`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Satuan
                    </span>
                    <input
                      value={masuk.satuan}
                      onChange={(e) => setMasuk((p) => ({ ...p, satuan: e.target.value }))}
                      placeholder="cth. Pcs"
                      className={`${inputCls} w-full`}
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-xl border border-[#4a0f30]/10 bg-[#4a0f30]/5 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#e8b10c]/20 text-[#4a0f30]">
                      <Boxes className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-[#4a0f30]">Stok & harga</h3>
                      <p className="text-xs text-muted-foreground">Nilai stok di lokasi ini.</p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase ${PILL_STOCK[statusPreview]}`}
                  >
                    {KIND_LABEL[statusPreview]}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Stok
                    </span>
                    <input
                      value={masuk.stock}
                      onChange={(e) => setMasuk((p) => ({ ...p, stock: e.target.value }))}
                      inputMode="decimal"
                      aria-invalid={!!galat.stock}
                      className={`${inputCls} w-full tabular-nums ${galat.stock ? 'border-red-400 focus-visible:ring-red-300' : ''}`}
                    />
                    {galat.stock ? (
                      <span role="alert" className="mt-1 block text-xs font-medium text-red-700">
                        {galat.stock}
                      </span>
                    ) : (
                      <span className="mt-1 block text-xs text-muted-foreground">Total akhir setelah disimpan.</span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      HPP rata-rata
                    </span>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                        Rp
                      </span>
                      <input
                        value={masuk.hpp}
                        onChange={(e) => setMasuk((p) => ({ ...p, hpp: e.target.value }))}
                        inputMode="decimal"
                        aria-invalid={!!galat.hpp}
                        className={`${inputCls} w-full pl-9 tabular-nums ${galat.hpp ? 'border-red-400 focus-visible:ring-red-300' : ''}`}
                      />
                    </div>
                    {galat.hpp ? (
                      <span role="alert" className="mt-1 block text-xs font-medium text-red-700">
                        {galat.hpp}
                      </span>
                    ) : (
                      <span className="mt-1 block text-xs text-muted-foreground">Harga pokok per satuan.</span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Min. stok
                    </span>
                    <input
                      value={masuk.min}
                      onChange={(e) => setMasuk((p) => ({ ...p, min: e.target.value }))}
                      placeholder="cth. 10"
                      inputMode="numeric"
                      aria-invalid={!!galat.min}
                      className={`${inputCls} w-full tabular-nums ${galat.min ? 'border-red-400 focus-visible:ring-red-300' : ''}`}
                    />
                    {galat.min ? (
                      <span role="alert" className="mt-1 block text-xs font-medium text-red-700">
                        {galat.min}
                      </span>
                    ) : (
                      <span className="mt-1 block text-xs text-muted-foreground">Batas peringatan stok menipis.</span>
                    )}
                  </label>
                </div>
              </section>

              {error && (
                <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end">
              <Dialog.Close
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-background px-4 text-[15px] font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
              >
                Batal
              </Dialog.Close>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#e8b10c] px-5 text-[15px] font-bold text-[#4a0f30] transition-colors hover:bg-[#f5c234] focus-visible:ring-2 focus-visible:ring-[#4a0f30] focus-visible:outline-none disabled:opacity-50"
              >
                {busy ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

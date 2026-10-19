'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { fmtNum, fmtRp } from '@/lib/format'
import { inputCls } from '../_components/input-cls'
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
  const [terbuka, setTerbuka] = useState(false)
  const [konfirmasi, setKonfirmasi] = useState<StockRow | null>(null)
  const [masuk, setMasuk] = useState({ nama: '', qty: '', harga: '', min: '', satuan: '', exp: '' })
  const [kemas, setKemas] = useState({ jml: '', isi: '' })
  // Nilai qty terakhir yang diisi kalkulator: pengaman agar hitungan otomatis
  // tidak menimpa qty yang diketik manual (Qty selalu menang).
  const otoRef = useRef<string | null>(null)
  const [minDiubah, setMinDiubah] = useState(false)
  const [galat, setGalat] = useState<{ qty?: string; harga?: string; min?: string }>({})

  const infoStok = masuk.nama.trim()
    ? (items.find((it) => it.nama_barang === masuk.nama.trim()) ?? null)
    : null

  function bukaForm(item: StockRow) {
    setMasuk({
      nama: item.nama_barang ?? '',
      qty: '',
      harga: '',
      min: item.min_stock == null ? '' : String(item.min_stock),
      satuan: item.satuan ?? '',
      exp: '',
    })
    setKemas({ jml: '', isi: '' })
    otoRef.current = null
    setMinDiubah(false)
    setGalat({})
    setError(null)
    setTerbuka(true)
  }

  // Kalkulator kemasan (tanpa simpan): jml kemasan × isi → mengisi Qty otomatis.
  const pcsKemas =
    Number(kemas.jml) > 0 && Number(kemas.isi) > 0
      ? Math.floor(Number(kemas.jml) * Number(kemas.isi))
      : null

  function ubahKemas(kunci: 'jml' | 'isi', v: string) {
    const next = { ...kemas, [kunci]: v }
    setKemas(next)
    const hasil =
      Number(next.jml) > 0 && Number(next.isi) > 0 ? Math.floor(Number(next.jml) * Number(next.isi)) : null
    if (hasil == null) return
    setMasuk((p) => {
      if (p.qty.trim() !== '' && p.qty !== otoRef.current) return p
      otoRef.current = String(hasil)
      return { ...p, qty: String(hasil) }
    })
  }

  async function simpan() {
    const g: { qty?: string; harga?: string; min?: string } = {}
    const nama = masuk.nama.trim()
    if (!nama) {
      setError('Isi nama barang dulu')
      return
    }
    const qtyKosong = masuk.qty.trim() === ''
    const hargaKosong = masuk.harga.trim() === ''
    const qty = qtyKosong ? null : Number(masuk.qty)
    const harga = hargaKosong ? null : Number(masuk.harga)
    const min = masuk.min.trim() === '' ? null : Number(masuk.min)

    if (!qtyKosong && (!Number.isInteger(qty) || (qty as number) < 1)) g.qty = 'Qty minimal 1'
    if (!hargaKosong && !((harga as number) >= 0)) g.harga = 'Harga beli tidak valid'
    if (minDiubah && min !== null && (!Number.isInteger(min) || min < 0)) g.min = 'Min. stok harus bilangan bulat ≥ 0'
    if (qtyKosong && !minDiubah) {
      setError('Tidak ada perubahan — isi Tambah qty atau ubah Min. stok')
      return
    }
    setGalat(g)
    if (Object.keys(g).length) return

    setBusy('simpan')
    setError(null)
    try {
      if (!qtyKosong) {
        const res = await fetch('/api/inventory/cabang', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nama_barang: nama,
            qty,
            harga_beli: harga,
            satuan: masuk.satuan.trim() || null,
            tanggal_exp: masuk.exp.trim() || null,
          }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setError(json?.error ?? 'Gagal catat barang masuk')
          return
        }
      }
      if (minDiubah) {
        const res = await fetch('/api/inventory/cabang', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nama_barang: nama, min_stock: min }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setError(json?.error ?? 'Gagal ubah batas minimum')
          return
        }
      }
      setTerbuka(false)
      setMasuk({ nama: '', qty: '', harga: '', min: '', satuan: '', exp: '' })
      setKemas({ jml: '', isi: '' })
      otoRef.current = null
      setMinDiubah(false)
      setGalat({})
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="bg-[#c2185b] bg-clip-text text-3xl font-light tracking-wide text-transparent">
            Inventory Cabang
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
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
        <Dialog.Root open={terbuka} onOpenChange={setTerbuka}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
            <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-background p-4 shadow-lg sm:p-5">
              <Dialog.Title className="text-lg font-semibold text-[#c2185b]">Ubah Barang</Dialog.Title>
              <div className="mt-3 space-y-3">
                {infoStok && (
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">Data saat ini</p>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">Stok</dt>
                        <dd className="text-[15px] font-semibold tabular-nums">
                          {fmtNum(infoStok.stock)} {infoStok.satuan ?? ''}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">HPP rata-rata</dt>
                        <dd className="text-[15px] tabular-nums">{fmtRp(infoStok.hpp_average)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">Min. stok</dt>
                        <dd className="text-[15px] tabular-nums">
                          {infoStok.min_stock == null ? '—' : fmtNum(infoStok.min_stock)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">Satuan</dt>
                        <dd className="text-[15px]">{infoStok.satuan ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>
                )}
                <label className="block">
                  <span className="mb-1 block text-sm text-muted-foreground">Nama barang</span>
                  <input
                    value={masuk.nama}
                    onChange={(e) => setMasuk((p) => ({ ...p, nama: e.target.value }))}
                    placeholder="Nama barang terdaftar"
                    className={`${inputCls} w-full`}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <label className="w-24 flex-1 basis-24">
                    <span className="mb-1 block text-sm text-muted-foreground">Tambah qty</span>
                    <input
                      value={masuk.qty}
                      onChange={(e) => setMasuk((p) => ({ ...p, qty: e.target.value }))}
                      placeholder="0"
                      inputMode="numeric"
                      className={`${inputCls} w-full`}
                    />
                    {galat.qty && <span className="mt-0.5 block text-sm text-red-700">{galat.qty}</span>}
                  </label>
                  <label className="w-36 flex-1 basis-36">
                    <span className="mb-1 block text-sm text-muted-foreground">Harga beli baru</span>
                    <input
                      value={masuk.harga}
                      onChange={(e) => setMasuk((p) => ({ ...p, harga: e.target.value }))}
                      placeholder="cth. 15000"
                      inputMode="numeric"
                      className={`${inputCls} w-full`}
                    />
                    {galat.harga && <span className="mt-0.5 block text-sm text-red-700">{galat.harga}</span>}
                  </label>
                  <label className="w-36 flex-1 basis-36">
                    <span className="mb-1 block text-sm text-muted-foreground">Min. stok</span>
                    <input
                      value={masuk.min}
                      onChange={(e) => {
                        setMasuk((p) => ({ ...p, min: e.target.value }))
                        setMinDiubah(true)
                      }}
                      placeholder="cth. 10"
                      inputMode="numeric"
                      className={`${inputCls} w-full`}
                    />
                    {galat.min && <span className="mt-0.5 block text-sm text-red-700">{galat.min}</span>}
                  </label>
                  <label className="w-28 flex-1 basis-28">
                    <span className="mb-1 block text-sm text-muted-foreground">Satuan</span>
                    <input
                      value={masuk.satuan}
                      onChange={(e) => setMasuk((p) => ({ ...p, satuan: e.target.value }))}
                      placeholder="Pcs"
                      className={`${inputCls} w-full`}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="w-36 flex-1 basis-36">
                    <span className="mb-1 block text-sm text-muted-foreground">Tgl. exp batch baru</span>
                    <input
                      type="date"
                      value={masuk.exp}
                      onChange={(e) => setMasuk((p) => ({ ...p, exp: e.target.value }))}
                      className={`${inputCls} w-full`}
                    />
                  </label>
                  <div className="flex flex-1 basis-48 items-end gap-2">
                    <label className="w-20 flex-1">
                      <span className="mb-1 block text-sm text-muted-foreground">Kemasan</span>
                      <input
                        value={kemas.jml}
                        onChange={(e) => ubahKemas('jml', e.target.value)}
                        placeholder="cth. 4"
                        inputMode="decimal"
                        className={`${inputCls} w-full`}
                      />
                    </label>
                    <span className="pb-2 text-muted-foreground">×</span>
                    <label className="w-20 flex-1">
                      <span className="mb-1 block text-sm text-muted-foreground">Isi/kemasan</span>
                      <input
                        value={kemas.isi}
                        onChange={(e) => ubahKemas('isi', e.target.value)}
                        placeholder="cth. 250"
                        inputMode="decimal"
                        className={`${inputCls} w-full`}
                      />
                    </label>
                    <span
                      className="pb-2 text-sm whitespace-nowrap text-muted-foreground tabular-nums"
                      title="Otomatis mengisi Tambah qty di atas"
                    >
                      {pcsKemas != null ? `= ${fmtNum(pcsKemas)}` : '= …'}
                    </span>
                  </div>
                </div>
                {error && (
                  <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}
                <div className="flex justify-end gap-2">
                  <Dialog.Close className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted">
                    Batal
                  </Dialog.Close>
                  <button
                    type="button"
                    disabled={busy === 'simpan'}
                    onClick={simpan}
                    className="inline-flex h-9 items-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] disabled:opacity-50"
                  >
                    {busy === 'simpan' ? '…' : 'Simpan'}
                  </button>
                </div>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      {error && !terbuka && (
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
                  return (
                  <tr key={it.sku} className="border-b last:border-0 odd:bg-muted/20 hover:bg-muted/50">
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
                          onClick={() => bukaForm(it)}
                          aria-label={`Ubah ${it.nama_barang ?? it.sku}`}
                          className="inline-flex min-h-9 items-center rounded-lg border border-input px-3 text-[15px] whitespace-nowrap hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy === `hapus-${it.nama_barang ?? it.sku}`}
                          onClick={() => {
                            setError(null)
                            setKonfirmasi(it)
                          }}
                          aria-label={`Hapus ${it.nama_barang ?? it.sku}`}
                          className="inline-flex min-h-9 items-center rounded-lg border border-red-300 px-3 text-[15px] whitespace-nowrap text-red-700 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none disabled:opacity-50"
                        >
                          {busy === `hapus-${it.nama_barang ?? it.sku}` ? '…' : 'Hapus'}
                        </button>
                      </div>
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

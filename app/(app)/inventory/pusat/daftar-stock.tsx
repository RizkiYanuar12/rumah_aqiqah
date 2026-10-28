'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { fmtDate, fmtNum, fmtRp } from '@/lib/utils/format'
import { hariWIB } from '@/lib/closing'
import FormEditStok from '../_components/form-edit-stok'
import FormStok, { type MasterRow, type StokRow } from '../_components/form-stok'
import { inputCls } from '../_components/input-cls'
import { emptyMsg, KIND_LABEL, PILL_STOCK, statusStock, type StockKind } from '../_components/status-stock'

export type PusatRow = StokRow

export type MutasiRow = {
  sku: string
  nama_barang?: string | null
  jenis: string
  jumlah: number
  harga_satuan: number | null
  tanggal_exp: string | null
  created_at: string
  id_lokasi?: string | null
  id_batch?: string | null
  id_lokasi_tujuan?: string | null
  tujuan?: { nama: string | null } | null
  dikirim_at?: string | null
  nama_pengirim?: string | null
}

const PILL_JENIS: Record<string, string> = {
  MASUK: 'border-green-300 bg-green-50 text-green-700',
  KELUAR: 'border-[#e8b10c]/70 bg-[#e8b10c]/15 text-[#4a0f30]',
  BATAL: 'border-red-300 bg-red-50 text-red-700',
}

const EMPTY_MSG = emptyMsg('Belum ada barang di Gudang Pusat')

// Status kedaluwarsa batch MASUK: 'lewat' bila sudah lewat tanggal, 'dekat' bila ≤30 hari.
function statusExp(tgl: string | null | undefined): 'lewat' | 'dekat' | null {
  if (!tgl) return null
  // Hitung hari WIB: server (UTC) & browser (WIB) harus sama.
  const hari = Math.ceil(
    (Date.parse(`${hariWIB(tgl)}T00:00:00Z`) - Date.parse(`${hariWIB(new Date())}T00:00:00Z`)) /
      86400000,
  )
  if (hari < 0) return 'lewat'
  if (hari <= 30) return 'dekat'
  return null
}

export default function DaftarStock({
  initialItems,
  initialMutasi,
  master,
}: {
  initialItems: PusatRow[]
  initialMutasi: MutasiRow[]
  master: MasterRow[]
}) {
  const router = useRouter()
  const [prevItems, setPrevItems] = useState(initialItems)
  const [prevMutasi, setPrevMutasi] = useState(initialMutasi)
  const [items, setItems] = useState(initialItems)
  const [mutasi, setMutasi] = useState(initialMutasi)
  if (prevItems !== initialItems || prevMutasi !== initialMutasi) {
    setPrevItems(initialItems)
    setPrevMutasi(initialMutasi)
    setItems(initialItems)
    setMutasi(initialMutasi)
  }
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'semua' | StockKind>('semua')
  const [tab, setTab] = useState<'stok' | 'riwayat'>('stok')
  const [jenis, setJenis] = useState('semua')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [konfirmasi, setKonfirmasi] = useState<PusatRow | null>(null)
  const [formBuka, setFormBuka] = useState(false)
  const [editItem, setEditItem] = useState<PusatRow | null>(null)

  const counts = useMemo(() => {
    const c: Record<'semua' | StockKind, number> = { semua: items.length, normal: 0, low: 0, habis: 0 }
    for (const it of items) c[statusStock(it)] += 1
    return c
  }, [items])

  const tampil = useMemo(() => {
    const k = q.trim().toLowerCase()
    return items.filter(
      (it) =>
        (filter === 'semua' || statusStock(it) === filter) &&
        (!k ||
          String(it.nama_barang ?? it.sku).toLowerCase().includes(k) ||
          String(it.sku ?? '').toLowerCase().includes(k)),
    )
  }, [items, q, filter])

  const mutasiTampil = useMemo(
    () => (jenis === 'semua' ? mutasi : mutasi.filter((m) => m.jenis === jenis)),
    [mutasi, jenis],
  )

  const mutasiBatch = useMemo(() => {
    const map = new Map<string, MutasiRow[]>()
    for (const m of mutasiTampil) {
      const key = m.id_batch?.trim() || `tanggal:${m.created_at.slice(0, 10)}`
      const arr = map.get(key) ?? []
      arr.push(m)
      map.set(key, arr)
    }
    return [...map.entries()].map(([key, rows]) => ({
      key,
      label: key.startsWith('tanggal:') ? `Batch PUSAT ${key.slice(8)}` : `Batch ${key}`,
      rows,
    }))
  }, [mutasiTampil])

  const nPeringatan = { menipis: counts.low, habis: counts.habis, total: counts.low + counts.habis }

  async function hapus(nama: string) {
    setBusy(`hapus-${nama}`)
    setError(null)
    try {
      const res = await fetch(`/api/inventory/pusat?nama=${encodeURIComponent(nama)}`, {
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

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">
            Inventory · Gudang Pusat
          </p>
          <h1 className="mt-1 font-heading text-4xl font-semibold tracking-[-0.03em] text-[#4a0f30]">
            Stock Pusat
          </h1>
          <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-linear-to-r from-[#c2185b] to-[#e8b10c]" />
          <p className="mt-3 text-sm text-muted-foreground">
            Gudang Pusat · {items.length} barang
            {(counts.low > 0 || counts.habis > 0) && (
              <>
                <span className="ml-2 rounded-full bg-[#e8b10c]/20 px-2 py-0.5 text-[13px] font-medium text-[#4a0f30] tabular-nums">
                  {counts.low} menipis
                </span>
                <span className="ml-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[13px] font-medium text-red-600 tabular-nums">
                  {counts.habis} habis
                </span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormBuka(true)}
          className="inline-flex h-9 items-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
        >
          + Tambah Data
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {nPeringatan.total > 0 && (
        <p className="rounded-lg border border-[#e8b10c]/70 bg-[#e8b10c]/15 px-3 py-2 text-sm text-[#4a0f30]">
          {nPeringatan.habis > 0 && `${nPeringatan.habis} barang habis`}
          {nPeringatan.habis > 0 && nPeringatan.menipis > 0 && ' · '}
          {nPeringatan.menipis > 0 && `${nPeringatan.menipis} barang menipis`} — ubah batas minimum lewat Tambah Data.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['stok', 'riwayat'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[15px] tabular-nums focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none ${
              tab === t
                ? 'border-[#c2185b] bg-[#c2185b] font-semibold text-white'
                : 'border-input hover:bg-muted'
            }`}
          >
            {t === 'stok' ? 'Stock' : 'Riwayat'}
            <span className={tab === t ? 'opacity-80' : 'text-muted-foreground'}>
              {t === 'stok' ? items.length : mutasi.length}
            </span>
          </button>
        ))}
      </div>

      {tab === 'stok' && (
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama Barang"
          aria-label="Cari barang"
          className={`${inputCls} max-w-xs flex-1`}
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
      )}

      {tab === 'riwayat' && (
        <div className="flex flex-wrap items-center gap-2">
          {(['semua', 'MASUK', 'KELUAR', 'BATAL'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setJenis(s)}
              aria-pressed={jenis === s}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[15px] tabular-nums focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none ${
                jenis === s
                  ? 'border-[#c2185b] bg-[#c2185b] font-semibold text-white'
                  : 'border-input hover:bg-muted'
              }`}
            >
              {s === 'semua' ? 'Semua' : s}
              <span className={jenis === s ? 'opacity-80' : 'text-muted-foreground'}>
                {s === 'semua' ? mutasi.length : mutasi.filter((m) => m.jenis === s).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {tab === 'stok' && (tampil.length ? (
        <Card className="py-0">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-left text-[15px] tabular-nums">
              <thead>
                <tr className="sticky top-0 z-10 border-b bg-[#4a0f30]/5 text-xs tracking-wide text-muted-foreground uppercase backdrop-blur-sm">
                  <th scope="col" className="px-3 py-3 font-medium">Nama</th>
                  <th scope="col" className="px-3 py-3 font-medium">Satuan</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Stock</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Min</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">HPP Rata-rata</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Status</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {tampil.map((it) => {
                  const kind = statusStock(it)
                  return (
                  <tr key={it.sku} className="border-b last:border-0 odd:bg-muted/20 hover:bg-muted/50">
                    <td className="px-3 py-2.5">{it.nama_barang ?? it.sku}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{it.satuan ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{fmtNum(it.stock)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-muted-foreground">
                      {it.min_stock == null ? '-' : fmtNum(it.min_stock)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtRp(it.hpp_average)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`inline-block rounded border px-2 py-0.5 text-xs font-bold tracking-widest uppercase ${PILL_STOCK[kind]}`}>
                        {KIND_LABEL[kind]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
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
              {q ? 'Coba kata kunci lain.' : 'Tambah data lewat tombol di atas.'}
            </p>
          </CardContent>
        </Card>
      ))}

      {tab === 'riwayat' && (mutasiTampil.length ? (
        <div className="flex flex-col gap-4">
          {mutasiBatch.map((batch) => (
            <Card key={batch.key} className="py-0">
              <CardContent className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
                  <p className="text-xs font-semibold tracking-wide text-[#4a0f30] uppercase">{batch.label}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">{batch.rows.length} item</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-left text-[15px] tabular-nums">

                    <thead>
                      <tr className="sticky top-0 z-10 border-b bg-[#4a0f30]/5 text-xs tracking-wide text-muted-foreground uppercase backdrop-blur-sm">
                        <th scope="col" className="px-3 py-2.5 font-medium w-[8%]">Status</th>
                        <th scope="col" className="px-3 py-2.5 font-medium w-[22%]">Nama Item</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium w-[8%]">Jumlah</th>
                        <th scope="col" className="px-3 py-2.5 font-medium w-[12%]">Lokasi Pengirim</th>
                        <th scope="col" className="px-3 py-2.5 font-medium w-[13%]">Tujuan Pengiriman</th>
                        <th scope="col" className="px-3 py-2.5 font-medium w-[15%]">Pengirim</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium w-[11%]">Tanggal Pesan</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium w-[11%]">Tanggal Kirim</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.rows.map((m, i) => (
                        <tr key={i} className="border-b last:border-0 odd:bg-muted/20 hover:bg-muted/50">
                          <td className="px-3 py-2.5">
                            <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-bold tracking-wide uppercase ${PILL_JENIS[m.jenis] ?? ''}`}>{m.jenis}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="min-w-0">
                              <span className="font-medium truncate">{m.nama_barang ?? m.sku}</span>
                              {m.jenis === 'MASUK' && m.tanggal_exp && (
                                <span className={`block text-sm ${statusExp(m.tanggal_exp) === 'lewat' ? 'text-red-700' : statusExp(m.tanggal_exp) === 'dekat' ? 'text-[#9a6b00]' : 'text-muted-foreground'}`}>
                                  exp {fmtDate(m.tanggal_exp)}
                                  {statusExp(m.tanggal_exp) === 'lewat' ? ' kedaluwarsa' : statusExp(m.tanggal_exp) === 'dekat' ? ' · ≤30 hari' : ''}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{fmtNum(m.jumlah)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis text-muted-foreground">{m.id_lokasi ?? "—"}</td>
                          <td className="px-3 py-2.5 overflow-hidden">
                            {m.jenis === 'KELUAR' && m.tujuan?.nama ? (
                              <span className="inline-block rounded border border-input bg-muted/50 px-2 py-0.5 text-xs tabular-nums">{m.tujuan.nama}</span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-muted-foreground">
                            <span className="block truncate">{m.nama_pengirim ?? "—"}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap text-muted-foreground">{fmtDate(m.dikirim_at)}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap text-muted-foreground">{fmtDate(m.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="px-4 py-10 text-center">
            <p className="text-lg font-medium">Belum ada riwayat{jenis === 'semua' ? '' : ` ${jenis}`}</p>
            <p className="mt-1 text-sm text-muted-foreground">Mutasi Pusat tampil di sini setelah ada barang masuk/keluar.</p>
          </CardContent>
        </Card>
      ))}
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
                    Stok masih {fmtNum(konfirmasi.stock)} barang tidak bisa dihapus. Habiskan dulu stoknya.
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
                    {busy === `hapus-${konfirmasi.nama_barang ?? konfirmasi.sku}` ? '...' : 'Hapus'}
                  </button>
                </div>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <FormStok
        open={formBuka}
        onClose={() => setFormBuka(false)}
        item={null}
        items={items}
        master={master}
        onSukses={() => router.refresh()}
      />

      <FormEditStok
        open={editItem !== null}
        item={editItem}
        endpoint="/api/inventory/pusat"
        onClose={() => setEditItem(null)}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}

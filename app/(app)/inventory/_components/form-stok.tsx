'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { fmtNum, fmtRp } from '@/lib/utils/format'
import { inputCls } from './input-cls'

export type StokRow = {
  sku: string
  nama_barang: string | null
  kategori: string | null
  satuan: string | null
  stock: number | null
  min_stock: number | null
  hpp_average: number | null
  is_low: boolean | null
}

export type MasterRow = { sku: string; nama_barang: string; satuan: string | null }

// Input nama + saran dari master (filter lokal; master kecil).
// Tanpa SKU: server yang memetakan.
function InputSaran({
  value,
  onPilih,
  placeholder,
  master,
  stok,
}: {
  value: string
  onPilih: (nama: string) => void
  placeholder: string
  master: MasterRow[]
  stok: Record<string, number>
}) {
  const [buka, setBuka] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function luar(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setBuka(false)
    }
    document.addEventListener('pointerdown', luar)
    return () => document.removeEventListener('pointerdown', luar)
  }, [])

  const daftar = useMemo(() => {
    const k = value.trim().toLowerCase()
    if (k.length < 2) return []
    return master
      .filter(
        (m) =>
          m.nama_barang.toLowerCase().includes(k) || m.sku.toLowerCase().includes(k),
      )
      .slice(0, 8)
  }, [value, master])

  function sorot(nama: string, kunci: string) {
    const k = kunci.trim().toLowerCase()
    const idx = k ? nama.toLowerCase().indexOf(k) : -1
    if (idx < 0) return nama
    return (
      <>
        {nama.slice(0, idx)}
        <span className="font-bold">{nama.slice(idx, idx + k.length)}</span>
        {nama.slice(idx + k.length)}
      </>
    )
  }

  const tampil = buka && value.trim().length >= 2
  return (
    <div ref={boxRef} className="relative min-w-0 flex-1 basis-48">
      <input
        value={value}
        onChange={(e) => {
          onPilih(e.target.value)
          setBuka(true)
        }}
        onFocus={() => value.trim().length >= 2 && setBuka(true)}
        onKeyDown={(e) => e.key === 'Escape' && setBuka(false)}
        placeholder={placeholder}
        autoComplete="off"
        className={`${inputCls} w-full`}
      />
      {tampil && (
        <ul className="absolute z-10 mt-1 max-h-[120px] w-full overflow-y-auto overscroll-contain rounded-lg border border-input bg-background shadow-lg touch-pan-y">
          {!daftar.length && (
            <li className="px-3 py-2 text-[15px] text-muted-foreground">Tidak ada barang cocok — cek ejaan</li>
          )}
          {daftar.map((m) => (
            <li key={m.sku}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPilih(m.nama_barang)
                  setBuka(false)
                }}
                className="flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left text-[15px] hover:bg-muted"
              >
                <span className="font-medium">{sorot(m.nama_barang, value)}</span>
                <span className="text-sm text-muted-foreground tabular-nums">stok {stok[m.sku] ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const KOSONG = { nama: '', qty: '', harga: '', min: '', satuan: '', exp: '' }

export default function FormStok({
  open,
  onClose,
  item,
  items,
  master,
  onSukses,
}: {
  open: boolean
  onClose: () => void
  item: StokRow | null
  items: StokRow[]
  master: MasterRow[]
  onSukses: () => void
}) {
  const [prevItem, setPrevItem] = useState(item)
  const [masuk, setMasuk] = useState(KOSONG)
  const [kemas, setKemas] = useState({ jml: '', isi: '' })
  // Nilai qty terakhir yang diisi kalkulator: pengaman agar hitungan otomatis
  // tidak menimpa qty yang diketik manual (Qty selalu menang).
  const [otomatis, setOtomatis] = useState('')
  const [minDiubah, setMinDiubah] = useState(false)
  const [galat, setGalat] = useState<{ qty?: string; harga?: string; min?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [menyimpan, setMenyimpan] = useState(false)

  // Props baru harus menggantikan state lama (pola render-adjust, tanpa effect).
  if (open && prevItem !== item) {
    setPrevItem(item)
    setMasuk(
      item
        ? {
            nama: item.nama_barang ?? '',
            qty: '',
            harga: '',
            min: item.min_stock == null ? '' : String(item.min_stock),
            satuan: item.satuan ?? '',
            exp: '',
          }
        : KOSONG,
    )
    setKemas({ jml: '', isi: '' })
    setOtomatis('')
    setMinDiubah(false)
    setGalat({})
    setError(null)
  }

  const stokMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of items) m[it.sku] = Number(it.stock) || 0
    return m
  }, [items])

  // Mode form dari master: cocok persis = tambah stok; tak cocok = barang baru.
  const kunciNama = masuk.nama.trim().toLowerCase()
  const cocokMaster = kunciNama ? master.find((m) => m.nama_barang.trim().toLowerCase() === kunciNama) ?? null : null
  const modeBaru = masuk.nama.trim() ? !cocokMaster : null
  const infoStok = cocokMaster ? (items.find((it) => it.sku === cocokMaster.sku) ?? null) : null

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
      // qty diketik manual = berbeda dari nilai otomatis terakhir → jangan ditimpa.
      if (p.qty.trim() !== '' && p.qty !== otomatis) return p
      return { ...p, qty: String(hasil) }
    })
    setOtomatis(String(hasil))
  }

  // Satu tombol Simpan: validasi inline per mode, lalu POST (masuk)
  // dan/atau PATCH (batas, hanya bila field min diubah).
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

    if (modeBaru) {
      if (qty == null || !Number.isInteger(qty) || qty < 1) g.qty = 'Qty minimal 1'
      if (harga == null || !(harga >= 0)) g.harga = 'Harga beli wajib diisi'
      if (min == null || !Number.isInteger(min) || min < 0) g.min = 'Min. stok wajib diisi'
    } else {
      if (!qtyKosong && (!Number.isInteger(qty) || (qty as number) < 1)) g.qty = 'Qty minimal 1'
      if (!hargaKosong && !((harga as number) >= 0)) g.harga = 'Harga beli tidak valid'
      if (minDiubah && min !== null && (!Number.isInteger(min) || min < 0)) g.min = 'Min. stok harus bilangan bulat ≥ 0'
      if (qtyKosong && !minDiubah) {
        setError('Tidak ada perubahan — isi Tambah qty atau ubah Min. stok')
        return
      }
      // Tambah qty = increment (barang_masuk menambah stok), bukan nilai absolut;
      // jadi tidak pernah diisi otomatis dengan stok sekarang.
    }
    setGalat(g)
    if (Object.keys(g).length) return

    setMenyimpan(true)
    setError(null)
    try {
      // 1. Barang masuk (mode baru selalu; mode ada hanya bila qty diisi).
      if (modeBaru || !qtyKosong) {
        const res = await fetch('/api/inventory/pusat', {
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
      // 2. Batas minimum (mode baru selalu; mode ada hanya bila diubah).
      if (modeBaru || minDiubah) {
        const res = await fetch('/api/inventory/pusat', {
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
      onClose()
      onSukses()
    } finally {
      setMenyimpan(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-background p-4 shadow-lg sm:p-5">
          <Dialog.Title className="text-lg font-semibold text-[#c2185b]">
            {modeBaru === false ? 'Ubah Barang' : 'Tambah Data'}
          </Dialog.Title>
          <div className="mt-3 space-y-3">
            {modeBaru === true && (
              <p className="rounded-lg border border-[#e8b10c]/70 bg-[#e8b10c]/15 px-3 py-2 text-sm text-[#4a0f30]">
                Barang baru — akan didaftarkan otomatis (SKU GDG berikutnya). Qty, harga, dan min. stok wajib diisi.
              </p>
            )}
            {modeBaru === false && infoStok && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                  Data saat ini
                </p>
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
              <InputSaran value={masuk.nama} onPilih={(nama) => {
                const cocok = master.find((m) => m.nama_barang.trim().toLowerCase() === nama.trim().toLowerCase())
                setMasuk((p) => ({ ...p, nama, satuan: cocok?.satuan ?? p.satuan }))
              }} placeholder="Ketik nama barang…" master={master} stok={stokMap} />
            </label>
            <div className="flex flex-wrap gap-2">
              <label className="w-24 flex-1 basis-24">
                <span className="mb-1 block text-sm text-muted-foreground">
                  {modeBaru === false ? 'Tambah qty' : 'Qty'}{modeBaru ? ' *' : ''}
                </span>
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
                <span className="mb-1 block text-sm text-muted-foreground">
                  {modeBaru === false ? 'Harga beli baru' : 'Harga'}{modeBaru ? ' *' : ''}
                </span>
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
                <span className="mb-1 block text-sm text-muted-foreground">Min. stok{modeBaru ? ' *' : ''}</span>
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
                <span className="mb-1 block text-sm text-muted-foreground">
                  {modeBaru === false ? 'Tgl. exp batch baru' : 'Tgl. exp batch (opsional)'}
                </span>
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
                  title="Otomatis mengisi Qty di atas"
                >
                  {pcsKemas != null ? `= ${fmtNum(pcsKemas)}` : '= …'}
                </span>
              </div>
            </div>
            {error && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted">
                Batal
              </Dialog.Close>
              <button
                type="button"
                disabled={menyimpan}
                onClick={simpan}
                className="inline-flex h-9 items-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] disabled:opacity-50"
              >
                {menyimpan ? '…' : 'Simpan'}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
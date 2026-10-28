'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { fmtDate, fmtNum } from '@/lib/utils/format'

export type PengajuanRow = {
  batch_id: string
  batch_date: string
  id_lokasi: string
  nama_lokasi: string
  status: string
  created_at: string
  sku: string
  qty: number
  nama_barang: string | null
  alasan_tolak: string | null
  ditolak_oleh: string | null
  ditolak_at: string | null
  nama_penolak: string | null
}

const PENGAJUAN_STATUS = ['DIAJUKAN', 'DISETUJUI', 'DIKIRIM', 'DITERIMA', 'DITOLAK', 'DIBATALKAN'] as const

const PILL: Record<string, string> = {
  DIAJUKAN: 'border-[#e8b10c]/70 bg-[#e8b10c]/15 text-[#4a0f30]',
  DISETUJUI: 'border-green-300 bg-green-50 text-green-700',
  DIKIRIM: 'border-[#133fed]/70 bg-[#133fed]/15 text-[#133fed]',
  DITERIMA: 'border-teal-300 bg-teal-50 text-teal-700',
  DITOLAK: 'border-red-300 bg-red-50 text-red-700'
}

export default function DaftarPengajuan({
  initialRows,
  mode,
  namaLokasi,
  stokPusat,
}: {
  initialRows: PengajuanRow[]
  mode: 'cabang' | 'pusat'
  namaLokasi: string
  stokPusat: Record<string, number>
}) {
  const router = useRouter()
  const [prevInitial, setPrevInitial] = useState(initialRows)
  const [rows, setRows] = useState(initialRows)
  if (prevInitial !== initialRows) {
    setPrevInitial(initialRows)
    setRows(initialRows)
  }
  const [filter, setFilter] = useState('semua')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tolakKey, setTolakKey] = useState<string | null>(null)
  const [alasanTolak, setAlasanTolak] = useState('')

  const tampil = useMemo(
    () => (filter === 'semua' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  )
  const nDiajukan = rows.filter((r) => r.status === 'DIAJUKAN').length

  async function batalkan(batchId: string, sku: string) {
    setBusy(`${batchId}:${sku}`)
    setError(null)
    try {
      const res = await fetch(`/api/pengajuan?batch_id=${encodeURIComponent(batchId)}&sku=${encodeURIComponent(sku)}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'Gagal menghapus pengajuan')
        return
      }
      setRows((prev) => prev.filter((r) => r.batch_id !== batchId || r.sku !== sku))
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function putuskan(
    batchId: string,
    sku: string,
    aksi: 'setuju' | 'kirim' | 'tolak' | 'terima',
    alasan = '',
  ) {
    const alasanBersih = alasan.trim()
    if (aksi === 'tolak' && !alasanBersih) {
      setError('Alasan penolakan wajib diisi')
      return
    }
    const key = `${batchId}:${sku}`
    setBusy(key)
    setError(null)
    try {
      const res = await fetch(`/api/pengajuan/${batchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aksi, sku, ...(aksi === 'tolak' ? { alasan: alasanBersih } : {}) }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'Gagal memproses')
        return
      }
      setRows((prev) =>
        prev.map((r) =>
          r.batch_id === batchId && r.sku === sku
            ? {
                ...r,
                status:
                  aksi === 'setuju'
                    ? 'DISETUJUI'
                    : aksi === 'kirim'
                      ? 'DIKIRIM'
                      : aksi === 'terima'
                        ? 'DITERIMA'
                        : 'DITOLAK',
                ...(aksi === 'tolak'
                  ? {
                      alasan_tolak: alasanBersih,
                      ditolak_oleh: (json?.oleh as string | undefined) ?? r.ditolak_oleh,
                      ditolak_at: new Date().toISOString(),
                    }
                  : {}),
              }
            : r,
        ),
      )
      if (aksi === 'tolak') {
        setTolakKey(null)
        setAlasanTolak('')
      }
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, PengajuanRow[]>()
    for (const r of tampil) {
      const arr = map.get(r.batch_id) ?? []
      arr.push(r)
      map.set(r.batch_id, arr)
    }
    return [...map.entries()].map(([batchId, items]) => ({ batchId, items }))
  }, [tampil])

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">
          Inventory · {mode === 'cabang' ? namaLokasi : 'Gudang Pusat'}
        </p>
        <h1 className="mt-1 font-heading text-4xl font-semibold tracking-[-0.03em] text-[#4a0f30]">
          History Pengajuan
        </h1>
        <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-[#c2185b] to-[#e8b10c]" />
        <p className="mt-3 text-sm text-muted-foreground">
          {mode === 'cabang'
            ? `${namaLokasi} · pembuatan pengajuan baru di Inventory Cabang · ${nDiajukan} menunggu`
            : `Keputusan Gudang Pusat · ${nDiajukan} menunggu`}
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['semua', ...PENGAJUAN_STATUS.filter((s) => s !== 'DIBATALKAN')] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[15px] tabular-nums focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none ${
              filter === s
                ? 'border-[#c2185b] bg-[#c2185b] font-semibold text-white'
                : 'border-input hover:bg-muted'
            }`}
          >
            {s === 'semua' ? 'Semua' : s}
            <span className={filter === s ? 'opacity-80' : 'text-muted-foreground'}>
              {s === 'semua' ? rows.length : rows.filter((r) => r.status === s).length}
            </span>
          </button>
        ))}
      </div>

       {groups.length ? (
         <ul className="space-y-5">
           {groups.map(({ batchId, items }) => {
             const first = items[0]
             return (
               <li key={batchId}>
                 <Card className="py-0">
                   <CardContent className="p-4 sm:p-5">
                     <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                       <div className="min-w-0 flex-1">
                         <div className="flex flex-wrap items-center gap-2">
                           <span className="text-lg font-semibold">Batch {batchId}</span>
                         </div>
                         <div className="flex items-center gap-3 text-sm text-muted-foreground">
                           <span className="font-bold">{first.nama_lokasi}</span>
                           <span>Masuk {fmtDate(first.created_at)}</span>
                         </div>
                       </div>
                     </div>
                     <ul className="mt-3 space-y-4">
                       {items.map((r) => {
                         const key = `${batchId}:${r.sku}`
                         const sibuk = busy === key
                         return (
                           <li key={key} className="rounded-lg border border-input p-3">
                             <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                               <div className="min-w-0 flex-1 space-y-1">
                                 <div className="flex flex-wrap items-center gap-2">
                                   <span className="font-semibold">{r.nama_barang ?? r.sku}</span>
                                   <span
                                     className={`inline-block rounded border px-2 py-0.5 text-[11px] font-bold tracking-widest uppercase ${PILL[r.status] ?? ''}`}
                                   >
                                     {r.status}
                                   </span>
                                 </div>
                                 <div className="text-[15px] tabular-nums text-muted-foreground">
                                   {r.sku} × {fmtNum(r.qty)}
                                   {mode === 'pusat' && <span> (Pusat: {stokPusat[r.sku] ?? 0})</span>}
                                 </div>
                                 {r.status === 'DITOLAK' && (
                                   <div className="text-sm text-red-700">
                                     <span className="font-medium">Alasan:</span>{' '}
                                     {r.alasan_tolak || 'Tanpa alasan (data lama)'}
                                     {r.nama_penolak && (
                                       <span className="text-muted-foreground"> · oleh {r.nama_penolak}</span>
                                     )}
                                   </div>
                                 )}
                               </div>
                               <div className="flex shrink-0 gap-2">
                                 {r.status === 'DIAJUKAN' && mode === 'pusat' && (
                                   tolakKey === key ? (
                                     <div className="flex flex-col gap-2">
                                       <label htmlFor={`alasan-${key}`} className="text-sm font-medium">
                                         Alasan penolakan
                                       </label>
                                       <textarea
                                         id={`alasan-${key}`}
                                         value={alasanTolak}
                                         onChange={(e) => setAlasanTolak(e.target.value)}
                                         onKeyDown={(e) => {
                                           if (e.key === 'Escape') {
                                             setTolakKey(null)
                                             setAlasanTolak('')
                                           }
                                         }}
                                         maxLength={500}
                                         rows={3}
                                         autoFocus
                                         placeholder="Contoh: stok pusat sedang kosong"
                                         className="min-h-[72px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                                       />
                                       <div className="flex justify-end gap-2">
                                         <button
                                           type="button"
                                           disabled={sibuk || !alasanTolak.trim()}
                                           onClick={() => putuskan(batchId, r.sku, 'tolak', alasanTolak)}
                                           className="inline-flex h-9 items-center rounded-full bg-red-600 px-4 text-[15px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
                                         >
                                           {sibuk ? '…' : 'Kirim penolakan'}
                                         </button>
                                         <button
                                           type="button"
                                           disabled={sibuk}
                                           onClick={() => {
                                             setTolakKey(null)
                                             setAlasanTolak('')
                                           }}
                                           className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted disabled:opacity-50"
                                         >
                                           Batal
                                         </button>
                                       </div>
                                     </div>
                                   ) : (
                                     <div className="flex gap-2">
                                       <button
                                         type="button"
                                         disabled={sibuk}
                                         onClick={() => putuskan(batchId, r.sku, 'setuju')}
                                         className="inline-flex h-9 items-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] disabled:opacity-50"
                                       >
                                         {sibuk ? '…' : 'Setujui'}
                                       </button>
                                       <button
                                         type="button"
                                         disabled={sibuk}
                                         onClick={() => {
                                           setTolakKey(key)
                                           setAlasanTolak('')
                                         }}
                                         className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted disabled:opacity-50"
                                       >
                                         Tolak
                                       </button>
                                     </div>
                                   )
                                 )}
                                 {r.status === 'DIAJUKAN' && mode === 'cabang' && (
                                   <button
                                     type="button"
                                     disabled={sibuk}
                                     onClick={() => batalkan(batchId, r.sku)}
                                     className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted disabled:opacity-50"
                                   >
                                     {sibuk ? '…' : 'Batalkan'}
                                   </button>
                                 )}
                                 {r.status === 'DISETUJUI' && mode === 'pusat' && (
                                   <button
                                     type="button"
                                     disabled={sibuk}
                                     onClick={() => putuskan(batchId, r.sku, 'kirim')}
                                     className="inline-flex h-9 items-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] disabled:opacity-50"
                                   >
                                     {sibuk ? '…' : 'Kirim'}
                                   </button>
                                 )}
                                 {r.status === 'DIKIRIM' && mode === 'cabang' && (
                                   <button
                                     type="button"
                                     disabled={sibuk}
                                     onClick={() => putuskan(batchId, r.sku, 'terima')}
                                     className="inline-flex h-9 items-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] disabled:opacity-50"
                                   >
                                     {sibuk ? '…' : 'Terima'}
                                   </button>
                                 )}
                               </div>
                             </div>
                           </li>
                         )
                       })}
                     </ul>
                   </CardContent>
                 </Card>
               </li>
             )
           })}
         </ul>
       ) : (
        <Card>
          <CardContent className="px-4 py-10 text-center">
            <p className="text-lg font-medium">Belum ada pengajuan{filter === 'semua' ? '' : ` ${filter}`}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === 'cabang' ? 'Ajukan restock ke Gudang Pusat lewat form di atas.' : 'Pengajuan cabang yang masuk tampil di sini.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
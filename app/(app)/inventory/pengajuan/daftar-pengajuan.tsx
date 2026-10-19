'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { fmtDate, fmtNum } from '@/lib/format'
import { inputCls } from '../_components/input-cls'

export type PengajuanRow = {
  id_pengajuan: string
  id_lokasi: string
  nama_lokasi: string
  status: string
  created_at: string
  sku: string
  qty: number
  nama_barang: string | null
}

const PENGAJUAN_STATUS = ['DIAJUKAN', 'DISETUJUI', 'DIKIRIM', 'DITERIMA', 'DITOLAK', 'DIBATALKAN'] as const

const PILL: Record<string, string> = {
  DIAJUKAN: 'border-[#e8b10c]/70 bg-[#e8b10c]/15 text-[#4a0f30]',
  DISETUJUI: 'border-green-300 bg-green-50 text-green-700',
  DIKIRIM: 'border-[#133fed]/70 bg-[#133fed]/15 text-[#133fed]',
  DITERIMA: 'border-teal-300 bg-teal-50 text-teal-700',
  DITOLAK: 'border-red-300 bg-red-50 text-red-700',
  DIBATALKAN: 'border-input bg-muted text-muted-foreground',
}

type Saran = { sku: string; nama_barang: string; satuan: string; stock: number }

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
  const [baris, setBaris] = useState<{ nama: string; qty: string }[]>([{ nama: '', qty: '1' }])
  const [saran, setSaran] = useState<Record<number, Saran[]>>({})
  const [buka, setBuka] = useState<number | null>(null)
  const [statusCari, setStatusCari] = useState<Record<number, 'cari' | 'siap'>>({})
  const [sorotIdx, setSorotIdx] = useState<Record<number, number>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const opsiRef = useRef<Record<string, HTMLButtonElement | null>>({})
  const saranRef = useRef<HTMLDivElement | null>(null)

  // tertutup saat daftar disentuh untuk scroll, terutama di sentuh).
  useEffect(() => {
    function luar(e: PointerEvent) {
      if (saranRef.current && !saranRef.current.contains(e.target as Node)) setBuka(null)
    }
    document.addEventListener('pointerdown', luar)
    return () => document.removeEventListener('pointerdown', luar)
  }, [])

  const tampil = useMemo(
    () => (filter === 'semua' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  )
  const nDiajukan = rows.filter((r) => r.status === 'DIAJUKAN').length

  // Ketik nama → saran dari master (debounce). Tanpa SKU: server yang memetakan.
  function ketik(i: number, v: string) {
    setBaris((p) => p.map((x, j) => (j === i ? { ...x, nama: v } : x)))
    setBuka(i)
    setSorotIdx((p) => ({ ...p, [i]: 0 }))
    if (timer.current) clearTimeout(timer.current)
    if (v.trim().length < 2) {
      setSaran((p) => ({ ...p, [i]: [] }))
      return
    }
    setStatusCari((p) => ({ ...p, [i]: 'cari' }))
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(v.trim())}&limit=8`)
      const json = await res.json().catch(() => null)
      setSaran((p) => ({ ...p, [i]: Array.isArray(json?.items) ? json.items : [] }))
      setStatusCari((p) => ({ ...p, [i]: 'siap' }))
    }, 300)
  }

  function pilih(i: number, s: Saran) {
    setBaris((p) => p.map((x, j) => (j === i ? { ...x, nama: s.nama_barang } : x)))
    setBuka(null)
    setSaran((p) => ({ ...p, [i]: [] }))
  }

  // Navigasi keyboard di daftar saran: ↑/↓ pindah, Enter pilih, Esc tutup.
  function tombol(i: number, e: React.KeyboardEvent) {
    const daftar = saran[i] ?? []
    if (buka !== i || !daftar.length) return
    const cur = sorotIdx[i] ?? 0
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowDown' ? (cur + 1) % daftar.length : (cur - 1 + daftar.length) % daftar.length
      setSorotIdx((p) => ({ ...p, [i]: next }))
      requestAnimationFrame(() => opsiRef.current[`${i}-${next}`]?.scrollIntoView({ block: 'nearest' }))
    } else if (e.key === 'Enter' && daftar[cur]) {
      e.preventDefault()
      pilih(i, daftar[cur])
    }
  }

  // Tebalkan bagian nama yang cocok dengan ketikan.
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

  async function kirim() {
    const items = baris
      .map((b) => ({ nama_barang: b.nama.trim(), qty: Number(b.qty) }))
      .filter((b) => b.nama_barang)
    if (!items.length) {
      setError('Isi minimal 1 barang (nama + qty)')
      return
    }
    setBusy('baru')
    setError(null)
    try {
      const res = await fetch('/api/pengajuan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'Gagal mengajukan')
        return
      }
      setBaris([{ nama: '', qty: '1' }])
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function batalkan(id: string) {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/pengajuan?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'Gagal menghapus pengajuan')
        return
      }
      setRows((prev) => prev.filter((r) => r.id_pengajuan !== id))
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function putuskan(id: string, aksi: 'setuju' | 'kirim' | 'tolak' | 'terima' | 'batal') {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/pengajuan/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aksi }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'Gagal memproses')
        return
      }
      // Batal pusat langsung hilang dari daftar (POV pusat sembunyikan batal).
      setRows((prev) =>
        aksi === 'batal'
          ? prev.filter((r) => r.id_pengajuan !== id)
          : prev.map((r) =>
              r.id_pengajuan === id
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
                  }
                : r,
            ),
      )
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <h1 className="text-3xl font-light tracking-wide text-[#c2185b]">Pengajuan Restock</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {mode === 'cabang'
            ? `${namaLokasi} meminta ke Gudang Pusat · ${nDiajukan} menunggu`
            : `Keputusan Gudang Pusat · ${nDiajukan} menunggu`}
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {mode === 'cabang' && (
        <Card className="py-0" style={{ overflow: 'visible' }}>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <p className="text-[11px] tracking-widest text-muted-foreground uppercase">Pengajuan baru ke Pusat</p>
            {baris.map((b, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <div ref={buka === i ? saranRef : undefined} className="relative min-w-0 flex-1 basis-48">
                  <input
                    value={b.nama}
                    onChange={(e) => ketik(i, e.target.value)}
                    onFocus={() => b.nama.trim().length >= 2 && setBuka(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setBuka(null)
                      else tombol(i, e)
                    }}
                    placeholder="Ketik nama barang…"
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={buka === i}
                    aria-controls={`saran-${i}`}
                    aria-activedescendant={(saran[i] ?? []).length ? `saran-${i}-${sorotIdx[i] ?? 0}` : undefined}
                    className={`${inputCls} w-full`}
                  />
                  {buka === i && b.nama.trim().length >= 2 && statusCari[i] && (
                    <ul
                      id={`saran-${i}`}
                      role="listbox"
                      className="absolute z-10 mt-1 max-h-[120px] w-full overflow-y-auto overscroll-contain rounded-lg border border-input bg-background shadow-lg touch-pan-y"
                    >
                      {statusCari[i] === 'cari' && (
                        <li className="px-3 py-2 text-[15px] text-muted-foreground">Mencari…</li>
                      )}
                      {statusCari[i] === 'siap' && !(saran[i] ?? []).length && (
                        <li className="px-3 py-2 text-[15px] text-muted-foreground">
                          Tidak ada barang cocok — cek ejaan
                        </li>
                      )}
                      {(saran[i] ?? []).map((s, idx) => (
                        <li key={s.sku} role="option" id={`saran-${i}-${idx}`} aria-selected={idx === (sorotIdx[i] ?? 0)}>
                          <button
                            type="button"
                            ref={(el) => {
                              opsiRef.current[`${i}-${idx}`] = el
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              pilih(i, s)
                            }}
                            onMouseEnter={() => setSorotIdx((p) => ({ ...p, [i]: idx }))}
                            className={`flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left text-[15px] hover:bg-muted ${
                              idx === (sorotIdx[i] ?? 0) ? 'bg-muted' : ''
                            }`}
                          >
                            <span className="font-medium">{sorot(s.nama_barang, b.nama)}</span>
                            <span className="text-sm text-muted-foreground tabular-nums">stok {s.stock}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <input
                  value={b.qty}
                  onChange={(e) => setBaris((p) => p.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                  placeholder="Qty"
                  inputMode="numeric"
                  className={`${inputCls} w-24`}
                />
                {baris.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setBaris((p) => p.filter((_, j) => j !== i))}
                    className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted"
                  >
                    Hapus
                  </button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBaris((p) => [...p, { nama: '', qty: '1' }])}
                className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted"
              >
                + Baris
              </button>
              <button
                type="button"
                disabled={busy === 'baru'}
                onClick={kirim}
                className="inline-flex h-9 items-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] disabled:opacity-50"
              >
                {busy === 'baru' ? '…' : 'Ajukan ke Pusat'}
              </button>
            </div>
            <p className="text-sm text-muted-foreground">Pilih dari saran agar tepat. Satu baris = satu keputusan di Pusat.</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['semua', ...PENGAJUAN_STATUS.filter((s) => mode === 'cabang' || (s !== 'DITOLAK' && s !== 'DIBATALKAN'))] as const).map((s) => (
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

      {tampil.length ? (
        <ul className="space-y-3">
          {tampil.map((r) => (
            <li key={r.id_pengajuan}>
              <Card className="py-0">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold">{r.nama_barang ?? r.sku}</span>
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-[11px] font-bold tracking-widest uppercase ${PILL[r.status] ?? ''}`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[15px] tabular-nums">
                        {r.sku} × {fmtNum(r.qty)}
                        {mode === 'pusat' && <span className="text-muted-foreground"> (Pusat: {stokPusat[r.sku] ?? 0})</span>}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {r.nama_lokasi} · Masuk {fmtDate(r.created_at)}
                      </p>
                    </div>
                    {mode === 'pusat' && r.status === 'DIAJUKAN' && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={busy === r.id_pengajuan}
                          onClick={() => putuskan(r.id_pengajuan, 'setuju')}
                          className="inline-flex h-9 items-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] disabled:opacity-50"
                        >
                          {busy === r.id_pengajuan ? '…' : 'Setujui'}
                        </button>
                        <button
                          type="button"
                          disabled={busy === r.id_pengajuan}
                          onClick={() => putuskan(r.id_pengajuan, 'tolak')}
                          className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted disabled:opacity-50"
                        >
                          Tolak
                        </button>
                        <button
                          type="button"
                          disabled={busy === r.id_pengajuan}
                          onClick={() => putuskan(r.id_pengajuan, 'batal')}
                          title="Batalkan pengajuan (stok belum bergerak di tahap ini)"
                          className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted disabled:opacity-50"
                        >
                          Batalkan
                        </button>
                      </div>
                    )}
                    {mode === 'pusat' && r.status === 'DISETUJUI' && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={busy === r.id_pengajuan}
                          onClick={() => putuskan(r.id_pengajuan, 'kirim')}
                          className="inline-flex h-9 items-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] disabled:opacity-50"
                        >
                          {busy === r.id_pengajuan ? '…' : 'Kirim'}
                        </button>
                        <button
                          type="button"
                          disabled={busy === r.id_pengajuan}
                          onClick={() => putuskan(r.id_pengajuan, 'batal')}
                          title="Batalkan + kembalikan stok ke Pusat"
                          className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted disabled:opacity-50"
                        >
                          Batalkan
                        </button>
                      </div>
                    )}
                    {mode === 'pusat' && r.status === 'DIKIRIM' && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={busy === r.id_pengajuan}
                          onClick={() => putuskan(r.id_pengajuan, 'batal')}
                          title="Batalkan + kembalikan stok ke Pusat"
                          className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted disabled:opacity-50"
                        >
                          {busy === r.id_pengajuan ? '…' : 'Batalkan'}
                        </button>
                      </div>
                    )}
                    {mode === 'cabang' && r.status === 'DIAJUKAN' && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={busy === r.id_pengajuan}
                          onClick={() => batalkan(r.id_pengajuan)}
                          className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted disabled:opacity-50"
                        >
                          {busy === r.id_pengajuan ? '…' : 'Batalkan'}
                        </button>
                      </div>
                    )}
                    {mode === 'cabang' && r.status === 'DIKIRIM' && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={busy === r.id_pengajuan}
                          onClick={() => putuskan(r.id_pengajuan, 'terima')}
                          className="inline-flex h-9 items-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] disabled:opacity-50"
                        >
                          {busy === r.id_pengajuan ? '…' : 'Terima'}
                        </button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
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

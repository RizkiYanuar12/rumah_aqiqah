'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { fmtNum } from '@/lib/utils/format'
import type { ResepPaket, ResepRow } from '../daftar-resep'

async function kirim(method: string, body: object): Promise<void> {
  const res = await fetch('/api/resep', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const j = await res.json().catch(() => null)
    throw new Error(j?.error ?? `Gagal (${res.status})`)
  }
}

const inputCls =
  'h-9 rounded-lg border border-input bg-transparent px-3 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none'
const btnMarun =
  'inline-flex h-9 items-center rounded-lg bg-[#c2185b] px-3 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50'
const btnGhost =
  'inline-flex h-9 items-center rounded-lg border border-input px-3 text-[15px] hover:bg-muted disabled:opacity-50'

function FormTambah({ idPaket, onDone }: { idPaket: string; onDone: () => void }) {
  const [sku, setSku] = useState('') // teks tampil (nama barang bila dipilih dari saran)
  const [skuId, setSkuId] = useState('') // id terpilih (SKU hasil pilihan)
  const [qty, setQty] = useState('1')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saran, setSaran] = useState<{ sku: string; nama_barang: string; stock: number }[]>([])
  const [buka, setBuka] = useState(false)
  const [aktif, setAktif] = useState(-1)
  const [sudahCari, setSudahCari] = useState(false)
  const [cari, setCari] = useState(false)
  const [errCari, setErrCari] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)

  // Saran SKU + nama + stok cabang sendiri (debounce, tanpa effect).
  const onSku = (v: string) => {
    setSku(v)
    setSkuId('') // ketikan manual = kirim apa adanya (validasi di server)
    setAktif(-1)
    if (timer.current) clearTimeout(timer.current)
    const k = v.trim()
    if (k.length < 2) {
      setSaran([])
      setSudahCari(false)
      setBuka(false)
      return
    }
    setBuka(true)
    setCari(true)
    setErrCari('')
    const my = ++seq.current
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(k)}&limit=10`)
        const j = await res.json().catch(() => null)
        if (my !== seq.current) return
        if (!res.ok) throw new Error(j?.error ?? `Gagal (${res.status})`)
        setSaran(j?.items ?? [])
      } catch (e) {
        if (my !== seq.current) return
        setSaran([])
        setErrCari(e instanceof Error ? e.message : 'Gagal memuat saran')
        // Validasi SKU tetap di server saat simpan.
      } finally {
        if (my === seq.current) {
          setCari(false)
          setSudahCari(true)
        }
      }
    }, 300)
  }

  const pilih = (s: { sku: string; nama_barang: string }) => {
    setSku(s.nama_barang)
    setSkuId(s.sku)
    setSaran([])
    setBuka(false)
    setAktif(-1)
  }

  const onTombol = (e: React.KeyboardEvent) => {
    if (!buka || !saran.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAktif((a) => (a + 1) % saran.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAktif((a) => (a <= 0 ? saran.length - 1 : a - 1))
    } else if (e.key === 'Enter' && aktif >= 0) {
      e.preventDefault()
      pilih(saran[aktif])
    } else if (e.key === 'Escape') {
      setBuka(false)
    }
  }

  const simpan = async () => {
    setBusy(true)
    setErr('')
    try {
      await kirim('POST', { id_paket: idPaket, sku: (skuId || sku).trim(), qty: Number(qty) })
      setSku('')
      setSkuId('')
      setQty('1')
      setSaran([])
      setBuka(false)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menambah')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-2 border-t px-4 py-3">
      <div className="min-w-52 flex-1">
        <input
          value={sku}
          onChange={(e) => onSku(e.target.value)}
          onFocus={() => saran.length && setBuka(true)}
          onBlur={() => setBuka(false)}
          onKeyDown={onTombol}
          placeholder="Ketik SKU / nama barang…"
          autoComplete="off"
          className={`${inputCls} w-full`}
        />
        {skuId ? <p className="mt-1 text-xs text-muted-foreground">SKU: {skuId}</p> : null}
        {buka && (
          <ul className="mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-background py-1 shadow-lg">
            {cari ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Mencari…</li>
            ) : errCari ? (
              <li className="px-3 py-2 text-sm text-red-600">{errCari}</li>
            ) : saran.length ? (
              saran.map((s, i) => (
                <li key={s.sku}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pilih(s)
                    }}
                    onMouseEnter={() => setAktif(i)}
                    className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[15px] ${
                      i === aktif ? 'bg-[#c2185b]/10' : 'hover:bg-muted'
                    }`}
                  >
                    <span>
                      <span className="font-semibold">{s.nama_barang}</span>
                      <span className="ml-2 text-muted-foreground">{s.sku}</span>
                    </span>
                    <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      stok {s.stock}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              sudahCari && (
                <li className="px-3 py-2 text-sm text-muted-foreground">Tidak ada barang cocok</li>
              )
            )}
          </ul>
        )}
      </div>
      <input
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="Qty"
        inputMode="numeric"
        className={`${inputCls} w-20 shrink-0`}
      />
      <button type="button" disabled={busy} onClick={simpan} className={`${btnMarun} shrink-0`}>
        Tambah
      </button>
      {err && <span className="basis-full text-sm text-red-600">{err}</span>}
    </div>
  )
}

function BarisResep({
  idPaket,
  r,
  onDone,
}: {
  idPaket: string
  r: ResepRow
  onDone: () => void
}) {
  const [qty, setQty] = useState(String(r.qty))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const simpan = async () => {
    setBusy(true)
    setErr('')
    try {
      await kirim('PATCH', { id_paket: idPaket, sku: r.sku, qty: Number(qty) })
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setBusy(false)
    }
  }

  const hapus = async () => {
    if (!confirm(`Hapus ${r.sku} dari resep?`)) return
    setBusy(true)
    setErr('')
    try {
      await kirim('DELETE', { id_paket: idPaket, sku: r.sku })
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menghapus')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-b last:border-0 hover:bg-muted/50">
      <td className="px-4 py-2.5 text-sm text-muted-foreground break-all">{r.sku}</td>
      <td className="px-4 py-2.5 font-medium">{r.nama_barang}</td>
      <td className="px-4 py-2.5 text-right">
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="numeric"
          aria-label={`Qty ${r.sku}`}
          className={`${inputCls} w-20 text-right tabular-nums`}
        />
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">{r.satuan ?? '—'}</td>
      <td className="px-4 py-2.5 text-right">{fmtNum(r.stock)}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button type="button" disabled={busy} onClick={simpan} className={btnGhost}>
            Simpan
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={hapus}
            className="inline-flex h-9 items-center rounded-lg border border-red-500 px-3 text-[15px] text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Hapus
          </button>
        </div>
        {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
      </td>
    </tr>
  )
}

export default function FormResep({ group }: { group: ResepPaket }) {
  const router = useRouter()
  const segar = () => router.refresh()

  return (
    <Card className="py-0">
      <CardContent className="p-0">
        {group.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[15px] tabular-nums">
              <thead>
                <tr className="border-b text-[11px] tracking-widest text-muted-foreground uppercase">
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="px-4 py-3 text-right font-medium">Qty / paket</th>
                  <th className="px-4 py-3 font-medium">Satuan</th>
                  <th className="px-4 py-3 text-right font-medium">Stock lokasi</th>
                  <th className="px-4 py-3 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((r) => (
                  <BarisResep
                    key={`${r.sku}-${r.qty}`}
                    idPaket={group.id_paket}
                    r={r}
                    onDone={segar}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Belum ada bahan — tambah baris pertama di bawah.
          </p>
        )}
        <FormTambah idPaket={group.id_paket} onDone={segar} />
      </CardContent>
    </Card>
  )
}

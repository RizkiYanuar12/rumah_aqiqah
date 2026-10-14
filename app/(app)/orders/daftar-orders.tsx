'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { ORDER_STATUS } from '@/lib/order-status'
import { tenggatLabel } from '@/lib/closing'
import { fmtDate, fmtRp } from '@/lib/format'

export type OrderOlahan = { nama_olahan: string; kategori: string }

export type OrderLine = {
  id_baris: string
  nama_paket: string
  kategori: string
  qty: number
  harga_satuan: number
  order_olahan?: OrderOlahan[]
  paket?: { tipe: string | null; anak: string | null; porsi: number | null; jenis: string | null; jumlah_hewan: number | null } | null
}

export type OrderClosing = {
  id: string
  nama_customer: string
  no_hp: string
  email_customer?: string | null
  alamat: string
} | null

export type OrderItem = {
  sku: string
  qty: number
  nama_barang: string
}

export type OrderRow = {
  id_pesanan: string
  status: string | null
  tipe_pembayaran: string | null
  harga_final: number | null
  qty_paket: number | null
  diskon: number | null
  waktu_kirim: string | null
  waktu_tiba: string | null
  tanggal_transaksi: string | null
  created_at: string
  cso_id: string
  customer_email: string | null
  closing: OrderClosing
  order_lines: OrderLine[]
  order_items: OrderItem[]
}

const PILL_ORDER: Record<string, string> = {
  PENDING:  'border-[#c2185b]/40 bg-[#c2185b]/5 text-[#c2185b]',
  DIPROSES: 'border-[#e8b10c]/70 bg-[#e8b10c]/15 text-[#4a0f30]',
  SELESAI:  'border-green-300 bg-green-50 text-green-700',
  BATAL:    'border-red-300 bg-red-50 text-red-700',
}

// Badge jatuh tempo (datar, formal — sama seperti kartu Closing).
const PILL_TENGGAT: Record<string, string> = {
  now:  'border-[#e8b10c] bg-[#e8b10c] text-[#4a0f30]',
  late: 'border-red-500 bg-red-500 text-white',
  soon: 'border-[#e8b10c]/70 bg-[#e8b10c]/15 text-[#4a0f30]',
  none: 'border-input bg-muted text-muted-foreground',
}

const OLAHAN_LABEL: Record<string, string> = {
  OLAHAN_DAGING: 'daging',
  OLAHAN_TULANG_JEROAN: 'tulang/jeroan',
}

const paketOf = (li: OrderLine) =>
  Array.isArray(li.paket) ? (li.paket[0] ?? null) : (li.paket ?? null)

const ekorOf = (lines: OrderLine[]) =>
  lines.filter((li) => li.kategori === 'PAKET').reduce((s, li) => {
    const p = paketOf(li)
    return s + Number(li.qty) * Number(p?.jumlah_hewan ?? 0)
  }, 0)

// Ekor per baris (untuk rincian expand).
const ekorBaris = (li: OrderLine) =>
  li.kategori === 'PAKET' ? Number(li.qty) * Number(paketOf(li)?.jumlah_hewan ?? 0) : 0

const fmtPaket = (li: OrderLine) => {
  const p = paketOf(li)
  if (!p) return null
  const parts = [
    p.tipe ? `Tipe ${p.tipe}` : null,
    p.porsi ? `${p.porsi} porsi` : null,
    p.anak,
    p.jenis
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

  const TERMINAL = ['BATAL']

  // Selesai/batal = tidak aktif (tanpa badge deadline, tanpa pill tenggat).
  const NONAKTIF = ['SELESAI', 'BATAL']

const terlambat = (o: Pick<OrderRow, 'status' | 'waktu_kirim'>) => {
  if (!o.waktu_kirim || TERMINAL.includes(o.status ?? '')) return false
  return new Date(new Date(o.waktu_kirim).toDateString()) < new Date(new Date().toDateString())
}

export default function DaftarOrders({
  initialOrders,
  editable = false,
  canChangeStatus = false,
}: {
  initialOrders: OrderRow[]
  editable?: boolean
  canChangeStatus?: boolean
}) {
  const router = useRouter()
  const [prevInitial, setPrevInitial] = useState(initialOrders)
  const [orders, setOrders] = useState<OrderRow[]>(() =>
    initialOrders.map((o) => ({ ...o, order_lines: o.order_lines ?? [] })),
  )
  // Props baru dari server (router.refresh) harus menggantikan state lama.
  if (prevInitial !== initialOrders) {
    setPrevInitial(initialOrders)
    setOrders(initialOrders.map((o) => ({ ...o, order_lines: o.order_lines ?? [] })))
  }
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState('semua')
  const [sort, setSort] = useState<'kirim' | 'baru'>('kirim')
  const [next, setNext] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: orders.length, terlambat: 0 }
    for (const s of ORDER_STATUS) c[s] = 0
    for (const o of orders) {
      c[o.status ?? 'PENDING'] = (c[o.status ?? 'PENDING'] ?? 0) + 1
      if (terlambat(o)) c.terlambat += 1
    }
    return c
  }, [orders])

  const rows = useMemo(() => {
    const r =
      filter === 'semua'
        ? [...orders]
        : filter === 'terlambat'
          ? orders.filter(terlambat)
          : orders.filter((o) => (o.status ?? 'PENDING') === filter)
    r.sort((a, b) =>
      sort === 'kirim'
        ? +new Date(a.waktu_kirim ?? a.created_at) - +new Date(b.waktu_kirim ?? b.created_at)
        : +new Date(b.created_at) - +new Date(a.created_at),
    )
    return r
  }, [orders, filter, sort])

  async function ubahStatus(id: string) {
    const to = next[id]
    if (!to) return
    setSaving(id)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: to }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'Gagal ubah status')
        return
      }
      // Optimistik: jumlah + chip langsung berubah tanpa tunggu server.
      setOrders((prev) => prev.map((o) => (o.id_pesanan === id ? { ...o, status: to } : o)))
      setNext((p) => {
        const c = { ...p }
        delete c[id]
        return c
      })
      router.refresh()
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-light tracking-wide text-[#c2185b]">PESANAN</h1>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="urut" className="text-sm text-muted-foreground">Urutkan</label>
          <select
            id="urut"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'kirim' | 'baru')}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
          >
            <option value="kirim">Kirim terdekat</option>
            <option value="baru">Terbaru</option>
          </select>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['semua', ...ORDER_STATUS] as const).map((s) => (
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
            <span className={filter === s ? 'opacity-80' : 'text-muted-foreground'}>{s === 'semua' ? counts.total : (counts[s] ?? 0)}</span>
          </button>
        ))}
      </div>

      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((o) => {
            const status = o.status ?? 'PENDING'
            const isOpen = open === o.id_pesanan
            const email = o.customer_email ?? o.closing?.email_customer ?? null
            const opsi = ORDER_STATUS.filter((s) => s !== status)
            const lines = o.order_lines ?? []
            const utama = lines.find((li) => li.kategori === 'PAKET')
            const nAddon = lines.filter((li) => li.kategori !== 'PAKET').length
            const ekor = ekorOf(lines)
            const tg = tenggatLabel(o.waktu_kirim)
            const final = NONAKTIF.includes(status)
            const subPaket = lines
              .filter((li) => li.kategori === 'PAKET')
              .reduce((s, li) => s + Number(li.qty) * Number(li.harga_satuan), 0)
            const subAddon = lines
              .filter((li) => li.kategori !== 'PAKET')
              .reduce((s, li) => s + Number(li.qty) * Number(li.harga_satuan), 0)
            const diskon = Number(o.diskon) || 0
            const keluarMap = new Map<string, { sku: string; nama: string; qty: number }>()
            for (const it of o.order_items ?? []) {
              const cur = keluarMap.get(it.sku) ?? { sku: it.sku, nama: it.nama_barang ?? it.sku, qty: 0 }
              cur.qty += Number(it.qty) || 0
              keluarMap.set(it.sku, cur)
            }
            const keluar = [...keluarMap.values()]
            return (
              <li key={o.id_pesanan}>
                <Card className="py-0">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                      <div className="min-w-0 flex-1 basis-64">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-semibold break-all">
                            {o.closing?.nama_customer ?? '—'}
                          </span>
                          <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-bold tracking-widest uppercase ${PILL_ORDER[status] ?? ''}`}>
                            {status}
                          </span>
                          {!final && (
                            <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-bold tracking-widest uppercase ${PILL_TENGGAT[tg.tone]}`}>
                              {tg.text}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[15px] text-muted-foreground tabular-nums">
                          {utama ? `${utama.nama_paket} × ${utama.qty}` : 'tanpa paket utama'}
                          {nAddon > 0 && ` + ${nAddon} add-on`}
                          {ekor > 0 && ` · ${ekor} ekor`}
                        </p>
                        {(utama?.order_olahan ?? []).length > 0 && (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            Olahan:{' '}
                            {(utama?.order_olahan ?? [])
                              .map((ol) => `${ol.nama_olahan} (${OLAHAN_LABEL[ol.kategori] ?? ol.kategori})`)
                              .join(' · ')}
                          </p>
                        )}
                        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                          {o.closing?.no_hp ?? '—'} · Kirim {fmtDate(o.waktu_kirim)}{o.waktu_tiba ? ` · Tiba ${fmtDate(o.waktu_tiba)}` : ''} · Bayar {o.tipe_pembayaran ?? '—'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1 md:min-w-52 md:text-right">
                        <span className="text-[11px] tracking-widest text-muted-foreground uppercase">Total</span>
                        <span className="text-xl font-semibold text-[#c2185b] tabular-nums">{fmtRp(o.harga_final)}</span>
                        <button
                          type="button"
                          onClick={() => setOpen(isOpen ? null : o.id_pesanan)}
                          aria-expanded={isOpen}
                          className="mt-1 inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-[#e8b10c]/60 px-3 text-[15px] font-medium text-[#4a0f30] hover:bg-[#e8b10c]/10 focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none md:justify-end"
                        >
                          {(o.order_lines ?? []).length} item {isOpen ? '▴' : '▾'}
                        </button>
                        {editable && status !== 'BATAL' && (
                          <Link
                            href={`/orders/${o.id_pesanan}/ubah`}
                            className="mt-1 inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-input px-3 text-[15px] font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none md:justify-end"
                          >
                            Ubah pesanan
                          </Link>
                        )}
                        {canChangeStatus && status !== 'BATAL' && opsi.length > 0 && (
                          <div className="mt-2 flex gap-2 md:justify-end">
                            <select
                              aria-label="Status baru"
                              value={next[o.id_pesanan] ?? ''}
                              onChange={(e) => setNext((p) => ({ ...p, [o.id_pesanan]: e.target.value }))}
                              className="h-9 rounded-lg border border-input bg-transparent px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                            >
                              <option value="">Ubah Status</option>
                              {opsi.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!next[o.id_pesanan] || saving === o.id_pesanan}
                              onClick={() => ubahStatus(o.id_pesanan)}
                              className="inline-flex h-9 items-center rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] disabled:opacity-50"
                            >
                              {saving === o.id_pesanan ? '…' : 'OK'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <>
                      <ul className="mt-4 space-y-3 border-t border-dashed pt-4">
                        <li className="text-sm text-muted-foreground break-all">
                          Email: {email ?? '—'} · Alamat: {o.closing?.alamat ?? '—'} · Masuk {fmtDate(o.tanggal_transaksi)}
                        </li>
                        {(o.order_lines ?? []).map((li) => (
                          <li key={li.id_baris} className="text-[15px] tabular-nums">
                            <span className="font-medium">{li.nama_paket}</span>{' '}
                            <span className="inline-block rounded border border-input px-1.5 py-0 text-[11px] tracking-widest uppercase text-muted-foreground">
                              {li.kategori === 'PAKET' ? 'paket' : 'add-on'}
                            </span>{' '}
                            × {li.qty} @ {fmtRp(li.harga_satuan)} = {fmtRp(Number(li.qty) * Number(li.harga_satuan))}
                            {fmtPaket(li) && (
                              <span className='block text-sm'>{fmtPaket(li)}{ekorBaris(li) > 0 && ` · ${ekorBaris(li)} ekor`}</span>
                            )}
                            {(li.order_olahan ?? []).length > 0 && (
                              <span className="block text-sm text-muted-foreground">
                                Olahan:{' '}
                                {(li.order_olahan ?? [])
                                  .map((ol) => `${ol.nama_olahan} (${OLAHAN_LABEL[ol.kategori] ?? ol.kategori})`)
                                  .join(' · ')}
                              </span>
                            )}
                          </li>
                        ))}
                        {!(o.order_lines ?? []).length && <li>tanpa rincian paket</li>}
                      </ul>
                      {keluar.length > 0 && (
                        <div className="mt-3 border-t border-dashed pt-3">
                          <p className="text-[11px] tracking-widest text-muted-foreground uppercase">
                            Barang keluar (inventory)
                          </p>
                          <ul className="mt-1 space-y-0.5 text-[15px] tabular-nums">
                            {keluar.map((it) => (
                              <li key={it.sku} className="flex flex-wrap gap-x-2">
                                <span className="font-medium">{it.nama}</span>
                                <span>× {it.qty}</span>
                                <span className="text-sm text-muted-foreground">{it.sku}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-3 space-y-1 border-t border-dashed pt-3 text-[15px] tabular-nums">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Subtotal paket</span><span>{fmtRp(subPaket)}</span>
                        </div>
                        {subAddon > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Add-on</span><span>{fmtRp(subAddon)}</span>
                          </div>
                        )}
                        {diskon > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Diskon</span><span>−{fmtRp(diskon)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold text-[#c2185b]">
                          <span>Total</span><span>{fmtRp(o.harga_final)}</span>
                        </div>
                      </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      ) : (
        <Card>
          <CardContent className="px-4 py-10 text-center">
            <p className="text-lg font-medium">Belum ada pesanan{filter === 'semua' ? '' : filter === 'terlambat' ? ' yang terlambat' : ` berstatus ${filter}`}</p>
            <p className="mt-1 text-sm text-muted-foreground">Pesanan dibuat dari menu Closing.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

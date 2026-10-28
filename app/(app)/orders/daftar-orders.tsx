'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { ORDER_STATUS } from '@/lib/orders/status'
import { tenggatLabel, hariWIB } from '@/lib/closing'
import { fmtDate, fmtNum, fmtRp } from '@/lib/utils/format'
import type { PembayaranRow, Tagihan } from '@/lib/payments/types'
import PanelBayar from './_components/panel-bayar'

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
  metode_pembayaran: string | null
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
  SELESAI:  'border-[#34eb3d]/70 bg-[#34eb3d]/15 text-[#050505]',
  BATAL:    'border-red-300 bg-red-50 text-red-700',
}

// Warna aksen tipis di atas kartu (selaras dengan kartu Closing).
const ACCENT_ORDER: Record<string, string> = {
  PENDING:  'bg-[#c2185b]',
  DIPROSES: 'bg-[#e8b10c]',
  SELESAI:  'bg-[#34eb3d]',
  BATAL:    'bg-red-500',
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

// Filter "terlambat" ada di tabel counts + rows; tanpa tombol ini tidak pernah terpakai.
const TERLAMBAT_FILTERS = ['terlambat', 'semua', ...ORDER_STATUS] as const

const terlambat = (o: Pick<OrderRow, 'status' | 'waktu_kirim'>) => {
  if (!o.waktu_kirim || TERMINAL.includes(o.status ?? '')) return false
  // Bandingkan hari WIB (server & browser wajib sama).
  return hariWIB(o.waktu_kirim) < hariWIB(new Date())
}

export default function DaftarOrders({
  initialOrders,
  editable = false,
  canChangeStatus = false,
  tagihan = {},
  riwayat = {},
  canPay = false,
  canMakeVa = false,
}: {
  initialOrders: OrderRow[]
  editable?: boolean
  canChangeStatus?: boolean
  tagihan?: Record<string, Tagihan>
  riwayat?: Record<string, PembayaranRow[]>
  canPay?: boolean
  canMakeVa?: boolean
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
  const [openStatus, setOpenStatus] = useState<string | null>(null)
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

  async function ubahStatus(id: string, to: string) {
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
      setOpenStatus(null)
      router.refresh()
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">
            Operasional
          </p>
          <h1 className="mt-1 font-heading text-4xl font-semibold tracking-[-0.03em] text-[#4a0f30]">
            Pesanan
          </h1>
          <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-[#c2185b] to-[#e8b10c]" />
          <p className="mt-3 text-sm text-muted-foreground">
            {counts.total} pesanan
            {counts.terlambat > 0 && (
              <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-[13px] font-medium text-red-600">
                {counts.terlambat} terlambat
              </span>
            )}
          </p>
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
        {TERLAMBAT_FILTERS.map((s) => {
          const isLate = s === 'terlambat'
          const n = s === 'semua' ? counts.total : (counts[s] ?? 0)
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[15px] tabular-nums focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none ${
                filter === s
                  ? isLate
                    ? 'border-red-500 bg-red-500 font-semibold text-white'
                    : 'border-[#c2185b] bg-[#c2185b] font-semibold text-white'
                  : isLate
                    ? 'border-red-300 text-red-600 hover:bg-red-50'
                    : 'border-input hover:bg-muted'
              }`}
            >
              {s === 'semua' ? 'Semua' : s === 'terlambat' ? 'Terlambat' : s}
              <span className={filter === s ? 'opacity-80' : 'text-muted-foreground'}>{n}</span>
            </button>
          )
        })}
      </div>

      {rows.length > 0 && (
        <p className="-mt-1 text-sm text-muted-foreground">
          Menampilkan {rows.length} dari {orders.length} pesanan ·{' '}
          {sort === 'kirim' ? 'kirim terdekat dulu' : 'terbaru dulu'}
        </p>
      )}

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
            const totalRincian = lines.reduce(
              (s, li) => s + Number(li.qty) * Number(li.harga_satuan),
              0,
            )
            const keluarMap = new Map<string, { sku: string; nama: string; qty: number }>()
            for (const it of o.order_items ?? []) {
              const cur = keluarMap.get(it.sku) ?? { sku: it.sku, nama: it.nama_barang ?? it.sku, qty: 0 }
              cur.qty += Number(it.qty) || 0
              keluarMap.set(it.sku, cur)
            }
            const keluar = [...keluarMap.values()]
            const late = terlambat(o)
            const statusOpen = openStatus === o.id_pesanan
            return (
              <li key={o.id_pesanan}>
                <Card className={`relative overflow-hidden py-0 ${late ? 'ring-1 ring-red-500' : ''}`}>
                  <span aria-hidden className={`absolute inset-x-0 top-0 h-0.5 ${ACCENT_ORDER[status] ?? 'bg-muted'}`} />
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                      <div className="min-w-0 flex-1 basis-64">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-semibold break-all">
                            {o.closing?.nama_customer ?? '—'}
                          </span>
                          <span className={`inline-block rounded border px-2 py-0.5 text-xs font-bold tracking-widest uppercase ${PILL_ORDER[status] ?? ''}`}>
                            {status}
                          </span>
                          {tagihan[o.id_pesanan]?.statusBayar === 'LUNAS' && (
                            <span className="inline-block rounded border border-[#34eb3d]/70 bg-[#34eb3d]/15 px-2 py-0.5 text-xs font-bold tracking-widest uppercase">
                              Lunas
                            </span>
                          )}
                          {!final && (
                            <span className={`inline-block rounded border px-2 py-0.5 text-xs font-bold tracking-widest uppercase ${PILL_TENGGAT[tg.tone]}`}>
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
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                          <div className="min-w-0">
                            <dt className="text-xs tracking-wide text-muted-foreground uppercase">No. HP</dt>
                            <dd className="text-[15px] tabular-nums">{o.closing?.no_hp ?? '—'}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Kirim</dt>
                            <dd className="text-[15px] tabular-nums">{fmtDate(o.waktu_kirim)}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Tiba</dt>
                            <dd className="text-[15px] tabular-nums">{o.waktu_tiba ? fmtDate(o.waktu_tiba) : '—'}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Bayar</dt>
                            <dd className="text-[15px]">{o.tipe_pembayaran ?? '—'}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-xs tracking-wide text-muted-foreground uppercase">Total</span>
                        <div className="text-2xl font-semibold text-[#c2185b] tabular-nums">{fmtRp(o.harga_final)}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-dashed pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(isOpen ? null : o.id_pesanan)
                          setOpenStatus(null)
                        }}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? `Tutup rincian ${o.closing?.nama_customer ?? ''}` : `Buka rincian ${o.closing?.nama_customer ?? ''}`}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8b10c]/60 px-3 text-[15px] font-medium text-[#4a0f30] hover:bg-[#e8b10c]/10 focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                      >
                        Rincian
                        <span className="tabular-nums">{(o.order_lines ?? []).length}</span>
                        {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </button>
                      {editable && status !== 'BATAL' && (
                        <Link
                          href={`/orders/${o.id_pesanan}/ubah`}
                          className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-input px-3 text-[15px] font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                        >
                          Ubah pesanan
                        </Link>
                      )}
                      {canChangeStatus && status !== 'BATAL' && opsi.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setOpenStatus(statusOpen ? null : o.id_pesanan)}
                          aria-expanded={statusOpen}
                          aria-label={`Ubah status pesanan ${o.closing?.nama_customer ?? ''}`}
                          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                        >
                          Ubah status
                          {statusOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </button>
                      )}
                    </div>
                    {statusOpen && opsi.length > 0 && (
                      <div className="mt-2 flex flex-wrap justify-end gap-2 rounded-lg border bg-muted/40 p-2">
                        {opsi.map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={saving === o.id_pesanan}
                            onClick={() => ubahStatus(o.id_pesanan, s)}
                            className="inline-flex h-9 items-center rounded-lg border border-input bg-background px-3 text-[15px] font-medium hover:bg-[#e8b10c]/10 focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none disabled:opacity-50"
                          >
                            {saving === o.id_pesanan ? '…' : s}
                          </button>
                        ))}
                      </div>
                    )}
                    {isOpen && (
                      <>
                      <div className="mt-4 space-y-4 border-t border-dashed pt-4">
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-3">
                          <div className="min-w-0">
                            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Email</dt>
                            <dd className="text-[15px] break-all">{email ?? '—'}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Alamat</dt>
                            <dd className="text-[15px] line-clamp-2">{o.closing?.alamat ?? '—'}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Masuk</dt>
                            <dd className="text-[15px] tabular-nums">{fmtDate(o.tanggal_transaksi)}</dd>
                          </div>
                        </dl>

                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                          <div className="min-w-0 space-y-4">
                            <section className="overflow-hidden rounded-xl border">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
                                <div>
                                  <h3 className="text-sm font-semibold text-[#4a0f30]">Rincian pesanan</h3>
                                  <p className="text-xs text-muted-foreground">
                                    {lines.length} baris · {nAddon} add-on
                                  </p>
                                </div>
                                <span className="rounded-full bg-[#c2185b]/10 px-2.5 py-1 text-xs font-semibold text-[#c2185b]">
                                  {lines.length} item
                                </span>
                              </div>
                              {lines.length ? (
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[640px] text-sm">
                                    <thead>
                                      <tr className="border-b bg-muted/40 text-left text-[11px] tracking-widest text-muted-foreground uppercase">
                                        <th scope="col" className="px-4 py-2 font-medium">Item</th>
                                        <th scope="col" className="px-3 py-2 text-right font-medium">Qty</th>
                                        <th scope="col" className="px-3 py-2 text-right font-medium">Harga</th>
                                        <th scope="col" className="px-4 py-2 text-right font-medium">Jumlah</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-dashed">
                                      {lines.map((li) => (
                                        <tr key={li.id_baris} className="align-top hover:bg-muted/30">
                                          <td className="px-4 py-3">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <span className="font-medium">{li.nama_paket}</span>
                                              <span className="rounded border border-input bg-background px-1.5 py-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                                                {li.kategori === 'PAKET' ? 'Paket' : 'Add-on'}
                                              </span>
                                            </div>
                                            {(fmtPaket(li) || (li.order_olahan ?? []).length > 0) && (
                                              <p className="mt-0.5 text-xs text-muted-foreground">
                                                {fmtPaket(li) ?? ''}
                                                {fmtPaket(li) && ekorBaris(li) > 0 && ` · ${ekorBaris(li)} ekor`}
                                                {(li.order_olahan ?? []).length > 0 && (
                                                  <>
                                                    {fmtPaket(li) ? ' · ' : ''}
                                                    Olahan:{' '}
                                                    {(li.order_olahan ?? [])
                                                      .map((ol) => `${ol.nama_olahan} (${OLAHAN_LABEL[ol.kategori] ?? ol.kategori})`)
                                                      .join(' · ')}
                                                  </>
                                                )}
                                              </p>
                                            )}
                                          </td>
                                          <td className="px-3 py-3 text-right tabular-nums">{fmtNum(li.qty)}</td>
                                          <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">
                                            {fmtRp(li.harga_satuan)}
                                          </td>
                                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                            {fmtRp(Number(li.qty) * Number(li.harga_satuan))}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t bg-muted/30">
                                        <td colSpan={3} className="px-4 py-3 text-xs tracking-widest text-muted-foreground uppercase">
                                          Total rincian
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                          {fmtRp(totalRincian)}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              ) : (
                                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Tanpa rincian paket</p>
                              )}
                            </section>

                            {keluar.length > 0 && (
                              <section className="rounded-xl border bg-muted/20 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <h3 className="text-sm font-semibold text-[#4a0f30]">Barang keluar</h3>
                                    <p className="text-xs text-muted-foreground">Inventory yang dipakai untuk pesanan ini.</p>
                                  </div>
                                  <span className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold tabular-nums">
                                    {keluar.length} SKU
                                  </span>
                                </div>
                                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                                  {keluar.map((it) => (
                                    <li
                                      key={it.sku}
                                      className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{it.nama}</p>
                                        <p className="font-mono text-[11px] text-muted-foreground">{it.sku}</p>
                                      </div>
                                      <span className="shrink-0 rounded-full bg-[#c2185b]/10 px-2.5 py-1 text-xs font-semibold text-[#c2185b] tabular-nums">
                                        {fmtNum(it.qty)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </section>
                            )}
                          </div>

                          <aside className="space-y-3">
                            <section className="rounded-xl border bg-[#4a0f30]/[0.03] p-4">
                              <h3 className="text-sm font-semibold text-[#4a0f30]">Ringkasan biaya</h3>
                              <dl className="mt-3 space-y-1.5 text-sm tabular-nums">
                                <div className="flex justify-between gap-2">
                                  <dt className="text-muted-foreground">Subtotal paket</dt>
                                  <dd>{fmtRp(subPaket)}</dd>
                                </div>
                                {subAddon > 0 && (
                                  <div className="flex justify-between gap-2">
                                    <dt className="text-muted-foreground">Add-on</dt>
                                    <dd>{fmtRp(subAddon)}</dd>
                                  </div>
                                )}
                                {diskon > 0 && (
                                  <div className="flex justify-between gap-2">
                                    <dt className="text-muted-foreground">Diskon</dt>
                                    <dd>−{fmtRp(diskon)}</dd>
                                  </div>
                                )}
                                <div className="flex justify-between gap-2 border-t pt-2 text-base font-semibold text-[#c2185b]">
                                  <dt>Total</dt>
                                  <dd>{fmtRp(o.harga_final)}</dd>
                                </div>
                              </dl>
                            </section>
                          </aside>
                        </div>
                      </div>
                      <PanelBayar
                        orderId={o.id_pesanan}
                        metode={o.metode_pembayaran ?? null}
                        tagihan={tagihan[o.id_pesanan]}
                        riwayat={riwayat[o.id_pesanan]}
                        namaCustomer={o.closing?.nama_customer ?? null}
                        canPay={canPay}
                        canMakeVa={canMakeVa}
                        onChanged={() => router.refresh()}
                      />
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

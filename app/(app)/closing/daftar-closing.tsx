'use client'
import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { tenggatLabel, statusClosing } from '@/lib/closing'
import { fmtDate, fmtRp } from '@/lib/utils/format'
import type { PembayaranRow, Tagihan } from '@/lib/payments/types'
import { ChevronDown, ChevronUp, CircleCheck, Clock, Plus, Search, UserPlus, Users, XCircle } from 'lucide-react'

export type OrderOlahan = { nama_olahan: string; kategori: string }

export type statSEO = {
  id: string,
  email: string,
  nClosing: number,
  ekor: number,
  pendapatan: number
}

export type OrderLine = {
  id_baris: string
  nama_paket: string
  kategori: string
  qty: number
  harga_satuan: number
  order_olahan?: OrderOlahan[]
  paket?: { tipe: string | null; anak: string | null; porsi: number | null; jenis: string | null; jumlah_hewan: number | null } | null
}

export type Order = {
  id_pesanan: string
  status: string | null
  tipe_pembayaran: string | null
  metode_pembayaran: string | null
  harga_final: number | null
  qty_paket: number | null
  waktu_kirim: string | null
  waktu_tiba: string | null
  tanggal_transaksi: string | null
  created_at: string
  customer_email: string | null
  order_lines: OrderLine[]
}

export type Closing = {
  id: number
  nama_customer: string
  no_hp: string
  email_customer?: string | null
  email?: string | null
  alamat: string
  jenis_customer: string | null
  sumber_informasi: string
  status: 'BARU' | 'DIPROSES' | 'SELESAI' | 'BATAL'
  created_by: string
  created_at: string
  orders?: Order[]
}

const PILL: Record<Closing['status'], string> = {
  BARU: 'border-[#c2185b]/40 bg-[#c2185b]/5 text-[#c2185b]',
  DIPROSES: 'border-[#e8b10c]/70 bg-[#e8b10c]/15 text-[#4a0f30]',
  SELESAI: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  BATAL: 'border-red-300 bg-red-50 text-red-700',
}

const PILL_TENGGAT: Record<string, string> = {
  now: 'border-[#e8b10c] bg-[#e8b10c] text-[#4a0f30]',
  late: 'border-red-500 bg-red-500 text-white',
  soon: 'border-[#e8b10c]/70 bg-[#e8b10c]/15 text-[#4a0f30]',
  none: 'border-input bg-muted text-muted-foreground',
}

const closingTotal = (l: Closing) => (l.orders ?? []).reduce((s, o) => s + (Number(o.harga_final) || 0), 0)

const closingEmail = (l: Closing, orders: Order[]) =>
  l.email_customer ?? l.email ?? orders[0]?.customer_email ?? null

const initials = (nama: string) =>
  nama
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((kata) => kata[0] ?? '')
    .join('')
    .toUpperCase() || '—'

// Tenggat terburuk per closing (late > now > soon) supaya tenggat overdue
// terlihat tanpa harus membuka baris.
const worstTenggat = (orders: Order[]) =>
  orders.reduce<{ tone: string; text: string } | null>((acc, o) => {
    const t = tenggatLabel(o.waktu_kirim)
    if (t.tone === 'none') return acc
    const rank = { late: 3, now: 2, soon: 1 } as Record<string, number>
    if (!acc || (rank[t.tone] ?? 0) > (rank[acc.tone] ?? 0)) return { tone: t.tone, text: t.text }
    return acc
  }, null)

export default function DaftarClosing({
  initialClosing,
  namaSEO = {},
  namaLokasi = 'BDG-RAYA',
  tagihan = {},
  riwayat = {},
}: {
  initialClosing: Closing[]
  namaSEO?: Record<string, string>
  role?: string
  namaLokasi?: string
  tagihan?: Record<string, Tagihan>
  riwayat?: Record<string, PembayaranRow[]>
}) {
  const [prevInitial, setPrevInitial] = useState(initialClosing)
  const [closing, setClosing] = useState<Closing[]>(() =>
    initialClosing.map((l) => ({ ...l, orders: l.orders ?? [] })),
  )
  // Props baru dari server (router.refresh) harus menggantikan state lama.
  // setClosing dipakai pola render-adjust di bawah agar tak basi.
  if (prevInitial !== initialClosing) {
    setPrevInitial(initialClosing)
    setClosing(initialClosing.map((l) => ({ ...l, orders: l.orders ?? [] })))
  }
  const [open, setOpen] = useState<number | null>(null)
  const [filter, setFilter] = useState('semua')
  const [sort, setSort] = useState<'baru' | 'lama'>('baru')
  const [query, setQuery] = useState('')

  // Daftar default: BATAL dikecualikan (tetap dibuka via filter Status = Batal).
  const aktif = useMemo(
    () => closing.filter((l) => statusClosing(l.orders) !== 'BATAL'),
    [closing],
  )

  const counts = useMemo(() => {
    const c = { total: aktif.length, BARU: 0, DIPROSES: 0, SELESAI: 0, BATAL: 0 }
    for (const l of aktif) c[statusClosing(l.orders)] += 1
    c.BATAL = closing.length - aktif.length
    return c
  }, [closing, aktif])

  // Statistik per SEO (closing + order batal dikecualikan).
  const statSEO = useMemo(() => {
    const grup = new Map<string, Closing[]>()
    for (const l of aktif) grup.set(l.created_by, [...(grup.get(l.created_by) ?? []), l])
    return [...grup.entries()]
      .map(([id, rows]) => {
        const orderAktif = rows.flatMap((l) => l.orders ?? []).filter((o) => o.status !== 'BATAL')
        const ekor = orderAktif.reduce(
          (s, o) =>
            s +
            (o.order_lines ?? [])
              .filter((li) => li.kategori === 'PAKET')
              .reduce((a, li) => {
                const p = Array.isArray(li.paket) ? (li.paket[0] ?? null) : (li.paket ?? null)
                return a + Number(li.qty) * Number(p?.jumlah_hewan ?? 0)
              }, 0),
          0,
        )
        const pendapatan = orderAktif.reduce((s, o) => s + (Number(o.harga_final) || 0), 0)
        return { id, email: namaSEO[id] ?? id.slice(0, 8), nClosing: rows.length, ekor, pendapatan }
      })
      .sort((a, b) => b.pendapatan - a.pendapatan)
  }, [aktif, namaSEO])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let r =
      filter === 'semua'
        ? [...aktif]
        : filter === 'BATAL'
          ? closing.filter((l) => statusClosing(l.orders) === 'BATAL')
          : aktif.filter((l) => statusClosing(l.orders) === filter)
    if (q) {
      r = r.filter((l) =>
        [l.id, l.nama_customer, l.no_hp, l.email_customer ?? '', l.jenis_customer ?? '', l.sumber_informasi, namaSEO[l.created_by] ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    r.sort((a, b) =>
      sort === 'baru'
        ? +new Date(b.created_at) - +new Date(a.created_at)
        : +new Date(a.created_at) - +new Date(b.created_at),
    )
    return r
  }, [aktif, closing, filter, sort, query, namaSEO])

  const stats = [
    { label: 'Total closing', value: counts.total, icon: Users, chip: 'bg-white/15 text-white', bar: 'bg-[#e8b10c]', hero: true },
    { label: 'Baru', value: counts.BARU, icon: UserPlus, chip: 'bg-[#c2185b]/10 text-[#c2185b]', bar: 'bg-[#c2185b]', hero: false },
    { label: 'Diproses', value: counts.DIPROSES, icon: Clock, chip: 'bg-[#e8b10c]/20 text-[#4a0f30]', bar: 'bg-[#e8b10c]', hero: false },
    { label: 'Selesai', value: counts.SELESAI, icon: CircleCheck, chip: 'bg-green-600/10 text-green-700', bar: 'bg-green-600', hero: false },
    { label: 'Batal', value: counts.BATAL, icon: XCircle, chip: 'bg-red-500/10 text-red-600', bar: 'bg-red-500', hero: false },
  ]

  const tabs = [
    { key: 'semua', label: 'Semua', n: counts.total },
    { key: 'BARU', label: 'Baru', n: counts.BARU },
    { key: 'DIPROSES', label: 'Diproses', n: counts.DIPROSES },
    { key: 'SELESAI', label: 'Selesai', n: counts.SELESAI },
    { key: 'BATAL', label: 'Batal', n: counts.BATAL },
  ]

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">
            CRM · {namaLokasi}
          </p>
          <h1 className="mt-1 font-heading text-4xl font-semibold tracking-[-0.03em] text-[#4a0f30]">
            Closing
          </h1>
          <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-[#c2185b] to-[#e8b10c]" />
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Lead yang sudah closing, siap diteruskan ke CSO dan diproses menjadi order.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4a0f30]/10 bg-white px-3 py-1 font-medium text-[#4a0f30] tabular-nums">
              <Users className="size-3.5 text-[#c2185b]" aria-hidden />
              {counts.total} closing
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c2185b]/15 bg-[#c2185b]/5 px-3 py-1 font-medium text-[#c2185b] tabular-nums">
              <UserPlus className="size-3.5" aria-hidden />
              {counts.BARU} baru
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e8b10c]/30 bg-[#e8b10c]/10 px-3 py-1 font-medium text-[#4a0f30] tabular-nums">
              <Clock className="size-3.5" aria-hidden />
              {counts.DIPROSES} diproses
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="urut" className="text-sm text-muted-foreground">Urutkan</label>
          <select
            id="urut"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'baru' | 'lama')}
            className="h-10 rounded-lg border border-[#4a0f30]/15 bg-white px-3 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
          >
            <option value="baru">Terbaru</option>
            <option value="lama">Terlama</option>
          </select>
          <Link
            href="/closing/tambah"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] shadow-sm transition-colors hover:bg-[#f5c234] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
          >
            <Plus className="size-4" /> Tambah Closing
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <Card
            key={s.label}
            size="sm"
            className={`relative overflow-hidden rounded-xl shadow-sm ${s.hero ? 'border-transparent bg-[#4a0f30] text-white' : 'border-[#4a0f30]/10 bg-white'}`}
          >
            <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} />
            <CardContent className="flex items-center gap-3 pl-4">
              <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${s.chip}`}>
                <s.icon className="size-5" />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-2xl font-semibold tracking-tight tabular-nums">{s.value}</div>
                <div
                  className={`truncate text-[11px] font-semibold tracking-[0.12em] uppercase ${s.hero ? 'text-white/65' : 'text-muted-foreground'}`}
                >
                  {s.label}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid items-stretch gap-2.5 md:grid-cols-[1fr_1.6fr]">
        <Card size="sm" className="rounded-xl border-[#e8b10c]/30 bg-[#e8b10c]/10 shadow-sm">
          <CardContent>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#4a0f30]/60 uppercase">
              Ekor terjual · {namaLokasi}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#4a0f30] tabular-nums">
              {statSEO.reduce((s, x) => s + x.ekor, 0)}{' '}
              <span className="text-sm font-medium text-muted-foreground">ekor</span>
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">dari {counts.total} closing aktif</p>
          </CardContent>
        </Card>
        <Card size="sm" className="rounded-xl border-[#c2185b]/15 shadow-sm">
          <CardContent>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#4a0f30]/60 uppercase">
              Omset · {namaLokasi}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#c2185b] tabular-nums">
              {fmtRp(statSEO.reduce((s, x) => s + x.pendapatan, 0))}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">dari {counts.total} closing aktif</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[#4a0f30]/10 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="cari" className="sr-only">Cari closing</label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="cari"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, HP, ID, SEO…"
            className="h-10 w-full rounded-lg border border-[#4a0f30]/15 bg-white pr-3 pl-9 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
          />
        </div>
        <div
          role="tablist"
          aria-label="Filter status closing"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 sm:mx-0 sm:px-0"
        >
          {tabs.map((t) => {
            const active = filter === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(t.key)}
                className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none ${
                  active
                    ? 'bg-[#c2185b] font-semibold text-white shadow-sm'
                    : 'font-medium text-muted-foreground hover:bg-[#4a0f30]/5 hover:text-[#4a0f30]'
                }`}
              >
                {t.label}
                <span className={`text-[12px] tabular-nums ${active ? 'text-white/75' : 'text-muted-foreground/70'}`}>
                  {t.n}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {rows.length ? (
        <Card className="overflow-hidden border border-[#4a0f30]/10 py-0 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#4a0f30]/10 bg-[#4a0f30]/[0.03] px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#4a0f30]/70 uppercase">
              Daftar closing
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {rows.length} dari {closing.length} · {sort === 'baru' ? 'terbaru dulu' : 'terlama dulu'}
            </p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-[14px]">
            <thead>
              <tr className="sticky top-0 z-10 border-b bg-[#4a0f30]/[0.04] text-[11px] tracking-[0.14em] text-[#4a0f30]/60 uppercase backdrop-blur-sm">
                <th scope="col" className="px-4 py-3 font-medium">ID</th>
                <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                <th scope="col" className="px-4 py-3 font-medium">No. HP</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">SEO</th>
                <th scope="col" className="px-4 py-3 font-medium">Sumber</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Nilai</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
          {rows.map((l) => {
            const orders = l.orders ?? []
            const isOpen = open === l.id
            const email = closingEmail(l, orders)
            // Status tampil = derivasi order (kolom DB tidak dibaca).
            const st = statusClosing(orders)
            // Batal tidak punya tenggat nyata — jangan teas deadline-nya.
            const tenggatBaris = st === 'BATAL' ? null : worstTenggat(orders)
            return (
              <Fragment key={l.id}>
              <tr className={`border-b border-[#4a0f30]/10 transition-colors last:border-0 ${isOpen ? 'bg-[#e8b10c]/[0.07]' : 'odd:bg-[#4a0f30]/[0.015] hover:bg-[#c2185b]/[0.035]'}`}>
                <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground/80" title={String(l.id)}>#{l.id}</td>
                <td className="px-4 py-3">
                  <div className="flex min-w-0 max-w-[280px] items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#c2185b]/10 text-[11px] font-bold tracking-wide text-[#c2185b]"
                    >
                      {initials(l.nama_customer)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#4a0f30]">{l.nama_customer}</p>
                      {email && <p className="truncate text-[12px] text-muted-foreground">{email}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">{l.no_hp}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase whitespace-nowrap ${PILL[st]}`}>
                    {st}
                  </span>
                  {tenggatBaris && (
                    <span className={`ml-1.5 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${PILL_TENGGAT[tenggatBaris.tone]}`}>
                      {tenggatBaris.text}
                    </span>
                  )}
                </td>
                <td className="max-w-40 truncate px-4 py-3 text-muted-foreground" title={namaSEO[l.created_by] ?? ''}>
                  {namaSEO[l.created_by] ?? l.created_by.slice(0, 8)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{l.sumber_informasi}</td>
                <td className="px-4 py-3 text-right font-semibold text-[#c2185b] tabular-nums">{fmtRp(closingTotal(l))}</td>
                <td className="px-4 py-3 text-right">
                  {orders.length ? (
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : l.id)}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? `Tutup rincian ${l.nama_customer}` : `Buka rincian ${l.nama_customer}`}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8b10c]/60 px-3 text-[14px] font-medium text-[#4a0f30] transition-colors hover:bg-[#e8b10c]/10 focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                    >
                      Rincian
                      <span className="tabular-nums">{orders.length}</span>
                      {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
              {isOpen && (
              <tr className="border-b border-[#e8b10c]/25 bg-[#e8b10c]/[0.04] last:border-0">
                <td colSpan={8} className="border-l-2 border-[#e8b10c] px-4 py-4">
                  <div className="grid gap-x-8 gap-y-3 text-[15px] sm:grid-cols-2 lg:grid-cols-4">
                    <p className="min-w-0"><span className="block text-xs tracking-wide text-muted-foreground uppercase">Email</span><span className="break-all">{email ?? '—'}</span></p>
                    <p className="min-w-0"><span className="block text-xs tracking-wide text-muted-foreground uppercase">Alamat</span><span className="line-clamp-2">{l.alamat}</span></p>
                    <p className="min-w-0"><span className="block text-xs tracking-wide text-muted-foreground uppercase">Jenis</span>{l.jenis_customer ?? '—'}</p>
                    <p className="min-w-0"><span className="block text-xs tracking-wide text-muted-foreground uppercase">Masuk</span><span className="tabular-nums">{fmtDate(l.created_at)}</span></p>
                  </div>
                  <ul className="mt-3 space-y-3 border-t border-dashed pt-3">
                    {orders.map((o) => {
                      const tg = tenggatLabel(o.waktu_kirim)
                      const tag = tagihan[o.id_pesanan]
                      const va = (riwayat[o.id_pesanan] ?? []).find(
                        (r) => r.status_payment === 'PENDING' && r.va_number,
                      )
                      const lunas = tag?.statusBayar === 'LUNAS'
                      return (
                      <li key={o.id_pesanan} className="text-[15px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium tabular-nums">{fmtDate(o.tanggal_transaksi ?? o.created_at)}</span>
                          <span className="inline-block rounded border border-input px-2 py-0.5 text-xs tracking-widest uppercase">
                            {o.status ?? '—'}
                          </span>
                          <span className="text-muted-foreground">bayar: {o.tipe_pembayaran ?? '—'} · via {o.metode_pembayaran ?? '—'}</span>
                          {tag && (
                            <span className="text-muted-foreground tabular-nums">
                              {lunas ? 'lunas' : `sisa ${fmtRp(tag.sisaBayar)}`}
                              {va ? ` · VA ${va.va_number}` : ''}
                            </span>
                          )}
                          <span className="ml-auto font-semibold tabular-nums">{fmtRp(o.harga_final)}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                          Kirim: {o.waktu_kirim ? fmtDate(o.waktu_kirim) : '—'}
                          {o.waktu_tiba ? ` · Tiba: ${fmtDate(o.waktu_tiba)}` : ''}
                          {' · '}
                          <span className={`inline-block rounded border px-2 py-0.5 text-xs font-bold tracking-widest uppercase ${PILL_TENGGAT[tg.tone]}`}>
                            {tg.text}
                          </span>
                          {' · '}
                          <Link href="/orders" className="font-medium text-[#c2185b] underline-offset-2 hover:underline">
                            Kelola di Pesanan →
                          </Link>
                        </p>
                      </li>
                      )
                    })}
                  </ul>
                </td>
              </tr>
              )}
              </Fragment>
            )
          })}
            </tbody>
          </table>
          </div>
        </Card>
      ) : (
        <Card className="border border-[#4a0f30]/10 shadow-sm">
          <CardContent className="px-4 py-12 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#c2185b]/10 text-[#c2185b]">
              <UserPlus className="size-6" aria-hidden />
            </span>
            <p className="mt-4 text-lg font-semibold text-[#4a0f30]">
              Belum ada closing{filter !== 'semua' ? ` berstatus ${filter}` : ''}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Tambah closing pertama untuk mulai mencatat order.</p>
            <Link
              href="/closing/tambah"
              className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] shadow-sm hover:bg-[#f5c234]"
            >
              <Plus className="size-4" /> Tambah Closing
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

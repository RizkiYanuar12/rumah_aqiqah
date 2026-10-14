'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { tenggatLabel, statusClosing } from '@/lib/closing'
import { fmtDate, fmtRp } from '@/lib/format'
import { CircleCheck, Clock, Plus, UserPlus, Users, XCircle } from 'lucide-react'

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
  id: string
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
  SELESAI: 'border-[#34eb3d]/70 bg-[#34eb3d]/15 text-[#050505]',
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

export default function DaftarClosing({
  initialClosing,
  namaSEO = {},
  namaLokasi = 'BDG-RAYA',
}: {
  initialClosing: Closing[]
  namaSEO?: Record<string, string>
  role?: string
  namaLokasi?: string
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
  const [open, setOpen] = useState<string | null>(null)
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
    { label: 'Total closing', value: counts.total, icon: Users, chip: 'bg-[#4a0f30] text-white' },
    { label: 'Baru', value: counts.BARU, icon: UserPlus, chip: 'bg-[#c2185b]/10 text-[#c2185b]' },
    { label: 'Diproses', value: counts.DIPROSES, icon: Clock, chip: 'bg-[#e8b10c]/20 text-[#4a0f30]' },
    { label: 'Selesai', value: counts.SELESAI, icon: CircleCheck, chip: 'bg-green-600/10 text-green-700' },
    { label: 'Batal', value: counts.BATAL, icon: XCircle, chip: 'bg-red-500/10 text-red-600' },
  ]

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-light tracking-wide text-[#c2185b]">Closing</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
              {counts.total} Closing · {counts.BARU} Baru · {counts.DIPROSES} Diproses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="urut" className="text-sm text-muted-foreground">Urutkan</label>
          <select
            id="urut"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'baru' | 'lama')}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
          >
            <option value="baru">Terbaru</option>
            <option value="lama">Terlama</option>
          </select>
          <Link
            href="/closing/tambah"
            className="inline-flex h-9 items-center gap-1 rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234]"
          >
            <Plus className="size-4" /> Tambah Closing
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} size="sm">
            <CardContent className="flex items-center gap-2.5">
              <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${s.chip}`}>
                <s.icon className="size-5" />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-xl font-semibold tracking-tight tabular-nums">{s.value}</div>
                <div className="truncate text-[13px] font-medium text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid items-start gap-2.5 md:grid-cols-2">
        <Card size="sm">
          <CardContent>
            <p className="text-[13px] font-medium text-muted-foreground">
              Ekor terjual · {namaLokasi}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {statSEO.reduce((s, x) => s + x.ekor, 0)}{' '}
              <span className="text-sm font-medium text-muted-foreground">ekor</span>
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              dari {counts.total} closing aktif
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-[13px] font-medium text-muted-foreground">
              Omset · {namaLokasi}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {fmtRp(statSEO.reduce((s, x) => s + x.pendapatan,  0))}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              dari {counts.total} closing aktif
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="cari" className="sr-only">Cari closing</label>
        <input
          id="cari"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama, HP, ID, SEO…"
          className="h-9 min-w-52 flex-1 rounded-lg border border-input bg-transparent px-3 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none sm:max-w-xs"
        />
        <label htmlFor="status" className="text-sm text-muted-foreground">Status</label>
        <select
          id="status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
        >
            <option value="semua">Semua</option>
            <option value="BARU">Baru</option>
            <option value="DIPROSES">Diproses</option>
            <option value="SELESAI">Selesai</option>
            <option value="BATAL">Batal</option>
        </select>
      </div>

      {rows.length ? (
        <Card className="overflow-hidden py-0">
          <div className="overflow-x-auto">
          <table className="w-full min-w-240 text-left text-[15px]">
            <thead>
              <tr className="border-b bg-muted/50 text-[11px] tracking-widest text-muted-foreground uppercase">
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
            return (
              <Fragment key={l.id}>
              <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-[13px] text-muted-foreground" title={l.id}>{l.id.slice(0, 8)}</td>
                <td className="px-4 py-3 font-semibold break-all">{l.nama_customer}</td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">{l.no_hp}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-bold tracking-widest uppercase whitespace-nowrap ${PILL[st]}`}>
                    {st}
                  </span>
                </td>
                <td className="max-w-44 truncate px-4 py-3 text-muted-foreground" title={namaSEO[l.created_by] ?? ''}>
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
                      aria-label={isOpen ? 'Tutup rincian' : 'Buka rincian'}
                      className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-[#e8b10c]/60 px-3 text-[15px] font-medium text-[#4a0f30] hover:bg-[#e8b10c]/10 focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                    >
                      {orders.length} pesanan {isOpen ? '▴' : '▾'}
                    </button>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
              {isOpen && (
              <tr key={`${l.id}-detail`} className="border-b bg-muted/20 last:border-0">
                <td colSpan={8} className="px-4 py-4">
                  <div className="grid gap-x-8 gap-y-2 text-[15px] sm:grid-cols-2">
                    <p><span className="text-[11px] tracking-widest text-muted-foreground uppercase">Email</span><br />{email ?? '—'}</p>
                    <p><span className="text-[11px] tracking-widest text-muted-foreground uppercase">Alamat</span><br />{l.alamat}</p>
                    <p><span className="text-[11px] tracking-widest text-muted-foreground uppercase">Sumber</span><br />{l.sumber_informasi}</p>
                    <p><span className="text-[11px] tracking-widest text-muted-foreground uppercase">Jenis</span><br />{l.jenis_customer ?? '—'}</p>
                    <p><span className="text-[11px] tracking-widest text-muted-foreground uppercase">Masuk</span><br /><span className="tabular-nums">{fmtDate(l.created_at)}</span></p>
                  </div>
                  <ul className="mt-3 space-y-3 border-t border-dashed pt-3">
                    {orders.map((o) => {
                      const tg = tenggatLabel(o.waktu_kirim)
                      return (
                      <li key={o.id_pesanan} className="text-[15px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium tabular-nums">{fmtDate(o.tanggal_transaksi ?? o.created_at)}</span>
                          <span className="inline-block rounded border border-input px-2 py-0.5 text-[11px] tracking-widest uppercase">
                            {o.status ?? '—'}
                          </span>
                          <span className="text-muted-foreground">bayar: {o.tipe_pembayaran ?? '—'} · via {o.metode_pembayaran ?? '—'}</span>
                          <span className="ml-auto font-semibold tabular-nums">{fmtRp(o.harga_final)}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                          Kirim: {o.waktu_kirim ? fmtDate(o.waktu_kirim) : '—'}
                          {o.waktu_tiba ? ` · Tiba: ${fmtDate(o.waktu_tiba)}` : ''}
                          {' · '}
                          <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-bold tracking-widest uppercase ${PILL_TENGGAT[tg.tone]}`}>
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
        <Card>
          <CardContent className="px-4 py-10 text-center">
            <p className="text-lg font-medium">Belum ada closing{filter !== 'semua' ? ` berstatus ${filter}` : ''}</p>
            <p className="mt-1 text-sm text-muted-foreground">Tambah closing pertama untuk mulai mencatat order.</p>
            <Link
              href="/closing/tambah"
              className="mt-4 inline-flex h-9 items-center gap-1 rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234]"
            >
              <Plus className="size-4" /> Tambah Closing
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

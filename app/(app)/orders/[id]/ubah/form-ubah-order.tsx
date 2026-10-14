'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import OrderForm, { type OrderFormValues } from '../../../closing/_components/order-form'
import type { BomPaket, OlahanOpt, PaketOpt } from '../../../closing/_components/order-sections'
import { METODE_PEMBAYARAN } from '@/lib/order-status'

export type UbahInitial = Omit<OrderFormValues, 'tanggalTransaksi'>

// Form ubah isi pesanan: tampil sama seperti form closing, nilai terisi awal.
// Data customer read-only (milik closing); status tidak tersentuh di sini.
export default function FormUbahOrder({
  orderId,
  status,
  terminal,
  customer,
  paket,
  olahan,
  resep,
  initial,
}: {
  orderId: string
  status: string | null
  terminal: boolean
  customer: { nama: string; no_hp: string; alamat: string }
  paket: PaketOpt[]
  olahan: OlahanOpt[]
  resep: BomPaket[]
  initial: UbahInitial
}) {
  const router = useRouter()

  return (
    <OrderForm
      title="Ubah Pesanan"
      subtitle={`${customer.nama} · ${customer.no_hp} · status: ${status ?? '—'}`}
      banner={
        terminal ? (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            Pesanan batal tidak bisa diubah.
          </p>
        ) : undefined
      }
      customerCard={
        <Card>
          <CardHeader className="text-lg font-semibold text-[#c2185b]">1. Data customer (tidak bisa diubah di sini)</CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <p className="text-[11px] tracking-widest text-muted-foreground uppercase">Nama</p>
              <p className="text-[15px] font-medium">{customer.nama}</p>
            </div>
            <div className="grid gap-1.5">
              <p className="text-[11px] tracking-widest text-muted-foreground uppercase">No. HP</p>
              <p className="text-[15px] tabular-nums">{customer.no_hp}</p>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <p className="text-[11px] tracking-widest text-muted-foreground uppercase">Alamat</p>
              <p className="text-[15px]">{customer.alamat}</p>
            </div>
          </CardContent>
        </Card>
      }
      paket={paket}
      olahan={olahan}
      resep={resep}
      initial={{ ...initial, tanggalTransaksi: '' }}
      showTanggal={false}
      validateExtra={(v) => {
        if (!(METODE_PEMBAYARAN as readonly string[]).includes(v.metode)) return 'Pilih metode pembayaran'
        return null
      }}
      submitLabel="Simpan Perubahan"
      onSubmit={async (v) => {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paket_id: v.paketId,
            qty: v.qty,
            olahan_daging: v.dagingId,
            olahan_jeroan: v.jeroanId,
            addons: Object.entries(v.addonQty).map(([id_paket, q]) => ({ id_paket, qty: q })),
            inventory: v.invRows.map((r) => ({ sku: r.sku, qty: r.qty, harga: Number(r.harga) || 0 })),
            tipe_pembayaran: v.tipe,
            metode_pembayaran: v.metode,
            diskon: Number(v.diskon) || 0,
            waktu_kirim: new Date(v.waktuKirim).toISOString(),
            waktu_tiba: new Date(v.waktuTiba).toISOString(),
          }),
        })
        const json = await res.json()
        if (!res.ok) return json.error ?? 'Gagal menyimpan perubahan'
        router.push('/orders')
        router.refresh()
        return null
      }}
    />
  )
}

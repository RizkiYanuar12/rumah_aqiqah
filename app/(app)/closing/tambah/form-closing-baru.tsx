'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import OrderForm from '../_components/order-form'
import type { BomPaket, OlahanOpt, PaketOpt } from '../_components/order-sections'
import { NO_HP, SUMBER_INFORMASI, JENIS_CUSTOMER } from '@/lib/closing'
import { METODE_PEMBAYARAN } from '@/lib/order-status'
import { clearDraft, useDraftState } from '@/hooks/use-draft'

const DRAFT = 'closing:v1'

export default function FormClosingBaru({
  paket,
  olahan,
  resep,
  hasLokasi,
}: {
  paket: PaketOpt[]
  olahan: OlahanOpt[]
  resep: BomPaket[]
  hasLokasi: boolean
}) {
  const router = useRouter()

  const [nama, setNama] = useDraftState(`${DRAFT}:nama`, '')
  const [noHp, setNoHp] = useDraftState(`${DRAFT}:noHp`, '')
  const [email, setEmail] = useDraftState(`${DRAFT}:email`, '')
  const [alamat, setAlamat] = useDraftState(`${DRAFT}:alamat`, '')
  const [jenisCustomer, setJenisCustomer] = useDraftState<string>(`${DRAFT}:jenisCustomer`, JENIS_CUSTOMER[0])
  const [sumberInformasi, setSumberInformasi] = useDraftState(`${DRAFT}:sumberInformasi`, 'Instagram')
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <OrderForm
      title="Tambah Closing"
      subtitle="6 langkah berurutan: isi data customer, pilih paket, olahan, add-on, inventory, lalu bayar & jadwal."
      banner={
        <>
          {!hasLokasi && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              Akunmu belum punya lokasi — closing akan ditolak. Minta admin set app_metadata.id_lokasi, lalu
              login ulang.
            </p>
          )}
          {notice && (
            <p className="rounded-lg border border-[#e8b10c]/60 bg-[#e8b10c]/10 px-3 py-2 text-sm text-[#c2185b]">
              {notice}
            </p>
          )}
        </>
      }
      customerCard={
        <Card>
          <CardHeader className="text-lg font-semibold text-[#c2185b]">1. Data customer</CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Perusahaan</Label>
              <p className="h-8 rounded-lg border border-input bg-muted px-2.5 py-1 text-sm font-medium">ANA</p>
            </div>
            <div className="grid gap-1.5">
              <Label>Varian transaksi</Label>
              <p className="h-8 rounded-lg border border-input bg-muted px-2.5 py-1 text-sm font-medium">aqiqah</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nama">Nama customer</Label>
              <Input id="nama" required value={nama} onChange={(e) => setNama(e.target.value)} className="h-11 text-[15px]" />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='email'>Email</Label>
              <Input id='email' value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-[15px]" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nohp">No. HP (+62…)</Label>
              <Input id="nohp" required placeholder="+628123456789" pattern="\+62[0-9]{9,13}"
                value={noHp} onChange={(e) => setNoHp(e.target.value)} className="h-11 text-[15px]" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="alamat">Alamat</Label>
              <Input id="alamat" required value={alamat} onChange={(e) => setAlamat(e.target.value)} className="h-11 text-[15px]" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sumberInformasi">Sumber</Label>
              <select
                id="sumberInformasi"
                value={sumberInformasi}
                onChange={(e) => setSumberInformasi(e.target.value)}
                className="h-11 rounded-lg border border-input bg-transparent px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
              >
                {SUMBER_INFORMASI.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="jenisCustomer">Jenis customer</Label>
              <select
                id="jenisCustomer"
                value={jenisCustomer}
                onChange={(e) => setJenisCustomer(e.target.value)}
                className="h-11 rounded-lg border border-input bg-transparent px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
              >
                {JENIS_CUSTOMER.map((jenis) => (
                  <option key={jenis} value={jenis}>{jenis}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      }
      paket={paket}
      olahan={olahan}
      resep={resep}
      initial={{
        paketId: '', qty: 1, dagingId: '', jeroanId: '', addonQty: {}, invRows: [],
        tipe: 'TUNAI', metode: METODE_PEMBAYARAN[0], diskon: 0,
        waktuKirim: '', waktuTiba: '', tanggalTransaksi: '',
      }}
      showTanggal
      draftPrefix={DRAFT}
      validateExtra={(v) => {
        if (!NO_HP.test(noHp.trim())) return 'No HP harus format +62 (contoh +628123456789)'
        if (!(JENIS_CUSTOMER as readonly string[]).includes(jenisCustomer)) return 'Pilih jenis customer'
        if (!(METODE_PEMBAYARAN as readonly string[]).includes(v.metode)) return 'Pilih metode pembayaran'
        if (!v.tanggalTransaksi || isNaN(+new Date(v.tanggalTransaksi))) return 'Isi tanggal transaksi'
        return null
      }}
      submitLabel="Simpan Closing + Order"
      onSubmit={async (v) => {
        setNotice(null)
        const res = await fetch('/api/closing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nama_customer: nama.trim(),
            no_hp: noHp.trim(),
            email_customer: email.trim(),
            alamat: alamat.trim(),
            jenis_customer: jenisCustomer,
            sumber_informasi: sumberInformasi,
            order: {
              paket_id: v.paketId,
              qty: v.qty,
              olahan_daging: v.dagingId,
              olahan_jeroan: v.jeroanId,
              addons: Object.entries(v.addonQty).map(([id_paket, q]) => ({ id_paket, qty: q })),
              inventory: v.invRows.map((r) => ({ sku: r.sku, qty: r.qty, harga: Number(r.harga) || 0 })),
              metode_pembayaran: v.metode,
              tipe_pembayaran: v.tipe,
              diskon: Number(v.diskon) || 0,
              tanggal_transaksi: new Date(v.tanggalTransaksi).toISOString(),
              waktu_kirim: new Date(v.waktuKirim).toISOString(),
              waktu_tiba: new Date(v.waktuTiba).toISOString(),
            },
          }),
        })
        const json = await res.json()
        if (!res.ok) return json.error ?? 'Gagal menyimpan closing'
        if (json.warning) setNotice(json.warning)
        clearDraft(DRAFT)
        router.push('/closing')
        router.refresh()
        return null
      }}
    />
  )
}

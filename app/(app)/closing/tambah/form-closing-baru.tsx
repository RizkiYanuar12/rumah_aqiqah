'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import OrderForm, { type FieldErrors } from '../_components/order-form'
import type { BomPaket, OlahanOpt, PaketOpt } from '../_components/order-sections'
import { SUMBER_INFORMASI, JENIS_CUSTOMER, isNoHpValid, isKotaValid, isKodePosValid } from '@/lib/closing'
import { METODE_PEMBAYARAN } from '@/lib/orders/status'
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
  const [kota, setKota] = useDraftState(`${DRAFT}:kota`, '')
  const [kodePos, setKodePos] = useDraftState(`${DRAFT}:kodepos`, '')
  // Pesan validasi per kolom (kunci = nama field).
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  function clearErr(key: string) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }
  const [notice, setNotice] = useState<string | null>(null)
  const customerComplete = Boolean(
    nama.trim() &&
      isNoHpValid(noHp.trim()) &&
      alamat.trim() &&
      isKotaValid(kota) &&
      isKodePosValid(kodePos) &&
      (JENIS_CUSTOMER as readonly string[]).includes(jenisCustomer),
  )

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
      customerComplete={customerComplete}
      reviewCustomer={
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] tracking-widest text-muted-foreground uppercase">Nama</dt>
            <dd className="font-medium">{nama || '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-widest text-muted-foreground uppercase">No. HP</dt>
            <dd className="tabular-nums">{noHp || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] tracking-widest text-muted-foreground uppercase">Alamat</dt>
            <dd>
              {alamat || '—'}
              {kota ? `, ${kota}` : ''}
              {kodePos ? ` ${kodePos}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-widest text-muted-foreground uppercase">Jenis</dt>
            <dd>{jenisCustomer}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-widest text-muted-foreground uppercase">Sumber</dt>
            <dd>{sumberInformasi}</dd>
          </div>
          {email && (
            <div className="sm:col-span-2">
              <dt className="text-[11px] tracking-widest text-muted-foreground uppercase">Email</dt>
              <dd>{email}</dd>
            </div>
          )}
        </dl>
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
              <Label htmlFor="nama">
                Nama customer <span className="text-[#c2185b]">*</span>
              </Label>
              <Input
                id="nama"
                required
                autoComplete="name"
                value={nama}
                aria-invalid={!!fieldErrors.nama}
                aria-describedby={fieldErrors.nama ? 'err-nama' : undefined}
                onChange={(e) => { setNama(e.target.value); clearErr('nama') }}
                className="h-11 text-[15px]"
              />
              {fieldErrors.nama && <p id="err-nama" className="text-sm text-red-600">{fieldErrors.nama}</p>}
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='email'>Email (opsional)</Label>
              <Input
                id='email'
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 text-[15px]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nohp">
                No. HP <span className="text-[#c2185b]">*</span> (diawali 08)
              </Label>
              <Input
                id="nohp"
                required
                autoComplete="tel"
                placeholder="08201020112"
                maxLength={14}
                inputMode="numeric"
                aria-invalid={!!fieldErrors.no_hp}
                aria-describedby={fieldErrors.no_hp ? 'err-nohp' : undefined}
                value={noHp}
                onChange={(e) => { setNoHp(e.target.value.replace(/\D/g, '').slice(0, 14)); clearErr('no_hp') }}
                onBlur={() => {
                  if (!noHp.trim()) setFieldErrors((p) => ({ ...p, no_hp: 'No HP wajib diisi' }))
                  else if (!isNoHpValid(noHp.trim()))
                    setFieldErrors((p) => ({ ...p, no_hp: 'No HP diawali 08 dan minimal 10 angka' }))
                  else clearErr('no_hp')
                }}
                className="h-11 text-[15px]"
              />
              {fieldErrors.no_hp && (
                <p id="err-nohp" className="text-sm text-red-600">{fieldErrors.no_hp}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="alamat">
                Alamat <span className="text-[#c2185b]">*</span>
              </Label>
              <Input
                id="alamat"
                required
                autoComplete="street-address"
                value={alamat}
                aria-invalid={!!fieldErrors.alamat}
                aria-describedby={fieldErrors.alamat ? 'err-alamat' : undefined}
                onChange={(e) => { setAlamat(e.target.value); clearErr('alamat') }}
                className="h-11 text-[15px]"
              />
              {fieldErrors.alamat && <p id="err-alamat" className="text-sm text-red-600">{fieldErrors.alamat}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="kota">
                Kota <span className="text-[#c2185b]">*</span>
              </Label>
              <Input
                id="kota"
                required
                autoComplete="address-level2"
                value={kota}
                aria-invalid={!!fieldErrors.kota}
                aria-describedby={fieldErrors.kota ? 'err-kota' : undefined}
                onChange={(e) => { setKota(e.target.value); clearErr('kota') }}
                className="h-11 text-[15px]"
              />
              {fieldErrors.kota && <p id="err-kota" className="text-sm text-red-600">{fieldErrors.kota}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="kode_pos">
                Kode Pos <span className="text-[#c2185b]">*</span> (5 digit)
              </Label>
              <Input
                id="kode_pos"
                required
                autoComplete="postal-code"
                placeholder="40115"
                maxLength={5}
                inputMode="numeric"
                aria-invalid={!!fieldErrors.kode_pos}
                aria-describedby={fieldErrors.kode_pos ? 'err-kodepos' : undefined}
                value={kodePos}
                onChange={(e) => { setKodePos(e.target.value.replace(/\D/g, '').slice(0, 5)); clearErr('kode_pos') }}
                onBlur={() => {
                  if (!kodePos.trim()) setFieldErrors((p) => ({ ...p, kode_pos: 'Kode pos wajib diisi' }))
                  else if (!isKodePosValid(kodePos))
                    setFieldErrors((p) => ({ ...p, kode_pos: 'Kode pos harus 5 digit (mis. 40115)' }))
                  else clearErr('kode_pos')
                }}
                className="h-11 text-[15px]"
              />
              {fieldErrors.kode_pos && (
                <p id="err-kodepos" className="text-sm text-red-600">{fieldErrors.kode_pos}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sumberInformasi">Sumber</Label>
              <select
                id="sumberInformasi"
                value={sumberInformasi}
                onChange={(e) => { setSumberInformasi(e.target.value); clearErr('sumber') }}
                className="h-11 rounded-lg border border-input bg-transparent px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
              >
                {SUMBER_INFORMASI.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="jenisCustomer">
                Jenis customer <span className="text-[#c2185b]">*</span>
              </Label>
              <select
                id="jenisCustomer"
                required
                value={jenisCustomer}
                onChange={(e) => { setJenisCustomer(e.target.value); clearErr('jenis_customer') }}
                aria-invalid={!!fieldErrors.jenis_customer}
                aria-describedby={fieldErrors.jenis_customer ? 'err-jeniscustomer' : undefined}
                className="h-11 rounded-lg border border-input bg-transparent px-2 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
              >
                {JENIS_CUSTOMER.map((jenis) => (
                  <option key={jenis} value={jenis}>{jenis}</option>
                ))}
              </select>
              {fieldErrors.jenis_customer && (
                <p id="err-jeniscustomer" className="text-sm text-red-600">{fieldErrors.jenis_customer}</p>
              )}
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
      validateExtra={() => {
        const e: FieldErrors = {}
        if (!nama.trim()) e.nama = 'Nama customer wajib diisi'
        if (!alamat.trim()) e.alamat = 'Alamat wajib diisi'
        if (!isKotaValid(kota)) e.kota = 'Mohon Masukkan Kota Tempat Customer Berada'
        if (!kodePos.trim()) e.kode_pos = 'Kode pos wajib diisi'
        else if (!isKodePosValid(kodePos)) e.kode_pos = 'Kode pos harus 5 digit (mis. 40115)'
        if (!noHp.trim()) e.no_hp = 'No HP wajib diisi'
        else if (!isNoHpValid(noHp.trim())) e.no_hp = 'No HP diawali 08 dan minimal 10 angka'
        if (!(JENIS_CUSTOMER as readonly string[]).includes(jenisCustomer)) {
          e.jenis_customer = 'Pilih jenis customer'
        }
        return e
      }}
      onFieldErrors={setFieldErrors}
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
            kota: kota.trim(),
            kode_pos: kodePos.trim(),
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
        if (!res.ok) {
          // Error dari API bisa menunjuk kolom -> tampil di kolomnya, bukan di bawah.
          if (json?.field) setFieldErrors((prev) => ({ ...prev, [json.field]: json.error }))
          return json.error ?? 'Gagal menyimpan closing'
        }
        if (json.warning) setNotice(json.warning)
        clearDraft(DRAFT)
        router.push('/closing')
        router.refresh()
        return null
      }}
    />
  )
}

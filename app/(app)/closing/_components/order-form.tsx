'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  AddonSection,
  BayarSection,
  InventorySection,
  OlahanSection,
  PaketSection,
  TotalBar,
  type InventoryRow,
  type OlahanOpt,
  type PaketOpt,
  type BomPaket,
} from './order-sections'
import { METODE_PEMBAYARAN } from '@/lib/order-status'
import { useDraftState } from '@/hooks/use-draft'

export type OrderFormValues = {
  paketId: string
  qty: number
  dagingId: string
  jeroanId: string
  addonQty: Record<string, number>
  invRows: InventoryRow[]
  tipe: 'TUNAI' | 'CICILAN'
  metode: string
  diskon: number
  waktuKirim: string
  waktuTiba: string
  tanggalTransaksi: string
}

// Satu form untuk tambah closing + ubah pesanan. Yang beda (kartu customer,
// validasi ekstra, fetch, redirect) milik wrapper via props.
export default function OrderForm({
  title,
  subtitle,
  banner,
  customerCard,
  paket,
  olahan,
  resep,
  initial,
  showTanggal,
  draftPrefix,
  validateExtra,
  submitLabel,
  onSubmit,
}: {
  title: string
  subtitle: string
  banner?: ReactNode
  customerCard: ReactNode
  paket: PaketOpt[]
  olahan: OlahanOpt[]
  resep?: BomPaket[]
  initial: OrderFormValues
  showTanggal: boolean
  draftPrefix?: string | null
  validateExtra?: (v: OrderFormValues) => string | null
  submitLabel: string
  onSubmit: (v: OrderFormValues) => Promise<string | null>
}) {
  const utama = useMemo(() => paket.filter((p) => p.kategori === 'PAKET'), [paket])
  const addons = useMemo(() => paket.filter((p) => p.kategori !== 'PAKET'), [paket])
  const daging = useMemo(() => olahan.filter((o) => o.kategori === 'OLAHAN_DAGING'), [olahan])
  const jeroan = useMemo(() => olahan.filter((o) => o.kategori !== 'OLAHAN_DAGING'), [olahan])

  const d = (field: string) => (draftPrefix ? `${draftPrefix}:${field}` : null)
  const [paketId, setPaketId] = useDraftState(d('paketId'), initial.paketId)
  const [qty, setQty] = useDraftState(d('qty'), initial.qty)
  const [dagingId, setDagingId] = useDraftState(d('dagingId'), initial.dagingId)
  const [jeroanId, setJeroanId] = useDraftState(d('jeroanId'), initial.jeroanId)
  const [addonQty, setAddonQty] = useDraftState<Record<string, number>>(d('addonQty'), initial.addonQty)
  const [invRows, setInvRows] = useDraftState<InventoryRow[]>(d('invRows'), initial.invRows)
  const [tipe, setTipe] = useDraftState<'TUNAI' | 'CICILAN'>(d('tipe'), initial.tipe)
  const [metode, setMetode] = useDraftState(d('metode'), initial.metode || METODE_PEMBAYARAN[0])
  const [diskon, setDiskon] = useDraftState(d('diskon'), initial.diskon)
  const [waktuKirim, setWaktuKirim] = useDraftState(d('waktuKirim'), initial.waktuKirim)
  const [waktuTiba, setWaktuTiba] = useDraftState(d('waktuTiba'), initial.waktuTiba)
  const [tanggalTransaksi, setTanggalTransaksi] = useDraftState(d('tanggalTransaksi'), initial.tanggalTransaksi)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = utama.find((p) => p.id === paketId)
  const total = useMemo(() => {
    const base = chosen ? Number(chosen.harga) * qty : 0
    const extra = addons.reduce((s, a) => s + Number(a.harga) * (addonQty[a.id] ?? 0), 0)
    const inv = invRows.reduce((s, v) => s + Number(v.harga) * v.qty, 0)
    return Math.max(0, base + extra + inv - (Number(diskon) || 0))
  }, [chosen, qty, addons, addonQty, invRows, diskon])

  function setAddon(id: string, d: number) {
    setAddonQty((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + d)
      const copy = { ...prev }
      if (!next) delete copy[id]
      else copy[id] = next
      return copy
    })
  }

  function setAddonAbs(id: string, n: number) {
    setAddonQty((prev) => {
      const copy = { ...prev }
      if (!n) delete copy[id]
      else copy[id] = n
      return copy
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!paketId) return setError('Pilih paket utama dulu')
    if (!dagingId || !jeroanId) return setError('Pilih olahan daging + tulang/jeroan')
    if (!waktuKirim) return setError('Isi jadwal kirim')
    if (!waktuTiba) return setError('Isi jadwal tiba')
    const values: OrderFormValues = {
      paketId, qty, dagingId, jeroanId, addonQty, invRows, tipe, metode,
      diskon, waktuKirim, waktuTiba, tanggalTransaksi,
    }
    const extra = validateExtra?.(values)
    if (extra) return setError(extra)
    setSaving(true)
    try {
      const err = await onSubmit(values)
      if (err) setError(err)
    } catch {
      setError('Jaringan bermasalah, coba lagi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <h1 className="text-3xl font-light tracking-wide text-[#c2185b]">{title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {banner}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {customerCard}
          <PaketSection utama={utama} value={paketId} onChange={setPaketId} resep={resep} qtyPaket={qty} />
          <OlahanSection daging={daging} jeroan={jeroan} dagingId={dagingId} jeroanId={jeroanId}
            onDaging={setDagingId} onJeroan={setJeroanId} />
          <AddonSection addons={addons} qty={addonQty} onStep={setAddon} onSet={setAddonAbs} />
          <InventorySection rows={invRows} onRows={setInvRows} />
        </div>
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-4">
          <BayarSection
            tipe={tipe}
            onTipe={setTipe}
            diskon={diskon}
            onDiskon={setDiskon}
            qty={qty}
            onQty={setQty}
            waktuKirim={waktuKirim}
            onWaktu={setWaktuKirim}
            metode={metode}
            onMetode={setMetode}
            metodeOptions={METODE_PEMBAYARAN}
            tanggalTransaksi={showTanggal ? tanggalTransaksi : undefined}
            onTanggalTransaksi={showTanggal ? setTanggalTransaksi : undefined}
            waktuTiba={waktuTiba}
            onWaktuTiba={setWaktuTiba}
          />
          <TotalBar total={total} error={error} saving={saving} submitLabel={submitLabel} />
        </aside>
      </div>
    </form>
  )
}

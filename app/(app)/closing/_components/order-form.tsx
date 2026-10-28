'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AddonSection,
  BayarSection,
  InventorySection,
  OlahanSection,
  OrderSummary,
  PaketSection,
  GOLD_BTN,
  type InventoryRow,
  type OlahanOpt,
  type PaketOpt,
  type BomPaket,
  type SummaryLine,
} from './order-sections'
import { METODE_PEMBAYARAN } from '@/lib/orders/status'
import { useDraftState } from '@/hooks/use-draft'
import { fmtRp } from '@/lib/utils/format'

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

// Pesan validasi per kolom: kunci = nama field.
export type FieldErrors = Record<string, string>

const STEPS = [
  { key: 'customer', label: 'Customer', optional: false },
  { key: 'paket', label: 'Paket', optional: false },
  { key: 'olahan', label: 'Olahan', optional: false },
  { key: 'addon', label: 'Add-on', optional: true },
  { key: 'inventory', label: 'Tambahan', optional: true },
  { key: 'bayar', label: 'Bayar & jadwal', optional: false },
] as const

type StepKey = (typeof STEPS)[number]['key']

const FIELD_TARGET: Record<string, string> = {
  nama: 'nama',
  no_hp: 'nohp',
  alamat: 'alamat',
  kota: 'kota',
  kode_pos: 'kode_pos',
  jenis_customer: 'jenisCustomer',
  paket: 'step-paket',
  daging: 'step-olahan',
  jeroan: 'step-olahan',
  kirim: 'kirim',
  tiba: 'tiba',
  tanggal: 'tgl',
  metode: 'metode',
}

// Satu form untuk tambah closing + ubah pesanan. Yang beda (kartu customer,
// validasi ekstra, fetch, redirect) milik wrapper via props.
export default function OrderForm({
  title,
  subtitle,
  banner,
  customerCard,
  reviewCustomer,
  customerComplete = false,
  paket,
  olahan,
  resep,
  initial,
  showTanggal,
  draftPrefix,
  validateExtra,
  onFieldErrors,
  submitLabel,
  onSubmit,
}: {
  title: string
  subtitle: string
  banner?: ReactNode
  customerCard: ReactNode
  reviewCustomer?: ReactNode
  customerComplete?: boolean
  paket: PaketOpt[]
  olahan: OlahanOpt[]
  resep?: BomPaket[]
  initial: OrderFormValues
  showTanggal: boolean
  draftPrefix?: string | null
  validateExtra?: (v: OrderFormValues) => FieldErrors
  onFieldErrors?: (errs: FieldErrors) => void
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [summaryDismissed, setSummaryDismissed] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [activeStep, setActiveStep] = useState<StepKey>('customer')
  const sectionRefs = useRef<Partial<Record<StepKey, HTMLDivElement | null>>>({})

  // Pesan per kolom hilang begitu field-nya diperbaiki.
  function clearErr(key: string) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const chosen = utama.find((p) => p.id === paketId)
  const totals = useMemo(() => {
    const base = chosen ? Number(chosen.harga) * qty : 0
    const addonLines: SummaryLine[] = addons
      .filter((a) => (addonQty[a.id] ?? 0) > 0)
      .map((a) => ({ id: a.id, nama: a.nama_paket, qty: addonQty[a.id], harga: Number(a.harga) }))
    const addonTotal = addonLines.reduce((s, l) => s + l.harga * l.qty, 0)
    const invLines: SummaryLine[] = invRows.map((r) => ({
      id: r.sku,
      nama: r.nama_barang,
      qty: r.qty,
      harga: Number(r.harga),
      satuan: r.satuan,
    }))
    const invTotal = invLines.reduce((s, l) => s + l.harga * l.qty, 0)
    const total = Math.max(0, base + addonTotal + invTotal - (Number(diskon) || 0))
    return { base, addonLines, addonTotal, invLines, invTotal, total }
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

  const dagingNama = daging.find((o) => o.id_olahan === dagingId)?.nama_olahan
  const jeroanNama = jeroan.find((o) => o.id_olahan === jeroanId)?.nama_olahan
  const addonCount = Object.values(addonQty).reduce((s, n) => s + n, 0)
  const invCount = invRows.reduce((s, r) => s + r.qty, 0)
  const stepDone: Record<StepKey, boolean> = {
    customer: customerComplete,
    paket: Boolean(paketId),
    olahan: Boolean(dagingId && jeroanId),
    addon: addonCount > 0,
    inventory: invCount > 0,
    bayar: Boolean(metode && waktuKirim && waktuTiba && (!showTanggal || tanggalTransaksi)),
  }

  useEffect(() => {
    const onScroll = () => {
      let current: StepKey = 'customer'
      for (const s of STEPS) {
        const el = sectionRefs.current[s.key]
        if (el && el.getBoundingClientRect().top <= 140) current = s.key
      }
      setActiveStep(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  function goToStep(key: StepKey) {
    setActiveStep(key)
    const el = sectionRefs.current[key]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.focus({ preventScroll: true })
  }

  function values(): OrderFormValues {
    return {
      paketId,
      qty,
      dagingId,
      jeroanId,
      addonQty,
      invRows,
      tipe,
      metode,
      diskon,
      waktuKirim,
      waktuTiba,
      tanggalTransaksi,
    }
  }

  // Validasi milik OrderForm (paket, olahan, jadwal, metode) -> pesan per kolom.
  function ownErrors(): FieldErrors {
    const e: FieldErrors = {}
    if (!paketId) e.paket = 'Pilih paket utama dulu'
    if (!dagingId) e.daging = 'Pilih olahan daging'
    if (!jeroanId) e.jeroan = 'Pilih tulang/jeroan'
    if (!waktuKirim) e.kirim = 'Isi jadwal kirim'
    if (!waktuTiba) e.tiba = 'Isi jadwal tiba'
    if (showTanggal && (!tanggalTransaksi || isNaN(+new Date(tanggalTransaksi)))) {
      e.tanggal = 'Isi tanggal transaksi'
    }
    if (!(METODE_PEMBAYARAN as readonly string[]).includes(metode)) {
      e.metode = 'Pilih metode pembayaran'
    }
    return e
  }

  function focusFirstError(errs: FieldErrors) {
    const key = Object.keys(errs)[0]
    const id = key ? FIELD_TARGET[key] : undefined
    if (!id) return
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => {
      if (el instanceof HTMLElement) el.focus({ preventScroll: true })
    }, 250)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)
    const errs: FieldErrors = { ...(validateExtra?.(values()) ?? {}), ...ownErrors() }
    if (Object.keys(errs).length) {
      setFieldErrors(errs)
      setSummaryDismissed(false)
      onFieldErrors?.(errs)
      focusFirstError(errs)
      return
    }
    setFieldErrors({})
    onFieldErrors?.({})
    setReviewOpen(true)
  }

  async function doSubmit() {
    if (saving) return
    setReviewOpen(false)
    setSaving(true)
    setError(null)
    try {
      const err = await onSubmit(values())
      if (err) setError(err)
    } catch {
      setError('Jaringan bermasalah, coba lagi')
    } finally {
      setSaving(false)
    }
  }

  const errorEntries = Object.entries(fieldErrors)

  return (
    <form
      onSubmit={submit}
      onChangeCapture={() => setSummaryDismissed(true)}
      noValidate
      className="mx-auto w-full max-w-5xl space-y-5 pb-28 lg:pb-0"
    >
      <div>
        <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">
          Closing · Order
        </p>
        <h1 className="mt-1 font-heading text-4xl font-semibold tracking-[-0.03em] text-[#4a0f30]">{title}</h1>
        <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-[#c2185b] to-[#e8b10c]" />
        <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="text-[#c2185b]">*</span> Wajib diisi
        </p>
      </div>

      {banner}

      <nav
        aria-label="Langkah pengisian"
        className="sticky top-0 z-20 rounded-xl border bg-background/95 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <ol className="flex gap-1 overflow-x-auto">
          {STEPS.map((s, i) => {
            const active = activeStep === s.key
            const done = stepDone[s.key]
            return (
              <li key={s.key} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => goToStep(s.key)}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`Langkah ${i + 1}: ${s.label}${s.optional ? ' (opsional)' : ''}`}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                    active ? 'bg-[#c2185b]/10 text-[#4a0f30]' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                      done
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : active
                          ? 'border-[#c2185b] bg-[#c2185b] text-white'
                          : 'border-input bg-background'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <span className="hidden min-w-0 truncate sm:inline">{s.label}</span>
                  {s.optional && (
                    <span className="hidden text-[10px] text-muted-foreground lg:inline">opsional</span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
        <p className="mt-1 px-1 text-[11px] font-medium text-[#4a0f30] sm:hidden">
          Langkah {STEPS.findIndex((s) => s.key === activeStep) + 1}:{' '}
          {STEPS.find((s) => s.key === activeStep)?.label}
        </p>
      </nav>

      {errorEntries.length > 0 && !summaryDismissed && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">Periksa {errorEntries.length} kolom</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {errorEntries.slice(0, 4).map(([key, msg]) => (
                  <li key={key}>{msg}</li>
                ))}
              </ul>
              {errorEntries.length > 4 && (
                <p className="mt-1 text-xs">+{errorEntries.length - 4} lainnya</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSummaryDismissed(true)}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <div
            id="step-customer"
            data-step="customer"
            ref={(el) => {
              sectionRefs.current.customer = el
            }}
            tabIndex={-1}
            className="scroll-mt-24 focus:outline-none"
          >
            {customerCard}
          </div>

          <div
            id="step-paket"
            data-step="paket"
            ref={(el) => {
              sectionRefs.current.paket = el
            }}
            tabIndex={-1}
            className="scroll-mt-24 focus:outline-none"
          >
            <PaketSection
              utama={utama}
              value={paketId}
              onChange={(id) => {
                setPaketId(id)
                clearErr('paket')
              }}
              resep={resep}
              qty={qty}
              onQty={setQty}
              error={fieldErrors.paket}
            />
          </div>

          <div
            id="step-olahan"
            data-step="olahan"
            ref={(el) => {
              sectionRefs.current.olahan = el
            }}
            tabIndex={-1}
            className="scroll-mt-24 focus:outline-none"
          >
            <OlahanSection
              daging={daging}
              jeroan={jeroan}
              dagingId={dagingId}
              jeroanId={jeroanId}
              onDaging={(id) => {
                setDagingId(id)
                clearErr('daging')
              }}
              onJeroan={(id) => {
                setJeroanId(id)
                clearErr('jeroan')
              }}
              errorDaging={fieldErrors.daging}
              errorJeroan={fieldErrors.jeroan}
            />
          </div>

          <div
            id="step-addon"
            data-step="addon"
            ref={(el) => {
              sectionRefs.current.addon = el
            }}
            tabIndex={-1}
            className="scroll-mt-24 focus:outline-none"
          >
            <AddonSection addons={addons} qty={addonQty} onStep={setAddon} onSet={setAddonAbs} />
          </div>

          <div
            id="step-inventory"
            data-step="inventory"
            ref={(el) => {
              sectionRefs.current.inventory = el
            }}
            tabIndex={-1}
            className="scroll-mt-24 focus:outline-none"
          >
            <InventorySection rows={invRows} onRows={setInvRows} />
          </div>

          <div
            id="step-bayar"
            data-step="bayar"
            ref={(el) => {
              sectionRefs.current.bayar = el
            }}
            tabIndex={-1}
            className="scroll-mt-24 focus:outline-none"
          >
            <BayarSection
              tipe={tipe}
              onTipe={setTipe}
              diskon={diskon}
              onDiskon={setDiskon}
              waktuKirim={waktuKirim}
              onWaktu={(v) => {
                setWaktuKirim(v)
                clearErr('kirim')
              }}
              metode={metode}
              onMetode={(v) => {
                setMetode(v)
                clearErr('metode')
              }}
              metodeOptions={METODE_PEMBAYARAN}
              tanggalTransaksi={showTanggal ? tanggalTransaksi : undefined}
              onTanggalTransaksi={
                showTanggal
                  ? (v) => {
                      setTanggalTransaksi(v)
                      clearErr('tanggal')
                    }
                  : undefined
              }
              waktuTiba={waktuTiba}
              onWaktuTiba={(v) => {
                setWaktuTiba(v)
                clearErr('tiba')
              }}
              errorMetode={fieldErrors.metode}
              errorTanggal={fieldErrors.tanggal}
              errorKirim={fieldErrors.kirim}
              errorTiba={fieldErrors.tiba}
            />
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <OrderSummary
            paketNama={chosen?.nama_paket ?? ''}
            qty={qty}
            hargaPaket={chosen ? Number(chosen.harga) : 0}
            dagingNama={dagingNama}
            jeroanNama={jeroanNama}
            addonLines={totals.addonLines}
            invLines={totals.invLines}
            base={totals.base}
            addonTotal={totals.addonTotal}
            invTotal={totals.invTotal}
            diskon={Number(diskon) || 0}
            total={totals.total}
            tipe={tipe}
            metode={metode}
            waktuKirim={waktuKirim}
            waktuTiba={waktuTiba}
            error={error}
            saving={saving}
            submitLabel={submitLabel}
          />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-3 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Total</p>
            <p className="truncate text-lg font-semibold text-[#c2185b] tabular-nums">{fmtRp(totals.total)}</p>
          </div>
          <Button type="submit" disabled={saving} className={`${GOLD_BTN} h-11 px-5 text-sm`}>
            <span className="sm:hidden">{saving ? 'Menyimpan…' : 'Simpan'}</span>
            <span className="hidden sm:inline">{saving ? 'Menyimpan…' : submitLabel}</span>
          </Button>
        </div>
      </div>

      <Dialog.Root open={reviewOpen} onOpenChange={setReviewOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <Dialog.Title className="font-heading text-xl font-semibold tracking-tight text-[#4a0f30]">
                  Periksa sebelum simpan
                </Dialog.Title>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pastikan data customer, paket, dan jadwal sudah benar.
                </p>
              </div>
              <Dialog.Close
                type="button"
                aria-label="Tutup"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              {reviewCustomer && (
                <section>
                  <h3 className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                    Customer
                  </h3>
                  <div className="mt-1 rounded-lg border bg-muted/20 p-3">{reviewCustomer}</div>
                </section>
              )}

              <OrderSummary
                paketNama={chosen?.nama_paket ?? ''}
                qty={qty}
                hargaPaket={chosen ? Number(chosen.harga) : 0}
                dagingNama={dagingNama}
                jeroanNama={jeroanNama}
                addonLines={totals.addonLines}
                invLines={totals.invLines}
                base={totals.base}
                addonTotal={totals.addonTotal}
                invTotal={totals.invTotal}
                diskon={Number(diskon) || 0}
                total={totals.total}
                tipe={tipe}
                metode={metode}
                waktuKirim={waktuKirim}
                waktuTiba={waktuTiba}
                error={error}
                saving={saving}
                submitLabel={submitLabel}
                showSubmit={false}
              />
            </div>

            <div className="flex flex-col gap-2 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end">
              <Dialog.Close
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-background px-4 text-[15px] font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
              >
                Kembali
              </Dialog.Close>
              <Button
                type="button"
                onClick={() => void doSubmit()}
                disabled={saving}
                className={`${GOLD_BTN} h-10 px-5`}
              >
                {saving ? 'Menyimpan…' : 'Konfirmasi Simpan'}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </form>
  )
}

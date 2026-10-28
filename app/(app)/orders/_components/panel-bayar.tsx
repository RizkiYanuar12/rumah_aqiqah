'use client'

import { useState } from 'react'
import { Landmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fmtDate, fmtNum, fmtRp } from '@/lib/utils/format'
import {
    VA_BANKS,
    isVaBank,
    vaBankLabel,
    type PembayaranRow,
    type Tagihan,
    type VaBank,
} from '@/lib/payments/types'

const PILL_BAYAR: Record<string, string> = {
    LUNAS: 'border-[#34eb3d]/70 bg-[#34eb3d]/15 text-[#050505]',
    ON_PROGRESS: 'border-[#e8b10c]/70 bg-[#e8b10c]/15 text-[#4a0f30]',
    BELUM_BAYAR: 'border-[#c2185b]/40 bg-[#c2185b]/5 text-[#c2185b]',
}

const LABEL_BAYAR: Record<string, string> = {
    LUNAS: 'Lunas',
    ON_PROGRESS: 'Belum lunas',
    BELUM_BAYAR: 'Belum bayar',
}

// status NICEPAY: 0 deposit, 1 reversal, 3 belum bayar, 4 expired/cancel.
const LABEL_STATUS_VA: Record<string, string> = {
    '0': 'dana masuk',
    '1': 'reversal',
    '3': 'belum dibayar',
    '4': 'kedaluwarsa/dibatalkan',
}

const BTN =
    'inline-flex min-h-9 items-center justify-center rounded-lg border border-input px-3 text-[15px] font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none disabled:opacity-50'

function formatRibuan(value: string) {
    const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function angkaNominal(value: string) {
    return Number(value.replace(/\D/g, ''))
}

type Pengirim = { nama: string | null; bank: string | null }

type PengirimEdit = { id: string; nama: string; bank: string }

function pengirimVa(r: PembayaranRow): Pengirim | null {
    const p = r.raw_payload?.['pengirim']
    if (!p || typeof p !== 'object') return null
    const o = p as Record<string, unknown>
    return {
        nama: typeof o.nama === 'string' && o.nama ? o.nama : null,
        bank: typeof o.bank === 'string' && o.bank ? o.bank : null,
    }
}

function gabungRiwayat(rows: PembayaranRow[]): PembayaranRow[] {
    const dibayar = new Set<string>()
    for (const r of rows) {
        if (r.gateway_ref?.startsWith('trx:')) dibayar.add(r.gateway_ref.slice(4))
    }
    return rows.filter(
        (r) => !(r.gateway_ref?.startsWith('va:') && dibayar.has(r.gateway_ref.slice(3))),
    )
}

export default function PanelBayar({
    orderId,
    metode,
    tagihan,
    riwayat,
    namaCustomer,
    canPay,
    canMakeVa,
    onChanged,
}: {
    orderId: string
    metode: string | null
    tagihan?: Tagihan
    riwayat?: PembayaranRow[]
    namaCustomer?: string | null
    canPay: boolean
    canMakeVa: boolean
    onChanged: () => void
}) {
    const [saving, setSaving] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)
    const [total, setTotal] = useState('')
    const [nama, setNama] = useState('')
    const [bank, setBank] = useState('')
    const [vaTotal, setVaTotal] = useState('')
    const [bankVa, setBankVa] = useState<VaBank>(() => {
        const aktif = (riwayat ?? []).find((r) => r.status_payment === 'PENDING' && r.va_number)
        const kode = String(aktif?.bank_tujuan ?? '')
        return isVaBank(kode) ? kode : 'CENA'
    })
    const [editPengirim, setEditPengirim] = useState<PengirimEdit | null>(null)

    const sisa = tagihan?.sisaBayar ?? 0
    const statusBayar = tagihan?.statusBayar ?? 'BELUM_BAYAR'
    const rows = riwayat ?? []
    const tampil = gabungRiwayat(rows)
    const va = rows.find((r) => r.status_payment === 'PENDING' && r.va_number) ?? null
    const lunas = statusBayar === 'LUNAS' || sisa <= 0

    async function call(
        key: string,
        url: string,
        body: Record<string, unknown>
    ): Promise<boolean> {
        setSaving(key)
        setError(null)
        setInfo(null)
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const json = await res.json().catch(() => null)
            if (!res.ok) {
                setError(json?.error ?? json?.message ?? 'Gagal memproses pembayaran')
                onChanged()
                return false
            }
            const overpay = Number(json?.overpay ?? 0)
            const cekStatus = body.action === 'cek_status'
            const statusVa = LABEL_STATUS_VA[String(json?.status ?? '')] ?? ''
            setInfo(
                overpay > 0
                    ? `Dana masuk, pembayaran tercatat. Kelebihan ${fmtRp(overpay)}`
                    : body.action === 'isi_pengirim'
                      ? 'Data pengirim disimpan'
                      : cekStatus && json?.paid === false
                        ? `Belum ada dana masuk${statusVa ? ` (NICEPAY: ${statusVa})` : ''}`
                        : cekStatus && json?.paid === true
                          ? 'Dana masuk — pembayaran tercatat'
                          : json?.code === 'LUNAS'
                            ? 'Pembayaran lunas'
                            : json?.code === 'DUPLIKAT'
                              ? 'Dana sudah tercatat sebelumnya'
                              : json?.dicatat === true
                                ? 'Pembayaran tercatat'
                                : json?.replaced === true
                                  ? 'VA lama dinonaktifkan, VA baru dibuat'
                                  : 'OK'
            )
            if (body.action === 'isi_pengirim') setEditPengirim(null)
            setTotal('')
            onChanged()
            return true
        } catch {
            setError('Jaringan bermasalah, coba lagi')
            return false
        } finally {
            setSaving(null)
        }
    }

    return (
        <div className="mt-3 space-y-3 border-t border-dashed pt-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tracking-wide text-muted-foreground uppercase">Pembayaran</span>
                <span
                    className={`inline-block rounded border px-2 py-0.5 text-xs font-bold tracking-widest uppercase ${
                        PILL_BAYAR[statusBayar] ?? PILL_BAYAR.BELUM_BAYAR
                    }`}
                >
                    {LABEL_BAYAR[statusBayar] ?? statusBayar}
                </span>
                {metode && (
                    <span className="text-sm text-muted-foreground">via {metode}</span>
                )}
                {!(canMakeVa && !lunas) && (
                    <span className="text-[15px] tabular-nums">
                        {lunas ? 'Sisa Rp0' : `Sisa ${fmtRp(sisa)}`}
                    </span>
                )}
                {tagihan && tagihan.totalTerbayar > 0 && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                        (terbayar {fmtRp(tagihan.totalTerbayar)})
                    </span>
                )}
            </div>

            {va && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e8b10c]/60 bg-[#e8b10c]/10 px-3 py-2">
                    <span className="text-xs tracking-wide text-muted-foreground uppercase">
                        Virtual Account
                    </span>
                    <span className="text-lg font-semibold tabular-nums">{va.va_number}</span>
                    {va.bank_tujuan && (
                        <span className="text-sm text-muted-foreground">
                            {vaBankLabel(va.bank_tujuan)}
                        </span>
                    )}
                    <span className="text-sm text-muted-foreground tabular-nums">
                        {fmtRp(va.total_bayar)}
                    </span>
                    <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(va.va_number ?? '')}
                        className={BTN}
                    >
                        Salin
                    </button>
                    {canPay && (
                        <button
                            type="button"
                            disabled={saving !== null}
                            onClick={() =>
                                call('cek', `/api/orders/${orderId}/pembayaran`, { action: 'cek_status' })
                            }
                            className={BTN}
                        >
                            {saving === 'cek' ? 'Mengecek dana…' : 'Cek dana masuk'}
                        </button>
                    )}
                </div>
            )}

            {canPay && !lunas && (
                <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
                    <div className="grid gap-1">
                        <Label htmlFor={`total-${orderId}`}>Nominal</Label>
                        <Input
                            id={`total-${orderId}`}
                            type="text"
                            inputMode="numeric"
                            placeholder={fmtNum(sisa)}
                            value={total}
                            onChange={(e) => setTotal(formatRibuan(e.target.value))}
                            className="h-10 w-36 text-[15px] tabular-nums"
                        />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor={`nama-${orderId}`}>Nama pengirim</Label>
                        <Input
                            id={`nama-${orderId}`}
                            value={nama}
                            onChange={(e) => setNama(e.target.value)}
                            className="h-10 w-44 text-[15px]"
                        />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor={`bank-${orderId}`}>Bank pengirim</Label>
                        <Input
                            id={`bank-${orderId}`}
                            value={bank}
                            onChange={(e) => setBank(e.target.value)}
                            className="h-10 w-36 text-[15px]"
                        />
                    </div>
                    <Button
                        type="button"
                        disabled={saving !== null}
                        onClick={() =>
                            call(
                                'manual',
                                `/api/orders/${orderId}/pembayaran`,
                                {
                                    action: 'manual',
                                    total: total ? angkaNominal(total) : sisa,
                                    nama: nama.trim() || null,
                                    bank: bank.trim() || null,
                                }
                            )
                        }
                        className="h-10 rounded-full bg-[#e8b10c] px-4 text-[15px] font-bold text-[#4a0f30] hover:bg-[#f5c234]"
                    >
                        {saving === 'manual' ? 'Menyimpan…' : 'Catat bayar'}
                    </Button>
                </div>
            )}

            {canMakeVa && !lunas && (
                <section className="overflow-hidden rounded-xl border border-[#e8b10c]/40 bg-[#e8b10c]/[0.04]">
                    <div className="flex items-start gap-3 border-b border-[#e8b10c]/30 bg-[#e8b10c]/10 px-4 py-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e8b10c]/20 text-[#4a0f30]">
                            <Landmark className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-[#4a0f30]">Virtual Account</h4>
                            <p className="text-xs text-muted-foreground">
                                Buat nomor VA untuk pembayaran penuh atau cicilan.
                            </p>
                        </div>
                    </div>
                    <div className="space-y-4 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid content-start gap-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Label htmlFor={`va-total-${orderId}`}>Nominal VA</Label>
                                    <button
                                        type="button"
                                        onClick={() => setVaTotal(fmtNum(sisa))}
                                        className="text-xs font-medium text-[#c2185b] hover:underline"
                                    >
                                        Isi sisa penuh
                                    </button>
                                </div>
                                <div className="relative">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                                        Rp
                                    </span>
                                    <Input
                                        id={`va-total-${orderId}`}
                                        type="text"
                                        inputMode="numeric"
                                        placeholder={fmtNum(sisa)}
                                        value={vaTotal}
                                        onChange={(e) => setVaTotal(formatRibuan(e.target.value))}
                                        className="h-11 w-full pl-9 text-[15px] tabular-nums"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Boleh cicilan. Kosongkan untuk menagih sisa penuh.
                                </p>
                            </div>
                            <div className="grid content-start gap-1.5">
                                <Label htmlFor={`va-bank-${orderId}`}>Bank VA</Label>
                                <select
                                    id={`va-bank-${orderId}`}
                                    value={bankVa}
                                    onChange={(e) => setBankVa(e.target.value as VaBank)}
                                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] focus-visible:ring-2 focus-visible:ring-[#e8b10c] focus-visible:outline-none"
                                >
                                    {VA_BANKS.map((b) => (
                                        <option key={b.code} value={b.code}>
                                            {b.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-muted-foreground">Pilih bank tujuan transfer.</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8b10c]/30 pt-3">
                            <div className="text-sm">
                                <span className="text-muted-foreground">Sisa tagihan </span>
                                <span className="font-semibold tabular-nums">{fmtRp(sisa)}</span>
                            </div>
                            <Button
                                type="button"
                                disabled={saving !== null}
                                onClick={() => {
                                    const nominal = vaTotal === '' ? sisa : angkaNominal(vaTotal)
                                    if (!Number.isInteger(nominal) || nominal <= 0) {
                                        setError('Nominal VA harus bilangan bulat lebih dari 0')
                                        return
                                    }
                                    if (nominal > sisa) {
                                        setError('Nominal VA melebihi sisa tagihan')
                                        return
                                    }
                                    setVaTotal('')
                                    call('va', `/api/orders/${orderId}/va`, {
                                        total: nominal,
                                        bank: bankVa,
                                    })
                                }}
                                className="h-11 w-full rounded-full bg-[#e8b10c] px-5 text-[15px] font-bold whitespace-nowrap text-[#4a0f30] hover:bg-[#f5c234] sm:w-auto"
                            >
                                {saving === 'va' ? 'Membuat VA…' : va ? 'Ganti VA' : 'Buat Virtual Account'}
                            </Button>
                        </div>
                    </div>
                </section>
            )}

            {error && (
                <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
            )}
            {info && (
                <p className="rounded-lg border border-[#e8b10c]/60 bg-[#e8b10c]/10 px-3 py-2 text-sm text-[#4a0f30]">
                    {info}
                </p>
            )}

            {tampil.length > 0 && (
                <div>
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">
                        Riwayat pembayaran
                    </p>
                    <ul className="mt-1 space-y-1 text-[15px] tabular-nums">
                        {tampil.map((r) => {
                            const isVa = r.sumber === 'VA'
                            const pengirim = isVa ? pengirimVa(r) : null
                            const namaTampil = isVa
                                ? r.gateway_ref?.startsWith('va:')
                                    ? null
                                    : (pengirim?.nama ?? r.nama_pembayar ?? namaCustomer)
                                : r.nama_pembayar
                            const bankTampil = isVa ? pengirim?.bank : r.nama_bank
                            const adaPengirim = Boolean(namaTampil || bankTampil)
                            const bisaIsiPengirim =
                                canPay && isVa && r.status_payment === 'PAID'
                            return (
                                <li key={r.id_bayar} className="flex flex-wrap items-start gap-x-3">
                                    <span className="text-muted-foreground">{fmtDate(r.created_at)}</span>
                                    <span className="font-medium">{fmtRp(r.total_bayar)}</span>
                                    <span className="text-muted-foreground">
                                        {r.gateway_ref?.startsWith('va:')
                                            ? 'VA dibuat'
                                            : r.sumber === 'VA'
                                              ? 'transfer VA'
                                              : 'manual'}
                                        {r.gateway_ref?.startsWith('va:') && r.status_payment === 'INVALID'
                                            ? ' · tidak aktif'
                                            : ''}
                                        {namaTampil ? ` · ${namaTampil}` : ''}
                                        {bankTampil ? ` · ${bankTampil}` : ''}
                                        {r.raw_payload?.kind === 'OVERPAY' ? ' · kelebihan bayar' : ''}
                                        {r.raw_payload?.kind === 'ORDER_BATAL' ? ' · order batal' : ''}
                                    </span>
                                    <span
                                        className={`inline-block rounded border px-1.5 py-0 text-xs font-bold tracking-widest uppercase ${
                                            r.status_payment === 'PAID'
                                                ? 'border-[#34eb3d]/70 bg-[#34eb3d]/15'
                                                : r.status_payment === 'PENDING'
                                                  ? 'border-[#e8b10c]/70 bg-[#e8b10c]/15 text-[#4a0f30]'
                                                  : 'border-red-300 bg-red-50 text-red-700'
                                        }`}
                                    >
                                        {r.status_payment}
                                    </span>
                                    {bisaIsiPengirim &&
                                        (editPengirim?.id === r.id_bayar ? (
                                            <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                                                <Input
                                                    aria-label="Nama pengirim"
                                                    placeholder="Nama pengirim"
                                                    value={editPengirim.nama}
                                                    onChange={(e) =>
                                                        setEditPengirim({
                                                            ...editPengirim,
                                                            nama: e.target.value,
                                                        })
                                                    }
                                                    className="h-8 w-40 text-sm"
                                                />
                                                <Input
                                                    aria-label="Bank pengirim"
                                                    placeholder="Bank pengirim"
                                                    value={editPengirim.bank}
                                                    onChange={(e) =>
                                                        setEditPengirim({
                                                            ...editPengirim,
                                                            bank: e.target.value,
                                                        })
                                                    }
                                                    className="h-8 w-32 text-sm"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={saving !== null}
                                                    onClick={() =>
                                                        call(
                                                            `pengirim-${r.id_bayar}`,
                                                            `/api/orders/${orderId}/pembayaran`,
                                                            {
                                                                action: 'isi_pengirim',
                                                                id_bayar: r.id_bayar,
                                                                nama: editPengirim.nama,
                                                                bank: editPengirim.bank,
                                                            }
                                                        )
                                                    }
                                                    className={BTN}
                                                >
                                                    {saving === `pengirim-${r.id_bayar}`
                                                        ? 'Menyimpan…'
                                                        : 'Simpan'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditPengirim(null)}
                                                    className="text-sm underline underline-offset-2 hover:text-[#c2185b]"
                                                >
                                                    Batal
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setEditPengirim({
                                                        id: r.id_bayar,
                                                        nama: namaTampil ?? '',
                                                        bank: pengirim?.bank ?? '',
                                                    })
                                                }
                                                className="text-sm underline underline-offset-2 hover:text-[#c2185b]"
                                            >
                                                {adaPengirim ? 'Ubah pengirim' : 'Isi pengirim'}
                                            </button>
                                        ))}
                                    {canPay && r.status_payment === 'INVALID' && r.va_number && r.gateway_ref?.startsWith('va:') && (
                                        <button
                                            type="button"
                                            disabled={saving !== null}
                                            onClick={() =>
                                                call(`cek-${r.id_bayar}`, `/api/orders/${orderId}/pembayaran`, {
                                                    action: 'cek_status',
                                                    id_bayar: r.id_bayar,
                                                })
                                            }
                                            className="text-sm underline underline-offset-2 hover:text-[#c2185b]"
                                        >
                                            {saving === `cek-${r.id_bayar}` ? 'Mengecek dana…' : 'Cek dana VA lama'}
                                        </button>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                </div>
            )}
        </div>
    )
}

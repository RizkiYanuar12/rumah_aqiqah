import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
    batalVa,
    buatVa,
    inquiry,
    tokenNotifikasi,
    verifikasiTokenNotifikasi,
} from './nicepay'
import type { PembayaranRow, Tagihan, KodeBayar, HasilBayar, HasilCek, HasilVa, NotifikasiVa, VaBank } from './types'

const PEMBAYARAN_COLUMNS =
    'id_bayar,order_id,jenis_transaksi,status_payment,sumber,total_bayar,va_number,gateway_ref,raw_payload,nama_pembayar,nama_bank,bank_tujuan,created_at'

type OrderBilling = {
    closing_id: number | null
    id_lokasi: string
    nama_customer: string
    no_hp: string
    alamat: string
    customer_email: string | null
}

// Kunci idempotensi transfer: tXid unik per transaksi, jadi notifikasi & inquiry
// menghasilkan kunci yang sama (tidak dobel catat).
export function gatewayRefTrx(tXid: string): string {
    return `trx:${tXid}`
}

type HasilTutupVa = {
    ok: boolean
    code: 'OK' | 'SUDAH_DIBAYAR' | 'GAGAL'
    message?: string
}

async function tandaiVaInvalid(admin: SupabaseClient, idBayar: string): Promise<void> {
    await admin
        .from('pembayaran')
        .update({ status_payment: 'INVALID' })
        .eq('id_bayar', idBayar)
        .eq('status_payment', 'PENDING')
}

// Normal VA hanya boleh sekali pakai. Sebelum VA baru dibuat, VA lama harus
// dibatalkan. Kalau NICEPAY bilang sudah dibayar (9330), jangan buat VA baru
// dulu: pembayaran itu harus direkonsiliasi lewat inquiry.
export async function tutupVaAktif(
    admin: SupabaseClient,
    va: PembayaranRow,
    reason = 'Pesanan Lunas',
    opsi: { setelahBayar?: boolean } = {},
): Promise<HasilTutupVa> {
    const tXid = String(va.raw_payload?.tXid ?? va.gateway_ref?.replace('va:', '') ?? '')
    if (!tXid) {
        await tandaiVaInvalid(admin, va.id_bayar)
        return { ok: true, code: 'OK' }
    }

    const r = await batalVa({ tXid, amount: va.total_bayar, reason })
    if (!r.ok) {
        console.warn('Cancel VA gagal', r.code, r.error)
        // Pembayaran sudah tercatat: VA tetap ditutup lokal supaya tidak dipakai
        // ulang. Notifikasi telat masih akan dicatat lewat lookup va_number.
        if (opsi.setelahBayar) {
            await tandaiVaInvalid(admin, va.id_bayar)
            return { ok: true, code: 'OK', message: 'VA ditutup lokal; cancel NICEPAY gagal' }
        }
        return { ok: false, code: 'GAGAL', message: r.error }
    }

    if (r.data.resultCd === '9330') {
        if (opsi.setelahBayar) {
            await tandaiVaInvalid(admin, va.id_bayar)
            return { ok: true, code: 'OK' }
        }
        return { ok: false, code: 'SUDAH_DIBAYAR', message: 'VA sudah dibayar' }
    }

    await tandaiVaInvalid(admin, va.id_bayar)
    return { ok: true, code: 'OK' }
}

export async function sisaTagihan(
    admin: SupabaseClient,
    orderId: string
): Promise<Tagihan | null> {
    const {data, error} = await admin
        .from('v_status_pembayaran_order')
        .select('harga_final, total_terbayar, sisa_bayar, status_bayar')
        .eq('id_pesanan', orderId)
        .maybeSingle()
    if (error) throw error
    if (!data) return null
    
    return {
        hargaFinal: Number(data.harga_final ?? 0),
        totalTerbayar: Number(data.total_terbayar ?? 0),
        sisaBayar: Number(data.sisa_bayar ?? 0),
        statusBayar: String(data.status_bayar ?? 'BELUM_BAYAR'),
    }
}

// VA aktif = baris PENDING. Maksimal 1 (unique partial index di DB).
export async function vaAktif(
    admin: SupabaseClient,
    orderId: string
): Promise<PembayaranRow | null> {
    const { data } = await admin
        .from('pembayaran')
        .select(PEMBAYARAN_COLUMNS)
        .eq('order_id', orderId)
        .eq('status_payment', 'PENDING')
        .limit(1)
        .maybeSingle()
    return (data as PembayaranRow | null) ?? null
}

// Tagihan banyak order sekaligus (1 query) untuk halaman list.
export async function tagihanBatch(
    admin: SupabaseClient,
    orderIds: string[]
): Promise<Record<string, Tagihan>> {
    if (!orderIds.length) return {}
    const { data } = await admin
        .from('v_status_pembayaran_order')
        .select('id_pesanan,harga_final,total_terbayar,sisa_bayar,status_bayar')
        .in('id_pesanan', orderIds)

    const map: Record<string, Tagihan> = {}
    for (const r of (data ?? []) as Record<string, unknown>[]) {
        map[String(r.id_pesanan)] = {
            hargaFinal: Number(r.harga_final ?? 0),
            totalTerbayar: Number(r.total_terbayar ?? 0),
            sisaBayar: Number(r.sisa_bayar ?? 0),
            statusBayar: String(r.status_bayar ?? 'BELUM_BAYAR'),
        }
    }
    return map
}

// Riwayat pembayaran banyak order sekaligus (1 query), terbaru dulu.
export async function riwayatBatch(
    admin: SupabaseClient,
    orderIds: string[]
): Promise<Record<string, PembayaranRow[]>> {
    if (!orderIds.length) return {}
    const { data } = await admin
        .from('pembayaran')
        .select(PEMBAYARAN_COLUMNS)
        .in('order_id', orderIds)
        .order('created_at', { ascending: false })

    const map: Record<string, PembayaranRow[]> = {}
    for (const r of (data ?? []) as PembayaranRow[]) {
        ;(map[r.order_id] ??= []).push(r)
    }
    return map
}

// Data billing untuk NICEPAY: dari closing, dengan fallback ke order.
async function dataBilling(admin: SupabaseClient, order: OrderBilling) {
    const closing = order.closing_id
        ? (
            await admin
                .from('closing')
                .select('nama_customer,no_hp,email_customer,alamat,kota,kode_pos,wilayah')
                .eq('id', order.closing_id)
                .maybeSingle()
        ).data
        : null
    const kodeWilayah = closing?.wilayah || order.id_lokasi
    const lokasi = kodeWilayah
        ? (await admin.from('lokasi').select('nama').eq('id_lokasi', kodeWilayah).maybeSingle()).data
        : null
    return {
        name: closing?.nama_customer ?? order.nama_customer ?? 'Customer',
        phone: closing?.no_hp ?? order.no_hp ?? '',
        email: closing?.email_customer ?? order.customer_email ?? '',
        address: closing?.alamat ?? order.alamat ?? '',
        city: closing?.kota ?? lokasi?.nama ?? '',
        state: lokasi?.nama ?? '',
        postalCode: closing?.kode_pos ?? '',
    }
}

// Buat VA baru untuk percobaan bayar berikutnya. Nominal boleh sebagian dari
// sisa (cicilan); tanpa nominal = sisa penuh. Normal VA tidak bisa dipakai ulang
// dengan nominal berbeda, jadi VA lama selalu dibatalkan lebih dulu.
// Gagal VA tidak menggagalkan pesanan -> pemanggil hanya menampilkan warning.
export async function buatVirtualAccount(
    admin: SupabaseClient,
    orderId: string,
    nominalDiminta?: number,
    bankCd: VaBank = 'CENA'
): Promise<HasilVa> {
    const { data: order } = await admin
        .from('orders')
        .select('id_pesanan,status,harga_final,id_lokasi,closing_id,nama_customer,no_hp,alamat,customer_email')
        .eq('id_pesanan', orderId)
        .maybeSingle()
    if (!order) return { ok: false, code: 'ORDER_TIDAK_ADA', message: 'Pesanan tidak ditemukan' }
    if (order.status === 'BATAL') return { ok: false, code: 'BATAL', message: 'Pesanan sudah dibatalkan' }

    const tagihanAwal = await sisaTagihan(admin, orderId)
    if (!tagihanAwal) return { ok: false, code: 'ORDER_TIDAK_ADA', message: 'Pesanan tidak ditemukan' }
    if (tagihanAwal.sisaBayar <= 0) return { ok: false, code: 'SUDAH_LUNAS', message: 'Pesanan sudah lunas' }

    // Validasi nominal sebelum VA lama dibatalkan supaya VA tidak hilang sia-sia.
    const diminta = nominalDiminta === undefined ? Math.round(tagihanAwal.sisaBayar) : nominalDiminta
    if (!Number.isInteger(diminta) || diminta <= 0) {
        return { ok: false, code: 'NOMINAL_INVALID', message: 'Nominal VA harus bilangan bulat lebih dari 0' }
    }
    if (diminta > tagihanAwal.sisaBayar) {
        return { ok: false, code: 'LEBIH_BAYAR', message: 'Nominal VA melebihi sisa tagihan' }
    }

    let replaced = false
    const aktif = await vaAktif(admin, orderId)
    if (aktif) {
        const tutup = await tutupVaAktif(admin, aktif, 'Ganti VA')
        if (!tutup.ok) {
            if (tutup.code === 'SUDAH_DIBAYAR') {
                // VA lama ternyata sudah dibayar. Rekonsiliasi dulu, lalu baru
                // boleh membuat VA untuk sisa tagihan.
                const cek = await cekStatusVa(admin, orderId)
                if (!cek.ok && cek.code !== 'BELUM_DEPOSIT') {
                    return {
                        ok: false,
                        code: 'GAGAL',
                        message: cek.message ?? 'VA lama sudah dibayar tetapi gagal diverifikasi',
                    }
                }
                if (await vaAktif(admin, orderId)) {
                    return {
                        ok: false,
                        code: 'GAGAL',
                        message: 'VA lama sudah dibayar tetapi status belum bisa diverifikasi',
                    }
                }
            } else {
                return {
                    ok: false,
                    code: 'GAGAL',
                    message: tutup.message ?? 'Gagal menonaktifkan VA lama',
                }
            }
        }
        replaced = true
    }

    const tagihan = await sisaTagihan(admin, orderId)
    if (!tagihan) return { ok: false, code: 'ORDER_TIDAK_ADA', message: 'Pesanan tidak ditemukan' }
    if (tagihan.sisaBayar <= 0) return { ok: false, code: 'SUDAH_LUNAS', message: 'Pesanan sudah lunas' }
    // Sisa bisa turun setelah VA lama ditutup (mis. ternyata sudah dibayar).
    // Tanpa nominal eksplisit, ikuti sisa terbaru.
    const nominal = nominalDiminta === undefined ? Math.round(tagihan.sisaBayar) : nominalDiminta
    if (nominal > tagihan.sisaBayar) {
        return { ok: false, code: 'LEBIH_BAYAR', message: 'Nominal VA melebihi sisa tagihan' }
    }

    const billing = await dataBilling(admin, order as OrderBilling)
    const va = await buatVa({
        referenceNo: orderId,
        amount: nominal,
        goodsName: `Akikah ${billing.name}`,
        bankCd,
        customer: billing,
    })
    if (!va.ok) return { ok: false, code: va.code ?? 'GAGAL', message: va.error }

    // RPC buat_va_pending tidak mengisi va_number & gateway_ref -> diisi di sini.
    const { data: idBayar, error: eRpc } = await admin.rpc('buat_va_pending', {
        p_order_id: orderId,
        p_total: nominal,
        p_reference_no: orderId,
        p_raw: va.data.raw,
    })
    if (eRpc || !idBayar) {
        // Jangan biarkan VA yatim di NICEPAY.
        await batalVa({ tXid: va.data.tXid, amount: nominal, reason: 'Gagal membuat VA' })
        return { ok: false, code: 'GAGAL', message: eRpc?.message ?? 'Gagal menyimpan data VA' }
    }

    const { data: updated, error: eUpd } = await admin
        .from('pembayaran')
        .update({
            va_number: va.data.vacctNo,
            bank_tujuan: va.data.bankCd || bankCd,
            gateway_ref: `va:${va.data.tXid}`,
        })
        .eq('id_bayar', idBayar as string)
        .select(PEMBAYARAN_COLUMNS)
        .single()
    if (eUpd || !updated) {
        await batalVa({ tXid: va.data.tXid, amount: nominal, reason: 'Gagal menyimpan nomor VA' })
        return { ok: false, code: 'GAGAL', message: eUpd?.message ?? 'Gagal menyimpan nomor VA' }
    }
    return { ok: true, va: updated as PembayaranRow, reused: false, replaced }
}

// Catat pembayaran manual (cash/transfer teller). gateway_ref unik per klik.
export async function catatPembayaranManual(
    admin: SupabaseClient,
    orderId: string,
    input: {
        total: number
        nama?: string | null
        bank?: string | null
        verifiedBy?: string | null
    }
): Promise<HasilBayar> {
    const tagihan = await sisaTagihan(admin, orderId)
    if (!tagihan) {
        return { ok: false, code: 'ORDER_TIDAK_ADA', message: 'Pesanan tidak ditemukan' }
    }
    if (input.total <= 0) {
        return { ok: false, code: 'NOMINAL_INVALID', message: 'Nominal harus lebih dari 0', sisaBayar: tagihan.sisaBayar }
    }
    if (tagihan.sisaBayar <= 0) {
        return { ok: false, code: 'SUDAH_LUNAS', message: 'Pesanan sudah lunas', sisaBayar: tagihan.sisaBayar }
    }
    if (input.total > tagihan.sisaBayar) {
        return { ok: false, code: 'LEBIH_BAYAR', message: 'Nominal melebihi sisa tagihan', sisaBayar: tagihan.sisaBayar }
    }

    const { data, error } = await admin.rpc('catat_bayar', {
        p_order_id: orderId,
        p_total: input.total,
        p_sumber: 'MANUAL',
        p_gateway_ref: `manual:${crypto.randomUUID()}`,
        p_verified_by: input.verifiedBy ?? null,
        p_nama_pembayar: input.nama ?? null,
        p_nama_bank: input.bank ?? null,
        p_va_number: null,
        p_raw: { sumber: 'form' },
    })
    if (error) {
        return { ok: false, code: 'GAGAL', message: error.message, sisaBayar: tagihan.sisaBayar }
    }

    const kode = String(data ?? 'GAGAL') as KodeBayar
    // Normal VA terikat nominal lama. Setelah pembayaran manual (termasuk
    // sebagian), VA aktif harus ditutup supaya tidak dibayar dengan nominal basi.
    if (kode === 'OK' || kode === 'LUNAS') {
        const va = await vaAktif(admin, orderId)
        if (va) {
            const tutup = await tutupVaAktif(admin, va, 'Pembayaran diterima', { setelahBayar: true })
            if (tutup.message) console.warn('tutup VA setelah bayar manual:', tutup.message)
        }
    }
    const sisaBaru = (await sisaTagihan(admin, orderId))?.sisaBayar ?? tagihan.sisaBayar
    return {
        ok: kode === 'OK' || kode === 'LUNAS' || kode === 'DUPLIKAT',
        code: kode,
        sisaBayar: sisaBaru,
    }
}

async function vaDariNomor(
    admin: SupabaseClient,
    orderId: string,
    vaNumber: string,
): Promise<PembayaranRow | null> {
    if (!vaNumber) return null
    const { data, error } = await admin
        .from('pembayaran')
        .select(PEMBAYARAN_COLUMNS)
        .eq('order_id', orderId)
        .eq('va_number', vaNumber)
        // Hanya baris penerbitan VA, bukan baris pembayaran 'trx:' / 'overpay:'.
        .or('gateway_ref.like.va:%,gateway_ref.is.null')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (error) console.warn('cari VA dari nomor gagal', error.message)
    return (data as PembayaranRow | null) ?? null
}

// Selisih lebih bayar disimpan sebagai INVALID agar tidak menambah total
// terbayar, tetapi tetap terlihat di riwayat untuk rekonsiliasi.
async function catatKelebihan(
    admin: SupabaseClient,
    orderId: string,
    va: PembayaranRow,
    notif: NotifikasiVa,
    applied: number,
    kind = 'OVERPAY',
): Promise<number> {
    const overpay = Math.max(0, notif.amt - applied)
    if (overpay <= 0) return 0
    const { error } = await admin.from('pembayaran').insert({
        order_id: orderId,
        jenis_transaksi: 'PAYMENT',
        status_payment: 'INVALID',
        sumber: 'VA',
        total_bayar: overpay,
        va_number: notif.vacctNo || va.va_number,
        gateway_ref: `overpay:${notif.tXid}`,
        nama_pembayar: notif.billingNm || null,
        nama_bank: null,
        bank_tujuan: va.bank_tujuan || notif.bankCd || null,
        raw_payload: { ...notif.raw, kind, tXid: notif.tXid, amt: notif.amt, applied },
    })
    if (error && error.code !== '23505') {
        console.warn('catat kelebihan bayar gagal', error.message)
    }
    return overpay
}

// Catat transfer VA. Dipakai webhook notifikasi dan inquiry manual.
// Idempoten lewat gateway_ref 'trx:<tXid>'.
export async function catatTransferVa(
    admin: SupabaseClient,
    orderId: string,
    notif: NotifikasiVa
): Promise<HasilBayar> {
    if (!verifikasiTokenNotifikasi(notif)) {
        return { ok: false, code: 'TOKEN_INVALID', message: 'Token notifikasi tidak cocok' }
    }
    if (notif.status !== '0') {
        return { ok: false, code: 'BELUM_DEPOSIT', message: `Status notifikasi ${notif.status}` }
    }
    if (!notif.tXid) {
        return { ok: false, code: 'TOKEN_INVALID', message: 'Notifikasi tanpa tXid' }
    }
    if (!Number.isFinite(notif.amt) || notif.amt <= 0) {
        return { ok: false, code: 'NOMINAL_INVALID', message: 'Nominal notifikasi tidak valid' }
    }

    // VA lama yang sudah INVALID tetap dicari lewat nomornya. Pembayaran bisa
    // telat masuk setelah VA diganti; uangnya tidak boleh hilang.
    const va = (await vaDariNomor(admin, orderId, notif.vacctNo)) ?? (await vaAktif(admin, orderId))
    if (!va) {
        return { ok: false, code: 'VA_TIDAK_ADA', message: 'VA tidak ditemukan untuk pesanan ini' }
    }

    let applied = 0
    let kode: KodeBayar = 'OK'

    const { data: sudah } = await admin
        .from('pembayaran')
        .select('total_bayar')
        .eq('order_id', orderId)
        .eq('gateway_ref', gatewayRefTrx(notif.tXid))
        .maybeSingle()

    if (sudah) {
        kode = 'DUPLIKAT'
        applied = Number(sudah.total_bayar ?? 0)
    } else {
        // Sisa bisa berubah karena pembayaran manual/VA lain. Coba dua kali dengan
        // sisa terbaru sebelum menyerah.
        for (let attempt = 0; attempt < 2; attempt++) {
            const tagihan = await sisaTagihan(admin, orderId)
            if (!tagihan) {
                return { ok: false, code: 'ORDER_TIDAK_ADA', message: 'Pesanan tidak ditemukan' }
            }
            applied = Math.max(0, Math.min(notif.amt, tagihan.sisaBayar))
            if (applied <= 0) {
                kode = 'SUDAH_LUNAS'
                break
            }

            const { data, error } = await admin.rpc('catat_bayar', {
                p_order_id: orderId,
                p_total: applied,
                p_sumber: 'VA',
                p_gateway_ref: gatewayRefTrx(notif.tXid),
                p_verified_by: null,
                p_nama_pembayar: notif.billingNm || null,
                p_nama_bank: null,
                p_va_number: notif.vacctNo || null,
                p_raw: notif.raw,
            })
            if (error) {
                return { ok: false, code: 'GAGAL', message: error.message }
            }
            kode = String(data ?? 'GAGAL') as KodeBayar
            if (kode !== 'LEBIH_BAYAR') break
        }
    }

    if (kode === 'LEBIH_BAYAR') {
        return {
            ok: false,
            code: 'GAGAL',
            message: 'Sisa tagihan berubah saat mencatat pembayaran; silakan cek status lagi',
        }
    }

    if (kode === 'DUPLIKAT') {
        const { data: lama } = await admin
            .from('pembayaran')
            .select('total_bayar')
            .eq('gateway_ref', gatewayRefTrx(notif.tXid))
            .maybeSingle()
        applied = Number(lama?.total_bayar ?? 0)
    }
    // RPC menolak karena sisa sudah 0 sebelum sempat mencatat: seluruh nominal
    // yang masuk adalah kelebihan bayar.
    if (kode === 'SUDAH_LUNAS') applied = 0

    const bankTujuan = va.bank_tujuan || notif.bankCd || null
    if (bankTujuan) {
        await admin
            .from('pembayaran')
            .update({ bank_tujuan: bankTujuan })
            .eq('order_id', orderId)
            .eq('gateway_ref', gatewayRefTrx(notif.tXid))
            .is('bank_tujuan', null)
    }

    let overpay = 0
    if (kode === 'BATAL') {
        overpay = await catatKelebihan(admin, orderId, va, notif, 0, 'ORDER_BATAL')
    } else if (kode === 'OK' || kode === 'LUNAS' || kode === 'DUPLIKAT' || kode === 'SUDAH_LUNAS') {
        overpay = await catatKelebihan(admin, orderId, va, notif, applied)
    } else if (kode === 'GAGAL' || kode === 'ORDER_TIDAK_ADA' || kode === 'NOMINAL_INVALID' || kode === 'SUMBER_INVALID') {
        return { ok: false, code: kode, message: 'Pembayaran ditolak' }
    }

    // VA Normal tidak boleh dipakai lagi setelah ada pembayaran (termasuk
    // sebagian) karena nominalnya sudah basi. Kalau pembayaran masuk ke VA
    // lama, VA baru yang sedang aktif juga ikut ditutup: sisanya sudah berubah.
    if (
        kode === 'OK' || kode === 'LUNAS' || kode === 'DUPLIKAT' || kode === 'SUDAH_LUNAS' || kode === 'BATAL'
    ) {
        if (va.status_payment === 'PENDING') {
            const tutup = await tutupVaAktif(admin, va, 'Pembayaran diterima', { setelahBayar: true })
            if (tutup.message) console.warn('tutup VA setelah bayar:', tutup.message)
        }
        // Duplikat tidak mengubah sisa, jadi jangan tutup VA baru yang mungkin
        // sudah dibuat setelah pembayaran pertama.
        if (kode !== 'DUPLIKAT') {
            const masihAktif = await vaAktif(admin, orderId)
            if (masihAktif && masihAktif.id_bayar !== va.id_bayar) {
                const tutup = await tutupVaAktif(admin, masihAktif, 'Sisa tagihan berubah', { setelahBayar: true })
                if (tutup.message) console.warn('tutup VA aktif setelah bayar:', tutup.message)
            }
        }
    }

    const sisaBaru = (await sisaTagihan(admin, orderId))?.sisaBayar
    return {
        ok: kode === 'OK' || kode === 'LUNAS' || kode === 'DUPLIKAT' || kode === 'SUDAH_LUNAS',
        code: kode,
        sisaBayar: sisaBaru,
        overpay: overpay || undefined,
    }
}

// Cek status VA ke NICEPAY. Notifikasi bisa telat ~90 detik, jadi butuh jalur ini.
// idBayar opsional: cek VA lama/nonaktif lewat barisnya sendiri (fallback webhook).
// Catatan: inquiry tidak menyebut jumlah deposit aktual -> dicatat sebesar nominal VA.
export async function cekStatusVa(
    admin: SupabaseClient,
    orderId: string,
    idBayar?: string
): Promise<HasilCek> {
    let va: PembayaranRow | null
    if (idBayar) {
        const { data } = await admin
            .from('pembayaran')
            .select(PEMBAYARAN_COLUMNS)
            .eq('id_bayar', idBayar)
            .eq('order_id', orderId)
            .maybeSingle()
        va = (data as PembayaranRow | null) ?? null
    } else {
        va = await vaAktif(admin, orderId)
    }
    if (!va) {
        return { ok: false, code: 'VA_TIDAK_ADA', message: 'VA tidak ditemukan untuk pesanan ini', dicatat: false }
    }
    const tXid = String(va.raw_payload?.tXid ?? va.gateway_ref?.replace('va:', '') ?? '')
    if (!tXid) {
        return { ok: false, code: 'VA_TIDAK_ADA', message: 'Data VA tidak punya tXid', dicatat: false }
    }

    const res = await inquiry({ tXid, referenceNo: orderId, amount: va.total_bayar })
    if (!res.ok) {
        return { ok: false, code: 'GAGAL', message: res.error, dicatat: false }
    }
    if (!res.data.paid) {
        return {
            ok: true,
            code: 'OK',
            message: 'Belum ada dana masuk ke VA',
            status: res.data.status,
            paid: false,
            dicatat: false,
        }
    }

    const notif: NotifikasiVa = {
        tXid,
        referenceNo: orderId,
        vacctNo: res.data.vacctNo || va.va_number || '',
        amt: va.total_bayar,
        amtText: String(va.total_bayar),
        status: '0',
        transDt: res.data.transDt,
        transTm: res.data.transTm,
        merchantToken: tokenNotifikasi(tXid, String(va.total_bayar)),
        billingNm: res.data.billingNm,
        bankCd: va.bank_tujuan ?? String(res.data.raw['bankCd'] ?? ''),
        matchCl: '',
        raw: res.data.raw,
    }
    const hasil = await catatTransferVa(admin, orderId, notif)
    return {
        ok: hasil.ok,
        code: hasil.code,
        message: hasil.message,
        status: res.data.status,
        paid: true,
        dicatat: hasil.ok,
        sisaBayar: hasil.sisaBayar,
        overpay: hasil.overpay,
    }
}
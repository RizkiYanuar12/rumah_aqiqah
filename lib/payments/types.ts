// Tipe bersama pembayaran. Dipisah dari lib/payments/pembayaran.ts karena file itu
// 'server-only' -> tidak boleh diimpor komponen client.
export const VA_BANKS = [
    { code: 'CENA', label: 'BCA' },
    { code: 'BMRI', label: 'Mandiri' },
] as const

export type VaBank = (typeof VA_BANKS)[number]['code']

export function isVaBank(value: string): value is VaBank {
    return VA_BANKS.some((b) => b.code === value)
}

export function vaBankLabel(code: string | null | undefined): string {
    return VA_BANKS.find((b) => b.code === code)?.label ?? code ?? ''
}

export type PembayaranRow = {
    id_bayar: string
    order_id: string
    jenis_transaksi: string
    status_payment: string
    sumber: string
    total_bayar: number
    va_number: string | null
    gateway_ref: string | null
    raw_payload: Record<string, unknown> | null
    nama_pembayar: string | null
    nama_bank: string | null
    bank_tujuan: string | null
    created_at: string
}

export type Tagihan = {
    hargaFinal: number
    totalTerbayar: number
    sisaBayar: number
    statusBayar: string
}

// Kode hasil: RPC catat_bayar + kode lokal kita.
export type KodeBayar =
    | 'OK' | 'LUNAS' | 'DUPLIKAT' | 'NOMINAL_INVALID' | 'SUMBER_INVALID'
    | 'ORDER_TIDAK_ADA' | 'BATAL' | 'LEBIH_BAYAR' | 'SUDAH_LUNAS'
    | 'TOKEN_INVALID' | 'BELUM_DEPOSIT' | 'VA_TIDAK_ADA' | 'GAGAL'

export type HasilBayar = {
    ok: boolean
    code: KodeBayar
    message?: string
    sisaBayar?: number
    overpay?: number
}

export type HasilCek = {
    ok: boolean
    code: KodeBayar
    message?: string
    status?: string
    paid?: boolean
    dicatat: boolean
    sisaBayar?: number
    overpay?: number
}

export type HasilVa =
    | { ok: true; va: PembayaranRow; reused: boolean; replaced?: boolean }
    | { ok: false; code: string; message: string }

export type NicepayResult<T> =
   | { ok: true, data: T }
   | { ok: false; error: string; status: number, code?: string }

export type VaInput = {
    referenceNo: string
    amount: number
    goodsName: string
    bankCd: VaBank
    customer: {
        name: string;
        phone: string;
        email: string;
        address: string;
        city: string;
        state: string;
        postalCode: string;
    }
}

export type VaResponse = {
    tXid: string;
    vacctNo: string;
    referenceNo: string;
    amount: number;
    bankCd: string;
    transTm: string;
    raw: Record<string, unknown>
}

export type InquiryInput = {
    tXid: string;
    referenceNo: string;
    amount: number;
}

export type InquiryResponse = {
    resultMsg: string;
    billingNm: string;
    tXid: string;
    depositDt: string;
    amount: number;
    vacctNo: string;
    status: string;
    paid: boolean;
    transDt: string;
    transTm: string;
    raw: Record<string, unknown>;
}

export type NotifikasiVa = {
    tXid: string;
    referenceNo: string;
    vacctNo: string;
    amt: number;
    amtText: string;
    status: string;
    transDt: string;
    transTm: string;
    merchantToken: string;
    billingNm: string;
    bankCd: string;
    matchCl: string;
    raw: Record<string, unknown>
}
import 'server-only'
process.env.TZ = 'Asia/Jakarta'
import { type NicepayResult, type VaInput, type VaResponse, type InquiryInput, type InquiryResponse, type NotifikasiVa } from '@/lib/payments/types'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nicepayClient = require('nodejs-nicepay')

const secondVersion = new nicepayClient.SecondApiVersion({
    isProduction: false,
    isCloudServer: false,
    clientId: process.env.NICEPAY_MERCHANT_ID,
    merchantKey: process.env.NICEPAY_MERCHANT_KEY
});

export function tokenNotifikasi(tXid: string, amtText: string): string {
    return secondVersion.helper.generateMerchantToken(
        `${process.env.NICEPAY_MERCHANT_ID}${tXid}${amtText}${process.env.NICEPAY_MERCHANT_KEY}`,
    )
}

// verifikasi notifikasi bukti transfer
export function verifikasiTokenNotifikasi(n: NotifikasiVa): boolean{
    if(!n.merchantToken || !n.tXid || !n.amtText) return false
    return n.merchantToken === tokenNotifikasi(n.tXid, n.amtText)
}

export function parseNotifikasi(body: Record<string, unknown>): NotifikasiVa {
    const pick = (o: Record<string, unknown>, ...keys:string[]) => {
        for (const k of keys) { const v = o[k]; if(v !== undefined && v !== null && v !== '') return String(v)}
        return ''
    }

    const amtText = pick(body, 'amt') || pick((body.paidAmount as Record<string, unknown>) ?? {}, 'value')
    return {
        tXid: pick(body, 'tXid', 'txid', 'paymentRequestId'),
        referenceNo: pick(body, 'referenceNo', 'referenceno'),
        vacctNo: pick(body, 'vacctNo', 'vacctno', 'virtualAccountNo'),
        amt: Number(amtText) || 0,
        amtText,
        status: pick(body, 'status'),
        transDt: pick(body, 'transDt', 'transdt'),
        transTm: pick(body, 'transTm', 'transtm'),
        merchantToken: pick(body, 'merchantToken', 'merchant_token'),
        billingNm: pick(body, 'billingNm', 'billingnm'),
        bankCd: pick(body, 'bankCd', 'bankcd'),
        matchCl: pick(body, 'matchCl', 'matchcl'),
        raw: body,
    }
}

// Panggil API
// Reject dengan object response axios (err.status, err.data) http 4xx/5xx
async function callApi(
        body: Record<string, unknown>,
        endPoint:string,
        okCodes: string[] = ['0000']
    ):Promise<NicepayResult<Record<string, unknown>>> {
    let res: Record<string, unknown>
    try {
        res = (await secondVersion.requestAPI(body, endPoint)) as Record<string, unknown>
    } catch (e) {
        const err = e as { status?: number; message?: string; data?: Record<string, unknown>}
        res = (err.data as Record<string, unknown>) ?? { resultCd: String(err.status ?? 'NETWORK'), resultMsg: err.message}
    }
    const resultCd =  String(res.resultCd ?? '')
    if (!okCodes.includes(resultCd)) {
        return { ok: false, error: String(res.resultMsg ?? 'Permintaan NICEPAY DITOLAK'), status: 502, code:resultCd || 'UNKNOWN'}
    }
    return {ok: true, data: res}
}

// CREATE VA
export async function buatVa(input: VaInput): Promise<NicepayResult<VaResponse>> {
    const amount = Math.round(input.amount)
    if (!Number.isFinite(amount) || amount < 1 || amount > 999_999_999_999) {
        return { ok: false, error: 'Nominal VA tidak Valid', status: 400, code: 'VALIDASI'}
    }

    // Normal VA dipakai sekali. VA baru dibuat tiap kali customer mau bayar,
    // jadi berlaku 1x24 jam (bukan 10 tahun seperti VA statis).
    const wib = new Date(Date.now() + 7 * 3600_000 + 86400_000)
    const padZero = (n: number) => String(n).padStart(2, '0')
    const vacctValidDt = `${wib.getUTCFullYear()}${padZero(wib.getUTCMonth() + 1)}${padZero(wib.getUTCDate())}`
    const c = input.customer

    const hasil = await callApi({
        payMethod: '02',
        currency: 'IDR',
        amt: String(amount),
        referenceNo: input.referenceNo,
        goodsNm: input.goodsName.slice(0,100),
        billingNm: c.name.slice(0, 100),
        billingPhone: c.phone.slice(0, 15),
        billingEmail: c.email.slice(0, 40),
        billingAddr: c.address.slice(0, 100),
        billingCity: c.city.slice(0, 50),
        billingState: c.state.slice(0, 50),
        billingPostCd: c.postalCode.slice(0, 10),
        billingCountry: "Indonesia",
        dbProcessUrl: process.env.NICEPAY_DB_PROCESS_URL,
        bankCd: input.bankCd,
        vacctValidDt,
        vacctValidTm: '235959',
    }, '/direct/v2/registration')

    if (!hasil.ok) return hasil
    const d = hasil.data
    return { ok: true, data: {
        tXid: String(d.tXid ?? ''),
        vacctNo: String(d.vacctNo ?? ''),
        referenceNo: String(d.referenceNo ?? input.referenceNo),
        amount: Number(d.amt ?? amount),
        bankCd: String(d.bankCd ?? ''),
        transTm: String(d.transTm ?? ''),
        raw: d,
    }}
}

export async function inquiry(input: InquiryInput): Promise<NicepayResult<InquiryResponse>> {
    const hasil = await callApi({ 
        tXid: input.tXid, 
        referenceNo: input.referenceNo, 
        amt: String(Math.round(input.amount))},
        '/direct/v2/inquiry')
    if (!hasil.ok) return hasil
    const d = hasil.data
    const status = String(d.status ?? '')
    return {
        ok: true,
        data: {
            resultMsg: String(d.resultMsg ?? ''),
            tXid: String(d.tXid ?? ''),
            vacctNo: String(d.vacctNo ?? ''),
            amount: Number(d.amt ?? input.amount),
            billingNm: String(d.billingNm ?? ''),
            status,
            paid: status === '0',
            transDt: String(d.transDt ?? ''),
            transTm: String(d.transTm ?? ''),
            depositDt: String(d.depositDt ?? ''),
            raw: d,
        }
    }
}

// CANCEL VA
export async function batalVa(input: {
    tXid: string;
    amount: number;
    reason?:string
}): Promise<NicepayResult<Record<string, unknown>>> {
    const hasil = await callApi(
    {
        tXid: input.tXid,
        amt: String(Math.round(input.amount)),
        payMethod: '02',
        cancelType: '1',
        cancelMsg: (input.reason ?? 'Pembatalan Virtual Account').slice(0, 255),
        cancelUserId: 'sistem', cancelUserIp: '127.0.0.1', cancelServerIp: '127.0.0.1',
        cancelUserInfo: 'Rumah Aqiqah',
        cancelRetryCnt: '1',
        worker: 'sistem',
    }, '/direct/v2/cancel',
        ['0000', '9330'],
    )
    if (!hasil.ok) return hasil;
    if (hasil.data.resultCd === '9330') console.warn('nicepay: VA sudah dibayar, cancel dilewati')
    return hasil
}
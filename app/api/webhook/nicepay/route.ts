import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseNotifikasi, verifikasiTokenNotifikasi } from '@/lib/payments/nicepay'
import { catatTransferVa } from '@/lib/payments/pembayaran'

// Notifikasi NICEPAY (form-urlencoded). Tanpa sesi: biarrants hanya token notifikasi.
// Selalu balas 200 — NICEPAY mengulang request kalau non-200.
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const body: Record<string, string> = {}
    form.forEach((value, key) => {
      body[key] = typeof value === 'string' ? value : String(value)
    })

    const notif = parseNotifikasi(body)
    if (!verifikasiTokenNotifikasi(notif)) {
      console.warn('nicepay webhook: token notifikasi tidak cocok', { referenceNo: notif.referenceNo })
      return NextResponse.json({ ok: false, code: 'TOKEN_INVALID' })
    }
    if (!notif.referenceNo) {
      return NextResponse.json({ ok: false, code: 'ORDER_TIDAK_ADA' })
    }

    const admin = createAdminClient()
    // referenceNo = id_pesanan (kita yang menetapkannya saat registrasi VA).
    const hasil = await catatTransferVa(admin, notif.referenceNo, notif)
    return NextResponse.json({ ok: hasil.ok, code: hasil.code, sisa_bayar: hasil.sisaBayar })
  } catch (e) {
    console.error('nicepay webhook gagal', e)
    return NextResponse.json({ ok: false, code: 'GAGAL' })
  }
}

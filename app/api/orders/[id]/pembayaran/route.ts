import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/auth/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { catatPembayaranManual, cekStatusVa } from '@/lib/payments/pembayaran'

// Catat pembayaran: manual (cash/teller) atau cek status VA ke NICEPAY.
// Finance boleh catat bayar (PRD FR-05b) tapi tak boleh buat VA.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(['seo', 'cso', 'branch_manager', 'finance'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { data: order, error: eGet } = await admin
    .from('orders')
    .select('id_pesanan,status,cso_id,id_lokasi')
    .eq('id_pesanan', id)
    .single()
  if (eGet || !order) return NextResponse.json({ error: 'Order tidak ditemukan' }, { status: 404 })

  if (auth.role === 'seo' && order.cso_id !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (auth.role === 'cso' && auth.idLokasi && order.id_lokasi !== auth.idLokasi) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (order.status === 'BATAL') {
    return NextResponse.json({ error: 'Pesanan sudah dibatalkan' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)

  if (body?.action === 'isi_pengirim') {
    const idBayar = typeof body?.id_bayar === 'string' ? body.id_bayar : ''
    const nama = typeof body?.nama === 'string' ? body.nama.trim().slice(0, 100) : ''
    const bank = typeof body?.bank === 'string' ? body.bank.trim().slice(0, 50) : ''
    if (!idBayar) {
      return NextResponse.json({ error: 'Pembayaran tidak dipilih' }, { status: 400 })
    }
    if (!nama && !bank) {
      return NextResponse.json({ error: 'Isi nama atau bank pengirim' }, { status: 400 })
    }

    const { data: row, error: eRow } = await admin
      .from('pembayaran')
      .select('id_bayar,raw_payload')
      .eq('id_bayar', idBayar)
      .eq('order_id', id)
      .eq('sumber', 'VA')
      .eq('status_payment', 'PAID')
      .maybeSingle()
    if (eRow) return NextResponse.json({ error: eRow.message }, { status: 500 })
    if (!row) {
      return NextResponse.json({ error: 'Pembayaran VA tidak ditemukan' }, { status: 404 })
    }

    const raw =
      row.raw_payload && typeof row.raw_payload === 'object'
        ? (row.raw_payload as Record<string, unknown>)
        : {}
    const { error: eUpdate } = await admin
      .from('pembayaran')
      .update({
        nama_pembayar: nama || null,
        nama_bank: bank || null,
        raw_payload: {
          ...raw,
          pengirim: {
            nama: nama || null,
            bank: bank || null,
            oleh: auth.userId,
            at: new Date().toISOString(),
          },
        },
      })
      .eq('id_bayar', idBayar)
    if (eUpdate) return NextResponse.json({ error: eUpdate.message }, { status: 500 })

    return NextResponse.json({ ok: true, code: 'OK', message: 'Data pengirim disimpan' })
  }

  if (body?.action === 'cek_status') {
    // id_bayar = cek VA lama/nonaktif; tanpa id = VA aktif.
    const idBayar = typeof body?.id_bayar === 'string' ? body.id_bayar : undefined
    const hasil = await cekStatusVa(admin, id, idBayar)
    return NextResponse.json(
      {
        ok: hasil.ok,
        code: hasil.code,
        message: hasil.message,
        status: hasil.status,
        paid: hasil.paid,
        dicatat: hasil.dicatat,
        sisa_bayar: hasil.sisaBayar,
        overpay: hasil.overpay,
      },
      { status: hasil.ok ? 200 : 400 },
    )
  }

  const total = Number(body?.total)
  if (!Number.isFinite(total) || total <= 0) {
    return NextResponse.json({ error: 'Nominal harus lebih dari 0' }, { status: 400 })
  }

  const hasil = await catatPembayaranManual(admin, id, {
    total,
    nama: body?.nama ?? null,
    bank: body?.bank ?? null,
    verifiedBy: auth.userId,
  })

  return NextResponse.json(
    { ok: hasil.ok, code: hasil.code, message: hasil.message, sisa_bayar: hasil.sisaBayar },
    { status: hasil.ok ? 200 : 400 },
  )
}

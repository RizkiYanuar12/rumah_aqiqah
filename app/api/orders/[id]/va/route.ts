import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/auth/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buatVirtualAccount } from '@/lib/payments/pembayaran'
import { isVaBank } from '@/lib/payments/types'

// Buat Virtual Account (NICEPAY). Finance tak boleh: dia hanya verifikasi pembayaran.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(['seo', 'cso', 'branch_manager'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { data: order, error: eGet } = await admin
    .from('orders')
    .select('id_pesanan,status,cso_id,id_lokasi')
    .eq('id_pesanan', id)
    .single()
  if (eGet || !order) return NextResponse.json({ error: 'Order tidak ditemukan' }, { status: 404 })

  // Scope: SEO hanya order buatannya, CSO hanya order di lokasinya.
  if (auth.role === 'seo' && order.cso_id !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (auth.role === 'cso' && auth.idLokasi && order.id_lokasi !== auth.idLokasi) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (order.status === 'BATAL') {
    return NextResponse.json({ error: 'Pesanan sudah dibatalkan' }, { status: 400 })
  }

  // Nominal opsional: kosong = sisa penuh, angka = cicilan (<= sisa).
  const body = await req.json().catch(() => null)
  const total = body?.total === undefined || body?.total === null || body?.total === ''
    ? undefined
    : Number(body.total)
  if (total !== undefined && (!Number.isInteger(total) || total <= 0)) {
    return NextResponse.json({ error: 'Nominal VA harus bilangan bulat lebih dari 0' }, { status: 400 })
  }

  const bank = typeof body?.bank === 'string' && body.bank ? body.bank : 'CENA'
  if (!isVaBank(bank)) {
    return NextResponse.json({ error: 'Bank VA tidak valid' }, { status: 400 })
  }

  const va = await buatVirtualAccount(admin, id, total, bank)
  if (!va.ok) return NextResponse.json({ error: va.message, code: va.code }, { status: 400 })

  return NextResponse.json({
    va_number: va.va.va_number,
    bank_tujuan: va.va.bank_tujuan,
    total_bayar: va.va.total_bayar,
    reused: va.reused,
    replaced: va.replaced ?? false,
  })
}

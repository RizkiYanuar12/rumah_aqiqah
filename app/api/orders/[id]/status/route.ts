import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/auth/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ORDER_STATUS } from '@/lib/orders/status'
import { tutupVaAktif, vaAktif } from '@/lib/payments/pembayaran'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(['cso', 'branch_manager'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const to = body?.to_status
  if (!(ORDER_STATUS as readonly string[]).includes(to)) {
    return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: order, error: eGet } = await admin
    .from('orders')
    .select('id_pesanan,status,cso_id,id_lokasi')
    .eq('id_pesanan', id)
    .single()
  if (eGet || !order) return NextResponse.json({ error: 'Order tidak ditemukan' }, { status: 404 })
  // CSO boleh ubah order siapa pun di lokasinya (buatan SEO/CSO/BM).
  if (auth.role === 'cso' && auth.idLokasi && order.id_lokasi !== auth.idLokasi) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: eUp } = await admin.from('orders').update({ status: to }).eq('id_pesanan', id)
  if (eUp) return NextResponse.json({ error: eUp.message }, { status: 500 })

  // Normal VA terikat nominal. Saat order dibatalkan, VA aktif tidak boleh
  // tetap bisa dibayar. Kegagalan cancel tidak membatalkan perubahan status.
  if (to === 'BATAL') {
    const va = await vaAktif(admin, id)
    if (va) {
      const tutup = await tutupVaAktif(admin, va, 'Pesanan dibatalkan')
      if (!tutup.ok) {
        console.warn('Gagal menonaktifkan VA saat order BATAL', tutup.code, tutup.message)
      }
    }
  }

  const { error: eLog } = await admin.from('status_history').insert({
    order_id: id,
    from_status: order.status,
    to_status: to,
    changed_by: auth.userId,
  })
  if (eLog) return NextResponse.json({ error: eLog.message }, { status: 500 })

  return NextResponse.json({ order_id: id, from_status: order.status, to_status: to })
}

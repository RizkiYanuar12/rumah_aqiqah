import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/auth/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {type AddonIn, type InventoryIn } from '@/lib/orders/types'
import { updateOrderRincian } from '@/lib/orders/update'

const TERMINAL = ['BATAL']
// SEO + CSO. Status tidak tersentuh (tetap via PATCH /status oleh CSO/BM).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(['seo', 'cso'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { data: order, error: eGet } = await admin
    .from('orders')
    .select('id_pesanan,status,cso_id,id_lokasi')
    .eq('id_pesanan', id)
    .single()
  if (eGet || !order) return NextResponse.json({ error: 'Order tidak ditemukan' }, { status: 404 })
  if (TERMINAL.includes(order.status ?? '')) {
    return NextResponse.json({ error: 'Pesanan batal tidak bisa diubah' }, { status: 400 })
  }
  // SEO: hanya order buatannya. CSO: siapa pun di lokasinya.
  if (auth.role === 'seo' && order.cso_id !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (auth.role === 'cso' && auth.idLokasi && order.id_lokasi !== auth.idLokasi) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const addons: AddonIn[] = Array.isArray(body?.addons) ? body.addons : []
  const inventory: InventoryIn[] = Array.isArray(body?.inventory)
    ? body.inventory.map((v: { sku?: string; qty?: number; harga?: number }) => ({
        sku: String(v?.sku ?? ''),
        qty: Number(v?.qty ?? 0),
        harga: Number(v?.harga ?? 0),
      }))
    : []
  const waktu_kirim: string | undefined = body?.waktu_kirim
  const waktu_tiba: string | undefined = body?.waktu_tiba ?? body?.waktu_kirim
  if (!waktu_kirim || isNaN(+new Date(waktu_kirim)) || !waktu_tiba || isNaN(+new Date(waktu_tiba))) {
    return NextResponse.json({ error: 'Jadwal kirim wajib diisi' }, { status: 400 })
  }

  const result = await updateOrderRincian(admin, id, {
    paket_id: body?.paket_id,
    qty: Number(body?.qty ?? 1),
    olahan_daging: body?.olahan_daging,
    olahan_jeroan: body?.olahan_jeroan,
    addons,
    inventory,
    tipe_pembayaran: body?.tipe_pembayaran,
    metode_pembayaran: body?.metode_pembayaran,
    diskon: Number(body?.diskon ?? 0),
    waktu_kirim,
    waktu_tiba,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ order_id: result.order_id, harga_final: result.harga_final })
}

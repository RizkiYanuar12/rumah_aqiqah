import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ORDER_LINES_SELECT } from '@/lib/closing'
import DaftarOrders from './daftar-orders'

export default async function OrdersPage() {
  const { userId, role, idLokasi } = await requireRole(['seo', 'cso', 'finance', 'branch_manager'])

  const admin = createAdminClient()
  let q = admin
    .from('orders')
    .select(
      'id_pesanan,status,tipe_pembayaran,harga_final,qty_paket,diskon,waktu_kirim,waktu_tiba,tanggal_transaksi,created_at,cso_id,customer_email' +
        ',closing(id,nama_customer,no_hp,email_customer,alamat)' +
        `,order_lines(${ORDER_LINES_SELECT})` +
        ',order_items(sku,qty)',
    )
    .order('waktu_kirim', { ascending: true })
  // SEO: hanya order buatannya (cso_id=self, cermin created_by=self di /closing).
  // CSO: semua order di lokasinya. Tanpa lokasi → semua.
  if (role === 'seo') q = q.eq('cso_id', userId)
  else if (role === 'cso' && idLokasi) q = q.eq('id_lokasi', idLokasi)
  const { data } = (await q) as unknown as { data: Record<string, unknown>[] | null }
  const { data: master } = await admin.from('inventory').select('sku,nama_barang')
  const nama = new Map(
    ((master ?? []) as { sku: string; nama_barang: string }[]).map((m) => [m.sku, m.nama_barang]),
  )
  const rows = (data ?? []).map((r) => ({
    ...(r as object),
    closing: Array.isArray(r.closing) ? (r.closing[0] ?? null) : (r.closing ?? null),
    order_items: ((r.order_items ?? []) as { sku: string; qty: number }[]).map((it) => ({
      ...it,
      nama_barang: nama.get(it.sku) ?? it.sku,
    })),
  }))

  return (
    <DaftarOrders
      initialOrders={rows as never}
      editable={role === 'seo' || role === 'cso'}
      canChangeStatus={role === 'cso' || role === 'branch_manager'}
    />
  )
}

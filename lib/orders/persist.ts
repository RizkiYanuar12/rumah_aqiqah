import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RincianOk } from './types'

// Tulis rincian order (order_lines, order_items, order_olahan).
// Mengembalikan pesan error, atau null kalau berhasil.
export async function insertRincian(
  admin: SupabaseClient,
  order_id: string,
  qty: number,
  r: RincianOk,
): Promise<string | null> {
  const id_baris = crypto.randomUUID()
  const invLines = r.invRows.map((v) => ({ ...v, id_baris: crypto.randomUUID() }))
  const { error: eLines } = await admin.from('order_lines').insert([
    {
      id_baris,
      order_id,
      id_paket: r.paket.id,
      nama_paket: r.paket.nama_paket,
      kategori: 'PAKET',
      qty,
      harga_satuan: r.paket.harga,
      hpp_satuan: 0,
    },
    ...r.addonRows.map((a) => ({
      id_baris: crypto.randomUUID(),
      order_id,
      id_paket: a.id,
      nama_paket: a.nama_paket,
      kategori: 'Additional & Upgrade',
      qty: a.qty,
      harga_satuan: a.harga,
      hpp_satuan: 0,
    })),
    ...invLines.map((v) => ({
      id_baris: v.id_baris,
      order_id,
      id_paket: null,
      nama_paket: v.nama,
      kategori: 'Additional & Upgrade',
      qty: v.qty,
      harga_satuan: v.harga,
      hpp_satuan: v.hpp,
    })),
  ])
  if (eLines) return eLines.message

  if (invLines.length || r.bomRows.length) {
    const { error: eItems } = await admin.from('order_items').insert([
      ...invLines.map((v) => ({
        order_id,
        id_baris: v.id_baris,
        sku: v.sku,
        qty: v.qty,
        hpp_snapshot: v.hpp,
      })),
      ...r.bomRows.map((v) => ({
        order_id,
        id_baris,
        sku: v.sku,
        qty: v.qty,
        hpp_snapshot: v.hpp,
      })),
    ])
    if (eItems) return eItems.message
  }

  const { error: eOlahan } = await admin.from('order_olahan').insert([
    { id_baris, id_olahan: r.daging.id_olahan, nama_olahan: r.daging.nama_olahan, kategori: r.daging.kategori },
    { id_baris, id_olahan: r.jeroan.id_olahan, nama_olahan: r.jeroan.nama_olahan, kategori: r.jeroan.kategori },
  ])
  if (eOlahan) return eOlahan.message
  return null
}

// Hapus order + seluruh rinciannya (tanpa andalkan FK cascade DB).
export async function cleanupOrder(admin: SupabaseClient, order_id: string) {
  const { data: baris } = await admin
    .from('order_lines')
    .select('id_baris')
    .eq('order_id', order_id)
  const ids = (baris ?? []).map((b) => b.id_baris)
  await admin
    .from('order_items')
    .delete()
    .eq('order_id', order_id)

  if (ids.length) await admin
    .from('order_olahan')
    .delete()
    .in('id_baris', ids)

  await admin
    .from('order_lines')
    .delete()
    .eq('order_id', order_id)
  
    await admin
    .from('orders')
    .delete()
    .eq('id_pesanan', order_id)
}